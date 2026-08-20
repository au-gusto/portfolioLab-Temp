/**
 * scripts/atualizar-dados.mjs
 *
 * Atualiza os CSVs de public/Dados ate o ultimo pregao disponivel.
 *
 *   node scripts/atualizar-dados.mjs
 *
 * Estrategia: ANEXAR, nunca reescrever. O historico ja existente e mantido
 * byte a byte — assim nenhum backtest passado muda de resultado. So os dias
 * novos sao buscados no Yahoo (ativos) e no Banco Central (CDI).
 *
 * Tickers que sumiram do Yahoo (empresa mudou de codigo, fechou capital,
 * fundiu) sao reportados no fim e recebem forward-fill, para nao abrir buraco
 * nas series dos demais.
 */

import fs from "node:fs";
import path from "node:path";
import YahooFinance from "yahoo-finance2";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const DIR = path.join(process.cwd(), "public", "Dados");
const ARQ_ATIVOS = path.join(DIR, "Dados_Ativos_B3_AdjClose.csv");
const ARQ_IBRX100 = path.join(DIR, "Dados_Ativos_IBRX100_AdjClose.csv");
const ARQ_CDI = path.join(DIR, "cdi_data_total.csv");
const ARQ_STATUS = path.join(DIR, "atualizado-em.json");
const ARQ_IBOV = path.join(DIR, "ibov.csv");
const ARQ_INDICES = path.join(DIR, "indices_mensais.csv");

// Series do SGS do Banco Central usadas como referencia
const SGS = { ipca: 433, poupanca: 196 };

const SUFIXO_B3 = ".SA";
const LOTE = 8; // requisicoes simultaneas ao Yahoo

// ─── CSV ──────────────────────────────────────────────────────────────────────

function lerLinhaCSV(linha) {
  const saida = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') { atual += '"'; i++; }
        else aspas = false;
      } else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { saida.push(atual); atual = ""; }
    else atual += c;
  }
  saida.push(atual);
  return saida;
}

/** 12.34 -> "12,34" no mesmo formato do arquivo atual (virga decimal, aspas). */
function formatarValor(n) {
  return `"${n.toFixed(2).replace(".", ",")}"`;
}

function formatarDataBR(iso) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a} 00:00:00`;
}

function dataISOdeBR(br) {
  const [d, m, a] = br.split(" ")[0].split("/");
  return `${a}-${m}-${d}`;
}

/**
 * Busca uma série do SGS do Banco Central.
 *
 * A API não é consistente quando não há dado no intervalo: às vezes devolve
 * `[]`, às vezes corpo vazio, às vezes um objeto de erro com HTTP 200. Como
 * este script roda sozinho todo dia, qualquer uma dessas formas precisa virar
 * "nada novo" em vez de derrubar a execução.
 */
async function buscarSGS(codigo, dataInicial) {
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${codigo}/dados`
    + `?formato=json&dataInicial=${dataInicial}`;

  let resposta;
  try {
    resposta = await fetch(url);
  } catch (e) {
    console.log(`  SGS ${codigo}: falha de rede (${e.message}) — pulando`);
    return [];
  }

  if (!resposta.ok) {
    console.log(`  SGS ${codigo}: HTTP ${resposta.status} — pulando`);
    return [];
  }

  const texto = (await resposta.text()).trim();
  if (!texto) return [];

  try {
    const dados = JSON.parse(texto);
    if (!Array.isArray(dados)) {
      console.log(`  SGS ${codigo}: resposta nao e lista — pulando`);
      return [];
    }
    return dados;
  } catch {
    console.log(`  SGS ${codigo}: resposta nao e JSON — pulando`);
    return [];
  }
}

/**
 * Limite superior das buscas no Yahoo: amanhã.
 *
 * `period2` é exclusivo, e a API recusa `period1 === period2`. Usando "hoje"
 * como teto, no dia em que o histórico já estava em dia o script quebrava —
 * era exatamente o caso da primeira execução da Action.
 */
function amanha() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

// ─── Ativos ───────────────────────────────────────────────────────────────────

async function atualizarAtivos(arquivo = ARQ_ATIVOS, rotulo = "Ativos") {
  if (!fs.existsSync(arquivo)) {
    console.log(`${rotulo}: arquivo ausente — pulando.`);
    return { novos: 0, ultimaData: null, tickers: 0, falhos: [] };
  }
  const texto = fs.readFileSync(arquivo, "utf-8");
  const quebra = texto.includes("\r\n") ? "\r\n" : "\n";
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());

  const cabecalho = lerLinhaCSV(linhas[0]);
  const tickers = cabecalho.slice(1);
  const ultimaLinha = lerLinhaCSV(linhas[linhas.length - 1]);
  const ultimaData = dataISOdeBR(ultimaLinha[0]);

  // ultimo valor conhecido de cada ticker, para forward-fill
  const ultimoValor = {};
  tickers.forEach((t, i) => {
    ultimoValor[t] = parseFloat(String(ultimaLinha[i + 1]).replace(",", "."));
  });

  const desde = new Date(ultimaData);
  desde.setDate(desde.getDate() + 1);
  const inicio = desde.toISOString().slice(0, 10);
  const hoje = amanha();

  console.log(`${rotulo}: historico vai ate ${ultimaData} (${linhas.length - 1} pregoes, ${tickers.length} tickers)`);
  if (inicio >= hoje) {
    console.log("  ja esta atualizado.");
    return { novos: 0, ultimaData, tickers: tickers.length, falhos: [] };
  }
  console.log(`  buscando ${inicio} -> ${hoje} ...`);

  const series = {};
  const falhos = [];

  // "delisted" e resposta definitiva do Yahoo: o papel deixou de existir com
  // esse codigo. Qualquer outro erro pode ser limite de taxa, entao vale
  // insistir antes de dar o ticker como morto.
  async function buscar(t, tentativa = 1) {
    try {
      const r = await yahoo.chart(t + SUFIXO_B3, {
        period1: inicio, period2: hoje, interval: "1d",
      });
      const m = new Map();
      for (const q of r.quotes ?? []) {
        const v = q.adjclose ?? q.close;
        if (v != null && Number.isFinite(v)) {
          m.set(new Date(q.date).toISOString().slice(0, 10), v);
        }
      }
      return m;
    } catch (e) {
      const definitivo = /delisted|not found|No data found/i.test(e?.message ?? "");
      if (!definitivo && tentativa < 3) {
        await new Promise((r) => setTimeout(r, 800 * tentativa));
        return buscar(t, tentativa + 1);
      }
      return null;
    }
  }

  for (let i = 0; i < tickers.length; i += LOTE) {
    const bloco = tickers.slice(i, i + LOTE);
    await Promise.all(bloco.map(async (t) => {
      const m = await buscar(t);
      if (m === null || m.size === 0) {
        series[t] = new Map();
        falhos.push({ ticker: t, ultimoPregaoReal: ultimaData });
      } else {
        series[t] = m;
      }
    }));
    process.stdout.write(`\r  ${Math.min(i + LOTE, tickers.length)}/${tickers.length} tickers`);
  }
  console.log();

  // Um pregao existe se a maioria dos ativos negociou nele.
  const contagem = new Map();
  for (const t of tickers) {
    for (const d of series[t].keys()) contagem.set(d, (contagem.get(d) ?? 0) + 1);
  }
  const minimo = Math.max(2, Math.floor(tickers.length * 0.5));
  const datas = [...contagem.entries()]
    .filter(([, n]) => n >= minimo)
    .map(([d]) => d)
    // Guarda contra duplicata: quando nao ha pregao novo, o Yahoo devolve a
    // ultima barra existente. Sem este filtro ela seria anexada de novo e o
    // arquivo passaria a ter duas linhas com a mesma data.
    .filter((d) => d > ultimaData)
    .sort();

  const novas = datas.map((d) => {
    const celulas = [formatarDataBR(d)];
    for (const t of tickers) {
      const v = series[t].get(d);
      if (v != null) ultimoValor[t] = v;           // forward-fill
      celulas.push(formatarValor(ultimoValor[t]));
    }
    return celulas.join(",");
  });

  if (novas.length) {
    fs.appendFileSync(arquivo, quebra + novas.join(quebra));
  }
  console.log(`  +${novas.length} pregoes` + (datas.length ? ` (ate ${datas[datas.length - 1]})` : ""));
  return { novos: novas.length, ultimaData: datas.at(-1) ?? ultimaData, tickers: tickers.length, falhos };
}

// ─── CDI ──────────────────────────────────────────────────────────────────────

async function atualizarCDI() {
  const texto = fs.readFileSync(ARQ_CDI, "utf-8");
  const quebra = texto.includes("\r\n") ? "\r\n" : "\n";
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());
  const ultima = linhas[linhas.length - 1].split(",")[0];
  const [d, m, a] = ultima.split("/");
  const ultimaISO = `${a}-${m}-${d}`;

  const desde = new Date(ultimaISO);
  desde.setDate(desde.getDate() + 1);
  const dd = String(desde.getDate()).padStart(2, "0");
  const mm = String(desde.getMonth() + 1).padStart(2, "0");

  console.log(`CDI: historico vai ate ${ultimaISO} (${linhas.length - 1} dias)`);

  // Serie 12 do SGS = taxa CDI diaria (% ao dia)
  const dados = await buscarSGS(12, `${dd}/${mm}/${desde.getFullYear()}`);

  const novas = dados
    .filter((r) => {
      const [D, M, A] = r.data.split("/");
      return `${A}-${M}-${D}` > ultimaISO;
    })
    .map((r) => `${r.data},${r.valor}`);

  if (novas.length) fs.appendFileSync(ARQ_CDI, quebra + novas.join(quebra));
  console.log(`  +${novas.length} dias` + (novas.length ? ` (ate ${dados.at(-1).data})` : ""));
  return { novos: novas.length, ultimaData: novas.length ? dados.at(-1).data : ultima };
}

// ─── Benchmarks ───────────────────────────────────────────────────────────────

/** Série diária do Ibovespa, no mesmo formato dos ativos. */
async function atualizarIbov() {
  let ultimaISO = "2018-01-01";
  let novoArquivo = true;

  if (fs.existsSync(ARQ_IBOV)) {
    const linhas = fs.readFileSync(ARQ_IBOV, "utf-8").split(/\r?\n/).filter((l) => l.trim());
    if (linhas.length > 1) {
      ultimaISO = dataISOdeBR(lerLinhaCSV(linhas[linhas.length - 1])[0]);
      novoArquivo = false;
    }
  }

  const desde = new Date(ultimaISO);
  if (!novoArquivo) desde.setDate(desde.getDate() + 1);
  const inicio = desde.toISOString().slice(0, 10);
  const hoje = amanha();

  console.log(`IBOV: historico vai ate ${ultimaISO}`);
  if (!novoArquivo && inicio >= hoje) {
    console.log("  ja esta atualizado.");
    return ultimaISO;
  }

  const r = await yahoo.chart("^BVSP", { period1: inicio, period2: hoje, interval: "1d" });
  const novas = (r.quotes ?? [])
    .filter((q) => (q.adjclose ?? q.close) != null)
    .map((q) => ({ dia: new Date(q.date).toISOString().slice(0, 10), q }))
    // Mesma guarda dos ativos: nunca reanexar um dia que ja esta no arquivo.
    .filter(({ dia }) => novoArquivo || dia > ultimaISO)
    .map(({ dia, q }) => `${formatarDataBR(dia)},${formatarValor(q.adjclose ?? q.close)}`);

  if (novoArquivo) {
    fs.writeFileSync(ARQ_IBOV, ["Data,IBOV", ...novas].join("\n") + "\n");
  } else if (novas.length) {
    fs.appendFileSync(ARQ_IBOV, novas.join("\n") + "\n");
  }

  console.log(`  +${novas.length} pregoes`);
  return novas.length ? dataISOdeBR(novas[novas.length - 1].split(",")[0]) : ultimaISO;
}

/**
 * IPCA e poupança: séries MENSAIS do Banco Central, em % ao mês.
 *
 * Diferente do CDI, que é diário, estas só têm um valor por mês — e o IPCA sai
 * com cerca de um mês de defasagem. Só gravamos meses em que AMBAS existem:
 * acumular uma série com buraco distorce o resultado em silêncio.
 */
async function atualizarIndicesMensais() {
  console.log("Indices mensais (IPCA, poupanca):");

  const series = {};
  for (const [nome, codigo] of Object.entries(SGS)) {
    const dados = await buscarSGS(codigo, "01/01/2017");
    if (!dados.length) {
      console.log(`  ${nome}: sem dados — mantendo o arquivo atual`);
      return null;
    }
    series[nome] = new Map(
      dados.map((r) => {
        const [, m, a] = r.data.split("/");
        return [`${a}-${m}`, Number(r.valor)];
      })
    );
    console.log(`  ${nome}: ${dados.length} meses (ate ${dados.at(-1)?.data ?? "?"})`);
  }

  const meses = [...new Set(Object.values(series).flatMap((m) => [...m.keys()]))].sort();
  const linhas = ["Mes,IPCA,Poupanca"];
  for (const mes of meses) {
    const ipca = series.ipca.get(mes);
    const poupanca = series.poupanca.get(mes);
    if (ipca == null || poupanca == null) continue;
    linhas.push(`${mes},${ipca},${poupanca}`);
  }

  fs.writeFileSync(ARQ_INDICES, linhas.join("\n") + "\n");
  const ultimo = linhas[linhas.length - 1].split(",")[0];
  console.log(`  ${linhas.length - 1} meses completos (ate ${ultimo})`);
  return ultimo;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const ativos = await atualizarAtivos(ARQ_ATIVOS, "Ativos (Outros)");

// A base do IBRX-100 precisa envelhecer junto. Deixar so uma delas no cron era
// repetir o problema que ja tivemos: cotacao congelada por meses sem nada na
// tela indicando isso.
const ibrx100 = await atualizarAtivos(ARQ_IBRX100, "Ativos (IBRX-100)");
const cdi = await atualizarCDI();
const ibov = await atualizarIbov();
const indices = await atualizarIndicesMensais();

fs.writeFileSync(ARQ_STATUS, JSON.stringify({
  atualizadoEm: new Date().toISOString(),
  ativos: { ultimoPregao: ativos.ultimaData, tickers: ativos.tickers },
  ibrx100: { ultimoPregao: ibrx100.ultimaData, tickers: ibrx100.tickers },
  cdi: { ultimoDia: cdi.ultimaData },
  ibov: { ultimoPregao: ibov },
  indicesMensais: { ultimoMes: indices },
  tickersSemDados: ativos.falhos,
}, null, 2) + "\n");

console.log("\nResumo gravado em public/Dados/atualizado-em.json");
if (ativos.falhos.length) {
  console.log(`\nATENCAO — ${ativos.falhos.length} ticker(s) sem dados novos no Yahoo.`);
  console.log("Provavel mudanca de codigo, fusao ou fechamento de capital. A serie");
  console.log("deles fica repetindo o ultimo preco real, entao o app avisa o usuario:");
  console.log("  " + ativos.falhos.map((f) => f.ticker).join(", "));
}
