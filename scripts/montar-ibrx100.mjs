/**
 * scripts/montar-ibrx100.mjs
 *
 * Monta a base de precos do IBRX-100 do zero.
 *
 *   node scripts/montar-ibrx100.mjs
 *
 * A carteira vem da propria B3 (indice IBXX no portal de listados), nao de uma
 * lista digitada a mao: composicao de indice muda a cada quadrimestre, e uma
 * copia estatica no codigo envelhece sem ninguem perceber.
 *
 * Os precos comecam em 2023-01-01 de proposito, embora a simulacao so seja
 * liberada a partir de 2024-01-01 (ver LIMITES em app/lib/catalogo-ativos.ts).
 * O ano extra existe para as estrategias terem janela de covariancia cheia no
 * primeiro dia simulavel — sem ele, a primeira alocacao sairia de um punhado
 * de pregoes e nao de um ano de historia.
 *
 * Escreve dois arquivos:
 *   public/Dados/codigos_ibrx100.csv            — a carteira, uma linha
 *   public/Dados/Dados_Ativos_IBRX100_AdjClose.csv — os precos, formato largo
 */

import fs from "node:fs";
import path from "node:path";
import YahooFinance from "yahoo-finance2";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const DIR = path.join(process.cwd(), "public", "Dados");
const ARQ_CODIGOS = path.join(DIR, "codigos_ibrx100.csv");
const ARQ_PRECOS = path.join(DIR, "Dados_Ativos_IBRX100_AdjClose.csv");

const INICIO = "2023-01-01";
const SUFIXO_B3 = ".SA";
const LOTE = 8;

function formatarValor(n) {
  return `"${n.toFixed(2).replace(".", ",")}"`;
}

function formatarDataBR(iso) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a} 00:00:00`;
}

function amanha() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Carteira teorica atual do IBRX-100, direto da B3. */
async function buscarCarteira() {
  const parametros = Buffer.from(JSON.stringify({
    language: "pt-br", pageNumber: 1, pageSize: 200, index: "IBXX", segment: "1",
  })).toString("base64");

  const url = "https://sistemaswebb3-listados.b3.com.br/indexProxy/indexCall/GetPortfolioDay/" + parametros;
  const resposta = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
  });
  if (!resposta.ok) throw new Error(`B3 respondeu ${resposta.status}`);

  const corpo = await resposta.json();
  const codigos = (corpo?.results ?? [])
    .map((r) => String(r.cod ?? "").trim().toUpperCase())
    .filter(Boolean);

  if (codigos.length < 50) {
    throw new Error(`carteira veio com ${codigos.length} papeis — parece resposta truncada`);
  }
  return [...new Set(codigos)].sort();
}

async function buscarPrecos(ticker, tentativa = 1) {
  try {
    const r = await yahoo.chart(ticker + SUFIXO_B3, {
      period1: INICIO, period2: amanha(), interval: "1d",
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
      return buscarPrecos(ticker, tentativa + 1);
    }
    return null;
  }
}

async function main() {
  console.log("Buscando a carteira do IBRX-100 na B3...");
  const carteira = await buscarCarteira();
  console.log(`  ${carteira.length} papeis`);

  console.log(`Buscando precos desde ${INICIO}...`);
  const series = {};
  const semDados = [];

  for (let i = 0; i < carteira.length; i += LOTE) {
    const bloco = carteira.slice(i, i + LOTE);
    await Promise.all(bloco.map(async (t) => {
      const m = await buscarPrecos(t);
      if (m === null || m.size === 0) {
        series[t] = new Map();
        semDados.push(t);
      } else {
        series[t] = m;
      }
    }));
    process.stdout.write(`\r  ${Math.min(i + LOTE, carteira.length)}/${carteira.length} tickers`);
  }
  console.log();

  // Um pregao existe se a maioria dos papeis negociou nele. Isso descarta
  // feriados em que um ou outro ticker traz cotacao fantasma do Yahoo.
  const contagem = new Map();
  for (const t of carteira) {
    for (const d of series[t].keys()) contagem.set(d, (contagem.get(d) ?? 0) + 1);
  }
  const comDados = carteira.filter((t) => series[t].size > 0).length;
  const minimo = Math.max(2, Math.floor(comDados * 0.6));
  const pregoes = [...contagem.entries()]
    .filter(([, n]) => n >= minimo)
    .map(([d]) => d)
    .sort();

  if (!pregoes.length) throw new Error("nenhum pregao encontrado");

  // Papel que nao negociou no dia herda o ultimo preco. Sem isso a matriz fica
  // com buracos e a covariancia sai de amostras de tamanhos diferentes.
  const ultimo = {};
  const linhas = [["Data", ...carteira].join(",")];

  for (const dia of pregoes) {
    const celulas = [formatarDataBR(dia)];
    for (const t of carteira) {
      const v = series[t].get(dia);
      if (v != null) ultimo[t] = v;
      celulas.push(ultimo[t] != null ? formatarValor(ultimo[t]) : "");
    }
    linhas.push(celulas.join(","));
  }

  fs.writeFileSync(ARQ_CODIGOS, carteira.join(",") + "\n", "utf8");
  // Sem quebra final: o atualizador diario anexa a quebra antes da linha
  // nova, e um arquivo ja terminado em quebra viraria uma linha vazia.
  fs.writeFileSync(ARQ_PRECOS, linhas.join("\n"), "utf8");

  console.log(`\nEscrito: ${path.relative(process.cwd(), ARQ_CODIGOS)}`);
  console.log(`Escrito: ${path.relative(process.cwd(), ARQ_PRECOS)}`);
  console.log(`  ${pregoes.length} pregoes, de ${pregoes[0]} a ${pregoes[pregoes.length - 1]}`);
  if (semDados.length) {
    console.log(`  sem dados no Yahoo (${semDados.length}): ${semDados.join(", ")}`);
  }
}

main().catch((e) => {
  console.error("FALHOU:", e.message);
  process.exit(1);
});
