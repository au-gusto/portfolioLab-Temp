/**
 * scripts/sincronizar-ibrx100.mjs
 *
 * Acerta as duas bases quando a B3 reavalia a carteira do IBRX-100.
 *
 *   node scripts/sincronizar-ibrx100.mjs           (aplica)
 *   node scripts/sincronizar-ibrx100.mjs --simular (so mostra o que faria)
 *
 * A composicao do indice muda a cada quadrimestre. O script diario so ANEXA
 * pregoes, entao sozinho ele nunca traz papel novo nem se livra de quem saiu.
 * Aqui e onde as colunas se movem:
 *
 *   entrou no IBRX-100  -> ganha coluna na base do indice, com historico
 *                          buscado desde 2023-01-01
 *   saiu do IBRX-100    -> a coluna sai da base do indice e vai para "Outros",
 *                          onde continua sendo atualizada normalmente
 *
 * Ninguem e apagado. Um papel que sai do indice continua simulavel na outra
 * base, com a serie inteira que ja tinha.
 *
 * O que o script NAO faz e mexer em preco ja gravado. Ele reescreve os
 * arquivos porque acrescentar e remover coluna exige reescrever, mas todo
 * valor que permanece sai byte a byte igual ao que entrou — um backtest de
 * ontem, nos papeis que ficaram, da o mesmo numero hoje. Ha uma conferencia
 * explicita disso no fim.
 */

import fs from "node:fs";
import path from "node:path";
import YahooFinance from "yahoo-finance2";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const DIR = path.join(process.cwd(), "public", "Dados");
const ARQ_IBRX = path.join(DIR, "Dados_Ativos_IBRX100_AdjClose.csv");
const ARQ_OUTROS = path.join(DIR, "Dados_Ativos_B3_AdjClose.csv");
const ARQ_HISTORICO = path.join(DIR, "historico-indice.json");

const INICIO_IBRX = "2023-01-01";
const SUFIXO_B3 = ".SA";
const LOTE = 8;

const SIMULAR = process.argv.includes("--simular");

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

function formatarValor(n) {
  return `"${n.toFixed(2).replace(".", ",")}"`;
}

function dataISOdeBR(br) {
  const [d, m, a] = br.split(" ")[0].split("/");
  return `${a}-${m}-${d}`;
}

function amanha() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Le um CSV largo para { quebra, datasBR, tickers, colunas }.
 *
 * As celulas ficam como TEXTO, exatamente como estao no arquivo. Converter
 * para numero e formatar de volta arredondaria valores antigos, que e
 * justamente o que nao pode acontecer.
 */
function lerBase(arquivo) {
  const texto = fs.readFileSync(arquivo, "utf-8");
  const quebra = texto.includes("\r\n") ? "\r\n" : "\n";
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim());

  const cabecalho = lerLinhaCSV(linhas[0].replace(/^﻿/, ""));
  const tickers = cabecalho.slice(1);

  const datasBR = [];
  const colunas = Object.fromEntries(tickers.map((t) => [t, []]));

  for (let i = 1; i < linhas.length; i++) {
    const celulas = lerLinhaCSV(linhas[i]);
    datasBR.push(celulas[0]);
    tickers.forEach((t, j) => {
      const bruto = celulas[j + 1] ?? "";
      // Reconstruimos as aspas na escrita; guardamos so o conteudo.
      colunas[t].push(bruto);
    });
  }

  return { quebra, datasBR, tickers, colunas };
}

function escreverBase(arquivo, base, ordemTickers) {
  const { quebra, datasBR, colunas } = base;
  const linhas = [["Data", ...ordemTickers].join(",")];

  for (let i = 0; i < datasBR.length; i++) {
    const celulas = [datasBR[i]];
    for (const t of ordemTickers) {
      const v = colunas[t]?.[i] ?? "";
      celulas.push(v === "" ? "" : `"${v}"`);
    }
    linhas.push(celulas.join(","));
  }

  // Sem quebra final, pelo mesmo motivo do montador: o atualizador diario
  // anexa `quebra + linha` e criaria uma linha vazia no meio do CSV.
  fs.writeFileSync(arquivo, linhas.join(quebra), "utf8");
}

// ─── B3 e Yahoo ───────────────────────────────────────────────────────────────

async function buscarCarteira() {
  const parametros = Buffer.from(JSON.stringify({
    language: "pt-br", pageNumber: 1, pageSize: 200, index: "IBXX", segment: "1",
  })).toString("base64");

  const resposta = await fetch(
    "https://sistemaswebb3-listados.b3.com.br/indexProxy/indexCall/GetPortfolioDay/" + parametros,
    { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" } },
  );
  if (!resposta.ok) throw new Error(`B3 respondeu ${resposta.status}`);

  const corpo = await resposta.json();
  const codigos = (corpo?.results ?? [])
    .map((r) => String(r.cod ?? "").trim().toUpperCase())
    .filter(Boolean);

  // Guarda contra resposta truncada: aceitar uma carteira de 3 papeis
  // esvaziaria a base do indice inteira.
  if (codigos.length < 50) {
    throw new Error(`carteira veio com ${codigos.length} papeis — resposta suspeita, nada foi alterado`);
  }
  return [...new Set(codigos)].sort();
}

async function buscarPrecos(ticker, desde, tentativa = 1) {
  try {
    const r = await yahoo.chart(ticker + SUFIXO_B3, {
      period1: desde, period2: amanha(), interval: "1d",
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
      return buscarPrecos(ticker, desde, tentativa + 1);
    }
    return null;
  }
}

/**
 * Monta a coluna de um ticker alinhada as datas de uma base.
 *
 * Dia sem negocio herda o ultimo preco; antes da estreia fica vazio, que e a
 * forma honesta de dizer "nao havia acao". O validador entende essa diferenca.
 */
function alinhar(precos, datasBR) {
  const coluna = [];
  let ultimo = null;
  for (const dataBR of datasBR) {
    const iso = dataISOdeBR(dataBR);
    const v = precos.get(iso);
    if (v != null) ultimo = v;
    coluna.push(ultimo == null ? "" : formatarValor(ultimo).slice(1, -1));
  }
  return coluna;
}

async function buscarEmLote(tickers, desde, rotulo) {
  const saida = {};
  const falhos = [];
  for (let i = 0; i < tickers.length; i += LOTE) {
    const bloco = tickers.slice(i, i + LOTE);
    await Promise.all(bloco.map(async (t) => {
      const m = await buscarPrecos(t, desde);
      if (m === null || m.size === 0) falhos.push(t);
      else saida[t] = m;
    }));
    process.stdout.write(`\r  ${rotulo}: ${Math.min(i + LOTE, tickers.length)}/${tickers.length}`);
  }
  if (tickers.length) console.log();
  return { saida, falhos };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function lerHistorico() {
  try {
    return JSON.parse(fs.readFileSync(ARQ_HISTORICO, "utf-8"));
  } catch {
    return { saidas: {}, entradas: {} };
  }
}

async function main() {
  console.log("Buscando a carteira do IBRX-100 na B3...");
  const carteira = await buscarCarteira();
  console.log(`  ${carteira.length} papeis na carteira atual`);

  const ibrx = lerBase(ARQ_IBRX);
  const outros = lerBase(ARQ_OUTROS);

  const naCarteira = new Set(carteira);
  const noIbrx = new Set(ibrx.tickers);
  const noOutros = new Set(outros.tickers);

  const entraram = carteira.filter((t) => !noIbrx.has(t));
  const sairam = ibrx.tickers.filter((t) => !naCarteira.has(t));

  console.log(`\nEntraram no indice (${entraram.length}): ${entraram.join(", ") || "—"}`);
  console.log(`Sairam do indice  (${sairam.length}): ${sairam.join(", ") || "—"}`);

  if (!entraram.length && !sairam.length) {
    console.log("\nNada a fazer: a carteira nao mudou.");
    return;
  }

  if (SIMULAR) {
    const novosEmOutros = sairam.filter((t) => !noOutros.has(t));
    console.log(`\n[--simular] Nenhum arquivo foi tocado.`);
    console.log(`  IBRX-100 ficaria com ${carteira.length} colunas.`);
    console.log(`  "Outros" ganharia ${novosEmOutros.length} coluna(s): ${novosEmOutros.join(", ") || "—"}`);
    return;
  }

  // Retrato do estado atual, para conferir no fim que nada mudou de valor.
  const antesIbrx = JSON.parse(JSON.stringify(
    Object.fromEntries(ibrx.tickers.filter((t) => naCarteira.has(t)).map((t) => [t, ibrx.colunas[t]]))
  ));
  const antesOutros = JSON.parse(JSON.stringify(outros.colunas));

  // ── Quem saiu vai para "Outros" ────────────────────────────────────────────
  const paraOutros = sairam.filter((t) => !noOutros.has(t));
  if (paraOutros.length) {
    console.log(`\nBuscando historico completo de quem saiu (desde ${dataISOdeBR(outros.datasBR[0])})...`);
    const desde = dataISOdeBR(outros.datasBR[0]);
    const { saida, falhos } = await buscarEmLote(paraOutros, desde, "saidas");
    for (const t of paraOutros) {
      if (!saida[t]) continue;
      outros.colunas[t] = alinhar(saida[t], outros.datasBR);
    }
    if (falhos.length) {
      console.log(`  sem dados no Yahoo, nao migrados: ${falhos.join(", ")}`);
    }
  }
  const migrados = paraOutros.filter((t) => outros.colunas[t]);
  const jaEstavamEmOutros = sairam.filter((t) => noOutros.has(t));

  // ── Quem entrou ganha coluna no IBRX-100 ───────────────────────────────────
  if (entraram.length) {
    console.log(`\nBuscando historico de quem entrou (desde ${INICIO_IBRX})...`);
    const { saida, falhos } = await buscarEmLote(entraram, INICIO_IBRX, "entradas");
    for (const t of entraram) {
      if (!saida[t]) continue;
      ibrx.colunas[t] = alinhar(saida[t], ibrx.datasBR);
    }
    if (falhos.length) {
      console.log(`  sem dados no Yahoo, nao adicionados: ${falhos.join(", ")}`);
    }
  }

  const ordemIbrx = carteira.filter((t) => ibrx.colunas[t]);
  const ordemOutros = [...new Set([...outros.tickers, ...migrados])].sort();

  // ── Conferencia: nenhum preco que permanece pode ter mudado ────────────────
  let alterados = 0;
  for (const t of Object.keys(antesIbrx)) {
    const depois = ibrx.colunas[t] ?? [];
    if (antesIbrx[t].join("|") !== depois.join("|")) alterados++;
  }
  for (const t of Object.keys(antesOutros)) {
    const depois = outros.colunas[t] ?? [];
    if (antesOutros[t].join("|") !== depois.join("|")) alterados++;
  }
  if (alterados) {
    throw new Error(`${alterados} coluna(s) preexistente(s) mudaram de valor — abortando sem gravar`);
  }

  escreverBase(ARQ_IBRX, ibrx, ordemIbrx);
  escreverBase(ARQ_OUTROS, outros, ordemOutros);

  // ── Registro de quando cada papel saiu ─────────────────────────────────────
  // Ainda nao usamos isto para nada. Existe porque a regra combinada e parar de
  // atualizar quem saiu depois de dois anos, e essa conta precisa da data —
  // que so da para saber no dia em que a saida acontece.
  const historico = lerHistorico();
  const hoje = new Date().toISOString().slice(0, 10);
  for (const t of sairam) historico.saidas[t] = hoje;
  for (const t of entraram) {
    historico.entradas[t] = hoje;
    delete historico.saidas[t];
  }
  fs.writeFileSync(ARQ_HISTORICO, JSON.stringify(historico, null, 2) + "\n");

  console.log("\n─────────────────────────────────────────");
  console.log(`IBRX-100: ${ordemIbrx.length} papeis (+${entraram.length} / -${sairam.length})`);
  console.log(`Outros:   ${ordemOutros.length} papeis (+${migrados.length})`);
  if (jaEstavamEmOutros.length) {
    console.log(`  ja estavam em Outros: ${jaEstavamEmOutros.join(", ")}`);
  }
  console.log("Nenhum preco preexistente foi alterado.");
  console.log("\nRode `node scripts/validar-dados.mjs` antes de commitar.");
}

main().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
