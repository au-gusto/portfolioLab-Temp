"use client";
import { useMemo, useState } from "react";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

import { type MetaEstrategia } from "../lib/estrategias-meta";
import { reduzirPontos, PONTOS_NO_GRAFICO } from "../lib/amostragem";
import PainelSeries from "./PainelSeries";

interface Ponto { data: string; valor: number }
interface ConfigSimulacao { dataInicio: string; dataFim: string }

interface Props {
  dados: Partial<Record<string, Ponto[] | null>>;
  config: ConfigSimulacao | null;
  /** Quais séries o modo atual permite, na ordem do catálogo. */
  series: string[];
  /** Catálogo completo (embutidas + do usuário). */
  lista: MetaEstrategia[];
  valorReferencia: number;
  setValorReferencia: (v: number) => void;
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

export default function Grafico({ dados, config, series, lista, valorReferencia, setValorReferencia }: Props) {
  /** Séries escondidas do desenho. Ficam calculadas — só não aparecem. */
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());

  function alternar(id: string) {
    setOcultas((atual) => {
      const proxima = new Set(atual);
      if (proxima.has(id)) proxima.delete(id);
      else proxima.add(id);
      return proxima;
    });
  }

  const doModo = useMemo(() => lista.filter((e) => series.includes(e.id)), [lista, series]);
  /**
   * Domínio do eixo Y calculado sobre TODAS as séries, não só as visíveis.
   *
   * Sem isso a escala pulava a cada clique num cartão: esconder o CDI mudava o
   * topo do gráfico e as linhas que sobravam saltavam de lugar. Fixando o
   * domínio, ligar e desligar séries só acrescenta e remove traços — o que é
   * exatamente o ponto de poder comparar duas delas.
   */
  const dominioY = useMemo<[number, number]>(() => {
    let minimo = Infinity;
    let maximo = -Infinity;
    doModo.forEach(({ id }) => {
      dados[id]?.forEach((p) => {
        if (typeof p.valor === "number" && Number.isFinite(p.valor)) {
          if (p.valor < minimo) minimo = p.valor;
          if (p.valor > maximo) maximo = p.valor;
        }
      });
    });
    if (!Number.isFinite(minimo) || !Number.isFinite(maximo)) return [0, 1];
    const folga = (maximo - minimo) * 0.06 || Math.abs(maximo) * 0.06 || 1;
    return [minimo - folga, maximo + folga];
  }, [dados, doModo]);


  // Junta as séries por data e repete o último valor conhecido nos dias em que
  // uma estratégia não tem ponto, para as linhas não ficarem picotadas.
  const chartDataCompleto = useMemo(() => {
    const combinado: Record<string, Record<string, number | string>> = {};
    doModo.forEach(({ id }) => {
      dados[id]?.forEach((item) => {
        if (!combinado[item.data]) combinado[item.data] = { data: item.data };
        combinado[item.data][id] = item.valor;
      });
    });

    const linhas = Object.values(combinado).sort((a, b) =>
      String(a.data).localeCompare(String(b.data))
    );

    const ultimos: Record<string, number | null> = Object.fromEntries(series.map((s) => [s, null]));
    linhas.forEach((item) => {
      doModo.forEach(({ id }) => {
        if (item[id] !== undefined) ultimos[id] = item[id] as number;
        else if (ultimos[id] !== null) item[id] = ultimos[id] as number;
      });
    });
    return linhas;
  }, [dados, doModo, series]);

  // Reduz os pontos só para desenhar. Os cartões continuam lendo a série
  // completa, então nenhum número muda — só o custo de pintar o SVG.
  const chartData = useMemo(
    () => reduzirPontos(chartDataCompleto, PONTOS_NO_GRAFICO, (p) => Number(p["paridade"] ?? 0)),
    [chartDataCompleto]
  );

  function ultimoValor(id: string): number | null {
    const serie = dados[id];
    if (!serie?.length) return null;
    const v = serie[serie.length - 1]?.valor;
    return typeof v === "number" && !Number.isNaN(v) ? v : null;
  }

  return (
    <div className="cartao bloco-grafico">
      <div className="bloco-grafico__topo">
        <p className="secao__titulo" style={{ margin: 0 }}>Retorno acumulado</p>

        {config && (
          <label className="referencia">
            <span className="referencia__rotulo">Investindo</span>
            <span className="referencia__prefixo">R$</span>
            <input
              type="text"
              inputMode="numeric"
              className="referencia__campo tabular"
              value={valorReferencia.toLocaleString("pt-BR")}
              onChange={(e) => {
                const n = Number(e.target.value.replace(/\D/g, ""));
                if (!Number.isNaN(n)) setValorReferencia(n);
              }}
              aria-label="Valor de referência em reais"
            />
          </label>
        )}
      </div>

      {config && (
        <PainelSeries
          series={doModo}
          ocultas={ocultas}
          alternar={alternar}
          principal={(id) => {
            const v = ultimoValor(id);
            return v === null ? null : porcentagem(v);
          }}
          apoio={(id) => {
            const v = ultimoValor(id);
            return v === null ? null : reais(valorReferencia * (1 + v));
          }}
          corPrincipal={(id) => {
            const v = ultimoValor(id);
            if (v === null) return undefined;
            return v >= 0 ? "var(--positivo)" : "var(--negativo)";
          }}
        />
      )}

      <div className="grafico">
        <ResponsiveContainer>
          <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--borda)" vertical={false} />
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
              domain={dominioY}
              tickFormatter={(v) => porcentagem(Number(v), false)}
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
              formatter={(v, nome) => [porcentagem(Number(v)), String(nome)]}
            />
            {/* Sem <Legend>: os cartões acima já são a legenda, e ligam/desligam
                cada linha. Duplicar os nomes só gastava altura do gráfico. */}
            {doModo.map(({ id, titulo, cor, tracejado }) =>
              dados[id] && !ocultas.has(id) ? (
                <Line
                  key={id} type="monotone" dataKey={id} stroke={cor}
                  name={titulo} dot={false}
                  // Estratégia é o assunto; benchmark é pano de fundo.
                  strokeWidth={tracejado ? 1.5 : 2.5}
                  strokeOpacity={tracejado ? 0.85 : 1}
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
  );
}
