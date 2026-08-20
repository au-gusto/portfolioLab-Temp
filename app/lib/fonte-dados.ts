/**
 * app/lib/fonte-dados.ts
 *
 * Leitura dos dados de mercado no servidor, para renderizar a página.
 *
 * A fonte da verdade são os CSVs versionados em `public/Dados`, gerados uma vez
 * por dia por uma GitHub Action (`.github/workflows/atualizar-dados.yml`). Não
 * há banco no caminho: o volume é de 8 MB e idêntico para todo mundo, então um
 * arquivo servido pela CDN é mais rápido, mais barato e tem menos modos de
 * falha do que uma consulta por requisição.
 *
 * Isto aqui só entrega a lista de tickers e o status da última atualização — as
 * cotações em si vão direto do CDN para o worker do Python, sem passar pelo
 * servidor. Ver `public/pyodide-worker.js`.
 */

import fs from "fs";
import path from "path";
import Papa from "papaparse";

import { BASES } from "./catalogo-ativos";

const DIR = ["public", "Dados"];
const ARQ_ATIVOS = "Dados_Ativos_B3_AdjClose.csv";
const ARQ_STATUS = "atualizado-em.json";

export interface TickerSemDados {
  ticker: string;
  ultimoPregaoReal: string;
}

export interface StatusDados {
  /** Quando a Action rodou pela última vez (ISO). */
  atualizadoEm: string | null;
  /** Data do pregão mais recente presente nos dados. */
  ultimoPregao: string | null;
  /** Papéis que pararam de existir com esse código (fusão, troca, fechamento). */
  tickersSemDados: TickerSemDados[];
}

function caminho(arquivo: string) {
  return path.join(process.cwd(), ...DIR, arquivo);
}

/**
 * Lê apenas o cabeçalho de um CSV de preços para descobrir os tickers.
 *
 * A tabela inteira não é serializada para o navegador: virava ~2,4 MB de JSON
 * embutido no HTML de toda visita.
 */
function lerTickers(arquivo: string = ARQ_ATIVOS): string[] {
  const fd = fs.openSync(caminho(arquivo), "r");
  try {
    // O cabeçalho tem ~700 bytes; 8 KB cobrem com folga sem ler o arquivo todo.
    const buffer = Buffer.alloc(8192);
    const lidos = fs.readSync(fd, buffer, 0, buffer.length, 0);
    const cabecalho = buffer.subarray(0, lidos).toString("utf-8").split(/\r?\n/)[0].replace(/^﻿/, "");
    const colunas = Papa.parse<string[]>(cabecalho).data[0] ?? [];
    return colunas.filter((c) => c && c !== "Data");
  } finally {
    fs.closeSync(fd);
  }
}

/** Última data presente no CSV, lendo só o fim do arquivo. */
function ultimoPregaoDoCSV(): string | null {
  try {
    const fd = fs.openSync(caminho(ARQ_ATIVOS), "r");
    try {
      const tamanho = fs.fstatSync(fd).size;
      const pedaco = Math.min(4096, tamanho);
      const buffer = Buffer.alloc(pedaco);
      fs.readSync(fd, buffer, 0, pedaco, tamanho - pedaco);
      const linhas = buffer.toString("utf-8").split(/\r?\n/).filter((l) => l.trim());
      const [dia, mes, ano] = linhas[linhas.length - 1].split(",")[0].split(" ")[0].split("/");
      return ano && mes && dia ? `${ano}-${mes}-${dia}` : null;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

export function lerStatus(): StatusDados {
  let atualizadoEm: string | null = null;
  let ultimoPregao: string | null = null;
  let tickersSemDados: TickerSemDados[] = [];

  try {
    const bruto = JSON.parse(fs.readFileSync(caminho(ARQ_STATUS), "utf-8"));
    atualizadoEm = bruto.atualizadoEm ?? null;
    ultimoPregao = bruto.ativos?.ultimoPregao ?? null;
    tickersSemDados = bruto.tickersSemDados ?? [];
  } catch {
    // Sem arquivo de status (primeira execução, ou Action ainda não rodou):
    // caímos para a última data do próprio CSV.
  }

  return {
    atualizadoEm,
    ultimoPregao: ultimoPregao ?? ultimoPregaoDoCSV(),
    tickersSemDados,
  };
}

/**
 * Tickers de cada base de ativos, prontos para o HTML.
 *
 * São só os cabeçalhos: uns poucos KB por base, contra os 2,2 MB que a tabela
 * inteira ocuparia se fosse serializada na página.
 */
export function lerTickersPorBase(): Record<string, string[]> {
  const saida: Record<string, string[]> = {};
  for (const base of BASES) {
    const arquivo = base.arquivo.replace(/^\/Dados\//, "");
    try {
      saida[base.id] = lerTickers(arquivo);
    } catch {
      // Base ausente (arquivo ainda não gerado) não derruba a página: ela
      // simplesmente aparece vazia no seletor.
      saida[base.id] = [];
    }
  }
  return saida;
}

/**
 * Primeiro pregão com preço de cada papel que estreou depois do início do
 * arquivo.
 *
 * Só entram os atrasados: numa base em que todo mundo existe desde a primeira
 * linha, o retorno é `{}`. Isso mantém o payload da página em alguns bytes em
 * vez de uma entrada por ticker.
 *
 * Existe porque um único ativo sem cotação na janela escolhida zera a
 * estratégia inteira — a matriz de covariância sai com NaN e o otimizador
 * devolve nada. Sem esta lista, o usuário via o cartão simplesmente sumir.
 */
function lerEstreias(arquivo: string): Record<string, string> {
  const conteudo = fs.readFileSync(caminho(arquivo), "utf-8");
  const linhas = conteudo.split(/\r?\n/).filter((l) => l.trim());
  if (linhas.length < 2) return {};

  const colunas = (Papa.parse<string[]>(linhas[0].replace(/^\ufeff/, "")).data[0] ?? []);
  const tickers = colunas.slice(1);

  const estreia: Record<string, string> = {};
  const pendentes = new Set(tickers.map((_, i) => i));

  for (let l = 1; l < linhas.length && pendentes.size; l++) {
    const celulas = Papa.parse<string[]>(linhas[l]).data[0] ?? [];
    const [dia, mes, ano] = String(celulas[0] ?? "").split(" ")[0].split("/");
    const iso = ano && mes && dia ? `${ano}-${mes}-${dia}` : null;
    if (!iso) continue;

    for (const i of [...pendentes]) {
      const valor = String(celulas[i + 1] ?? "").trim();
      if (valor !== "") {
        pendentes.delete(i);
        // Só interessa quem não estava lá desde o primeiro pregão.
        if (l > 1) estreia[tickers[i]] = iso;
      }
    }
  }

  return estreia;
}

/** Estreias de cada base, para a página avisar antes de simular. */
export function lerEstreiasPorBase(): Record<string, Record<string, string>> {
  const saida: Record<string, Record<string, string>> = {};
  for (const base of BASES) {
    const arquivo = base.arquivo.replace(/^\/Dados\//, "");
    try {
      saida[base.id] = lerEstreias(arquivo);
    } catch {
      saida[base.id] = {};
    }
  }
  return saida;
}
