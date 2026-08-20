"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  assinarDiagnostico, registros_atuais, comoTexto, limparDiagnostico,
  quantosDescartados, TIPOS, type TipoRegistro,
} from "../lib/diagnostico";
import Icone from "./Icone";

/**
 * Registro do sistema. Abre com Ctrl+Shift+D.
 *
 * Fica escondido de propósito: é ferramenta de diagnóstico, não função do
 * produto. Mostra a sequência do que aconteceu — download do Python, montagem
 * das tabelas, o que a pessoa clicou, o que o app respondeu e o que falhou —
 * porque "está lento" e "deu erro" se respondem com a mesma linha do tempo.
 */

const CORES: Record<TipoRegistro, string> = {
  carregamento: "var(--info)",
  execucao: "var(--primaria)",
  interface: "var(--atencao)",
  dados: "var(--secundaria)",
  acao: "var(--serie-ibov)",
  sistema: "var(--texto-suave)",
};

function horario(quando: number): string {
  const d = new Date(quando);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function PainelDiagnostico() {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [filtro, setFiltro] = useState<TipoRegistro | "tudo" | "problemas">("tudo");

  const registros = useSyncExternalStore(
    (cb) => assinarDiagnostico(cb),
    () => registros_atuais(),
    () => registros_atuais()
  );

  useEffect(() => {
    function atalho(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && (e.key === "D" || e.key === "d")) {
        e.preventDefault();
        setAberto((a) => !a);
      }
    }
    window.addEventListener("keydown", atalho);
    return () => window.removeEventListener("keydown", atalho);
  }, []);

  const visiveis = useMemo(() => {
    if (filtro === "tudo") return registros;
    if (filtro === "problemas") return registros.filter((r) => r.nivel !== "info");
    return registros.filter((r) => r.tipo === filtro);
  }, [registros, filtro]);

  const problemas = useMemo(
    () => registros.filter((r) => r.nivel !== "info").length,
    [registros],
  );

  // A barra mede só o que tem duração; um evento pontual não compete com uma
  // simulação de oito segundos pela largura da barra.
  const maior = Math.max(1, ...visiveis.map((r) => r.ms));

  async function copiar() {
    try {
      await navigator.clipboard.writeText(comoTexto());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      // Área de transferência bloqueada: o texto continua selecionável.
    }
  }

  function baixar() {
    const blob = new Blob([comoTexto()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-lab-diagnostico-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!aberto) return null;

  const abas: (TipoRegistro | "tudo" | "problemas")[] = ["tudo", "problemas", ...TIPOS];

  return (
    <div className="diagnostico" role="dialog" aria-label="Diagnóstico do sistema">
      <div className="diagnostico__topo">
        <p className="diagnostico__titulo">Diagnóstico</p>
        <span className="tabular" style={{ fontSize: "11px", color: "var(--texto-suave)" }}>
          {registros.length}
          {problemas > 0 && (
            <span style={{ color: "var(--negativo)" }}> · {problemas} problema(s)</span>
          )}
        </span>
        <button className="botao-icone" onClick={copiar} title="Copiar o relatório">
          <Icone nome={copiado ? "check" : "duplicar"} tamanho={15} />
        </button>
        <button className="botao-icone" onClick={baixar} title="Baixar como .txt">
          <Icone nome="grafico" tamanho={15} />
        </button>
        <button className="botao-icone" onClick={limparDiagnostico} title="Limpar">
          <Icone nome="lixeira" tamanho={15} />
        </button>
        <button className="botao-icone" onClick={() => setAberto(false)} aria-label="Fechar">
          <Icone nome="fechar" tamanho={15} />
        </button>
      </div>

      <div className="diagnostico__filtros">
        {abas.map((a) => {
          const n = a === "tudo" ? registros.length
            : a === "problemas" ? problemas
            : registros.filter((r) => r.tipo === a).length;
          return (
            <button
              key={a}
              className={"diagnostico__filtro" + (filtro === a ? " diagnostico__filtro--ativo" : "")}
              onClick={() => setFiltro(a)}
              disabled={n === 0 && a !== "tudo"}
            >
              {a} <span className="tabular">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="diagnostico__lista">
        {visiveis.length === 0 ? (
          <p className="dica">
            {registros.length === 0
              ? "Nada registrado ainda. Use o app e os eventos aparecem aqui."
              : "Nenhum registro deste tipo."}
          </p>
        ) : (
          visiveis.map((r, i) => (
            <div
              key={i}
              className={"diagnostico__item diagnostico__item--" + r.nivel}
            >
              <div className="diagnostico__linha">
                <span className="diagnostico__ponto" style={{ background: CORES[r.tipo] }} />
                <span className="diagnostico__hora tabular">{horario(r.quando)}</span>
                <span className="diagnostico__rotulo">{r.rotulo}</span>
                {r.ms > 0 && (
                  <span className="tabular diagnostico__ms">{r.ms.toFixed(0)} ms</span>
                )}
              </div>
              {r.ms > 0 && (
                <div className="diagnostico__barra">
                  <div style={{ width: `${(r.ms / maior) * 100}%`, background: CORES[r.tipo] }} />
                </div>
              )}
              {r.detalhes?.map((d, j) => (
                <p key={j} className="diagnostico__detalhe">{d}</p>
              ))}
            </div>
          ))
        )}

        {quantosDescartados() > 0 && (
          <p className="dica">
            Registros antigos foram descartados para o log não crescer sem fim.
          </p>
        )}
      </div>
    </div>
  );
}
