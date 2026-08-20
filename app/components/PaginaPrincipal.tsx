"use client";

import { useState, useEffect, useMemo, useRef } from "react";

import {
  iniciarPyodide,
  ouvirCarregamento,
  executarEstrategia,
  lerVariavelPython,
  type EstadoCarregamento,
  usarBasePropria,
  type LaudoBase,
} from "../lib/pyodideLoader";
import type { StatusDados } from "../lib/fonte-dados";
import {
  catalogo, doModo, nomeDaEstrategia, precisaDeAtivos, CORES_USUARIO,
  type MetaEstrategia,
} from "../lib/estrategias-meta";
import {
  carregar as carregarPrefs, salvar as salvarPrefs, padroes,
  type Preferencias, type EstrategiaUsuario,
} from "../lib/preferencias";
import { cronometrar, anotar } from "../lib/diagnostico";

import Cabecalho from "./Cabecalho";
import PainelConfiguracoes from "./PainelConfiguracoes";
import PainelEditores from "./PainelEditores";
import StatusPython from "./StatusPython";
import Icone from "./Icone";
import PainelDiagnostico from "./PainelDiagnostico";
import StatusSimulacao, { type EstadoEstrategia } from "./StatusSimulacao";
import Grafico_aportes from "./Grafico";
import Grafico_rentabilidade from "./Grafico - Rentabilidade";
import GraficosParidade from "./GraficosParidade";
import GraficoRisco, { type PontoRisco } from "./GraficoRisco";
import PainelMetricas from "./PainelMetricas";

import { codigoCDI } from "../estrategias/cdi";
import { codigoParidade } from "../estrategias/paridade";
import { codigoEficiente } from "../estrategias/eficiente";
import { codigoCDI_rentabilidade } from "../estrategias/cdi - Rentabilidade";
import { codigoParidade_rentabilidade } from "../estrategias/paridade - Rentabilidade";
import { codigoEficiente_rentabilidade } from "../estrategias/eficiente - Rentabilidade";
import { codigoIngenua_rentabilidade } from "../estrategias/ingenua - Rentabilidade";
import { codigoMinVar_rentabilidade } from "../estrategias/minvar - Rentabilidade";
import {
  codigoIbov, codigoIpca, codigoPoupanca,
  codigoIbov_rentabilidade, codigoIpca_rentabilidade, codigoPoupanca_rentabilidade,
} from "../estrategias/benchmarks";
import { ESQUELETO_ESTRATEGIA } from "../estrategias/modelo";
import {
  acharBase, basePropria, motivoPeriodoInvalido, dataBR, ID_BASE_PROPRIA,
} from "../lib/catalogo-ativos";

interface Props {
  /** Tickers de cada base, indexados pelo id da base. */
  tickersPorBase: Record<string, string[]>;
  /** Papéis que estrearam depois do início do arquivo, por base. */
  estreiasPorBase: Record<string, Record<string, string>>;
  status: StatusDados;
}

export type Serie = { data: string; valor: number }[] | null;
export type Resultados = Partial<Record<string, Serie>>;

/** Código das séries embutidas. Elas são só leitura — o usuário duplica para mexer. */
function codigosEmbutidos(modo: "aportes" | "rentabilidade"): Record<string, string> {
  const aportes = modo === "aportes";
  return {
    paridade: aportes ? codigoParidade : codigoParidade_rentabilidade,
    eficiente: aportes ? codigoEficiente : codigoEficiente_rentabilidade,
    // Só existe em Rentabilidade, como a Ingênua: o modo Patrimônio precisa
    // da máquina de quantidades, que é outro trabalho.
    minvar: aportes ? "" : codigoMinVar_rentabilidade,
    ingenua: codigoIngenua_rentabilidade,
    cdi: aportes ? codigoCDI : codigoCDI_rentabilidade,
    ibov: aportes ? codigoIbov : codigoIbov_rentabilidade,
    ipca: aportes ? codigoIpca : codigoIpca_rentabilidade,
    poupanca: aportes ? codigoPoupanca : codigoPoupanca_rentabilidade,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function campo(item: any, nome: string) {
  return item instanceof Map ? item.get(nome) : item?.[nome];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function paraMapa(bruto: any): Record<string, number> {
  const saida: Record<string, number> = {};
  if (bruto instanceof Map) {
    bruto.forEach((v: unknown, k: unknown) => { saida[String(k)] = Number(v); });
  } else if (bruto && typeof bruto === "object") {
    Object.entries(bruto).forEach(([k, v]) => { saida[String(k)] = Number(v); });
  }
  return saida;
}

export interface AlocacaoMes {
  data: string;
  pesos: Record<string, number>;
  riscoAlvo: Record<string, number>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
/** O Python devolve uma lista de dicts; aqui ela vira o formato do gráfico. */
function normalizarRisco(bruto: unknown): PontoRisco[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((p) => {
      const o = p as Record<string, unknown>;
      return { data: String(o?.data ?? ""), risco: Number(o?.risco) };
    })
    .filter((p) => p.data && Number.isFinite(p.risco));
}

function normalizarAlocacao(raw: any): AlocacaoMes[] {
  if (!Array.isArray(raw)) return [];
  return raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((item: any) => ({
      data: String(campo(item, "data") ?? ""),
      pesos: paraMapa(campo(item, "pesos")),
      riscoAlvo: paraMapa(campo(item, "risco_alvo")),
    }))
    .filter((p) => p.data);
}

export default function PaginaPrincipal({ tickersPorBase, estreiasPorBase, status }: Props) {
  const [painelAberto, setPainelAberto] = useState(false);
  const [lateralAberta, setLateralAberta] = useState(false);

  // Base montada a partir de um arquivo do usuario. Vive so nesta aba: os
  // dados nunca saem da maquina dele, entao nao ha o que persistir.
  const [minhaBase, setMinhaBase] = useState<{ titulo: string; tickers: string[] } | null>(null);
  const [laudoBase, setLaudoBase] = useState<LaudoBase | null>(null);

  // O servidor não tem localStorage, então a primeira renderização usa os
  // padrões e a preferência salva entra logo depois da hidratação. Ler no
  // corpo do componente causaria divergência entre servidor e cliente.
  const [prefs, setPrefs] = useState<Preferencias>(padroes);
  const hidratado = useRef(false);

  useEffect(() => {
    setPrefs(carregarPrefs());
    hidratado.current = true;
  }, []);

  useEffect(() => {
    if (hidratado.current) salvarPrefs(prefs);
  }, [prefs]);

  function mudar<K extends keyof Preferencias>(chave: K, valor: Preferencias[K]) {
    setPrefs((p) => ({ ...p, [chave]: valor }));
  }

  const { modo, marcados, estrategiasUsuario } = prefs;

  /** A base escolhida agora, ja considerando a do usuario. */
  const base = useMemo(
    () => acharBase(prefs.base, minhaBase ? [basePropria(minhaBase.titulo)] : []),
    [prefs.base, minhaBase]
  );

  const tickers = useMemo(() => {
    if (base.id === ID_BASE_PROPRIA) return minhaBase?.tickers ?? [];
    return tickersPorBase[base.id] ?? [];
  }, [base.id, minhaBase, tickersPorBase]);

  /**
   * Ativos escolhidos que ainda nao tinham preco no inicio do periodo.
   *
   * Um so deles basta para a estrategia inteira voltar vazia: a covariancia
   * sai com NaN e o otimizador nao devolve peso nenhum. Antes disso o cartao
   * simplesmente sumia do painel, sem dizer por que.
   */
  const ativosSemHistorico = useMemo(() => {
    const estreias = estreiasPorBase[base.id] ?? {};
    return prefs.ativos
      .filter((t) => estreias[t] && estreias[t] > prefs.dataInicio)
      .map((t) => ({ ticker: t, estreia: estreias[t] }));
  }, [prefs.ativos, prefs.dataInicio, base.id, estreiasPorBase]);

  /**
   * Troca a base e larga os ativos que nao existem na nova.
   *
   * Sem isso a carteira ficaria com codigos que a base nova nao tem: o Python
   * receberia um ticker sem coluna e a estrategia quebraria — ou pior, seguiria
   * com um ativo a menos sem ninguem notar.
   */
  function trocarBase(id: string) {
    setPrefs((atual) => {
      const nova = id === ID_BASE_PROPRIA
        ? (minhaBase?.tickers ?? [])
        : (tickersPorBase[id] ?? []);
      const permitidos = new Set(nova);
      const sobreviventes = atual.ativos.filter((t) => permitidos.has(t));

      const alvo = acharBase(id, minhaBase ? [basePropria(minhaBase.titulo)] : []);
      const inicio = alvo.inicioMinimo && atual.dataInicio < alvo.inicioMinimo
        ? alvo.inicioMinimo
        : atual.dataInicio;

      return { ...atual, base: id, ativos: sobreviventes, dataInicio: inicio };
    });
    setErroSimulacao(null);
  }

  /** Le o arquivo do usuario e deixa o Python conferir antes de adotar. */
  async function subirBasePropria(arquivo: File) {
    setLaudoBase(null);
    try {
      const bytes = await arquivo.arrayBuffer();
      const laudo = await usarBasePropria(arquivo.name, bytes);
      setLaudoBase(laudo);
      if (laudo.ok && laudo.tickers?.length) {
        setMinhaBase({ titulo: arquivo.name, tickers: laudo.tickers });
        setPrefs((atual) => ({ ...atual, base: ID_BASE_PROPRIA, ativos: [] }));
        setErroSimulacao(null);
      }
    } catch (e) {
      setLaudoBase({ ok: false, erro: e instanceof Error ? e.message : String(e) });
    }
  }

  /** Catálogo com as embutidas + as que o usuário escreveu. */
  const lista = useMemo(() => catalogo(estrategiasUsuario), [estrategiasUsuario]);

  /** Código de cada série, por modo. */
  const codigos = useMemo(() => {
    const mapa = codigosEmbutidos(modo);
    estrategiasUsuario.forEach((e) => {
      mapa[e.id] = modo === "aportes" ? e.codigoAportes : e.codigoRentabilidade;
    });
    return mapa;
  }, [modo, estrategiasUsuario]);

  const [configSimulacao, setConfigSimulacao] = useState<{
    aporteInicial: number; aportesMensal: number; dataInicio: string; dataFim: string;
  } | null>(null);

  const [resultados, setResultados] = useState<Resultados>({});
  const [alocacaoParidade, setAlocacaoParidade] = useState<AlocacaoMes[]>([]);
  const [riscoIngenua, setRiscoIngenua] = useState<PontoRisco[]>([]);
  const [ativosUsados, setAtivosUsados] = useState<string[]>([]);

  const [carregamento, setCarregamento] = useState<EstadoCarregamento | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [statusEstrategias, setStatusEstrategias] = useState<Record<string, EstadoEstrategia>>({});
  const [erroSimulacao, setErroSimulacao] = useState<string | null>(null);
  const [inicioSimulacao, setInicioSimulacao] = useState<number | null>(null);
  const [perfilarPython, setPerfilarPython] = useState(false);

  const pythonPronto = carregamento?.fase === "pronto";

  // Trocar de modo muda a métrica: os resultados antigos não valem mais.
  const modoAnterior = useRef(modo);
  useEffect(() => {
    if (modoAnterior.current === modo) return;
    modoAnterior.current = modo;
    setResultados({});
    setAlocacaoParidade([]);
    setStatusEstrategias({});
    setErroSimulacao(null);
    setAtivosUsados([]);
  }, [modo]);

  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && (e.key === "P" || e.key === "p")) {
        e.preventDefault();
        setPerfilarPython((v) => {
          anotar("interface", `profiler do Python ${v ? "desligado" : "ligado"}`, 0);
          return !v;
        });
      }
    }
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);

  useEffect(() => {
    const parar = ouvirCarregamento(setCarregamento);
    iniciarPyodide().catch(() => {
      // O erro já é publicado no estado de carregamento e exibido pelo StatusPython.
    });
    return parar;
  }, []);

  // ─── Estratégias do usuário ────────────────────────────────────────────────

  function novoId() {
    return `usuario-${Date.now()}`;
  }

  function proximaCor() {
    return CORES_USUARIO[estrategiasUsuario.length % CORES_USUARIO.length];
  }

  function criarEstrategia(base?: MetaEstrategia) {
    const id = novoId();
    const codigoR = base ? (codigosEmbutidos("rentabilidade")[base.id]
      ?? estrategiasUsuario.find((e) => e.id === base.id)?.codigoRentabilidade ?? "") : ESQUELETO_ESTRATEGIA;
    const codigoA = base ? (codigosEmbutidos("aportes")[base.id]
      ?? estrategiasUsuario.find((e) => e.id === base.id)?.codigoAportes ?? "") : ESQUELETO_ESTRATEGIA;

    const nova: EstrategiaUsuario = {
      id,
      titulo: base ? `${base.titulo} (cópia)` : `Minha estratégia ${estrategiasUsuario.length + 1}`,
      cor: proximaCor(),
      codigoRentabilidade: codigoR || ESQUELETO_ESTRATEGIA,
      codigoAportes: codigoA || ESQUELETO_ESTRATEGIA,
      criadaEm: Date.now(),
    };

    setPrefs((p) => ({
      ...p,
      estrategiasUsuario: [...p.estrategiasUsuario, nova],
      marcados: [...p.marcados, id],
    }));
    setPainelAberto(true);
    anotar("interface", base ? `duplicou "${base.titulo}"` : "criou estratégia nova", 0);
  }

  function editarCodigo(id: string, codigo: string) {
    setPrefs((p) => ({
      ...p,
      estrategiasUsuario: p.estrategiasUsuario.map((e) =>
        e.id !== id ? e
          : modo === "aportes" ? { ...e, codigoAportes: codigo } : { ...e, codigoRentabilidade: codigo }
      ),
    }));
  }

  function renomearEstrategia(id: string, titulo: string) {
    setPrefs((p) => ({
      ...p,
      estrategiasUsuario: p.estrategiasUsuario.map((e) => (e.id === id ? { ...e, titulo } : e)),
    }));
  }

  function removerEstrategia(id: string) {
    setPrefs((p) => ({
      ...p,
      estrategiasUsuario: p.estrategiasUsuario.filter((e) => e.id !== id),
      marcados: p.marcados.filter((m) => m !== id),
    }));
    setResultados((r) => {
      const copia = { ...r };
      delete copia[id];
      return copia;
    });
  }

  // ─── Simulação ─────────────────────────────────────────────────────────────

  const descartados = useMemo(() => {
    if (!alocacaoParidade.length || !ativosUsados.length) return [];
    return ativosUsados.filter((t) =>
      alocacaoParidade.every((m) => !m.pesos[t] || m.pesos[t] === 0)
    );
  }, [alocacaoParidade, ativosUsados]);

  function marcarEstrategia(id: string, estado: EstadoEstrategia) {
    setStatusEstrategias((anterior) => ({ ...anterior, [id]: estado }));
  }

  async function simular() {
    if (!pythonPronto || simulando) return;

    if (marcados.length === 0) {
      setErroSimulacao("Escolha ao menos uma estratégia ou benchmark.");
      return;
    }
    if (marcados.some(precisaDeAtivos) && prefs.ativos.length === 0) {
      setErroSimulacao("Escolha ao menos um ativo para as estratégias de carteira.");
      return;
    }

    // A base pode ter piso de data. Barramos aqui, e não lá no Python, porque
    // o Python não recusaria: ele calcularia a covariância com o punhado de
    // pregões que existisse e devolveria pesos de aparência normal.
    const impedimento = motivoPeriodoInvalido(base, prefs.dataInicio);
    if (impedimento) {
      setErroSimulacao(impedimento);
      return;
    }

    if (marcados.some(precisaDeAtivos) && ativosSemHistorico.length) {
      const quais = ativosSemHistorico
        .map((a) => `${a.ticker} (desde ${dataBR(a.estreia)})`)
        .join(", ");
      setErroSimulacao(
        `Sem cotação no início do período: ${quais}. `
        + "Um ativo sem histórico zera a estratégia inteira, então remova-o ou "
        + "comece o período depois da estreia dele."
      );
      return;
    }

    const orcamentoRisco = (() => {
      if (!prefs.usarOrcamento || prefs.ativos.length === 0) return {};
      const total = prefs.ativos.reduce((s, t) => s + (prefs.orcamento[t] ?? 1), 0);
      if (total <= 0) return {};
      const saida: Record<string, number> = {};
      prefs.ativos.forEach((t) => { saida[t] = (prefs.orcamento[t] ?? 1) / total; });
      return saida;
    })();

    setErroSimulacao(null);
    setInicioSimulacao(Date.now());
    setSimulando(true);
    setLateralAberta(false);
    setStatusEstrategias(Object.fromEntries(marcados.map((id) => [id, "fila" as EstadoEstrategia])));

    const variaveis = {
      tickers: prefs.ativos,
      data_inicio: prefs.dataInicio,
      data_fim: prefs.dataFim,
      aporte_inicial: prefs.aporteInicial,
      aporte_mensal: prefs.aporteMensal,
      orcamento_risco: orcamentoRisco,
      modo_retorno: "serie",
    };

    anotar("interface", "configuração da simulação", 0, [
      `base: ${base.titulo}`,
      `período: ${prefs.dataInicio} → ${prefs.dataFim}`,
      `ativos (${prefs.ativos.length}): ${prefs.ativos.join(", ") || "—"}`,
      `séries: ${marcados.map((id) => nomeDaEstrategia(id, lista)).join(", ")}`,
      Object.keys(orcamentoRisco).length
        ? `orçamento de risco: ${Object.entries(orcamentoRisco).map(([a, v]) => `${a} ${(v * 100).toFixed(1)}%`).join(", ")}`
        : "orçamento de risco: igual para todos (1/n)",
    ]);

    const novo: Resultados = {};
    const falhas: string[] = [];
    const fecharTotal = cronometrar("interface", "simulação completa (clique → gráfico)");

    try {
      for (const id of marcados) {
        const nome = nomeDaEstrategia(id, lista);
        marcarEstrategia(id, "rodando");
        const fecharSerie = cronometrar("interface", `↳ ${nome} (ida e volta)`);
        try {
          const codigo = codigos[id];
          if (!codigo || !codigo.trim()) throw new Error("sem código — escreva a estratégia no editor");
          const serie = await executarEstrategia(
            codigo, { ...variaveis, __nome: nome }, perfilarPython,
            { id: base.id, arquivo: base.arquivo },
          );
          fecharSerie();
          novo[id] = serie;
          marcarEstrategia(id, serie.length > 0 ? "ok" : "vazio");
        } catch (e) {
          fecharSerie();
          marcarEstrategia(id, "erro");
          falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`);
          console.error("Erro na série " + id + ":", e);
        }
      }

      if (marcados.includes("paridade") && novo.paridade) {
        try {
          const alocacao = normalizarAlocacao(await lerVariavelPython("alocacao_mensal"));
          setAlocacaoParidade(alocacao);
          anotar("interface", "alocação lida dos globais do Python", 0, [
            `${alocacao.length} meses de rebalanceamento`,
          ]);
        } catch (e) {
          console.error("Erro ao ler a alocação da paridade:", e);
          setAlocacaoParidade([]);
        }
      } else {
        setAlocacaoParidade([]);
      }

      if (marcados.includes("ingenua") && novo.ingenua) {
        try {
          setRiscoIngenua(normalizarRisco(await lerVariavelPython("risco_mensal")));
        } catch (e) {
          console.error("Erro ao ler o risco da ingênua:", e);
          setRiscoIngenua([]);
        }
      } else {
        setRiscoIngenua([]);
      }

      setConfigSimulacao({
        aporteInicial: prefs.aporteInicial,
        aportesMensal: prefs.aporteMensal,
        dataInicio: prefs.dataInicio,
        dataFim: prefs.dataFim,
      });
      setAtivosUsados(prefs.ativos);
      setResultados(novo);
      if (falhas.length) setErroSimulacao(falhas.join(" · "));

      const tDesenho = performance.now();
      setTimeout(() => {
        void document.body.offsetHeight;
        anotar("interface", "desenho dos gráficos", performance.now() - tDesenho);
      }, 0);
    } finally {
      fecharTotal([`${marcados.length} série(s)`, `${prefs.ativos.length} ativo(s)`]);
      setSimulando(false);
    }
  }

  const temResultado = Object.values(resultados).some((s) => s && s.length > 0);
  const seriesDoModo = doModo(modo, lista).map((e) => e.id);

  return (
    <div className="app">
      <Cabecalho
        painelAberto={painelAberto}
        setPainelAberto={setPainelAberto}
        lateralAberta={lateralAberta}
        setLateralAberta={setLateralAberta}
        status={status}
      />

      <PainelEditores
        aberto={painelAberto}
        setPainelAberto={setPainelAberto}
        modo={modo}
        lista={lista}
        codigos={codigos}
        editarCodigo={editarCodigo}
        renomear={renomearEstrategia}
        remover={removerEstrategia}
        duplicar={criarEstrategia}
      />

      <StatusPython />
      <PainelDiagnostico />

      <div className="corpo">
        <aside className={"lateral" + (lateralAberta ? " lateral--aberta" : "")}>
          <PainelConfiguracoes
            tickers={tickers}
            base={base}
            temBasePropria={!!minhaBase}
            tituloBasePropria={minhaBase?.titulo ?? null}
            laudoBase={laudoBase}
            onTrocarBase={trocarBase}
            onSubirBase={subirBasePropria}
            ativosSemHistorico={ativosSemHistorico}
            lista={lista}
            prefs={prefs}
            mudar={mudar}
            tickersSemDados={status.tickersSemDados}
            onSimular={simular}
            onCriarEstrategia={() => criarEstrategia()}
            onDuplicar={criarEstrategia}
            onAbrirEditor={() => setPainelAberto(true)}
            pythonPronto={pythonPronto}
            pctCarregamento={carregamento?.pct ?? 0}
            simulando={simulando}
          />
        </aside>

        <main className="resultados">
          <StatusSimulacao
            key={inicioSimulacao ?? "sem-simulacao"}
            simulando={simulando}
            marcados={marcados}
            lista={lista}
            status={statusEstrategias}
            erro={erroSimulacao}
            inicio={inicioSimulacao}
          />

          {descartados.length > 0 && (
            <div className="aviso aviso--info">
              <span className="aviso__icone"><Icone nome="info" tamanho={15} /></span>
              <span>
                <strong>{descartados.join(", ")}</strong>{" "}
                {descartados.length === 1 ? "ficou de fora" : "ficaram de fora"} da
                Paridade de Risco em todos os meses: a volatilidade anual{" "}
                {descartados.length === 1 ? "dele" : "deles"} ficou abaixo do limiar
                de 13% que o otimizador usa para manter a matriz de covariância
                bem condicionada.
              </span>
            </div>
          )}

          {!temResultado && !simulando ? (
            <div className="vazio">
              <span className="vazio__icone"><Icone nome="grafico" tamanho={26} /></span>
              <p className="vazio__titulo">Compare estratégias na B3</p>
              <ul className="vazio__passos">
                <li><b>1</b><span>Período e estratégias</span></li>
                <li><b>2</b><span>Ativos da carteira</span></li>
                <li><b>3</b><span>Simular</span></li>
              </ul>
              <button
                className="botao-icone so-celular"
                style={{ marginTop: "22px", justifyContent: "center" }}
                onClick={() => setLateralAberta(true)}
              >
                <span className="com-icone">
                  <Icone nome="ajustes" tamanho={15} />
                  Configurar
                </span>
              </button>
            </div>
          ) : (
            <>
              {modo === "aportes" ? (
                <Grafico_aportes
                  dados={resultados} config={configSimulacao}
                  series={seriesDoModo} lista={lista}
                />
              ) : (
                <Grafico_rentabilidade
                  dados={resultados} config={configSimulacao}
                  series={seriesDoModo} lista={lista}
                  valorReferencia={prefs.valorReferencia}
                  setValorReferencia={(v) => mudar("valorReferencia", v)}
                />
              )}

              <PainelMetricas series={seriesDoModo.map((id) => lista.find((e) => e.id === id)!).filter(Boolean)} dados={resultados} />

              {marcados.includes("paridade") && alocacaoParidade.length > 0 && (
                <GraficosParidade alocacao={alocacaoParidade} />
              )}

              {marcados.includes("ingenua") && riscoIngenua.length > 1 && (
                <GraficoRisco risco={riscoIngenua} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
