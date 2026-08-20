"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import {
  assinarDiagnostico, registros_atuais, comoTexto, limparDiagnostico,
} from "../lib/diagnostico";
import Icone from "./Icone";

/**
 * Painel de desempenho. Abre com Ctrl+Shift+D.
 *
 * Fica escondido de propósito: é ferramenta de diagnóstico, não função do
 * produto. O que ele mostra é o caminho completo de uma simulação — download,
 * montagem das tabelas, tempo dentro do Python, conversão de volta para o
 * JavaScript — porque "está lento" pode ser qualquer um desses, e cada um tem
 * um remédio diferente.
 */

const CORES: Record<string, string> = {
  carregamento: "var(--info)",
  execucao: "var(--primaria)",
  interface: "var(--atencao)",
};

export default function PainelDiagnostico() {
  const [aberto, setAberto] = useState(false);
  const [copiado, setCopiado] = useState(false);

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

  async function copiar() {
    try {
      await navigator.clipboard.writeText(comoTexto());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      // clipboard bloqueado: o texto continua visível para seleção manual
    }
  }

  if (!aberto) return null;

  const maior = Math.max(1, ...registros.map((r) => r.ms));

  return (
    <div className="diagnostico" role="dialog" aria-label="Diagnóstico de desempenho">
      <div className="diagnostico__topo">
        <p className="diagnostico__titulo">Desempenho</p>
        <span className="tabular" style={{ fontSize: "11px", color: "var(--texto-suave)" }}>
          {registros.length} medições
        </span>
        <button className="botao-icone" onClick={copiar} title="Copiar relatório">
          <Icone nome={copiado ? "check" : "codigo"} tamanho={15} />
        </button>
        <button className="botao-icone" onClick={limparDiagnostico} title="Limpar">
          <Icone nome="recolher" tamanho={15} />
        </button>
        <button className="botao-icone" onClick={() => setAberto(false)} aria-label="Fechar">
          <Icone nome="fechar" tamanho={15} />
        </button>
      </div>

      <div className="diagnostico__lista">
        {registros.length === 0 ? (
          <p className="dica">Rode uma simulação para coletar medições.</p>
        ) : (
          registros.map((r, i) => (
            <div key={i} className="diagnostico__item">
              <div className="diagnostico__linha">
                <span className="diagnostico__ponto" style={{ background: CORES[r.tipo] }} />
                <span className="diagnostico__rotulo">{r.rotulo}</span>
                <span className="tabular diagnostico__ms">{r.ms.toFixed(0)} ms</span>
              </div>
              <div className="diagnostico__barra">
                <div style={{ width: `${(r.ms / maior) * 100}%`, background: CORES[r.tipo] }} />
              </div>
              {r.detalhes?.map((d, j) => (
                <p key={j} className="diagnostico__detalhe">{d}</p>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
