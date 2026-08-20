"use client";

import { useMemo } from "react";
import { calcular, type Metricas } from "../lib/metricas";
import type { MetaEstrategia } from "../lib/estrategias-meta";
import Ajuda from "./Ajuda";

interface Ponto { data: string; valor: number }

interface Props {
  series: MetaEstrategia[];
  dados: Partial<Record<string, Ponto[] | null>>;
}

function pct(v: number | null, casas = 2, comSinal = false): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const n = (v * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: casas, maximumFractionDigits: casas,
  });
  return (comSinal && v >= 0 ? "+" : "") + n + "%";
}

function numero(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Tabela de risco, uma linha por série.
 *
 * O retorno acumulado sozinho engana: duas carteiras podem terminar no mesmo
 * lugar tendo passado por quedas muito diferentes no caminho, e é a queda que
 * faz alguém desistir no meio. Estas colunas existem para o retorno não ser
 * julgado no vácuo.
 */
export default function PainelMetricas({ series, dados }: Props) {
  const linhas = useMemo(() => {
    const cdi = dados["cdi"] ?? null;
    return series
      .map((e) => ({ meta: e, m: calcular(dados[e.id], cdi) }))
      .filter((l): l is { meta: MetaEstrategia; m: Metricas } => l.m !== null);
  }, [series, dados]);

  if (!linhas.length) return null;

  return (
    <div className="cartao">
      <p className="secao__titulo">
        <span>Risco e consistência</span>
        <Ajuda alinhar="direita">
          A volatilidade é o desvio padrão dos retornos diários, anualizado. A
          queda máxima é a maior perda de topo a fundo dentro do período. O
          Sharpe usa o CDI do próprio período como taxa livre de risco — se o
          CDI não estiver marcado, a coluna fica vazia.
        </Ajuda>
      </p>

      <div className="rolagem-x">
        <table className="tabela-metricas">
          <thead>
            <tr>
              <th>Série</th>
              <th>Retorno</th>
              <th>Ao ano</th>
              <th>Volatilidade</th>
              <th>Queda máx.</th>
              <th>Sharpe</th>
              <th>Dias +</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ meta, m }) => (
              <tr key={meta.id}>
                <th scope="row">
                  <span className="tabela-metricas__marca" style={{ background: meta.cor }} />
                  {meta.titulo}
                </th>
                <td className="tabular" style={{ color: m.retorno >= 0 ? "var(--positivo)" : "var(--negativo)" }}>
                  {pct(m.retorno, 2, true)}
                </td>
                <td className="tabular">{pct(m.retornoAnual, 2, true)}</td>
                <td className="tabular">{pct(m.volatilidade)}</td>
                <td className="tabular" style={{ color: m.quedaMaxima > 0 ? "var(--negativo)" : undefined }}>
                  {m.quedaMaxima > 0 ? "−" + pct(m.quedaMaxima) : "—"}
                </td>
                <td className="tabular">{numero(m.sharpe)}</td>
                <td className="tabular">{pct(m.diasPositivos, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
