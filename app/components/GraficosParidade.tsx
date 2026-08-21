"use client";

import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from "recharts";

interface AlocacaoPonto {
  data: string;
  pesos: Record<string, number>;
}

interface Props {
  alocacao: AlocacaoPonto[];
}

/** Uma cor por ativo, vinda dos tokens — assim acompanham a troca de tema. */
const CORES = Array.from({ length: 8 }, (_, i) => `var(--cat-${i + 1})`);

function pct(v: number, casas = 2): string {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }) + "%";
}

function mesAno(iso: string): string {
  const [ano, mes] = iso.split("-");
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${nomes[Number(mes) - 1]}/${ano.slice(-2)}`;
}

export default function GraficosParidade({ alocacao }: Props) {
  const ultimo = alocacao.length > 0 ? alocacao[alocacao.length - 1] : null;
  // Só entram no gráfico os ativos que a estratégia realmente usou em algum
  // mês — carregar colunas sempre zeradas só polui a legenda.
  const ativos = ultimo
    ? Object.keys(ultimo.pesos).filter((a) => alocacao.some((m) => (m.pesos[a] ?? 0) > 0))
    : [];

  /**
   * Converte os pesos para porcentagem normalizando cada mês para somar 100.
   *
   * O solver fecha a restrição de soma com tolerância 1e-9, então o total vinha
   * como 100,0000001. O eixo herdava esse máximo e imprimia "100.0000001%",
   * que estourava a largura e aparecia cortado no meio do número.
   */
  function paraPorcentagem(pesos: Record<string, number>): Record<string, number> {
    const total = ativos.reduce((s, a) => s + (pesos[a] ?? 0), 0);
    const escala = total > 0 ? 100 / total : 0;
    const saida: Record<string, number> = {};
    ativos.forEach((a) => { saida[a] = (pesos[a] ?? 0) * escala; });
    return saida;
  }

  const pizza = ultimo
    ? (() => {
        const p = paraPorcentagem(ultimo.pesos);
        return ativos
          .map((a) => ({ name: a, value: p[a] }))
          .filter((i) => i.value > 0.05)
          .sort((a, b) => b.value - a.value);
      })()
    : [];

  const evolucao = alocacao.map((linha) => ({
    data: linha.data,
    ...paraPorcentagem(linha.pesos),
  }));

  const estiloTooltip = {
    background: "var(--fundo-elevado)",
    borderColor: "var(--borda)",
    borderRadius: "var(--raio-p)",
    fontSize: "12px",
  };

  return (
    <div className="metricas" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
      <div className="cartao">
        <p className="secao__titulo">
          <span>Alocação atual</span>
          {ultimo && <span className="tabular">{mesAno(ultimo.data)}</span>}
        </p>
        <div className="grafico--baixo" style={{ width: "100%" }}>
          <ResponsiveContainer debounce={120}>
            <PieChart>
              <Pie
                data={pizza}
                dataKey="value"
                nameKey="name"
                outerRadius="72%"
                isAnimationActive={false}
                stroke="var(--fundo-card)"
                strokeWidth={2}
                // Fatia pequena não recebe rótulo: o texto colidiria com o
                // vizinho e viraria borrão. Quem quiser o número usa a legenda.
                label={({ name, value }) =>
                  (value as number) >= 6 ? `${name} ${Math.round(value as number)}%` : ""
                }
                labelLine={false}
                style={{ fontSize: "11px" }}
              >
                {pizza.map((_, i) => (
                  <Cell key={i} fill={CORES[i % CORES.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={estiloTooltip} formatter={(v) => pct(Number(v))} />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="cartao">
        <p className="secao__titulo">
          <span>Evolução da alocação</span>
        </p>
        <div className="grafico--baixo" style={{ width: "100%" }}>
          <ResponsiveContainer debounce={120}>
            <AreaChart data={evolucao} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--borda)" vertical={false} />
              <XAxis
                dataKey="data"
                stroke="var(--texto-suave)"
                tick={{ fontSize: 11 }}
                minTickGap={56}
                tickFormatter={(v) => mesAno(String(v))}
              />
              <YAxis
                stroke="var(--texto-suave)"
                tick={{ fontSize: 11 }}
                width={42}
                domain={[0, 100]}
                ticks={[0, 25, 50, 75, 100]}
                tickFormatter={(v) => `${Math.round(Number(v))}%`}
              />
              <Tooltip
                contentStyle={estiloTooltip}
                formatter={(v, nome) => [pct(Number(v)), String(nome)]}
                labelFormatter={(v) => {
                  const [a, m, d] = String(v).split("-");
                  return `${d}/${m}/${a}`;
                }}
              />
              <Legend wrapperStyle={{ fontSize: "11px" }} />
              {/* Área empilhada em vez de barras: com 77 meses x 7 ativos as
                  barras viravam 539 retângulos no DOM, e desenhá-los custava
                  mais de um segundo. Aqui são 7 caminhos, e a leitura de
                  composição ao longo do tempo fica até melhor. */}
              {ativos.map((a, i) => (
                <Area
                  key={a} type="monotone" dataKey={a} stackId="a"
                  stroke={CORES[i % CORES.length]}
                  fill={CORES[i % CORES.length]}
                  fillOpacity={0.85}
                  strokeWidth={0}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
