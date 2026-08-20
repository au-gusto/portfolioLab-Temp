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
 * Lê apenas o cabeçalho do CSV para descobrir os tickers.
 *
 * A tabela inteira não é serializada para o navegador: virava ~2,4 MB de JSON
 * embutido no HTML de toda visita.
 */
export function lerTickers(): string[] {
  const fd = fs.openSync(caminho(ARQ_ATIVOS), "r");
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
