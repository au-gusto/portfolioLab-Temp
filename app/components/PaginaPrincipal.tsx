"use client";

import { useState, useEffect, useMemo } from "react";

import {
  iniciarPyodide,
  ouvirCarregamento,
  executarEstrategia,
  lerVariavelPython,
  type EstadoCarregamento,
} from "../lib/pyodideLoader";
import type { StatusDados } from "../lib/fonte-dados";
import { nomeDaEstrategia, precisaDeAtivos, doModo, type IdSerie } from "../lib/estrategias-meta";
import { cronometrar, anotar } from "../lib/diagnostico";

import Cabecalho from "./Cabecalho";
import PainelConfiguracoes, { type ConfigSimulacao } from "./PainelConfiguracoes";
import PainelEditores from "./PainelEditores";
import StatusPython from "./StatusPython";
import Icone from "./Icone";
import PainelDiagnostico from "./PainelDiagnostico";
import StatusSimulacao, { type EstadoEstrategia } from "./StatusSimulacao";
import Grafico_aportes from "./Grafico";
import Grafico_rentabilidade from "./Grafico - Rentabilidade";
import GraficosParidade from "./GraficosParidade";

import { codigoCDI } from "../estrategias/cdi";
import { codigoParidade } from "../estrategias/paridade";
import { codigoEficiente } from "../estrategias/eficiente";
import { codigoCDI_rentabilidade } from "../estrategias/cdi - Rentabilidade";
import { codigoParidade_rentabilidade } from "../estrategias/paridade - Rentabilidade";
import { codigoEficiente_rentabilidade } from "../estrategias/eficiente - Rentabilidade";
import { codigoIngenua_rentabilidade } from "../estrategias/ingenua - Rentabilidade";
import {
  codigoIbov, codigoIpca, codigoPoupanca,
  codigoIbov_rentabilidade, codigoIpca_rentabilidade, codigoPoupanca_rentabilidade,
} from "../estrategias/benchmarks";

interface Props {
  tickers: string[];
  status: StatusDados;
}

export type Serie = { data: string; valor: number }[] | null;
export type Resultados = Partial<Record<IdSerie, Serie>>;

type Codigos = Record<IdSerie, string>;

function codigosDoModo(modo: "aportes" | "rentabilidade"): Codigos {
  const aportes = modo === "aportes";
  return {
    paridade: aportes ? codigoParidade : codigoParidade_rentabilidade,
    eficiente: aportes ? codigoEficiente : codigoEficiente_rentabilidade,
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

export default function PaginaPrincipal({ tickers, status }: Props) {
  const [painelAberto, setPainelAberto] = useState(false);
  const [lateralAberta, setLateralAberta] = useState(false);
  const [modo, setModo] = useState<"aportes" | "rentabilidade">("rentabilidade");

  const [codigos, setCodigos] = useState<Codigos>(() => codigosDoModo("rentabilidade"));

  useEffect(() => {
    setCodigos(codigosDoModo(modo));
    // Trocar de modo muda a métrica: os resultados antigos não valem mais.
    setResultados({});
    setAlocacaoParidade([]);
    setStatusEstrategias({});
    setErroSimulacao(null);
    setAtivosUsados([]);
  }, [modo]);

  const [configSimulacao, setConfigSimulacao] = useState<{
    aporteInicial: number; aportesMensal: number; dataInicio: string; dataFim: string;
  } | null>(null);

  const [marcados, setMarcados] = useState<string[]>(["paridade", "cdi", "ibov"]);
  const [resultados, setResultados] = useState<Resultados>({});
  const [alocacaoParidade, setAlocacaoParidade] = useState<AlocacaoMes[]>([]);
  const [ativosUsados, setAtivosUsados] = useState<string[]>([]);

  const [carregamento, setCarregamento] = useState<EstadoCarregamento | null>(null);
  const [simulando, setSimulando] = useState(false);
  const [statusEstrategias, setStatusEstrategias] = useState<Record<string, EstadoEstrategia>>({});
  const [erroSimulacao, setErroSimulacao] = useState<string | null>(null);
  const [inicioSimulacao, setInicioSimulacao] = useState<number | null>(null);
  // Ctrl+Shift+P liga o profiler do Python. Desligado por padrão: ele
  // instrumenta cada chamada e chega a dobrar o tempo de execução.
  const [perfilarPython, setPerfilarPython] = useState(false);

  const pythonPronto = carregamento?.fase === "pronto";

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

  /**
   * Ativos que o otimizador descartou em TODOS os meses — quase sempre por
   * caírem abaixo do limiar de 13% de volatilidade anual. Sem isso o usuário
   * escolhia um ativo, ele sumia da carteira e nada na tela dizia por quê.
   */
  const descartados = useMemo(() => {
    if (!alocacaoParidade.length || !ativosUsados.length) return [];
    return ativosUsados.filter((t) =>
      alocacaoParidade.every((m) => !m.pesos[t] || m.pesos[t] === 0)
    );
  }, [alocacaoParidade, ativosUsados]);

  function marcarEstrategia(id: string, estado: EstadoEstrategia) {
    setStatusEstrategias((anterior) => ({ ...anterior, [id]: estado }));
  }

  async function simular(config: ConfigSimulacao) {
    if (!pythonPronto || simulando) return;

    if (marcados.length === 0) {
      setErroSimulacao("Escolha ao menos uma estratégia ou benchmark.");
      return;
    }
    if (marcados.some(precisaDeAtivos) && config.tickers.length === 0) {
      setErroSimulacao("Escolha ao menos um ativo para as estratégias de carteira.");
      return;
    }

    setErroSimulacao(null);
    setInicioSimulacao(Date.now());
    setSimulando(true);
    setLateralAberta(false);   // no celular, sai da gaveta e mostra o resultado
    setStatusEstrategias(Object.fromEntries(marcados.map((id) => [id, "fila" as EstadoEstrategia])));

    const variaveis = {
      tickers: config.tickers,
      data_inicio: config.dataInicio,
      data_fim: config.dataFim,
      aporte_inicial: config.aporteInicial,
      aporte_mensal: config.aportesMensal,
      orcamento_risco: config.orcamentoRisco,
      modo_retorno: "serie",
    };

    anotar("interface", "configuração da simulação", 0, [
      `período: ${config.dataInicio} → ${config.dataFim}`,
      `ativos (${config.tickers.length}): ${config.tickers.join(", ") || "—"}`,
      `séries: ${marcados.map(nomeDaEstrategia).join(", ")}`,
      Object.keys(config.orcamentoRisco).length
        ? `orçamento de risco: ${Object.entries(config.orcamentoRisco).map(([a, v]) => `${a} ${(v * 100).toFixed(1)}%`).join(", ")}`
        : "orçamento de risco: igual para todos (1/n)",
    ]);

    const novo: Resultados = {};
    const falhas: string[] = [];
    const fecharTotal = cronometrar("interface", "simulação completa (clique → gráfico)");

    try {
      for (const id of marcados) {
        marcarEstrategia(id, "rodando");
        const fecharSerie = cronometrar("interface", `↳ ${nomeDaEstrategia(id)} (ida e volta)`);
        try {
          const serie = await executarEstrategia(
            codigos[id as IdSerie],
            { ...variaveis, __nome: nomeDaEstrategia(id) },
            perfilarPython
          );
          fecharSerie();
          novo[id as IdSerie] = serie;
          marcarEstrategia(id, serie.length > 0 ? "ok" : "vazio");
        } catch (e) {
          fecharSerie();
          marcarEstrategia(id, "erro");
          falhas.push(`${nomeDaEstrategia(id)}: ${e instanceof Error ? e.message : String(e)}`);
          console.error("Erro na série " + id + ":", e);
        }
      }

      // A alocação mensal já ficou nos globais do Python durante a execução
      // acima — basta lê-la, em vez de rodar a otimização inteira de novo.
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

      setConfigSimulacao({
        aporteInicial: config.aporteInicial,
        aportesMensal: config.aportesMensal,
        dataInicio: config.dataInicio,
        dataFim: config.dataFim,
      });
      setAtivosUsados(config.tickers);
      setResultados(novo);
      if (falhas.length) setErroSimulacao(falhas.join(" · "));

      // Mede o desenho: o React ainda vai reconciliar e o navegador ainda vai
      // pintar depois deste bloco. Num PC fraco desenhar custa mais que calcular.
      const tDesenho = performance.now();
      setTimeout(() => {
        void document.body.offsetHeight;
        anotar("interface", "desenho dos gráficos", performance.now() - tDesenho);
      }, 0);
    } finally {
      fecharTotal([`${marcados.length} série(s)`, `${config.tickers.length} ativo(s)`]);
      setSimulando(false);
    }
  }

  const temResultado = Object.values(resultados).some((s) => s && s.length > 0);
  const seriesDoModo = doModo(modo).map((e) => e.id);

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
        codigos={codigos}
        setCodigos={setCodigos}
        modo={modo}
      />

      <StatusPython />
      <PainelDiagnostico />

      <div className="corpo">
        <aside className={"lateral" + (lateralAberta ? " lateral--aberta" : "")}>
          <PainelConfiguracoes
            tickers={tickers}
            marcados={marcados}
            setMarcados={setMarcados}
            tickersSemDados={status.tickersSemDados}
            onSimular={simular}
            modo={modo}
            setModo={setModo}
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
                <Grafico_aportes dados={resultados} config={configSimulacao} series={seriesDoModo} />
              ) : (
                <Grafico_rentabilidade dados={resultados} config={configSimulacao} series={seriesDoModo} />
              )}

              {marcados.includes("paridade") && alocacaoParidade.length > 0 && (
                <GraficosParidade alocacao={alocacaoParidade} />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
