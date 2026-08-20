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
import {
  cronometrar,
  anotar,
  registrar,
  registrarErro,
  avisarProblema,
  ligarCapturadores,
} from "../lib/diagnostico";

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

/**
 * Le um campo de algo que veio do Python.
 *
 * O Pyodide converte dict para Map quando as chaves nao sao todas string, e
 * para objeto quando sao. Como isso depende do conteudo, os dois casos
 * precisam ser aceitos.
 */
function campo(item: unknown, nome: string): unknown {
  if (item instanceof Map) return item.get(nome);
  if (item && typeof item === "object") return (item as Record<string, unknown>)[nome];
  return undefined;
}

function paraMapa(bruto: unknown): Record<string, number> {
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

/** O Python devolve uma lista de dicts; aqui ela vira o formato do gráfico. */
function normalizarRisco(bruto: unknown): PontoRisco[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    // `campo` e não `p.data`: o Pyodide entrega dict como Map quando as chaves
    // não são todas string, e ler a propriedade direto devolvia undefined —
    // o gráfico de risco simplesmente não aparecia, sem erro nenhum.
    .map((p) => ({
      data: String(campo(p, "data") ?? ""),
      risco: Number(campo(p, "risco")),
    }))
    .filter((p) => p.data && Number.isFinite(p.risco));
}

function normalizarAlocacao(bruto: unknown): AlocacaoMes[] {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .map((item: unknown) => ({
      data: String(campo(item, "data") ?? ""),
      pesos: paraMapa(campo(item, "pesos")),
      riscoAlvo: paraMapa(campo(item, "risco_alvo")),
    }))
    .filter((p) => p.data);
}

export default function PaginaPrincipal({ tickersPorBase, estreiasPorBase, status }: Props) {
  const [painelAberto, setPainelAberto] = useState(false);
  const [lateralAberta, setLateralAberta] = useState(false);

  // Retracao da lateral no desktop. E outra coisa que `lateralAberta`, que
  // controla a gaveta do celular: aqui a lateral existe e some para dar largura
  // ao grafico. Fica em estado local de proposito — voltar ao site com a
  // configuracao escondida deixaria a pessoa sem saber por onde comecar.
  const [lateralRecolhida, setLateralRecolhida] = useState(false);

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
    ligarCapturadores();
    setPrefs(carregarPrefs());
    hidratado.current = true;
  }, []);

  useEffect(() => {
    if (hidratado.current) salvarPrefs(prefs);
  }, [prefs]);

  /**
   * Descreve uma mudança de preferência em uma linha.
   *
   * Para lista, o que interessa é a diferença — dizer "ativos: 8 itens" não
   * ajuda ninguém a reconstruir o que a pessoa fez. Para o resto, o de-para.
   */
  function descrever(chave: string, antes: unknown, depois: unknown): string | null {
    if (Array.isArray(antes) && Array.isArray(depois)) {
      const entrou = depois.filter((x) => !antes.includes(x));
      const saiu = antes.filter((x) => !depois.includes(x));
      if (!entrou.length && !saiu.length) return null;
      const partes: string[] = [];
      if (entrou.length) partes.push(`+ ${entrou.join(", ")}`);
      if (saiu.length) partes.push(`− ${saiu.join(", ")}`);
      return `${chave}: ${partes.join("  ")}  (agora ${depois.length})`;
    }
    if (typeof antes === "object" || typeof depois === "object") {
      return `${chave} alterado`;
    }
    if (antes === depois) return null;
    return `${chave}: ${String(antes)} → ${String(depois)}`;
  }

  function mudar<K extends keyof Preferencias>(chave: K, valor: Preferencias[K]) {
    // O registro fica FORA do atualizador de estado. Dentro dele seria um
    // efeito colateral numa função que o React pode chamar mais de uma vez —
    // e chama, em desenvolvimento: cada ação aparecia duplicada no log.
    //
    // Ler `prefs` da closure é correto aqui porque `mudar` só é chamado de
    // manipuladores de evento, onde o valor do render atual é o valor vigente.
    const linha = descrever(String(chave), prefs[chave], valor);
    if (linha) registrar("acao", linha);

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

      const perdidos = atual.ativos.filter((t) => !permitidos.has(t));
      registrar("dados", `base trocada para ${alvo.titulo}`, [
        `${nova.length} ativo(s) disponíveis`,
        perdidos.length
          ? `${perdidos.length} ativo(s) não existem nesta base e saíram: ${perdidos.join(", ")}`
          : "todos os ativos escolhidos continuam válidos",
        inicio !== atual.dataInicio
          ? `início ajustado de ${atual.dataInicio} para ${inicio} (piso da base)`
          : `período mantido em ${atual.dataInicio}`,
      ]);

      return { ...atual, base: id, ativos: sobreviventes, dataInicio: inicio };
    });
    setErroSimulacao(null);
  }

  /** Le o arquivo do usuario e deixa o Python conferir antes de adotar. */
  async function subirBasePropria(arquivo: File) {
    setLaudoBase(null);
    const fechar = cronometrar("dados", `conferência de ${arquivo.name}`);
    registrar("acao", "arquivo de cotações escolhido", [
      arquivo.name,
      `${(arquivo.size / 1024).toFixed(0)} KB`,
      arquivo.type || "tipo não informado",
    ]);
    try {
      const bytes = await arquivo.arrayBuffer();
      const laudo = await usarBasePropria(arquivo.name, bytes);
      setLaudoBase(laudo);
      fechar([laudo.ok ? "aceito" : "recusado"]);
      if (!laudo.ok) {
        avisarProblema("dados", "arquivo recusado na conferência", [laudo.erro ?? "sem motivo"]);
      } else {
        registrar("dados", "base do usuário adotada", [
          `${laudo.tickers?.length ?? 0} ativo(s), ${laudo.pregoes ?? 0} pregão(ões)`,
          `${laudo.inicio} → ${laudo.fim}`,
          ...(laudo.avisos ?? []),
        ]);
      }
      if (laudo.ok && laudo.tickers?.length) {
        setMinhaBase({ titulo: arquivo.name, tickers: laudo.tickers });
        setPrefs((atual) => ({ ...atual, base: ID_BASE_PROPRIA, ativos: [] }));
        setErroSimulacao(null);
      }
    } catch (e) {
      fechar(["falhou"]);
      registrarErro("dados", `não consegui ler ${arquivo.name}`, e);
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
    registrar("acao", "estratégia do usuário apagada", [id]);
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

    if (aRodar.length === 0) {
      setErroSimulacao("Escolha ao menos uma estratégia ou benchmark.");
      avisarProblema("acao", "simulação recusada: nenhuma série marcada");
      return;
    }
    if (aRodar.some(precisaDeAtivos) && prefs.ativos.length === 0) {
      setErroSimulacao("Escolha ao menos um ativo para as estratégias de carteira.");
      avisarProblema("acao", "simulação recusada: nenhum ativo escolhido");
      return;
    }

    // A base pode ter piso de data. Barramos aqui, e não lá no Python, porque
    // o Python não recusaria: ele calcularia a covariância com o punhado de
    // pregões que existisse e devolveria pesos de aparência normal.
    const impedimento = motivoPeriodoInvalido(base, prefs.dataInicio);
    if (impedimento) {
      setErroSimulacao(impedimento);
      avisarProblema("acao", "simulação recusada: período fora do piso da base", [impedimento]);
      return;
    }

    if (aRodar.some(precisaDeAtivos) && ativosSemHistorico.length) {
      const quais = ativosSemHistorico
        .map((a) => `${a.ticker} (desde ${dataBR(a.estreia)})`)
        .join(", ");
      setErroSimulacao(
        `Sem cotação no início do período: ${quais}. `
        + "Um ativo sem histórico zera a estratégia inteira, então remova-o ou "
        + "comece o período depois da estreia dele."
      );
      avisarProblema("acao", "simulação recusada: ativo sem histórico na janela", [quais]);
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

    registrar("acao", "simular", [
      `${aRodar.length} série(s): ${aRodar.map((id) => nomeDaEstrategia(id, lista)).join(", ")}`,
      `base ${base.titulo} · ${prefs.ativos.length} ativo(s)`,
      `${prefs.dataInicio} → ${prefs.dataFim}`,
    ]);

    setErroSimulacao(null);
    setInicioSimulacao(Date.now());
    setSimulando(true);
    setLateralAberta(false);
    // Simulou: a atenção vai para o resultado, e a configuração sai da frente.
    // Só no desktop — no celular a lateral já é gaveta e acabou de se fechar
    // sozinha; recolher também deixaria o estado ligado sem nada na tela
    // indicando isso, e a lateral apareceria escondida ao voltar para a tela
    // grande.
    if (typeof window !== "undefined" && window.innerWidth > 900) {
      setLateralRecolhida(true);
    }
    setStatusEstrategias(Object.fromEntries(aRodar.map((id) => [id, "fila" as EstadoEstrategia])));

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
      `séries: ${aRodar.map((id) => nomeDaEstrategia(id, lista)).join(", ")}`,
      Object.keys(orcamentoRisco).length
        ? `orçamento de risco: ${Object.entries(orcamentoRisco).map(([a, v]) => `${a} ${(v * 100).toFixed(1)}%`).join(", ")}`
        : "orçamento de risco: igual para todos (1/n)",
    ]);

    const novo: Resultados = {};
    const falhas: string[] = [];
    const fecharTotal = cronometrar("interface", "simulação completa (clique → gráfico)");

    try {
      for (const id of aRodar) {
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
          registrarErro("execucao", `${nome} falhou`, e, [`id: ${id}`]);
        }
      }

      if (aRodar.includes("paridade") && novo.paridade) {
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

      if (aRodar.includes("ingenua") && novo.ingenua) {
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
      fecharTotal([`${aRodar.length} série(s)`, `${prefs.ativos.length} ativo(s)`]);
      setSimulando(false);
    }
  }

  const temResultado = Object.values(resultados).some((s) => s && s.length > 0);
  const seriesDoModo = doModo(modo, lista).map((e) => e.id);

  /**
   * O que de fato vai rodar.
   *
   * `marcados` guarda a escolha do usuario nos DOIS modos, para que trocar de
   * aba e voltar nao perca nada. Mas nem toda estrategia existe nos dois: a
   * Ingenua e a Menor Variancia so tem codigo em Rentabilidade. Sem este
   * filtro, marcar uma delas e trocar para Patrimonio deixava um id marcado,
   * invisivel na lateral e ainda assim executado — que era exatamente a
   * mensagem "sem codigo — escreva a estrategia no editor" aparecendo do nada.
   */
  const aRodar = useMemo(
    () => marcados.filter((id) => seriesDoModo.includes(id)),
    [marcados, seriesDoModo],
  );

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
        <aside
          className={
            "lateral"
            + (lateralAberta ? " lateral--aberta" : "")
            + (lateralRecolhida ? " lateral--recolhida" : "")
          }
          /* Recolhida, a lateral tem largura zero mas continua no fluxo: sem
             `inert` os onze campos dentro dela seguiriam recebendo Tab,
             invisíveis. É o mesmo furo que a gaveta do celular já teve. */
          inert={lateralRecolhida}
        >
          <PainelConfiguracoes
            tickers={tickers}
            base={base}
            temBasePropria={!!minhaBase}
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

        {/* Puxador da lateral. Mora na costura entre os dois painéis e só
            aparece quando o ponteiro chega perto — a faixa invisível ao redor
            é o que dá área de alvo sem ocupar espaço visual. */}
        <div className={"puxador-zona" + (lateralRecolhida ? " puxador-zona--recolhida" : "")}>
          <button
            className="puxador"
            onClick={() => setLateralRecolhida((v) => !v)}
            aria-expanded={!lateralRecolhida}
            aria-label={lateralRecolhida ? "Mostrar a configuração" : "Esconder a configuração"}
            title={lateralRecolhida ? "Mostrar a configuração" : "Esconder a configuração"}
          >
            <Icone nome={lateralRecolhida ? "expandirLateral" : "recolherLateral"} tamanho={16} />
          </button>
        </div>

        <main className="resultados">
          <StatusSimulacao
            key={inicioSimulacao ?? "sem-simulacao"}
            simulando={simulando}
            marcados={aRodar}
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

              {aRodar.includes("paridade") && alocacaoParidade.length > 0 && (
                <GraficosParidade alocacao={alocacaoParidade} />
              )}

              {aRodar.includes("ingenua") && riscoIngenua.length > 1 && (
                <GraficoRisco risco={riscoIngenua} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
