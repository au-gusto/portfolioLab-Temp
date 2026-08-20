"use client";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import Ajuda from "./Ajuda";

export interface PontoRisco { data: string; risco: number }

interface Props {
  risco: PontoRisco[];
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
 * Volatilidade da carteira 1/N ao longo do tempo.
 *
 * O ponto do gráfico é mostrar que peso igual não produz risco constante: as
 * volatilidades e correlações dos ativos mudam mês a mês, e a carteira ingênua
 * segue junto sem que ninguém decida nada. É esse deslocamento que a Paridade
 * de Risco existe para corrigir — daí valer a pena vê-lo desenhado.
 */
export default function GraficoRisco({ risco }: Props) {
  if (risco.length < 2) return null;

  const valores = risco.map((p) => p.risco);
  const media = valores.reduce((s, v) => s + v, 0) / valores.length;
  const minimo = Math.min(...valores);
  const maximo = Math.max(...valores);
  const folga = (maximo - minimo) * 0.12 || 1;

  return (
    <div className="cartao">
      <p className="secao__titulo">
        <span>Risco da carteira Ingênua</span>
        <span className="secao__acoes">
          <span className="tabular" style={{ fontSize: "12px", color: "var(--texto-suave)" }}>
            {pct(minimo)} – {pct(maximo)}
          </span>
          <Ajuda alinhar="direita">
            Volatilidade anualizada da carteira de pesos iguais, recalculada a
            cada rebalanceamento sobre a janela de um ano anterior. A linha
            tracejada é a média do período. Peso igual não significa risco
            constante — é essa variação que a Paridade de Risco procura eliminar.
          </Ajuda>
        </span>
      </p>

      <div className="grafico--baixo" style={{ width: "100%" }}>
        <ResponsiveContainer>
          <LineChart data={risco} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--borda)" vertical={false} />
            <XAxis
              dataKey="data"
              stroke="var(--texto-suave)"
              tick={{ fontSize: 11 }}
              minTickGap={48}
              tickFormatter={(v) => mesAno(String(v))}
            />
            <YAxis
              stroke="var(--texto-suave)"
              tick={{ fontSize: 11 }}
              width={58}
              domain={[minimo - folga, maximo + folga]}
              tickFormatter={(v) => pct(Number(v))}
            />
            <Tooltip
              contentStyle={{
                background: "var(--fundo-elevado)",
                borderColor: "var(--borda)",
                borderRadius: "var(--raio-p)",
                fontSize: "12px",
              }}
              labelFormatter={(v) => mesAno(String(v))}
              formatter={(v) => [pct(Number(v)), "Volatilidade anual"]}
            />
            <ReferenceLine
              y={media}
              stroke="var(--texto-suave)"
              strokeDasharray="4 4"
              strokeOpacity={0.7}
            />
            <Line
              type="monotone"
              dataKey="risco"
              stroke="var(--serie-ingenua)"
              strokeWidth={2.5}
              dot={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
