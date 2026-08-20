"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { doGrupo, type MetaEstrategia } from "../lib/estrategias-meta";
import type { Preferencias } from "../lib/preferencias";
import type { TickerSemDados } from "../lib/fonte-dados";
import {
  BASES, ID_BASE_PROPRIA, dataBR, motivoPeriodoInvalido, type BaseAtivos,
} from "../lib/catalogo-ativos";
import type { LaudoBase } from "../lib/pyodideLoader";
import Icone from "./Icone";
import Ajuda from "./Ajuda";

interface Props {
  tickers: string[];
  /** Base de ativos selecionada agora. */
  base: BaseAtivos;
  temBasePropria: boolean;
  laudoBase: LaudoBase | null;
  onTrocarBase: (id: string) => void;
  onSubirBase: (arquivo: File) => Promise<void>;
  /** Ativos escolhidos que ainda não existiam no início do período. */
  ativosSemHistorico: { ticker: string; estreia: string }[];
  /** Catálogo já com as estratégias que o usuário escreveu. */
  lista: MetaEstrategia[];
  prefs: Preferencias;
  mudar: <K extends keyof Preferencias>(chave: K, valor: Preferencias[K]) => void;
  tickersSemDados: TickerSemDados[];
  onSimular: () => Promise<void>;
  onCriarEstrategia: () => void;
  onDuplicar: (base: MetaEstrategia) => void;
  onAbrirEditor: () => void;
  pythonPronto: boolean;
  pctCarregamento: number;
  simulando: boolean;
}

function formatarBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export default function PainelConfiguracoes({
  tickers, base, temBasePropria, laudoBase,
  onTrocarBase, onSubirBase, ativosSemHistorico,
  lista, prefs, mudar, tickersSemDados,
  onSimular, onCriarEstrategia, onDuplicar, onAbrirEditor,
  pythonPronto, pctCarregamento, simulando,
}: Props) {
  const [filtro, setFiltro] = useState("");
  const [lendoArquivo, setLendoArquivo] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);
  const [mostrarSugestoes, setMostrarSugestoes] = useState(false);
  const [verTodos, setVerTodos] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const buscaRef = useRef<HTMLDivElement>(null);

  const mortos = useMemo(
    () => new Map(tickersSemDados.map((t) => [t.ticker, t.ultimoPregaoReal])),
    [tickersSemDados]
  );

  function alternarTicker(ticker: string) {
    mudar("ativos", prefs.ativos.includes(ticker)
      ? prefs.ativos.filter((t) => t !== ticker)
      : [...prefs.ativos, ticker]);
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

  const estrategias = doGrupo("estrategia", prefs.modo, lista);
  const benchmarks = doGrupo("benchmark", prefs.modo, lista);

  // Por que o periodo escolhido nao serve para esta base, se for o caso.
  const impedimento = motivoPeriodoInvalido(base, prefs.dataInicio);
  const selecionadosMortos = prefs.ativos.filter((t) => mortos.has(t));
  const podeSimular = pythonPronto && !simulando;

  function pontosDe(ticker: string): number {
    return prefs.orcamento[ticker] ?? 1;
  }
  const totalPontos = prefs.ativos.reduce((s, t) => s + pontosDe(t), 0);

  function alternarMarcado(id: string) {
    mudar("marcados", prefs.marcados.includes(id)
      ? prefs.marcados.filter((m) => m !== id)
      : [...prefs.marcados, id]);
  }

  function listaDeSeries(itens: MetaEstrategia[], comAcoes: boolean) {
    return itens.map((e) => {
      const marcada = prefs.marcados.includes(e.id);
      return (
        <div key={e.id} className={"estrategia" + (marcada ? " estrategia--marcada" : "")}>
          <label className="estrategia__alvo" title={e.descricao}>
            <input type="checkbox" checked={marcada} onChange={() => alternarMarcado(e.id)} />
            <span
              className="estrategia__cor"
              style={{
                background: e.tracejado ? "transparent" : e.cor,
                border: e.tracejado ? `2px dashed ${e.cor}` : "none",
              }}
            />
            <span className="estrategia__nome">{e.titulo}</span>
          </label>

          {comAcoes && (
            <span className="estrategia__acoes">
              {/* Vale para as embutidas também: elas abrem em só leitura, e
                  esconder o caminho para o código anulava metade do propósito
                  do site. */}
              <button
                className="acao-mini acao-mini--codigo"
                onClick={onAbrirEditor}
                aria-label={`${e.doUsuario ? "Editar" : "Ver"} o código de ${e.titulo}`}
                title={e.doUsuario ? "Editar código" : "Ver código"}
              >
                <Icone nome="codigo" tamanho={13} />
              </button>
              <button
                className="acao-mini"
                onClick={() => onDuplicar(e)}
                aria-label={`Duplicar ${e.titulo}`}
                title="Duplicar para editar"
              >
                <Icone nome="duplicar" tamanho={13} />
              </button>
            </span>
          )}
        </div>
      );
    });
  }

  return (
    <>
      {/* ── Modo ─────────────────────────────────────────────────────────── */}
      <div className="secao">
        <div className="abas" role="tablist">
          <button
            role="tab" aria-selected={prefs.modo === "rentabilidade"}
            className={"aba" + (prefs.modo === "rentabilidade" ? " aba--ativa" : "")}
            onClick={() => mudar("modo", "rentabilidade")}
            title="Retorno acumulado da cota, sem depender de quanto você aportou"
          >
            <Icone nome="tendencia" tamanho={15} />
            Rentabilidade
          </button>
          <button
            role="tab" aria-selected={prefs.modo === "aportes"}
            className={"aba" + (prefs.modo === "aportes" ? " aba--ativa" : "")}
            onClick={() => mudar("modo", "aportes")}
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
            depois de {formatarBR(prefs.dataInicio)}, e o último mês vai até a data de fim.
          </Ajuda>
        </p>
        <div className="linha-2">
          <div>
            <label className="rotulo" htmlFor="dt-inicio">Início</label>
            <input id="dt-inicio" type="date" className="campo tabular"
              value={prefs.dataInicio} onChange={(e) => mudar("dataInicio", e.target.value)} />
          </div>
          <div>
            <label className="rotulo" htmlFor="dt-fim">Fim</label>
            <input id="dt-fim" type="date" className="campo tabular"
              value={prefs.dataFim} onChange={(e) => mudar("dataFim", e.target.value)} />
          </div>
        </div>
      </div>

      {/* ── Aportes (só no modo Patrimônio) ──────────────────────────────── */}
      {prefs.modo === "aportes" && (
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
                value={prefs.aporteInicial}
                onChange={(e) => mudar("aporteInicial", Number(e.target.value))} />
            </div>
            <div>
              <label className="rotulo" htmlFor="ap-mes">Mensal (R$)</label>
              <input id="ap-mes" type="number" min={0} className="campo tabular"
                value={prefs.aporteMensal}
                onChange={(e) => mudar("aporteMensal", Number(e.target.value))} />
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
          <span className="secao__acoes">
            <button
              className="acao-mini acao-mini--destaque"
              onClick={onCriarEstrategia}
              aria-label="Criar estratégia nova"
              title="Criar estratégia nova"
            >
              <Icone nome="adicionar" tamanho={14} />
            </button>
            <Ajuda alinhar="direita">
              As nossas não podem ser alteradas, mas o código está aberto no
              editor. Para mudar alguma, use o botão de duplicar — a cópia é sua
              e fica guardada neste navegador.
            </Ajuda>
          </span>
        </p>
        {listaDeSeries(estrategias, true)}
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
        {listaDeSeries(benchmarks, false)}
      </div>

      {/* ── Ativos ───────────────────────────────────────────────────────── */}
      <div className="secao">
        <p className="secao__titulo">
          <span className="com-icone">
            <Icone nome="carteira" tamanho={13} />
            Ativos
          </span>
          <span className="secao__acoes">
            <span className="tabular">{prefs.ativos.length}</span>
            <Ajuda alinhar="direita">
              Ativos com volatilidade anual abaixo de 13% são descartados pelo
              otimizador da Paridade, para manter a matriz de covariância bem
              condicionada. Benchmarks não usam esta lista.
            </Ajuda>
          </span>
        </p>

        {/* Qual carteira alimenta a lista abaixo. Cada base tem cobertura e
            piso de data proprios, entao a escolha muda o que da para simular. */}
        <div className="abas abas--base" role="tablist" aria-label="Base de ativos">
          {[...BASES, ...(temBasePropria
            ? [{ id: ID_BASE_PROPRIA, titulo: "Meus dados" } as BaseAtivos]
            : [])].map((b) => (
            <button
              key={b.id}
              role="tab"
              aria-selected={prefs.base === b.id}
              className={"aba" + (prefs.base === b.id ? " aba--ativa" : "")}
              onClick={() => onTrocarBase(b.id)}
            >
              {b.titulo}
            </button>
          ))}
        </div>

        {ativosSemHistorico.length > 0 && (
          <div className="aviso aviso--atencao" style={{ marginBottom: "10px" }}>
            <span className="aviso__icone"><Icone nome="alerta" tamanho={15} /></span>
            <span>
              <strong>
                {ativosSemHistorico.map((a) => a.ticker).join(", ")}
              </strong>{" "}
              {ativosSemHistorico.length === 1 ? "não tinha" : "não tinham"} cotação
              em {formatarBR(prefs.dataInicio)}
              {ativosSemHistorico.length === 1
                && ` (estreia em ${formatarBR(ativosSemHistorico[0].estreia)})`}.
              Um ativo sem histórico zera a estratégia inteira.{" "}
              <button
                className="ligacao"
                onClick={() => {
                  const fora = new Set(ativosSemHistorico.map((a) => a.ticker));
                  mudar("ativos", prefs.ativos.filter((t) => !fora.has(t)));
                }}
              >
                Remover
              </button>
            </span>
          </div>
        )}

        {impedimento && (
          <div className="aviso aviso--atencao" style={{ marginBottom: "10px" }}>
            <span className="aviso__icone"><Icone nome="alerta" tamanho={15} /></span>
            <span>
              {impedimento}{" "}
              <button
                className="ligacao"
                onClick={() => mudar("dataInicio", base.inicioMinimo!)}
              >
                Usar {dataBR(base.inicioMinimo!)}
              </button>
            </span>
          </div>
        )}

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
                  <Icone nome={prefs.ativos.includes(t) ? "fechar" : "adicionar"} tamanho={14} />
                </button>
              ))}
            </div>
          )}
        </div>

        {prefs.ativos.length === 0 ? (
          <div className="sem-itens">
            <Icone nome="busca" tamanho={20} />
            <span>Busque acima ou abra a lista completa</span>
          </div>
        ) : (
          <div className="lista-ativos">
            {prefs.ativos.map((t) => (
              <div key={t} className="ativo-linha">
                <span className="ativo-linha__nome">{t}</span>

                {prefs.usarOrcamento && (
                  <span className="orcamento">
                    <input
                      type="number" min={0} step={0.5}
                      className="orcamento__campo tabular"
                      value={pontosDe(t)}
                      onChange={(e) =>
                        mudar("orcamento", { ...prefs.orcamento, [t]: Math.max(0, Number(e.target.value)) })
                      }
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

        {prefs.ativos.length > 0 && (
          <label className="estrategia" style={{ marginBottom: "8px" }}>
            <input type="checkbox" checked={prefs.usarOrcamento}
              onChange={() => mudar("usarOrcamento", !prefs.usarOrcamento)} />
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
                  (prefs.ativos.includes(t) ? " chip--ativo" : "") +
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
        <button className="botao-primario" disabled={!podeSimular} onClick={onSimular}>
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
        {/* ── Base propria ──────────────────────────────────────────────
            O arquivo e lido pelo Python dentro da propria aba; nada sobe para
            servidor nenhum. A conferencia acontece antes de virar tabela,
            porque planilha fora do padrao nao da erro: da numero errado com
            cara de certo. */}
        <div className="base-propria">
          <input
            ref={arquivoRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: "none" }}
            onChange={async (e) => {
              const arquivo = e.target.files?.[0];
              e.target.value = "";
              if (!arquivo) return;
              setLendoArquivo(true);
              try { await onSubirBase(arquivo); } finally { setLendoArquivo(false); }
            }}
          />
          <button
            className="botao-icone"
            style={{ width: "100%", fontSize: "12px", justifyContent: "center" }}
            onClick={() => arquivoRef.current?.click()}
            disabled={!pythonPronto || lendoArquivo}
          >
            <span className="com-icone">
              <Icone nome={lendoArquivo ? "carregando" : "adicionar"} tamanho={14} />
              {lendoArquivo ? "Conferindo o arquivo..." : "Usar meus dados (Excel ou CSV)"}
            </span>
          </button>

          {laudoBase && !laudoBase.ok && (
            <div className="aviso aviso--erro" style={{ marginTop: "8px" }}>
              <span className="aviso__icone"><Icone nome="alerta" tamanho={15} /></span>
              <span>{laudoBase.erro}</span>
            </div>
          )}

          {laudoBase?.ok && (
            <div className="aviso aviso--info" style={{ marginTop: "8px" }}>
              <span className="aviso__icone"><Icone nome="check" tamanho={15} /></span>
              <span>
                <strong>{laudoBase.tickers?.length} ativos</strong>, {laudoBase.pregoes} pregoes
                de {dataBR(laudoBase.inicio!)} a {dataBR(laudoBase.fim!)}.
                {laudoBase.avisos?.length ? (
                  <>
                    <br />
                    {laudoBase.avisos.join(" ")}
                  </>
                ) : null}
              </span>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
