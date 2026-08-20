/**
 * app/lib/diagnostico.ts
 *
 * Registro do que acontece no app — desempenho, ações e falhas.
 *
 * Começou como coletor de telemetria e virou o log do sistema, porque as duas
 * perguntas que a gente faz na frente da tela são a mesma: "por que está
 * lento" e "por que deu isso". Ambas se respondem com a sequência de eventos,
 * não com um número isolado.
 *
 * Três fontes alimentam o mesmo fluxo: o worker mede o carregamento e o tempo
 * dentro do Python, a página registra o que o usuário fez e o que o app
 * respondeu, e os capturadores globais pegam o que ninguém tratou. Tudo fica
 * em memória, nesta aba, e some ao recarregar — não é auditoria, é
 * diagnóstico.
 */

export type TipoRegistro =
  | "carregamento"   // Pyodide, pacotes, CSVs
  | "execucao"       // Python rodando uma estratégia
  | "interface"      // o que o usuário sente, do clique ao gráfico
  | "dados"          // troca de base, arquivo do usuário, validação
  | "acao"           // o que a pessoa clicou
  | "sistema";       // erros não tratados, ciclo de vida

export type Nivel = "info" | "aviso" | "erro";

export interface Registro {
  tipo: TipoRegistro;
  nivel: Nivel;
  rotulo: string;
  /** Duração, quando o evento tem duração. Zero para eventos pontuais. */
  ms: number;
  /** Linhas extras: MB baixados, número de pontos, pilha do erro. */
  detalhes?: string[];
  quando: number;
}

export const TIPOS: TipoRegistro[] = [
  "carregamento", "execucao", "interface", "dados", "acao", "sistema",
];

/**
 * Teto do buffer.
 *
 * Sem limite, uma sessão longa com muitos cliques cresce sem parar — e o
 * diagnóstico passaria a ser a causa do problema que deveria diagnosticar.
 * Ao estourar, os mais antigos saem.
 */
const TETO = 2000;

const registros: Registro[] = [];
const ouvintes = new Set<() => void>();

/**
 * Cópia que o React lê.
 *
 * `useSyncExternalStore` compara instantâneos por identidade. Enquanto
 * `registros_atuais()` devolvia o próprio array — mutado no lugar — a
 * referência nunca mudava, e qualquer `useMemo` que dependesse dela ficava
 * congelado no primeiro valor. Era assim que o painel mostrava "0 problemas"
 * com um aviso listado logo abaixo.
 *
 * Devolver um array novo a cada chamada seria o oposto: renderização infinita.
 * A cópia é trocada uma vez por evento registrado, que é exatamente quando o
 * instantâneo de fato mudou.
 */
let instantaneo: Registro[] = [];

let descartados = 0;

function avisar() {
  ouvintes.forEach((f) => f());
}

export function assinarDiagnostico(cb: () => void) {
  ouvintes.add(cb);
  return () => ouvintes.delete(cb);
}

export function registros_atuais(): Registro[] {
  return instantaneo;
}

export function quantosDescartados(): number {
  return descartados;
}

function empilhar(r: Registro) {
  registros.push(r);
  if (registros.length > TETO) {
    registros.splice(0, registros.length - TETO);
    descartados++;
  }
  instantaneo = registros.slice();
  avisar();
}

/** Evento com duração medida. */
export function anotar(tipo: TipoRegistro, rotulo: string, ms: number, detalhes?: string[]) {
  empilhar({ tipo, nivel: "info", rotulo, ms, detalhes, quando: Date.now() });
}

/** Evento pontual: aconteceu, não durou. */
export function registrar(
  tipo: TipoRegistro,
  rotulo: string,
  detalhes?: string[],
  nivel: Nivel = "info",
) {
  empilhar({ tipo, nivel, rotulo, ms: 0, detalhes, quando: Date.now() });
}

/** Atalhos para os dois níveis que interessam quando algo dá errado. */
export function avisarProblema(tipo: TipoRegistro, rotulo: string, detalhes?: string[]) {
  registrar(tipo, rotulo, detalhes, "aviso");
}

export function registrarErro(tipo: TipoRegistro, rotulo: string, erro: unknown, extras?: string[]) {
  const detalhes = [...(extras ?? [])];
  if (erro instanceof Error) {
    detalhes.push(erro.message);
    if (erro.stack) {
      // Só as primeiras linhas: a pilha inteira do bundler é ilegível e
      // empurra o resto do log para fora da tela.
      detalhes.push(...erro.stack.split("\n").slice(1, 4).map((l) => l.trim()));
    }
  } else if (erro !== undefined) {
    detalhes.push(String(erro));
  }
  empilhar({ tipo, nivel: "erro", rotulo, ms: 0, detalhes, quando: Date.now() });
}

export function limparDiagnostico() {
  registros.length = 0;
  descartados = 0;
  instantaneo = [];
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

interface MensagemWorker {
  evento?: string;
  fase?: string;
  ms?: number;
  mb?: number;
  detalhe?: unknown;
  estrategia?: unknown;
  msVariaveis?: number;
  msPython?: number;
  msConversao?: number;
  msTotal?: number;
  pontos?: number;
  perfil?: unknown;
}

/** Recebe as mensagens de telemetria que o worker emite. */
export function anotarDoWorker(msg: MensagemWorker) {
  if (msg.evento === "carregamento") {
    const detalhes: string[] = [];
    if (msg.mb) detalhes.push(`${msg.mb.toFixed(1)} MB acumulados`);
    if (Array.isArray(msg.detalhe)) detalhes.push(...msg.detalhe.map(String));
    anotar("carregamento", String(msg.fase), msg.ms ?? 0, detalhes);
    return;
  }

  if (msg.evento === "execucao") {
    const detalhes = [
      `variáveis → Python: ${(msg.msVariaveis ?? 0).toFixed(0)} ms`,
      `execução do Python: ${(msg.msPython ?? 0).toFixed(0)} ms`,
      `Python → JavaScript: ${(msg.msConversao ?? 0).toFixed(0)} ms`,
      `${msg.pontos ?? 0} pontos devolvidos`,
    ];
    if (Array.isArray(msg.perfil) && msg.perfil.length) {
      detalhes.push("— funções mais caras dentro do Python —", ...msg.perfil.map(String));
    }
    anotar("execucao", String(msg.estrategia), msg.msTotal ?? 0, detalhes);
  }
}

/**
 * Captura o que ninguém tratou.
 *
 * Sem isto, um erro fora de um try/catch aparece só no console do navegador —
 * que ninguém abre. O log passa a ter a falha e o que veio logo antes dela,
 * que costuma ser a parte útil.
 */
let capturadoresLigados = false;

export function ligarCapturadores() {
  if (capturadoresLigados || typeof window === "undefined") return;
  capturadoresLigados = true;

  window.addEventListener("error", (ev) => {
    registrarErro("sistema", "erro não tratado", ev.error ?? ev.message, [
      ev.filename ? `${ev.filename}:${ev.lineno}:${ev.colno}` : "",
    ].filter(Boolean));
  });

  window.addEventListener("unhandledrejection", (ev) => {
    registrarErro("sistema", "promessa rejeitada sem tratamento", ev.reason);
  });

  registrar("sistema", "diagnóstico iniciado", [
    `navegador: ${navigator.userAgent}`,
    `núcleos: ${navigator.hardwareConcurrency ?? "?"}`,
    `tela: ${window.innerWidth}×${window.innerHeight}`,
    `memória do dispositivo: ${
      (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? "?"
    } GB`,
  ]);
}

function horario(quando: number): string {
  const d = new Date(quando);
  const p = (n: number, casas = 2) => String(n).padStart(casas, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

/** Texto pronto para colar num relatório ou numa issue. */
export function comoTexto(): string {
  if (!registros.length) return "Nenhum registro ainda.";

  const erros = registros.filter((r) => r.nivel === "erro").length;
  const avisos = registros.filter((r) => r.nivel === "aviso").length;

  const linhas: string[] = [
    "DIAGNÓSTICO — Portfolio Lab",
    new Date().toISOString(),
    `navegador: ${navigator.userAgent}`,
    `núcleos: ${navigator.hardwareConcurrency ?? "?"}`,
    `${registros.length} registro(s) · ${erros} erro(s) · ${avisos} aviso(s)`,
    descartados ? `${descartados} lote(s) antigo(s) descartado(s) pelo teto de ${TETO}` : "",
    "",
    "── LINHA DO TEMPO ─────────────────────────────────────────────",
  ].filter(Boolean);

  for (const r of registros) {
    const marca = r.nivel === "erro" ? "!!" : r.nivel === "aviso" ? " !" : "  ";
    const dur = r.ms > 0 ? `${r.ms.toFixed(0).padStart(7)} ms` : " ".repeat(10);
    linhas.push(`${horario(r.quando)} ${marca} [${r.tipo}]${dur}  ${r.rotulo}`);
    r.detalhes?.forEach((d) => linhas.push(`${" ".repeat(16)}${d}`));
  }

  linhas.push("", "── TEMPO POR GRUPO ────────────────────────────────────────────");
  for (const grupo of TIPOS) {
    const doGrupo = registros.filter((r) => r.tipo === grupo && r.ms > 0);
    if (!doGrupo.length) continue;
    const soma = doGrupo.reduce((s, r) => s + r.ms, 0);
    linhas.push(`${soma.toFixed(0).padStart(8)} ms  ${grupo} (${doGrupo.length} evento(s))`);
  }

  return linhas.join("\n");
}
