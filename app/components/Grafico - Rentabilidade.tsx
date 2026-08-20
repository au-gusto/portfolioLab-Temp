"use client";
import { useMemo, useState } from "react";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

import { ESTRATEGIAS } from "../lib/estrategias-meta";
import { reduzirPontos, PONTOS_NO_GRAFICO } from "../lib/amostragem";

interface Ponto { data: string; valor: number }
interface ConfigSimulacao { dataInicio: string; dataFim: string }

interface Props {
  dados: Partial<Record<string, Ponto[] | null>>;
  config: ConfigSimulacao | null;
  /** Quais séries o modo atual permite, na ordem do catálogo. */
  series: string[];
}

/** 2.1234 -> "+212,34%". Duas casas, sempre, com sinal explícito. */
function porcentagem(v: number, comSinal = true): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  const n = (v * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
  return (comSinal && v >= 0 ? "+" : "") + n + "%";
}

function reais(v: number): string {
  return "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function mesAno(iso: string): string {
  const [ano, mes] = iso.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(mes) - 1]}/${ano.slice(-2)}`;
}

export default function Grafico({ dados, config, series }: Props) {
  const [valorReferencia, setValorReferencia] = useState(1000);

  // Junta as séries por data e repete o último valor conhecido nos dias em que
  // uma estratégia não tem ponto, para as linhas não ficarem picotadas.
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
      {config && (
        <div className="metricas">
          <div className="metrica metrica--editavel">
            <p className="metrica__rotulo">Se eu tivesse investido</p>
            <div className="metrica__entrada">
              <span aria-hidden="true">R$</span>
              <input
                type="text"
                inputMode="numeric"
                className="tabular"
                value={valorReferencia.toLocaleString("pt-BR")}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, ""));
                  if (!Number.isNaN(n)) setValorReferencia(n);
                }}
                aria-label="Valor de referência em reais"
              />
            </div>
          </div>

          {doModo.map(({ id, titulo, cor }) => {
            const serie = dados[id];
            if (!serie?.length) return null;
            const ultimo = serie[serie.length - 1];
            if (!ultimo || typeof ultimo.valor !== "number" || Number.isNaN(ultimo.valor)) return null;
            const positivo = ultimo.valor >= 0;
            return (
              <div key={id} className="metrica" style={{ borderTopColor: cor }}>
                <p className="metrica__rotulo">{titulo}</p>
                <p
                  className="metrica__valor tabular"
                  style={{ color: positivo ? "var(--positivo)" : "var(--negativo)" }}
                >
                  {porcentagem(ultimo.valor)}
                </p>
                <p className="metrica__extra tabular">
                  {reais(valorReferencia * (1 + ultimo.valor))}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="cartao">
        <p className="secao__titulo">Retorno acumulado</p>
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
                tickFormatter={(v) => porcentagem(Number(v), false)}
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
                formatter={(v, nome) => [porcentagem(Number(v)), String(nome)]}
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
