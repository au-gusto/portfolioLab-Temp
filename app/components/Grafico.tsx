"use client";

import { useMemo } from "react";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

import { ESTRATEGIAS } from "../lib/estrategias-meta";
import { reduzirPontos, PONTOS_NO_GRAFICO } from "../lib/amostragem";

interface Ponto { data: string; valor: number }

interface ConfigSimulacao {
  aporteInicial: number;
  aportesMensal: number;
  dataInicio: string;
  dataFim: string;
}

interface Props {
  dados: Partial<Record<string, Ponto[] | null>>;
  config: ConfigSimulacao | null;
  /** Quais séries o modo atual permite, na ordem do catálogo. */
  series: string[];
}

function reais(v: number, casas = 2): string {
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

/** Eixo Y: R$ 12.345 vira "12,3 mil" para não estourar a largura no celular. */
function reaisCurto(v: number): string {
  if (Math.abs(v) >= 1000) {
    return (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil";
  }
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function porcentagem(v: number): string {
  const n = v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v >= 0 ? "+" : "") + n + "%";
}

function mesAno(iso: string): string {
  const [ano, mes] = iso.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(mes) - 1]}/${ano.slice(-2)}`;
}

/**
 * Quanto foi efetivamente aportado. Conta os meses de rebalanceamento, que é
 * o que a simulação percorre — o primeiro aporte acontece no primeiro dia 1º
 * a partir da data de início, não na própria data escolhida.
 */
function totalInvestido(config: ConfigSimulacao): number {
  const inicio = new Date(config.dataInicio + "T00:00:00");
  const fim = new Date(config.dataFim + "T00:00:00");
  const primeiro = new Date(inicio.getFullYear(), inicio.getMonth() + (inicio.getDate() > 1 ? 1 : 0), 1);
  const meses =
    (fim.getFullYear() - primeiro.getFullYear()) * 12 + (fim.getMonth() - primeiro.getMonth()) + 1;
  const n = Math.max(0, meses);
  return n === 0 ? 0 : config.aporteInicial + config.aportesMensal * (n - 1);
}

export default function Grafico({ dados, config, series }: Props) {
  const investido = config ? totalInvestido(config) : null;

  const combinado: Record<string, Record<string, number | string>> = {};
  const doModo = ESTRATEGIAS.filter((e) => series.includes(e.id));

  doModo.forEach(({ id }) => {
    const serie = dados[id];
    serie?.forEach((item) => {
      if (!combinado[item.data]) combinado[item.data] = { data: item.data };
      combinado[item.data][id] = item.valor;
    });
  });

  const chartDataCompleto = Object.values(combinado).sort((a, b) =>
    String(a.data).localeCompare(String(b.data))
  );

  const ultimos: Record<string, number | null> = Object.fromEntries(series.map((s) => [s, null]));
  chartDataCompleto.forEach((item) => {
    const doModo = ESTRATEGIAS.filter((e) => series.includes(e.id));

  doModo.forEach(({ id }) => {
      if (item[id] !== undefined) ultimos[id] = item[id] as number;
      else if (ultimos[id] !== null) item[id] = ultimos[id] as number;
    });
  });

  // Reduz os pontos só para desenhar. Os cartões acima continuam lendo a série
  // completa, então nenhum número muda — só o custo de pintar o SVG.
  const chartData = useMemo(
    () => reduzirPontos(chartDataCompleto, PONTOS_NO_GRAFICO, (p) => Number(p["paridade"] ?? 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartDataCompleto.length, chartDataCompleto[0]?.data, chartDataCompleto[chartDataCompleto.length - 1]?.data]
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", width: "100%" }}>
      {config && investido !== null && (
        <div className="metricas">
          <div className="metrica">
            <p className="metrica__rotulo">Total investido</p>
            <p className="metrica__valor tabular">{reais(investido, 0)}</p>
                      </div>

          {doModo.map(({ id, titulo, cor }) => {
            const serie = dados[id];
            if (!serie?.length) return null;
            const final = serie[serie.length - 1].valor;
            if (typeof final !== "number" || Number.isNaN(final)) return null;
            const retorno = investido > 0 ? ((final - investido) / investido) * 100 : 0;
            const positivo = retorno >= 0;
            return (
              <div key={id} className="metrica" style={{ borderTopColor: cor }}>
                <p className="metrica__rotulo">{titulo}</p>
                <p className="metrica__valor tabular">{reais(final)}</p>
                <p
                  className="metrica__extra tabular"
                  style={{ color: positivo ? "var(--positivo)" : "var(--negativo)" }}
                >
                  {porcentagem(retorno)} sobre o investido
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="cartao">
        <p className="secao__titulo">Evolução do patrimônio</p>
        <div className="grafico">
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--borda)" />
              <XAxis
                dataKey="data"
                stroke="var(--texto-suave)"
                tick={{ fontSize: 11 }}
                minTickGap={64}
                tickFormatter={(v) => mesAno(String(v))}
              />
              <YAxis
                stroke="var(--texto-suave)"
                tick={{ fontSize: 11 }}
                width={70}
                tickFormatter={(v) => reaisCurto(Number(v))}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--fundo-elevado)",
                  borderColor: "var(--borda)",
                  borderRadius: "6px",
                  fontSize: "12px",
                }}
                labelFormatter={(v) => {
                  const [a, m, d] = String(v).split("-");
                  return `${d}/${m}/${a}`;
                }}
                formatter={(v, nome) => [reais(Number(v)), String(nome)]}
              />
              <Legend wrapperStyle={{ fontSize: "12px" }} />
              {doModo.map(({ id, titulo, cor, tracejado }) =>
                dados[id] ? (
                  <Line
                    key={id} type="monotone" dataKey={id} stroke={cor}
                    name={titulo} dot={false} strokeWidth={2}
                    strokeDasharray={tracejado ? "5 4" : undefined}
                    connectNulls
                    isAnimationActive={false}
                  />
                ) : null
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
