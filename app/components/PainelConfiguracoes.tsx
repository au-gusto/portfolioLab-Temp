"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { doGrupo, type MetaEstrategia } from "../lib/estrategias-meta";
import type { TickerSemDados } from "../lib/fonte-dados";
import Icone from "./Icone";
import Ajuda from "./Ajuda";

export interface ConfigSimulacao {
  tickers: string[];
  dataInicio: string;
  dataFim: string;
  aporteInicial: number;
  aportesMensal: number;
  /** Fração do risco por ativo (soma 1). Vazio = paridade clássica, 1/n. */
  orcamentoRisco: Record<string, number>;
}

interface Props {
  modo: "aportes" | "rentabilidade";
  setModo: (valor: "aportes" | "rentabilidade") => void;
  tickers: string[];
  marcados: string[];
  setMarcados: (valor: string[]) => void;
  tickersSemDados: TickerSemDados[];
  onSimular: (config: ConfigSimulacao) => Promise<void>;
  pythonPronto: boolean;
  pctCarregamento: number;
  simulando: boolean;
}

function formatarBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function PainelConfiguracoes({
  tickers, marcados, setMarcados, tickersSemDados,
  onSimular, modo, setModo, pythonPronto, pctCarregamento, simulando,
}: Props) {
  const [aporteInicial, setAporteInicial] = useState(1000);
  const [aportesMensal, setAporteMensal] = useState(400);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [dataInicio, setDataInicio] = useState("2019-01-02");
  const [dataFim, setDataFim] = useState("2025-06-10");
  const [filtro, setFiltro] = useState("");
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [verTodos, setVerTodos] = useState(false);

  /** Orçamento de risco em pontos (não %): o normalizador cuida da soma. */
  const [orcamento, setOrcamento] = useState<Record<string, number>>({});
  const [usarOrcamento, setUsarOrcamento] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const buscaRef = useRef<HTMLDivElement>(null);

  const mortos = useMemo(
    () => new Map(tickersSemDados.map((t) => [t.ticker, t.ultimoPregaoReal])),
    [tickersSemDados]
  );

  // A forma funcional é obrigatória: sem ela, dois cliques no mesmo instante
  // partem do mesmo array e um sobrescreve o outro.
  function alternarTicker(ticker: string) {
    setSelecionados((atual) =>
      atual.includes(ticker) ? atual.filter((t) => t !== ticker) : [...atual, ticker]
    );
  }

  useEffect(() => {
    function cliqueFora(e: MouseEvent) {
      if (buscaRef.current && !buscaRef.current.contains(e.target as Node)) {
        setMostrarSugestoes(false);
      }
    }
    document.addEventListener("mousedown", cliqueFora);
    return () => document.removeEventListener("mousedown", cliqueFora);
  }, []);

  const sugestoes = useMemo(() => {
    const termo = filtro.trim().toLowerCase();
    if (!termo) return [];
    return tickers.filter((t) => t.toLowerCase().includes(termo)).slice(0, 40);
  }, [filtro, tickers]);

  function escolher(ticker: string) {
    alternarTicker(ticker);
    setFiltro("");
    setMostrarSugestoes(false);
    inputRef.current?.focus();
  }

  const estrategias = doGrupo("estrategia", modo);
  const benchmarks = doGrupo("benchmark", modo);
  const precisaAtivos = marcados.some((id) =>
    estrategias.some((e) => e.id === id)
  );
  const selecionadosMortos = selecionados.filter((t) => mortos.has(t));
  const podeSimular = pythonPronto && !simulando;

  /** Peso de cada ativo no orçamento; sem valor definido, vale 1 (igual). */
  function pontosDe(ticker: string): number {
    return orcamento[ticker] ?? 1;
  }
  const totalPontos = selecionados.reduce((s, t) => s + pontosDe(t), 0);

  function definirPontos(ticker: string, valor: number) {
    setOrcamento((atual) => ({ ...atual, [ticker]: Math.max(0, valor) }));
  }

  function montarOrcamento(): Record<string, number> {
    if (!usarOrcamento || selecionados.length === 0 || totalPontos <= 0) return {};
    const saida: Record<string, number> = {};
    selecionados.forEach((t) => { saida[t] = pontosDe(t) / totalPontos; });
    return saida;
  }

  function listaDeSeries(itens: MetaEstrategia[]) {
    return itens.map((e) => {
      const marcada = marcados.includes(e.id);
      return (
        <label
          key={e.id}
          className={"estrategia" + (marcada ? " estrategia--marcada" : "")}
          title={e.descricao}
        >
          <input
            type="checkbox"
            checked={marcada}
            onChange={() =>
              setMarcados(marcada ? marcados.filter((m) => m !== e.id) : [...marcados, e.id])
            }
          />
          <span
            className="estrategia__cor"
            style={{
              background: e.tracejado ? "transparent" : e.cor,
              border: e.tracejado ? `2px dashed ${e.cor}` : "none",
            }}
          />
          <span className="estrategia__nome">{e.titulo}</span>
        </label>
      );
    });
  }

  return (
    <>
      {/* ── Modo ─────────────────────────────────────────────────────────── */}
      <div className="secao">
        <div className="abas" role="tablist">
          <button
            role="tab" aria-selected={modo === "rentabilidade"}
            className={"aba" + (modo === "rentabilidade" ? " aba--ativa" : "")}
            onClick={() => setModo("rentabilidade")}
            title="Retorno acumulado da cota, sem depender de quanto você aportou"
          >
            <Icone nome="tendencia" tamanho={15} />
            Rentabilidade
          </button>
          <button
            role="tab" aria-selected={modo === "aportes"}
            className={"aba" + (modo === "aportes" ? " aba--ativa" : "")}
            onClick={() => setModo("aportes")}
            title="Evolução do patrimônio com aportes mensais"
          >
            <Icone nome="carteira" tamanho={15} />
            Patrimônio
          </button>
        </div>
      </div>

      {/* ── Período ──────────────────────────────────────────────────────── */}
      <div className="secao">
        <p className="secao__titulo">
          <span className="com-icone">
            <Icone nome="calendario" tamanho={13} />
            Período
          </span>
          <Ajuda alinhar="direita">
            O rebalanceamento é mensal, então a simulação começa no primeiro dia 1º
            depois de {formatarBR(dataInicio)}, e o último mês vai até a data de fim.
          </Ajuda>
        </p>
        <div className="linha-2">
          <div>
            <label className="rotulo" htmlFor="dt-inicio">Início</label>
            <input id="dt-inicio" type="date" className="campo tabular"
              value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
          </div>
          <div>
            <label className="rotulo" htmlFor="dt-fim">Fim</label>
            <input id="dt-fim" type="date" className="campo tabular"
              value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Aportes (só no modo Patrimônio) ──────────────────────────────── */}
      {modo === "aportes" && (
        <div className="secao">
          <p className="secao__titulo">
            <span className="com-icone">
              <Icone nome="carteira" tamanho={13} />
              Aportes
            </span>
            <Ajuda alinhar="direita">
              O aporte inicial entra no primeiro mês simulado; o mensal, em todos
              os seguintes, sempre nos pesos que a estratégia calculou.
            </Ajuda>
          </p>
          <div className="linha-2">
            <div>
              <label className="rotulo" htmlFor="ap-ini">Inicial (R$)</label>
              <input id="ap-ini" type="number" min={0} className="campo tabular"
                value={aporteInicial} onChange={(e) => setAporteInicial(Number(e.target.value))} />
            </div>
            <div>
              <label className="rotulo" htmlFor="ap-mes">Mensal (R$)</label>
              <input id="ap-mes" type="number" min={0} className="campo tabular"
                value={aportesMensal} onChange={(e) => setAporteMensal(Number(e.target.value))} />
            </div>
          </div>
        </div>
      )}

      {/* ── Estratégias ──────────────────────────────────────────────────── */}
      <div className="secao">
        <p className="secao__titulo">
          <span className="com-icone">
            <Icone nome="grafico" tamanho={13} />
            Estratégias
          </span>
          <Ajuda alinhar="direita">
            Alocam os ativos que você escolheu, rebalanceando todo mês com os
            12 meses anteriores de histórico.
          </Ajuda>
        </p>
        {listaDeSeries(estrategias)}
      </div>

      {/* ── Benchmarks ───────────────────────────────────────────────────── */}
      <div className="secao">
        <p className="secao__titulo">
          <span className="com-icone">
            <Icone nome="tendencia" tamanho={13} />
            Benchmarks
          </span>
          <Ajuda alinhar="direita">
            Referências de mercado. Não usam os ativos escolhidos: aplicam a
            ideia ingênua de comprar no início do período e não mexer.
          </Ajuda>
        </p>
        {listaDeSeries(benchmarks)}
      </div>

      {/* ── Ativos ───────────────────────────────────────────────────────── */}
      <div className="secao">
        <p className="secao__titulo">
          <span className="com-icone">
            <Icone nome="carteira" tamanho={13} />
            Ativos
          </span>
          <span className="secao__acoes">
            <span className="tabular">{selecionados.length}</span>
            <Ajuda alinhar="direita">
              Ativos com volatilidade anual abaixo de 13% são descartados pelo
              otimizador da Paridade, para manter a matriz de covariância bem
              condicionada. Benchmarks não usam esta lista.
            </Ajuda>
          </span>
        </p>

        <div ref={buscaRef} className="campo-busca" style={{ marginBottom: "10px" }}>
          <span className="campo-busca__icone"><Icone nome="busca" tamanho={15} /></span>
          <input
            ref={inputRef} type="text" className="campo"
            placeholder="PETR4, VALE3..." aria-label="Buscar ativo"
            value={filtro}
            onChange={(e) => { setFiltro(e.target.value); setMostrarSugestoes(true); }}
            onFocus={() => setMostrarSugestoes(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && sugestoes.length) { e.preventDefault(); escolher(sugestoes[0]); }
              if (e.key === "Escape") setMostrarSugestoes(false);
            }}
          />
          {mostrarSugestoes && sugestoes.length > 0 && (
            <div className="sugestoes">
              {sugestoes.map((t) => (
                <button key={t} className="sugestao" onClick={() => escolher(t)}>
                  <span className="com-icone">
                    {t}
                    {mortos.has(t) && (
                      <span style={{ color: "var(--atencao)", display: "inline-flex" }}>
                        <Icone nome="alerta" tamanho={13} />
                      </span>
                    )}
                  </span>
                  <Icone nome={selecionados.includes(t) ? "fechar" : "adicionar"} tamanho={14} />
                </button>
              ))}
            </div>
          )}
        </div>

        {selecionados.length === 0 ? (
          <div className="sem-itens">
            <Icone nome="busca" tamanho={20} />
            <span>Busque acima ou abra a lista completa</span>
          </div>
        ) : (
          <div className="lista-ativos">
            {selecionados.map((t) => (
              <div key={t} className="ativo-linha">
                <span className="ativo-linha__nome">{t}</span>

                {/* Orçamento de risco: quanto do risco da carteira este ativo
                    deve carregar. O campo só aparece quando ligado, para não
                    poluir quem quer a paridade clássica. */}
                {usarOrcamento && (
                  <span className="orcamento">
                    <input
                      type="number" min={0} step={0.5}
                      className="orcamento__campo tabular"
                      value={pontosDe(t)}
                      onChange={(e) => definirPontos(t, Number(e.target.value))}
                      aria-label={`Peso de risco de ${t}`}
                    />
                    <span className="orcamento__pct tabular">
                      {(totalPontos > 0 ? (pontosDe(t) / totalPontos) * 100 : 0)
                        .toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                    </span>
                  </span>
                )}

                {mortos.has(t) && (
                  <span style={{ color: "var(--atencao)", display: "inline-flex" }}>
                    <Ajuda alinhar="direita">
                      Sem cotação nova desde {formatarBR(mortos.get(t)!)}. A empresa
                      provavelmente mudou de código, fundiu ou fechou capital — a série
                      repete o último preço real e a volatilidade vira zero.
                    </Ajuda>
                  </span>
                )}
                <button className="ativo-linha__remover" onClick={() => alternarTicker(t)}
                  aria-label={`Remover ${t}`}>
                  <Icone nome="fechar" tamanho={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {selecionados.length > 0 && (
          <label className="estrategia" style={{ marginBottom: "8px" }}>
            <input type="checkbox" checked={usarOrcamento}
              onChange={() => setUsarOrcamento((v) => !v)} />
            <span className="estrategia__nome">Orçamento de risco</span>
            <Ajuda alinhar="direita">
              Em vez de todos os ativos contribuírem igualmente para o risco,
              você define a fatia de cada um. Os números são pesos relativos:
              2 contra 1 significa o dobro de risco. Só a Paridade usa isto.
            </Ajuda>
          </label>
        )}

        {selecionadosMortos.length > 0 && (
          <div className="aviso aviso--atencao" style={{ marginBottom: "10px" }}>
            <span className="aviso__icone"><Icone nome="alerta" tamanho={15} /></span>
            <span>
              <strong>{selecionadosMortos.join(", ")}</strong> sem cotação nova.
              Considere remover.
            </span>
          </div>
        )}

        <button
          className="botao-icone"
          style={{ width: "100%", fontSize: "12px", marginBottom: "8px", justifyContent: "center" }}
          onClick={() => setVerTodos(!verTodos)}
          aria-expanded={verTodos}
        >
          <span className="com-icone">
            <Icone nome={verTodos ? "recolher" : "expandir"} tamanho={14} />
            {verTodos ? "Esconder lista" : `Todos os ${tickers.length} ativos`}
          </span>
        </button>

        {verTodos && (
          <div className="chips" style={{ maxHeight: "260px", overflowY: "auto" }}>
            {tickers.map((t) => (
              <button
                key={t}
                className={
                  "chip" +
                  (selecionados.includes(t) ? " chip--ativo" : "") +
                  (mortos.has(t) ? " chip--morto" : "")
                }
                title={mortos.has(t) ? `Sem cotações desde ${formatarBR(mortos.get(t)!)}` : undefined}
                onClick={() => alternarTicker(t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Ação ─────────────────────────────────────────────────────────── */}
      <div className="secao">
        <button
          className="botao-primario"
          disabled={!podeSimular}
          onClick={() =>
            onSimular({
              tickers: selecionados,
              dataInicio, dataFim, aporteInicial, aportesMensal,
              orcamentoRisco: montarOrcamento(),
            })
          }
        >
          {simulando || !pythonPronto ? (
            <>
              <span className="girando"><Icone nome="carregando" tamanho={16} /></span>
              {simulando ? "Simulando" : `Preparando ${pctCarregamento}%`}
            </>
          ) : (
            <>
              <Icone nome="tendencia" tamanho={16} />
              Simular
            </>
          )}
        </button>
        {podeSimular && precisaAtivos && selecionados.length === 0 && (
          <p className="dica com-icone" style={{ justifyContent: "center" }}>
            <Icone nome="info" tamanho={13} />
            Escolha ao menos um ativo
          </p>
        )}
      </div>
    </>
  );
}
