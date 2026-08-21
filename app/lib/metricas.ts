/**
 * app/lib/metricas.ts
 *
 * Métricas de risco calculadas a partir da série que a estratégia já devolveu.
 *
 * Nada disto volta ao Python. A série diária de retorno acumulado tem tudo que
 * é preciso, e recalcular no navegador custa microssegundos — mandar de volta
 * para o worker custaria uma ida e volta por estratégia, por simulação.
 *
 * O retorno acumulado do gráfico é `v` tal que o patrimônio vale `1 + v`. Todas
 * as contas aqui partem dessa curva.
 */

const PREGOES_POR_ANO = 252;

export interface Metricas {
  /** Retorno do período inteiro (0.2637 = +26,37%). */
  retorno: number;
  /** Retorno anualizado (CAGR), pelo tempo de calendário decorrido. */
  retornoAnual: number | null;
  /** Volatilidade anualizada dos retornos diários. */
  volatilidade: number | null;
  /** Maior queda de topo a fundo na curva de patrimônio. Sempre ≥ 0. */
  quedaMaxima: number;
  /** (retorno anual − CDI anual) / volatilidade. Null sem CDI no período. */
  sharpe: number | null;
  /** Fração de dias com retorno diário positivo. */
  diasPositivos: number | null;
}

interface Ponto { data: string; valor: number }

/** Dias corridos entre o primeiro e o último ponto. */
function diasDeCalendario(serie: Ponto[]): number {
  const inicio = new Date(serie[0].data + "T00:00:00").getTime();
  const fim = new Date(serie[serie.length - 1].data + "T00:00:00").getTime();
  const dias = (fim - inicio) / 86400000;
  return dias > 0 ? dias : 0;
}

/** Converte a curva acumulada em retornos diários. */
function retornosDiarios(serie: Ponto[]): number[] {
  const saida: number[] = [];
  for (let i = 1; i < serie.length; i++) {
    const antes = 1 + serie[i - 1].valor;
    const agora = 1 + serie[i].valor;
    // Patrimônio zerado ou negativo não tem retorno definido; a alavancagem
    // sem teto chegava a produzir isso.
    if (antes > 0 && Number.isFinite(antes) && Number.isFinite(agora)) {
      saida.push(agora / antes - 1);
    }
  }
  return saida;
}

function desvioPadrao(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const media = xs.reduce((s, x) => s + x, 0) / xs.length;
  // Divisor n−1: é uma amostra do processo, não a população inteira.
  const variancia = xs.reduce((s, x) => s + (x - media) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variancia);
}

/**
 * Maior queda de topo a fundo.
 *
 * É a métrica que o investidor sente, e a que o retorno acumulado esconde:
 * duas carteiras podem terminar no mesmo lugar tendo passado por quedas muito
 * diferentes no meio do caminho.
 */
function quedaMaxima(serie: Ponto[]): number {
  let topo = -Infinity;
  let pior = 0;
  for (const p of serie) {
    const patrimonio = 1 + p.valor;
    if (!Number.isFinite(patrimonio)) continue;
    if (patrimonio > topo) topo = patrimonio;
    if (topo > 0) {
      const queda = 1 - patrimonio / topo;
      if (queda > pior) pior = queda;
    }
  }
  return pior;
}

/** Anualiza um retorno de período pelo tempo de calendário decorrido. */
function anualizar(retorno: number, dias: number): number | null {
  if (dias <= 0 || 1 + retorno <= 0) return null;
  const anos = dias / 365.25;
  if (anos <= 0) return null;
  return Math.pow(1 + retorno, 1 / anos) - 1;
}

export function calcular(serie: Ponto[] | null | undefined, cdi?: Ponto[] | null): Metricas | null {
  if (!serie || serie.length < 2) return null;

  const retorno = serie[serie.length - 1].valor;
  const dias = diasDeCalendario(serie);
  const retornoAnual = anualizar(retorno, dias);

  const diarios = retornosDiarios(serie);
  const dp = desvioPadrao(diarios);
  const volatilidade = dp === null ? null : dp * Math.sqrt(PREGOES_POR_ANO);

  const diasPositivos = diarios.length
    ? diarios.filter((r) => r > 0).length / diarios.length
    : null;

  // O CDI entra como taxa livre de risco. Ele vem como série acumulada do mesmo
  // período, então basta anualizá-lo do mesmo jeito — usar um número fixo de
  // "juros do Brasil" daria um Sharpe que não corresponde ao período simulado.
  let sharpe: number | null = null;
  if (retornoAnual !== null && volatilidade !== null && volatilidade > 0 && cdi?.length) {
    const cdiAnual = anualizar(cdi[cdi.length - 1].valor, diasDeCalendario(cdi));
    if (cdiAnual !== null) sharpe = (retornoAnual - cdiAnual) / volatilidade;
  }

  return {
    retorno,
    retornoAnual,
    volatilidade,
    quedaMaxima: quedaMaxima(serie),
    sharpe,
    diasPositivos,
  };
}

/** Janela da volatilidade móvel, em pregões. Três meses: suave o bastante
 *  para comparar curvas sem virar uma linha reta. */
export const JANELA_RISCO = 63;

export interface PontoRisco { data: string; risco: number }

/**
 * Volatilidade anualizada em janela móvel.
 *
 * É o risco REALIZADO, calculado do que a carteira de fato fez — diferente do
 * risco que o otimizador estimou na hora de rebalancear. Para comparar
 * estratégias é o número mais honesto: a Paridade promete manter a
 * contribuição de risco equilibrada, e o que se quer ver é se a oscilação da
 * carteira ficou mesmo mais estável do que a das outras.
 *
 * Sai da mesma série que o gráfico já usa, então serve para qualquer
 * estratégia sem que nenhuma delas precise calcular nada em Python.
 */
export function volatilidadeMovel(
  serie: Ponto[] | null | undefined,
  janela = JANELA_RISCO,
): PontoRisco[] {
  if (!serie || serie.length < janela + 2) return [];

  const diarios: { data: string; r: number }[] = [];
  for (let i = 1; i < serie.length; i++) {
    const antes = 1 + serie[i - 1].valor;
    const agora = 1 + serie[i].valor;
    if (antes > 0 && Number.isFinite(antes) && Number.isFinite(agora)) {
      diarios.push({ data: serie[i].data, r: agora / antes - 1 });
    }
  }
  if (diarios.length < janela) return [];

  // Soma e soma dos quadrados deslizantes: a variância de cada janela sai em
  // tempo constante, em vez de refazer a conta sobre 63 pontos a cada dia.
  const saida: PontoRisco[] = [];
  let soma = 0;
  let somaQuadrados = 0;

  for (let i = 0; i < diarios.length; i++) {
    soma += diarios[i].r;
    somaQuadrados += diarios[i].r * diarios[i].r;

    if (i >= janela) {
      const saiu = diarios[i - janela].r;
      soma -= saiu;
      somaQuadrados -= saiu * saiu;
    }
    if (i < janela - 1) continue;

    const media = soma / janela;
    const variancia = (somaQuadrados - janela * media * media) / (janela - 1);
    if (variancia >= 0 && Number.isFinite(variancia)) {
      saida.push({
        data: diarios[i].data,
        risco: Math.sqrt(variancia) * Math.sqrt(PREGOES_POR_ANO) * 100,
      });
    }
  }

  return saida;
}
