"use client";

import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { volatilidadeMovel, JANELA_RISCO } from "../lib/metricas";
import type { MetaEstrategia } from "../lib/estrategias-meta";
import Ajuda from "./Ajuda";

interface Ponto { data: string; valor: number }

interface Props {
  /** Só as estratégias: benchmark mensal interpolado daria risco de mentira. */
  series: MetaEstrategia[];
  dados: Partial<Record<string, Ponto[] | null>>;
}

function mesAno(iso: string): string {
  const [ano, mes] = iso.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(mes) - 1]}/${ano.slice(-2)}`;
}

function pct(v: number): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

/**
 * Risco realizado de cada estratégia, lado a lado.
 *
 * A tese do trabalho é sobre risco, mas o gráfico principal mostra retorno —
 * e retorno esconde justamente o que a Paridade promete. Aqui dá para ver se
 * a carteira dela oscila menos, e sobretudo se oscila de forma mais ESTÁVEL
 * que as outras: a linha mais plana é a que está entregando o que o método
 * diz entregar, mesmo que não seja a mais baixa.
 */
export default function GraficoRisco({ series, dados }: Props) {
  const { linhas, comDados, dominio } = useMemo(() => {
    const porSerie = new Map<string, ReturnType<typeof volatilidadeMovel>>();
    series.forEach((e) => {
      const v = volatilidadeMovel(dados[e.id]);
      if (v.length > 1) porSerie.set(e.id, v);
    });

    const combinado: Record<string, Record<string, number | string>> = {};
    porSerie.forEach((pontos, id) => {
      pontos.forEach((p) => {
        (combinado[p.data] ??= { data: p.data })[id] = p.risco;
      });
    });

    const ordenadas = Object.values(combinado).sort((a, b) =>
      String(a.data).localeCompare(String(b.data))
    );

    let minimo = Infinity;
    let maximo = -Infinity;
    porSerie.forEach((pontos) => pontos.forEach((p) => {
      if (p.risco < minimo) minimo = p.risco;
      if (p.risco > maximo) maximo = p.risco;
    }));

    const folga = Number.isFinite(minimo) ? (maximo - minimo) * 0.1 || 1 : 1;
    return {
      linhas: ordenadas,
      comDados: series.filter((e) => porSerie.has(e.id)),
      dominio: Number.isFinite(minimo)
        ? ([Math.max(0, minimo - folga), maximo + folga] as [number, number])
        : ([0, 1] as [number, number]),
    };
  }, [series, dados]);

  // Menos de dois pontos não desenha curva; período curto simplesmente não
  // tem janela suficiente, e dizer isso é melhor que mostrar um gráfico vazio.
  if (!comDados.length) {
    return (
      <div className="cartao">
        <p className="secao__titulo">
          <span>Risco ao longo do tempo</span>
        </p>
        <p className="dica">
          O período é curto demais: a janela de {JANELA_RISCO} pregões ainda não
          fechou nenhuma medida.
        </p>
      </div>
    );
  }

  return (
    <div className="cartao">
      <p className="secao__titulo">
        <span>Risco ao longo do tempo</span>
        <span className="secao__acoes">
          <Ajuda alinhar="direita">
            Volatilidade anualizada em janela móvel de {JANELA_RISCO} pregões
            (cerca de três meses). É o risco que a carteira de fato correu, não
            o que o otimizador estimou ao rebalancear. A linha mais plana é a
            que manteve o risco sob controle — que costuma importar mais do que
            ser a mais baixa num instante.
          </Ajuda>
        </span>
      </p>

      <div className="grafico--baixo" style={{ width: "100%" }}>
        <ResponsiveContainer>
          <LineChart data={linhas} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--borda)" vertical={false} />
            <XAxis
              dataKey="data"
              stroke="var(--texto-suave)"
              tick={{ fontSize: 11 }}
              minTickGap={52}
              tickFormatter={(v) => mesAno(String(v))}
            />
            <YAxis
              stroke="var(--texto-suave)"
              tick={{ fontSize: 11 }}
              width={54}
              domain={dominio}
              tickFormatter={(v) => pct(Number(v))}
            />
            <Tooltip
              contentStyle={{
                background: "var(--fundo-elevado)",
                borderColor: "var(--borda)",
                borderRadius: "var(--raio-p)",
                fontSize: "12px",
              }}
              labelFormatter={(v) => {
                const [a, m, d] = String(v).split("-");
                return `${d}/${m}/${a}`;
              }}
              formatter={(v, nome) => [pct(Number(v)), String(nome)]}
            />
            {comDados.map((e) => (
              <Line
                key={e.id}
                type="monotone"
                dataKey={e.id}
                name={e.titulo}
                stroke={e.cor}
                strokeWidth={2}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
