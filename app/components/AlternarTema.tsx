"use client";

import { useSyncExternalStore } from "react";
import Icone from "./Icone";

type Tema = "claro" | "escuro";

/**
 * Alterna entre claro e escuro.
 *
 * O tema não é estado do React: mora no atributo data-tema do <html>, escrito
 * antes da primeira pintura por um script no layout — é o que evita a tela
 * piscar branca ao carregar. Aqui apenas o lemos, via useSyncExternalStore,
 * que é feito justamente para assinar estado que vive fora do React.
 *
 * Sem escolha salva, o atributo não existe e quem manda é o prefers-color-scheme
 * do sistema; por isso a media query também entra como fonte.
 */

const ouvintes = new Set<() => void>();

function assinar(aoMudar: () => void) {
  ouvintes.add(aoMudar);
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", aoMudar);
  return () => {
    ouvintes.delete(aoMudar);
    mq.removeEventListener("change", aoMudar);
  };
}

function lerNoCliente(): Tema {
  const explicito = document.documentElement.dataset.tema as Tema | undefined;
  if (explicito === "claro" || explicito === "escuro") return explicito;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

/** No servidor não dá para saber; o React reconcilia depois da hidratação. */
function lerNoServidor(): Tema {
  return "escuro";
}

export default function AlternarTema() {
  const tema = useSyncExternalStore(assinar, lerNoCliente, lerNoServidor);

  function alternar() {
    const novo: Tema = tema === "escuro" ? "claro" : "escuro";
    document.documentElement.dataset.tema = novo;
    try {
      localStorage.setItem("tema", novo);
    } catch {
      /* navegação privada: a escolha vale só para esta sessão */
    }
    ouvintes.forEach((f) => f());
  }

  return (
    <button
      className="botao-icone"
      onClick={alternar}
      aria-label={tema === "escuro" ? "Usar tema claro" : "Usar tema escuro"}
      title={tema === "escuro" ? "Tema claro" : "Tema escuro"}
    >
      <Icone nome={tema === "escuro" ? "sol" : "lua"} tamanho={17} />
    </button>
  );
}
