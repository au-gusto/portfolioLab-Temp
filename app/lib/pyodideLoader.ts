/**
 * app/lib/pyodideLoader.ts
 *
 * Ponte entre a interface e o Web Worker que hospeda o Pyodide
 * (public/pyodide-worker.js).
 *
 * A página nunca toca no Pyodide diretamente: manda mensagens e recebe
 * respostas. Assim o Python pesado roda fora da thread principal e a tela
 * continua respondendo — spinners giram, botões clicam, nada congela.
 */

import { anotarDoWorker } from "./diagnostico";

export type FaseCarregamento = "ocioso" | "runtime" | "pacotes" | "dados" | "pronto" | "falha";

export interface EstadoCarregamento {
  fase: FaseCarregamento;
  pct: number;
  detalhe: string;
  mbBaixados: number;
  erro?: string;
}

type Ouvinte = (estado: EstadoCarregamento) => void;

let worker: Worker | null = null;
let proximoId = 1;

const pendentes = new Map<number, { ok: (v: unknown) => void; falha: (e: Error) => void }>();
const ouvintes = new Set<Ouvinte>();

let estado: EstadoCarregamento = {
  fase: "ocioso",
  pct: 0,
  detalhe: "Aguardando",
  mbBaixados: 0,
};

let prontoPromise: Promise<void> | null = null;
let resolverPronto: (() => void) | null = null;
let rejeitarPronto: ((e: Error) => void) | null = null;

function publicar(novo: Partial<EstadoCarregamento>) {
  estado = { ...estado, ...novo };
  ouvintes.forEach((o) => o(estado));
}

/** Estado atual do carregamento (útil para inicializar componentes React). */
export function estadoAtual(): EstadoCarregamento {
  return estado;
}

/** Registra um ouvinte de progresso. Devolve a função para cancelar. */
export function ouvirCarregamento(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  ouvinte(estado);
  return () => ouvintes.delete(ouvinte);
}

/**
 * Sobe o worker e começa a baixar o Pyodide.
 * Chamadas repetidas reaproveitam o mesmo worker.
 * A promise resolve quando Python + bibliotecas + dados estão prontos.
 */
export function iniciarPyodide(): Promise<void> {
  if (prontoPromise) return prontoPromise;

  prontoPromise = new Promise<void>((resolve, reject) => {
    resolverPronto = resolve;
    rejeitarPronto = reject;
  });

  worker = new Worker("/pyodide-worker.js");

  worker.onmessage = (evento) => {
    const msg = evento.data;

    // Telemetria não é resposta a nenhuma requisição: só alimenta o painel
    // de diagnóstico e segue.
    if (msg.tipo === "metrica") {
      anotarDoWorker(msg);
      return;
    }

    switch (msg.tipo) {
      case "progresso":
        publicar({
          fase: msg.fase,
          pct: msg.pct,
          detalhe: msg.detalhe,
          mbBaixados: msg.mbBaixados,
        });
        break;

      case "pronto":
        publicar({ fase: "pronto", pct: 100, detalhe: "Tudo pronto" });
        resolverPronto?.();
        break;

      case "falha":
        publicar({ fase: "falha", detalhe: "Falha ao carregar", erro: msg.mensagem });
        rejeitarPronto?.(new Error(msg.mensagem));
        break;

      case "resultado": {
        pendentes.get(msg.id)?.ok(msg.dados);
        pendentes.delete(msg.id);
        break;
      }

      case "erro": {
        pendentes.get(msg.id)?.falha(new Error(msg.mensagem));
        pendentes.delete(msg.id);
        break;
      }
    }
  };

  worker.onerror = (evento) => {
    const mensagem = evento.message || "Erro desconhecido no worker do Python";
    publicar({ fase: "falha", detalhe: "Falha ao carregar", erro: mensagem });
    rejeitarPronto?.(new Error(mensagem));
  };

  worker.postMessage({ tipo: "iniciar" });
  return prontoPromise;
}

function enviar(mensagem: Record<string, unknown>) {
  if (!worker) return Promise.reject(new Error("Python ainda não foi iniciado"));

  const id = proximoId++;
  return new Promise<unknown>((ok, falha) => {
    pendentes.set(id, { ok, falha });
    worker!.postMessage({ ...mensagem, id });
  });
}

/** Roda uma estratégia e devolve a série {data, valor}. */
export async function executarEstrategia(
  codigo: string,
  variaveis: Record<string, unknown>,
  perfilar = false
): Promise<{ data: string; valor: number }[]> {
  return (await enviar({ tipo: "executar", codigo, variaveis, bruto: false, perfilar })) as {
    data: string;
    valor: number;
  }[];
}

/** Roda um código Python e devolve o retorno cru, sem normalizar. */
export async function executarEstrategiaBruta(
  codigo: string,
  variaveis: Record<string, unknown>
): Promise<unknown> {
  return enviar({ tipo: "executar", codigo, variaveis, bruto: true });
}

/**
 * Lê uma variável deixada nos globais do Python pela última execução.
 *
 * A paridade calcula `alocacao_mensal` como subproduto da série. Antes o app
 * rodava a estratégia inteira uma segunda vez (com modo_retorno='alocacao')
 * só para obtê-la — o dobro de otimizações. Agora é só pegar o que já está lá.
 * Devolve null se a variável não existir (ex.: o usuário renomeou no editor).
 */
export async function lerVariavelPython(nome: string): Promise<unknown> {
  return enviar({ tipo: "lerVariavel", nome });
}
