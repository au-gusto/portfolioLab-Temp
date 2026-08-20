"use client";

import { useMemo, useState, useSyncExternalStore } from "react";

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

import { type MetaEstrategia } from "../lib/estrategias-meta";
import { reduzirPontos, PONTOS_NO_GRAFICO } from "../lib/amostragem";
import PainelSeries from "./PainelSeries";
import { assinarTema, lerNumeroDoTema } from "../lib/tema";

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
  /** Catálogo completo (embutidas + do usuário). */
  lista: MetaEstrategia[];
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

export default function Grafico({ dados, config, series, lista }: Props) {
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

  const investido = config ? totalInvestido(config) : null;
  const doModo = useMemo(() => lista.filter((e) => series.includes(e.id)), [lista, series]);

  // O quanto o benchmark recua depende do tema, entao o valor vem do CSS.
  const opacidadeBenchmark = useSyncExternalStore(
    assinarTema,
    () => lerNumeroDoTema("--opacidade-benchmark", 1),
    () => 1,
  );
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

  const chartData = useMemo(
    () => reduzirPontos(chartDataCompleto, PONTOS_NO_GRAFICO, (p) => Number(p["paridade"] ?? 0)),
    [chartDataCompleto]
  );

  function valorFinal(id: string): number | null {
    const serie = dados[id];
    if (!serie?.length) return null;
    const v = serie[serie.length - 1]?.valor;
    return typeof v === "number" && !Number.isNaN(v) ? v : null;
  }

  return (
    <div className="cartao bloco-grafico">
      <div className="bloco-grafico__topo">
        <p className="secao__titulo" style={{ margin: 0 }}>Evolução do patrimônio</p>
        {investido !== null && (
          <span className="referencia">
            <span className="referencia__rotulo">Investido</span>
            <span className="tabular" style={{ fontWeight: 700 }}>{reais(investido, 0)}</span>
          </span>
        )}
      </div>

      {config && investido !== null && (
        <PainelSeries
          series={doModo}
          ocultas={ocultas}
          alternar={alternar}
          principal={(id) => {
            const v = valorFinal(id);
            return v === null ? null : reais(v);
          }}
          apoio={(id) => {
            const v = valorFinal(id);
            if (v === null || investido <= 0) return null;
            return porcentagem(((v - investido) / investido) * 100) + " sobre o investido";
          }}
          corPrincipal={(id) => {
            const v = valorFinal(id);
            if (v === null) return undefined;
            return v >= investido ? "var(--positivo)" : "var(--negativo)";
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
              tickFormatter={(v) => reaisCurto(Number(v))}
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
              formatter={(v, nome) => [reais(Number(v)), String(nome)]}
            />
            {/* Sem <Legend>: os cartões acima são a legenda e ligam/desligam
                cada linha. */}
            {doModo.map(({ id, titulo, cor, tracejado }) =>
              dados[id] && !ocultas.has(id) ? (
                <Line
                  key={id} type="monotone" dataKey={id} stroke={cor}
                  name={titulo} dot={false}
                  strokeWidth={tracejado ? 1.8 : 2.5}
                  // No claro o benchmark vai a cheio: cor lavada com traco fino
                  // some no fundo claro. No escuro ele recua um pouco, porque
                  // la o problema e o oposto — tudo salta demais.
                  strokeOpacity={tracejado ? opacidadeBenchmark : 1}
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
