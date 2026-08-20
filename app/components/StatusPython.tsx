"use client";

import { useEffect, useState } from "react";
import { ouvirCarregamento, estadoAtual, type EstadoCarregamento, type FaseCarregamento } from "../lib/pyodideLoader";
import Icone from "./Icone";
import Ajuda from "./Ajuda";

/**
 * Cartão fixo que mostra o download do Python (Pyodide) acontecendo.
 *
 * Na primeira visita são ~40 MB entre interpretador, numpy, pandas e scipy.
 * Sem retorno visual o site parece quebrado; aqui o usuário vê a barra andar
 * e em que etapa está.
 */

const ETAPAS: { fase: FaseCarregamento; titulo: string }[] = [
  { fase: "runtime", titulo: "Interpretador Python" },
  { fase: "pacotes", titulo: "numpy · pandas · scipy" },
  { fase: "dados", titulo: "Cotações da B3" },
];

const ORDEM: FaseCarregamento[] = ["ocioso", "runtime", "pacotes", "dados", "pronto"];

export default function StatusPython() {
  const [estado, setEstado] = useState<EstadoCarregamento>(estadoAtual);
  const [visivel, setVisivel] = useState(true);

  useEffect(() => ouvirCarregamento(setEstado), []);

  // Some sozinho pouco depois de ficar pronto — o usuário já entendeu o recado.
  useEffect(() => {
    if (estado.fase !== "pronto") return;
    const timer = setTimeout(() => setVisivel(false), 2200);
    return () => clearTimeout(timer);
  }, [estado.fase]);

  if (!visivel) return null;

  const falhou = estado.fase === "falha";
  const pronto = estado.fase === "pronto";
  const indiceAtual = ORDEM.indexOf(estado.fase);

  return (
    <div className={"painel-python" + (falhou ? " painel-python--erro" : "")}>
      <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "12px" }}>
        <span style={{ color: falhou ? "var(--negativo)" : pronto ? "var(--positivo)" : "var(--info)", display: "inline-flex" }}>
          {pronto ? <Icone nome="check" tamanho={16} />
            : falhou ? <Icone nome="alerta" tamanho={16} />
            : <span className="girando"><Icone nome="carregando" tamanho={16} /></span>}
        </span>

        <p style={{ fontSize: "13px", fontWeight: 600, color: "var(--texto)", flex: 1, margin: 0 }}>
          {falhou ? "Falha ao carregar" : pronto ? "Python pronto" : "Preparando Python"}
        </p>

        {!falhou && (
          <span className="tabular" style={{ fontSize: "12px", color: "var(--texto-suave)" }}>
            {estado.pct}%
          </span>
        )}

        <Ajuda alinhar="direita">
          As estratégias rodam em Python de verdade, dentro do navegador. São
          ~40 MB só na primeira visita — depois o navegador guarda em cache.
        </Ajuda>
      </div>

      {!falhou && (
        <div className="barra">
          <div
            className="barra__preenchida"
            style={{
              width: `${estado.pct}%`,
              background: pronto ? "var(--positivo)" : "var(--info)",
            }}
          />
        </div>
      )}

      {falhou ? (
        <>
          <p className="dica" style={{ marginBottom: "10px" }}>{estado.erro}</p>
          <button className="botao-icone" style={{ width: "100%", justifyContent: "center" }} onClick={() => window.location.reload()}>
            Tentar de novo
          </button>
        </>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
          {ETAPAS.map((etapa) => {
            const indice = ORDEM.indexOf(etapa.fase);
            const concluida = pronto || indice < indiceAtual;
            const ativa = indice === indiceAtual;
            return (
              <div key={etapa.fase} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px" }}>
                <span style={{ color: concluida ? "var(--positivo)" : ativa ? "var(--info)" : "var(--borda)", display: "inline-flex" }}>
                  {concluida
                    ? <Icone nome="check" tamanho={13} />
                    : ativa
                      ? <span className="girando"><Icone nome="carregando" tamanho={13} /></span>
                      : <Icone nome="info" tamanho={13} />}
                </span>
                <span style={{ color: concluida || ativa ? "var(--texto)" : "var(--texto-suave)", flex: 1 }}>
                  {etapa.titulo}
                </span>
                {ativa && !pronto && (
                  <span className="tabular" style={{ color: "var(--texto-suave)", fontSize: "11px" }}>
                    {estado.mbBaixados.toFixed(0)} MB
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
