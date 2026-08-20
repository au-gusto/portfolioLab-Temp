"use client";

import { useEffect, useState } from "react";
import Icone, { type NomeIcone } from "./Icone";
import { nomeDaEstrategia } from "../lib/estrategias-meta";

/**
 * Painel que mostra a simulação acontecendo, estratégia por estratégia.
 *
 * Antes o clique em "Simular" congelava a página inteira e, sem aviso, o
 * gráfico reaparecia. Agora o Python roda num Web Worker e este painel conta o
 * que está sendo calculado e quanto tempo já levou.
 */

export type EstadoEstrategia = "fila" | "rodando" | "ok" | "vazio" | "erro";

const APARENCIA: Record<EstadoEstrategia, { icone: NomeIcone; cor: string; girando: boolean }> = {
  fila:    { icone: "info",       cor: "var(--texto-suave)", girando: false },
  rodando: { icone: "carregando", cor: "var(--info)",        girando: true  },
  ok:      { icone: "check",      cor: "var(--positivo)",    girando: false },
  vazio:   { icone: "alerta",     cor: "var(--atencao)",     girando: false },
  erro:    { icone: "fechar",     cor: "var(--negativo)",    girando: false },
};

const ROTULO: Record<EstadoEstrategia, string> = {
  fila: "na fila",
  rodando: "calculando",
  ok: "pronto",
  vazio: "sem resultados",
  erro: "falhou",
};

interface Props {
  simulando: boolean;
  marcados: string[];
  status: Record<string, EstadoEstrategia>;
  erro: string | null;
  /** Instante (Date.now) em que a simulação atual começou. */
  inicio: number | null;
}

export default function StatusSimulacao({ simulando, marcados, status, erro, inicio }: Props) {
  // Cronômetro. O tempo vem sempre da diferença com o instante de início, e
  // não de um contador incremental, para não atrasar se o navegador engasgar
  // com o timer. A cada nova simulação o componente é remontado (o pai usa
  // `inicio` como key), então o contador já nasce zerado.
  const [segundos, setSegundos] = useState(0);

  useEffect(() => {
    if (!simulando || !inicio) return;
    const timer = setInterval(() => setSegundos(Math.floor((Date.now() - inicio) / 1000)), 250);
    return () => clearInterval(timer);
  }, [simulando, inicio]);

  // Terminou sem problema nenhum: o gráfico já fala por si.
  if (!simulando && !erro) return null;

  return (
    <div className="cartao" style={{ borderColor: erro && !simulando ? "var(--negativo)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: simulando ? "12px" : "0" }}>
        <span style={{ color: simulando ? "var(--info)" : "var(--negativo)", display: "inline-flex" }}>
          {simulando
            ? <span className="girando"><Icone nome="carregando" tamanho={15} /></span>
            : <Icone nome="alerta" tamanho={15} />}
        </span>
        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--texto)", flex: 1, margin: 0 }}>
          {simulando ? "Simulando" : "Concluído com avisos"}
        </p>
        {simulando && (
          <span className="tabular" style={{ fontSize: "12px", color: "var(--texto-suave)" }}>
            {segundos}s
          </span>
        )}
      </div>

      {simulando && (
        <>
          <div
            className="barra-indeterminada"
            style={{ height: "3px", background: "var(--fundo)", borderRadius: "2px", marginBottom: "12px" }}
          />

          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px" }}>
            {marcados.map((id) => {
              const estado = status[id] ?? "fila";
              const { icone, cor, girando } = APARENCIA[estado];
              return (
                <div key={id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px" }}>
                  <span style={{ color: cor, display: "inline-flex" }} title={ROTULO[estado]}>
                    {girando
                      ? <span className="girando"><Icone nome={icone} tamanho={13} /></span>
                      : <Icone nome={icone} tamanho={13} />}
                  </span>
                  <span style={{ color: "var(--texto)" }}>{nomeDaEstrategia(id)}</span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {erro && !simulando && (
        <p style={{ fontSize: "12px", color: "var(--texto-suave)", lineHeight: 1.6, margin: "8px 0 0" }}>
          {erro}
        </p>
      )}
    </div>
  );
}
