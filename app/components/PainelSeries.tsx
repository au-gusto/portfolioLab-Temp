"use client";

import type { MetaEstrategia } from "../lib/estrategias-meta";

interface Props {
  series: MetaEstrategia[];
  /** Séries escondidas do gráfico. Continuam calculadas — só não são desenhadas. */
  ocultas: Set<string>;
  alternar: (id: string) => void;
  /** Texto grande de cada cartão (retorno ou patrimônio). */
  principal: (id: string) => string | null;
  /** Linha de apoio embaixo. */
  apoio: (id: string) => string | null;
  /** Cor do número principal, quando faz sentido (positivo/negativo). */
  corPrincipal?: (id: string) => string | undefined;
}

/**
 * Faixa de cartões que também é a legenda do gráfico.
 *
 * Cada cartão liga e desliga a sua linha, como no Power BI: esconder não
 * recalcula nada, só deixa de desenhar. Com sete séries o gráfico vira um
 * emaranhado, e comparar duas de cada vez é o uso real.
 *
 * Os cartões acumulam as duas funções de propósito — antes a legenda do
 * gráfico repetia os mesmos nomes logo abaixo, gastando altura à toa.
 */
export default function PainelSeries({
  series, ocultas, alternar, principal, apoio, corPrincipal,
}: Props) {
  const visiveis = series.filter((e) => principal(e.id) !== null);
  if (!visiveis.length) return null;

  return (
    <div className="faixa-series" role="group" aria-label="Séries do gráfico">
      {visiveis.map((e) => {
        const oculta = ocultas.has(e.id);
        return (
          <button
            key={e.id}
            type="button"
            className={"serie-card" + (oculta ? " serie-card--oculta" : "")}
            style={{ "--cor-serie": e.cor } as React.CSSProperties}
            onClick={() => alternar(e.id)}
            aria-pressed={!oculta}
            title={oculta ? `Mostrar ${e.titulo}` : `Esconder ${e.titulo}`}
          >
            <span className="serie-card__topo">
              <span
                className="serie-card__marca"
                style={{
                  background: e.tracejado ? "transparent" : e.cor,
                  borderTop: e.tracejado ? `2px dashed ${e.cor}` : "none",
                }}
              />
              <span className="serie-card__nome">{e.titulo}</span>
            </span>
            <span className="serie-card__valor tabular" style={{ color: corPrincipal?.(e.id) }}>
              {principal(e.id)}
            </span>
            <span className="serie-card__apoio tabular">{apoio(e.id)}</span>
          </button>
        );
      })}
    </div>
  );
}
