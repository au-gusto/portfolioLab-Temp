/**
 * app/lib/estrategias-meta.ts
 *
 * Catálogo do que pode aparecer no gráfico, em dois grupos:
 *
 *  - ESTRATÉGIA: aloca os ativos que o usuário escolheu, rebalanceando todo mês.
 *  - BENCHMARK: referência de mercado que ignora a carteira. Aplica a ideia
 *    ingênua (compra e segura) e devolve o retorno do período.
 *
 * A separação não é só visual: benchmark não consome ativo nenhum, então
 * misturá-los na mesma lista confundia — dava a impressão de que o CDI usava
 * os papéis selecionados.
 */

export type Grupo = "estrategia" | "benchmark";

export interface MetaEstrategia {
  id: "paridade" | "eficiente" | "ingenua" | "cdi" | "ibov" | "ipca" | "poupanca";
  grupo: Grupo;
  titulo: string;
  descricao: string;
  cor: string;
  /** Se ausente, vale para os dois modos. */
  modos?: readonly ("aportes" | "rentabilidade")[];
  /** Linha tracejada: distingue referência de estratégia no gráfico. */
  tracejado?: boolean;
}

export const ESTRATEGIAS: MetaEstrategia[] = [
  {
    id: "paridade",
    grupo: "estrategia",
    titulo: "Paridade de Risco",
    descricao: "Cada ativo contribui com a fatia de risco que você definir.",
    cor: "var(--serie-paridade)",
  },
  {
    id: "eficiente",
    grupo: "estrategia",
    titulo: "Carteira Eficiente",
    descricao: "Markowitz sem restrição de venda a descoberto.",
    cor: "var(--serie-eficiente)",
  },
  {
    id: "ingenua",
    grupo: "estrategia",
    titulo: "Ingênua (1/N)",
    descricao: "Peso igual para todos os ativos escolhidos.",
    cor: "var(--serie-ingenua)",
    modos: ["rentabilidade"],
  },

  {
    id: "cdi",
    grupo: "benchmark",
    titulo: "CDI",
    descricao: "Taxa de referência da renda fixa brasileira.",
    cor: "var(--serie-cdi)",
    tracejado: true,
  },
  {
    id: "ibov",
    grupo: "benchmark",
    titulo: "Ibovespa",
    descricao: "Índice da bolsa brasileira, comprado e mantido.",
    cor: "var(--serie-ibov)",
    tracejado: true,
  },
  {
    id: "poupanca",
    grupo: "benchmark",
    titulo: "Poupança",
    descricao: "Rendimento mensal da caderneta, regras atuais.",
    cor: "var(--serie-poupanca)",
    tracejado: true,
  },
  {
    id: "ipca",
    grupo: "benchmark",
    titulo: "IPCA",
    descricao: "Inflação acumulada. Ficar abaixo dela é perder poder de compra.",
    cor: "var(--serie-ipca)",
    tracejado: true,
  },
];

export type IdSerie = MetaEstrategia["id"];

export function doModo(modo: "aportes" | "rentabilidade") {
  return ESTRATEGIAS.filter((e) => !e.modos || e.modos.includes(modo));
}

export function doGrupo(grupo: Grupo, modo: "aportes" | "rentabilidade") {
  return doModo(modo).filter((e) => e.grupo === grupo);
}

/** Só as estratégias precisam de ativos selecionados. */
export function precisaDeAtivos(id: string): boolean {
  return ESTRATEGIAS.find((e) => e.id === id)?.grupo === "estrategia";
}

export function corDaEstrategia(id: string): string {
  return ESTRATEGIAS.find((e) => e.id === id)?.cor ?? "var(--texto-suave)";
}

export function nomeDaEstrategia(id: string): string {
  return ESTRATEGIAS.find((e) => e.id === id)?.titulo ?? id;
}

/** Compat: alguns componentes ainda chamam pelo nome antigo. */
export const estrategiasDoModo = doModo;
