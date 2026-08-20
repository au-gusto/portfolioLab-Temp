/**
 * app/lib/catalogo-ativos.ts
 *
 * Catálogo das bases de ativos disponíveis para simular.
 *
 * Até aqui existia uma base só — os papéis do Ibovespa — e ela era implícita:
 * o worker abria um caminho fixo e ninguém escolhia nada. Com mais de uma
 * carteira, e com o usuário podendo trazer a dele, a base virou uma escolha, e
 * escolha precisa de nome, descrição e regras próprias.
 *
 * Cada base carrega o seu `inicioMinimo`. Não é decoração: uma carteira que só
 * tem preço a partir de certa data produz, antes dela, uma matriz de
 * covariância montada de meia dúzia de pregões — o otimizador roda, devolve
 * pesos e não reclama de nada. O número sai errado em silêncio, que é o pior
 * jeito de sair errado.
 */

export interface BaseAtivos {
  id: string;
  titulo: string;
  /** Caminho do CSV servido pela CDN (vazio quando a base é do usuário). */
  arquivo: string;
  /**
   * Primeira data que a simulação aceita. `null` significa "o que houver no
   * arquivo". Costuma ser depois do início dos dados de propósito: o trecho
   * anterior existe para alimentar a janela de covariância, não para ser
   * simulado.
   */
  inicioMinimo: string | null;
  /** Base montada a partir de um arquivo que o usuário subiu. */
  doUsuario?: boolean;
}

export const BASE_PADRAO = "ibrx100";

export const BASES: BaseAtivos[] = [
  {
    id: "ibrx100",
    titulo: "IBRX-100",
    arquivo: "/Dados/Dados_Ativos_IBRX100_AdjClose.csv",
    inicioMinimo: "2024-01-01",
  },
  {
    id: "outros",
    titulo: "Outros",
    arquivo: "/Dados/Dados_Ativos_B3_AdjClose.csv",
    inicioMinimo: null,
  },
];

/** A base do usuário não fica na lista fixa: ela nasce quando ele sobe o arquivo. */
export const ID_BASE_PROPRIA = "propria";

export function basePropria(titulo: string): BaseAtivos {
  return {
    id: ID_BASE_PROPRIA,
    titulo,
    arquivo: "",
    inicioMinimo: null,
    doUsuario: true,
  };
}

export function acharBase(id: string, extras: BaseAtivos[] = []): BaseAtivos {
  return [...BASES, ...extras].find((b) => b.id === id) ?? BASES[0];
}

/** "2024-01-01" -> "01/01/2024", para falar com o usuário na língua dele. */
export function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Diz por que o período escolhido não serve para esta base, ou `null` se serve.
 *
 * Devolve texto pronto porque quem chama é a interface, e a regra ("por que
 * 2024 e não 2023?") só faz sentido junto com a data.
 */
export function motivoPeriodoInvalido(base: BaseAtivos, dataInicio: string): string | null {
  if (!base.inicioMinimo) return null;
  if (!dataInicio) return null;
  if (dataInicio >= base.inicioMinimo) return null;

  return `A base ${base.titulo} só pode ser simulada a partir de `
    + `${dataBR(base.inicioMinimo)}. Existe cotação antes disso, mas ela é `
    + `reservada para o cálculo de risco do primeiro mês.`;
}
