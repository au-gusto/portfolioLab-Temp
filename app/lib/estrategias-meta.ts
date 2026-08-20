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
  /** Embutidas têm id fixo; as do usuário usam "usuario-<timestamp>". */
  id: string;
  grupo: Grupo;
  /** Só o que o usuário criou pode ser editado ou apagado. */
  doUsuario?: boolean;
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
    id: "minvar",
    grupo: "estrategia",
    titulo: "Menor Variância",
    descricao: "Markowitz que só minimiza risco — não estima retorno esperado.",
    cor: "var(--serie-minvar)",
    modos: ["rentabilidade"],
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

/**
 * Catálogo completo: as embutidas mais as que o usuário escreveu.
 *
 * Estratégia do usuário é sempre do grupo "estrategia" e vale nos dois modos —
 * benchmark é referência de mercado, não faz sentido alguém inventar um.
 */
export function catalogo(doUsuario: { id: string; titulo: string; cor: string }[] = []): MetaEstrategia[] {
  return [
    ...ESTRATEGIAS,
    ...doUsuario.map((e) => ({
      id: e.id,
      grupo: "estrategia" as Grupo,
      doUsuario: true,
      titulo: e.titulo,
      descricao: "Estratégia sua, guardada neste navegador.",
      cor: e.cor,
    })),
  ];
}

export function doModo(
  modo: "aportes" | "rentabilidade",
  lista: MetaEstrategia[] = ESTRATEGIAS
) {
  return lista.filter((e) => !e.modos || e.modos.includes(modo));
}

export function doGrupo(
  grupo: Grupo,
  modo: "aportes" | "rentabilidade",
  lista: MetaEstrategia[] = ESTRATEGIAS
) {
  return doModo(modo, lista).filter((e) => e.grupo === grupo);
}

/** Cores disponíveis para estratégias novas, em rodízio. */
export const CORES_USUARIO = ["var(--cat-5)", "var(--cat-6)", "var(--cat-7)", "var(--cat-8)", "var(--cat-4)"];

/** Só as estratégias precisam de ativos selecionados. */
/** Benchmark ignora a carteira; estratégia (inclusive a do usuário) precisa dela. */
export function precisaDeAtivos(id: string): boolean {
  const meta = ESTRATEGIAS.find((e) => e.id === id);
  return meta ? meta.grupo === "estrategia" : true;
}

export function nomeDaEstrategia(id: string, lista: MetaEstrategia[] = ESTRATEGIAS): string {
  return lista.find((e) => e.id === id)?.titulo ?? id;
}

/** Compat: alguns componentes ainda chamam pelo nome antigo. */
