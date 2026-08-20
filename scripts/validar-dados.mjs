/**
 * scripts/validar-dados.mjs
 *
 * Portão de qualidade antes do commit automático.
 *
 *   node scripts/validar-dados.mjs
 *
 * A GitHub Action commita sozinha, sem ninguém olhar. Sem esta checagem, uma
 * resposta ruim do Yahoo (coluna faltando, data repetida, preço zerado) entraria
 * no repositório em silêncio e só apareceria como um gráfico torto semanas
 * depois. Aqui o processo falha antes de gravar.
 *
 * Sai com código 1 se algo estiver errado — o que interrompe a Action.
 */

import fs from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "public", "Dados");

const problemas = [];
const avisos = [];

function erro(msg) { problemas.push(msg); }
function aviso(msg) { avisos.push(msg); }

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

function linhasDe(arquivo) {
  const caminho = path.join(DIR, arquivo);
  if (!fs.existsSync(caminho)) {
    erro(`${arquivo}: arquivo não existe`);
    return null;
  }
  return fs.readFileSync(caminho, "utf-8").split(/\r?\n/).filter((l) => l.trim());
}

function paraISO(dataBR) {
  const [d, m, a] = dataBR.split(" ")[0].split("/");
  return `${a}-${m}-${d}`;
}

const hoje = new Date().toISOString().slice(0, 10);

// ─── Cotações dos ativos ──────────────────────────────────────────────────────

function validarAtivos(arquivo = "Dados_Ativos_B3_AdjClose.csv", rotulo = "Ativos") {
  const linhas = linhasDe(arquivo);
  if (!linhas) return;

  const cabecalho = lerLinhaCSV(linhas[0]);
  const tickers = cabecalho.slice(1);
  console.log(`${rotulo}: ${linhas.length - 1} pregões x ${tickers.length} tickers`);

  if (tickers.length < 10) erro(`${rotulo}: só ${tickers.length} tickers no cabeçalho`);
  if (new Set(tickers).size !== tickers.length) erro(`${rotulo}: há ticker repetido no cabeçalho`);

  let anterior = "";
  let semMovimento = 0;

  // Papel que entrou no indice depois do inicio do arquivo nao tem preco nos
  // primeiros pregoes, e isso e correto — nao havia acao negociando. O que nao
  // pode e faltar preco DEPOIS da estreia: ai e coleta furada, e a serie
  // ficaria com um buraco no meio.
  const estreou = new Array(tickers.length).fill(false);
  const atrasados = [];

  for (let i = 1; i < linhas.length; i++) {
    const celulas = lerLinhaCSV(linhas[i]);

    if (celulas.length !== cabecalho.length) {
      erro(`${rotulo} linha ${i + 1}: ${celulas.length} colunas, esperado ${cabecalho.length}`);
      continue;
    }

    const iso = paraISO(celulas[0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      erro(`${rotulo} linha ${i + 1}: data inválida "${celulas[0]}"`);
      continue;
    }
    if (iso <= anterior) {
      erro(`${rotulo} linha ${i + 1}: data ${iso} não é posterior a ${anterior}`);
    }
    if (iso > hoje) erro(`${rotulo} linha ${i + 1}: data ${iso} está no futuro`);
    anterior = iso;

    // Preços: numéricos e positivos, a partir da estreia de cada papel.
    let iguaisAoAnterior = 0;
    for (let c = 1; c < celulas.length; c++) {
      const bruto = String(celulas[c]).trim();
      const ticker = tickers[c - 1];

      if (bruto === "") {
        if (estreou[c - 1]) {
          erro(`${rotulo} linha ${i + 1}, ${ticker}: preço ausente depois da estreia`);
        } else if (!atrasados.includes(ticker)) {
          atrasados.push(ticker);
        }
        continue;
      }

      const v = Number(bruto.replace(",", "."));
      if (!Number.isFinite(v)) {
        erro(`${rotulo} linha ${i + 1}, ${ticker}: valor não numérico "${celulas[c]}"`);
      } else if (v <= 0) {
        erro(`${rotulo} linha ${i + 1}, ${ticker}: preço ${v}`);
      } else {
        estreou[c - 1] = true;
      }
    }
    if (i > 1) {
      const antes = lerLinhaCSV(linhas[i - 1]);
      for (let c = 1; c < celulas.length; c++) {
        if (celulas[c] === antes[c]) iguaisAoAnterior++;
      }
      // Todos os papéis parados no mesmo dia = provável falha de coleta,
      // não um dia de mercado real.
      if (iguaisAoAnterior === tickers.length) semMovimento++;
    }
  }

  if (semMovimento > 0) {
    aviso(`${rotulo}: ${semMovimento} pregão(ões) com TODOS os preços idênticos ao dia anterior`);
  }
  if (atrasados.length) {
    aviso(`${rotulo}: ${atrasados.length} papel(éis) sem preço no início do arquivo `
      + `(estrearam depois): ${atrasados.join(", ")}`);
  }
  const nunca = tickers.filter((_, k) => !estreou[k]);
  if (nunca.length) {
    erro(`${rotulo}: ${nunca.length} papel(éis) sem nenhum preço: ${nunca.join(", ")}`);
  }
  console.log(`  último pregão: ${anterior}`);
}

// ─── CDI ──────────────────────────────────────────────────────────────────────

function validarCDI() {
  const linhas = linhasDe("cdi_data_total.csv");
  if (!linhas) return;
  console.log(`CDI: ${linhas.length - 1} dias`);

  let anterior = "";
  for (let i = 1; i < linhas.length; i++) {
    const [dataBR, valor] = linhas[i].split(",");
    const iso = paraISO(dataBR);
    if (iso <= anterior) erro(`CDI linha ${i + 1}: data ${iso} fora de ordem`);
    anterior = iso;

    const v = Number(valor);
    if (!Number.isFinite(v)) erro(`CDI linha ${i + 1}: valor inválido "${valor}"`);
    // Taxa diária: acima de 1% ao dia seria juro de 250% ao ano.
    else if (v < 0 || v > 1) erro(`CDI linha ${i + 1}: taxa diária implausível ${v}%`);
  }
  console.log(`  último dia: ${anterior}`);
}

// ─── Ibovespa ─────────────────────────────────────────────────────────────────

function validarIbov() {
  const linhas = linhasDe("ibov.csv");
  if (!linhas) return;
  console.log(`IBOV: ${linhas.length - 1} pregões`);

  let anterior = "";
  let anteriorValor = null;
  for (let i = 1; i < linhas.length; i++) {
    const celulas = lerLinhaCSV(linhas[i]);
    const iso = paraISO(celulas[0]);
    if (iso <= anterior) erro(`IBOV linha ${i + 1}: data ${iso} fora de ordem`);
    anterior = iso;

    const v = Number(String(celulas[1]).replace(",", "."));
    if (!Number.isFinite(v) || v <= 0) {
      erro(`IBOV linha ${i + 1}: valor inválido "${celulas[1]}"`);
    } else if (anteriorValor !== null) {
      const variacao = Math.abs(v / anteriorValor - 1);
      // O circuit breaker da B3 dispara em 10%; 25% num dia é dado ruim.
      if (variacao > 0.25) {
        erro(`IBOV linha ${i + 1}: salto de ${(variacao * 100).toFixed(1)}% em um pregão`);
      }
      anteriorValor = v;
    } else {
      anteriorValor = v;
    }
  }
  console.log(`  último pregão: ${anterior}`);
}

// ─── IPCA e poupança ──────────────────────────────────────────────────────────

function validarIndices() {
  const linhas = linhasDe("indices_mensais.csv");
  if (!linhas) return;
  console.log(`Índices mensais: ${linhas.length - 1} meses`);

  let anterior = "";
  for (let i = 1; i < linhas.length; i++) {
    const [mes, ipca, poupanca] = linhas[i].split(",");
    if (!/^\d{4}-\d{2}$/.test(mes)) erro(`Índices linha ${i + 1}: mês inválido "${mes}"`);
    if (mes <= anterior) erro(`Índices linha ${i + 1}: mês ${mes} fora de ordem`);
    anterior = mes;

    for (const [nome, txt, limite] of [["IPCA", ipca, 10], ["Poupança", poupanca, 5]]) {
      const v = Number(txt);
      if (!Number.isFinite(v)) erro(`Índices linha ${i + 1}: ${nome} inválido "${txt}"`);
      else if (Math.abs(v) > limite) erro(`Índices linha ${i + 1}: ${nome} de ${v}% no mês`);
    }
  }
  console.log(`  último mês: ${anterior}`);
}

// ─── Status ───────────────────────────────────────────────────────────────────

function validarStatus() {
  const caminho = path.join(DIR, "atualizado-em.json");
  if (!fs.existsSync(caminho)) {
    erro("atualizado-em.json não existe");
    return;
  }
  const status = JSON.parse(fs.readFileSync(caminho, "utf-8"));
  const mortos = status.tickersSemDados ?? [];
  console.log(`Status: último pregão ${status.ativos?.ultimoPregao}, ${mortos.length} ticker(s) sem dados novos`);

  // Metade da carteira sumindo de uma vez é falha de coleta, não delisting.
  if (mortos.length > 40) {
    erro(`${mortos.length} tickers sem dados — provável falha de coleta, não mudança de código`);
  } else if (mortos.length > 0) {
    aviso(`${mortos.length} ticker(s) sem cotação nova: ${mortos.map((m) => m.ticker).join(", ")}`);
  }
}

// ─── Execução ─────────────────────────────────────────────────────────────────

validarAtivos("Dados_Ativos_B3_AdjClose.csv", "Ativos (Outros)");
validarAtivos("Dados_Ativos_IBRX100_AdjClose.csv", "Ativos (IBRX-100)");
validarCDI();
validarIbov();
validarIndices();
validarStatus();

console.log();
for (const a of avisos) console.log(`AVISO   ${a}`);
for (const p of problemas) console.log(`ERRO    ${p}`);

if (problemas.length) {
  console.log(`\n${problemas.length} problema(s). Os dados NÃO devem ser commitados.`);
  process.exit(1);
}
console.log(`\nDados íntegros${avisos.length ? ` (${avisos.length} aviso(s))` : ""}.`);
