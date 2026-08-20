"use client";

import { useEffect, useId, useRef, useState } from "react";
import Icone from "./Icone";

interface Props {
  /** Texto da regra. Curto — se não couber em duas linhas, a regra é complexa demais. */
  children: React.ReactNode;
  /** Alinha o balão pela direita quando o botão fica no fim da linha. */
  alinhar?: "esquerda" | "direita";
}

/**
 * Botão (?) com a regra de funcionamento dentro.
 *
 * A tela mostra o que fazer; isto guarda o porquê. Abre no hover e no foco
 * (teclado), e também no clique — sem o clique, quem usa no celular nunca
 * conseguiria ler, porque toque não produz hover.
 */
export default function Ajuda({ children, alinhar = "esquerda" }: Props) {
  const [aberto, setAberto] = useState(false);
  const [fixado, setFixado] = useState(false);
  const id = useId();
  const raiz = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!fixado) return;
    function fora(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) {
        setFixado(false);
        setAberto(false);
      }
    }
    function esc(e: KeyboardEvent) {
      if (e.key === "Escape") { setFixado(false); setAberto(false); }
    }
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [fixado]);

  const visivel = aberto || fixado;

  return (
    <span className="ajuda" ref={raiz}>
      <button
        type="button"
        className={"ajuda__botao" + (visivel ? " ajuda__botao--ativo" : "")}
        aria-label="O que isso significa"
        aria-expanded={visivel}
        aria-describedby={visivel ? id : undefined}
        onClick={() => { setFixado((f) => !f); setAberto(false); }}
        onMouseEnter={() => setAberto(true)}
        onMouseLeave={() => setAberto(false)}
        onFocus={() => setAberto(true)}
        onBlur={() => setAberto(false)}
      >
        <Icone nome="ajuda" tamanho={14} />
      </button>

      {visivel && (
        <span
          id={id}
          role="tooltip"
          className={"ajuda__balao" + (alinhar === "direita" ? " ajuda__balao--direita" : "")}
        >
          {children}
        </span>
      )}
    </span>
  );
}
