/**
 * app/lib/diagnostico.ts
 *
 * Coletor de telemetria de desempenho.
 *
 * As medições vêm de três lugares e precisam ficar juntas para o diagnóstico
 * fazer sentido: o worker mede o carregamento e o tempo dentro do Python, a
 * página mede o que o usuário sente (do clique ao gráfico), e o profiler do
 * Python aponta qual função consumiu o tempo. Sozinha, nenhuma dessas fontes
 * responde "por que está lento".
 */

export type TipoRegistro = "carregamento" | "execucao" | "interface";

export interface Registro {
  tipo: TipoRegistro;
  rotulo: string;
  ms: number;
  /** Linhas extras: MB baixados, número de pontos, top de funções do Python. */
  detalhes?: string[];
  quando: number;
}

const registros: Registro[] = [];
const ouvintes = new Set<() => void>();

function avisar() {
  ouvintes.forEach((f) => f());
}

export function assinarDiagnostico(cb: () => void) {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

export function registros_atuais(): Registro[] {
  return registros;
}

export function anotar(tipo: TipoRegistro, rotulo: string, ms: number, detalhes?: string[]) {
  registros.push({ tipo, rotulo, ms, detalhes, quando: Date.now() });
  avisar();
}

export function limparDiagnostico() {
  registros.length = 0;
  avisar();
}

/** Cronômetro simples: devolve a função que fecha a medição. */
export function cronometrar(tipo: TipoRegistro, rotulo: string) {
  const t = performance.now();
  return (detalhes?: string[]) => {
    const ms = performance.now() - t;
    anotar(tipo, rotulo, ms, detalhes);
    return ms;
  };
}

/** Recebe as mensagens de telemetria que o worker emite. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function anotarDoWorker(msg: any) {
  if (msg.evento === "carregamento") {
    const detalhes: string[] = [];
    if (msg.mb) detalhes.push(`${msg.mb.toFixed(1)} MB acumulados`);
    if (Array.isArray(msg.detalhe)) detalhes.push(...msg.detalhe);
    anotar("carregamento", msg.fase, msg.ms, detalhes);
    return;
  }

  if (msg.evento === "execucao") {
    const detalhes = [
      `variáveis → Python: ${msg.msVariaveis.toFixed(0)} ms`,
      `execução do Python: ${msg.msPython.toFixed(0)} ms`,
      `Python → JavaScript: ${msg.msConversao.toFixed(0)} ms`,
      `${msg.pontos} pontos devolvidos`,
    ];
    if (Array.isArray(msg.perfil) && msg.perfil.length) {
      detalhes.push("— funções mais caras dentro do Python —", ...msg.perfil);
    }
    anotar("execucao", String(msg.estrategia), msg.msTotal, detalhes);
  }
}

/** Texto pronto para colar num relatório ou numa issue. */
export function comoTexto(): string {
  if (!registros.length) return "Nenhuma medição ainda.";

  const linhas: string[] = [
    "DIAGNÓSTICO DE DESEMPENHO — Portfolio Lab",
    new Date().toISOString(),
    `navegador: ${navigator.userAgent}`,
    `núcleos: ${navigator.hardwareConcurrency ?? "?"}`,
    "",
  ];

  for (const grupo of ["carregamento", "execucao", "interface"] as TipoRegistro[]) {
    const doGrupo = registros.filter((r) => r.tipo === grupo);
    if (!doGrupo.length) continue;

    linhas.push(`── ${grupo.toUpperCase()} ${"─".repeat(Math.max(0, 46 - grupo.length))}`);
    for (const r of doGrupo) {
      linhas.push(`${r.ms.toFixed(0).padStart(8)} ms  ${r.rotulo}`);
      r.detalhes?.forEach((d) => linhas.push(`             ${d}`));
    }
    const soma = doGrupo.reduce((s, r) => s + r.ms, 0);
    linhas.push(`${soma.toFixed(0).padStart(8)} ms  (soma do grupo)`, "");
  }

  return linhas.join("\n");
}
