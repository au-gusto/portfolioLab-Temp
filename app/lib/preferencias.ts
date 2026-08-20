/**
 * app/lib/preferencias.ts
 *
 * O que o navegador lembra entre visitas.
 *
 * Usamos localStorage, não cookie: cookie viaja em toda requisição e cabe
 * ~4 KB, e as estratégias que o usuário escreve são código Python — passam
 * disso fácil. Nada aqui sai da máquina dele.
 *
 * Toda leitura é defensiva. O conteúdo pode ter sido gravado por uma versão
 * antiga do app, editado à mão, ou estar num navegador em modo privado onde
 * escrever lança exceção — em qualquer desses casos o app precisa abrir
 * normalmente, com os padrões.
 */

const CHAVE = "portfolio-lab:v1";

export interface EstrategiaUsuario {
  id: string;
  titulo: string;
  cor: string;
  /** Código Python por modo. Estratégia nova nasce com os dois iguais. */
  codigoRentabilidade: string;
  codigoAportes: string;
  criadaEm: number;
}

export interface Preferencias {
  modo: "aportes" | "rentabilidade";
  dataInicio: string;
  dataFim: string;
  ativos: string[];
  marcados: string[];
  aporteInicial: number;
  aporteMensal: number;
  valorReferencia: number;
  usarOrcamento: boolean;
  orcamento: Record<string, number>;
  estrategiasUsuario: EstrategiaUsuario[];
}

/** Fim = hoje; início = um ano atrás. */
export function periodoPadrao(): { inicio: string; fim: string } {
  const hoje = new Date();
  const antes = new Date(hoje);
  antes.setFullYear(antes.getFullYear() - 1);
  return {
    inicio: antes.toISOString().slice(0, 10),
    fim: hoje.toISOString().slice(0, 10),
  };
}

export function padroes(): Preferencias {
  const { inicio, fim } = periodoPadrao();
  return {
    modo: "rentabilidade",
    dataInicio: inicio,
    dataFim: fim,
    ativos: [],
    marcados: ["paridade", "cdi", "ibov"],
    aporteInicial: 1000,
    aporteMensal: 400,
    valorReferencia: 1000,
    usarOrcamento: false,
    orcamento: {},
    estrategiasUsuario: [],
  };
}

function ehTexto(v: unknown): v is string {
  return typeof v === "string";
}

/** Aceita só o que tem o formato esperado; o resto volta ao padrão. */
function sanear(bruto: unknown): Preferencias {
  const p = padroes();
  if (!bruto || typeof bruto !== "object") return p;
  const g = bruto as Record<string, unknown>;

  if (g.modo === "aportes" || g.modo === "rentabilidade") p.modo = g.modo;
  if (ehTexto(g.dataInicio) && /^\d{4}-\d{2}-\d{2}$/.test(g.dataInicio)) p.dataInicio = g.dataInicio;
  if (ehTexto(g.dataFim) && /^\d{4}-\d{2}-\d{2}$/.test(g.dataFim)) p.dataFim = g.dataFim;

  if (Array.isArray(g.ativos)) p.ativos = g.ativos.filter(ehTexto);
  if (Array.isArray(g.marcados)) p.marcados = g.marcados.filter(ehTexto);

  for (const chave of ["aporteInicial", "aporteMensal", "valorReferencia"] as const) {
    const v = g[chave];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) p[chave] = v;
  }

  if (typeof g.usarOrcamento === "boolean") p.usarOrcamento = g.usarOrcamento;
  if (g.orcamento && typeof g.orcamento === "object") {
    const saida: Record<string, number> = {};
    Object.entries(g.orcamento as Record<string, unknown>).forEach(([k, v]) => {
      if (typeof v === "number" && Number.isFinite(v) && v >= 0) saida[k] = v;
    });
    p.orcamento = saida;
  }

  if (Array.isArray(g.estrategiasUsuario)) {
    p.estrategiasUsuario = g.estrategiasUsuario
      .filter((e): e is Record<string, unknown> => !!e && typeof e === "object")
      .map((e) => ({
        id: ehTexto(e.id) ? e.id : `usuario-${Date.now()}`,
        titulo: ehTexto(e.titulo) ? e.titulo : "Sem nome",
        cor: ehTexto(e.cor) ? e.cor : "var(--cat-5)",
        codigoRentabilidade: ehTexto(e.codigoRentabilidade) ? e.codigoRentabilidade : "",
        codigoAportes: ehTexto(e.codigoAportes) ? e.codigoAportes : "",
        criadaEm: typeof e.criadaEm === "number" ? e.criadaEm : Date.now(),
      }))
      .filter((e) => e.id.startsWith("usuario-"));
  }

  return p;
}

export function carregar(): Preferencias {
  if (typeof window === "undefined") return padroes();
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (!bruto) return padroes();
    return sanear(JSON.parse(bruto));
  } catch {
    return padroes();
  }
}

export function salvar(p: Preferencias) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CHAVE, JSON.stringify(p));
  } catch {
    // Navegação privada ou cota estourada: a sessão continua funcionando,
    // só não sobrevive ao recarregamento.
  }
}

export function limpar() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(CHAVE);
  } catch {
    /* nada a fazer */
  }
}
