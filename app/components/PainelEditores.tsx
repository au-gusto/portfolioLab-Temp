"use client";

import { useState } from "react";
import { doGrupo, type IdSerie } from "../lib/estrategias-meta";
import Icone from "./Icone";

interface Props {
  aberto: boolean;
  setPainelAberto: (valor: boolean) => void;
  codigos: Record<IdSerie, string>;
  setCodigos: React.Dispatch<React.SetStateAction<Record<IdSerie, string>>>;
  modo: "aportes" | "rentabilidade";
}

/**
 * Gaveta de edição do código Python das estratégias.
 *
 * Ligar/desligar estratégia saiu daqui e foi para a lateral: escolher o que
 * comparar é a tarefa principal e não deveria exigir abrir um editor de código.
 * Aqui ficou só o que é de fato avançado — mexer no algoritmo.
 */
export default function PainelEditores({ aberto, setPainelAberto, codigos, setCodigos, modo }: Props) {
  const [abertos, setAbertos] = useState<string[]>([]);

  if (!aberto) return null;

  function alternar(id: string) {
    setAbertos((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }

  return (
    <div
      role="dialog"
      aria-label="Editores de estratégia"
      style={{
        position: "fixed",
        top: 0, right: 0, bottom: 0,
        width: "min(560px, 100vw)",
        background: "var(--fundo-card)",
        borderLeft: "1px solid var(--borda)",
        padding: "20px",
        zIndex: 200,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <p style={{ color: "var(--texto)", fontSize: "13px", fontWeight: 700, margin: 0 }}>
            Código das estratégias
          </p>
          <p className="dica" style={{ marginTop: "2px" }}>
            Python executado no navegador. Editar aqui muda a próxima simulação.
          </p>
        </div>
        <button className="botao-icone" onClick={() => setPainelAberto(false)} aria-label="Fechar">
          <Icone nome="fechar" tamanho={15} />
        </button>
      </div>

      {[...doGrupo("estrategia", modo), ...doGrupo("benchmark", modo)].map((e) => (
        <div key={e.id} style={{ border: "1px solid var(--borda)", borderRadius: "var(--raio-p)", overflow: "hidden" }}>
          <button
            onClick={() => alternar(e.id)}
            aria-expanded={abertos.includes(e.id)}
            style={{
              width: "100%",
              padding: "12px",
              background: "var(--fundo)",
              border: "none",
              cursor: "pointer",
              color: "var(--texto)",
              fontSize: "13px",
              fontWeight: 700,
              fontFamily: "inherit",
              textAlign: "left",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span
              className="estrategia__cor"
              style={{
                background: e.tracejado ? "transparent" : e.cor,
                border: e.tracejado ? `2px dashed ${e.cor}` : "none",
              }}
            />
            <span style={{ flex: 1 }}>{e.titulo}</span>
            <Icone nome={abertos.includes(e.id) ? "recolher" : "expandir"} tamanho={15} />
          </button>

          {abertos.includes(e.id) && (
            <textarea
              value={codigos[e.id]}
              onChange={(ev) => setCodigos((atual) => ({ ...atual, [e.id]: ev.target.value }))}
              spellCheck={false}
              style={{
                width: "100%",
                minHeight: "320px",
                background: "var(--fundo)",
                color: "var(--texto)",
                border: "none",
                borderTop: "1px solid var(--borda)",
                padding: "12px",
                fontSize: "12px",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                lineHeight: 1.5,
                resize: "vertical",
                outline: "none",
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
}
