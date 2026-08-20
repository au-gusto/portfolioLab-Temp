"use client";

import { useSyncExternalStore } from "react";
import Icone from "./Icone";
import {
  assinarTema, notificarTema, lerTemaNoCliente, lerTemaNoServidor, type Tema,
} from "../lib/tema";

/**
 * Alterna entre claro e escuro.
 *
 * A assinatura mora em lib/tema.ts porque o gráfico também precisa dela: o
 * conjunto de ouvintes tem que ser um só para que a troca avise todo mundo.
 */
export default function AlternarTema() {
  const tema = useSyncExternalStore(assinarTema, lerTemaNoCliente, lerTemaNoServidor);

  function alternar() {
    const novo: Tema = tema === "escuro" ? "claro" : "escuro";
    document.documentElement.dataset.tema = novo;
    try {
      localStorage.setItem("tema", novo);
    } catch {
      /* navegação privada: a escolha vale só para esta sessão */
    }
    notificarTema();
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
