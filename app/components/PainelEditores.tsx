"use client";

import { useState } from "react";
import { doGrupo, type MetaEstrategia } from "../lib/estrategias-meta";
import Icone from "./Icone";

interface Props {
  aberto: boolean;
  setPainelAberto: (valor: boolean) => void;
  modo: "aportes" | "rentabilidade";
  lista: MetaEstrategia[];
  codigos: Record<string, string>;
  editarCodigo: (id: string, codigo: string) => void;
  renomear: (id: string, titulo: string) => void;
  remover: (id: string) => void;
  duplicar: (base: MetaEstrategia) => void;
}

/**
 * Gaveta com o código Python de cada série.
 *
 * As nossas ficam em modo leitura: alterá-las direto faria os números do
 * projeto deixarem de ser reproduzíveis, e um erro de digitação quebraria a
 * referência para sempre. O código continua todo visível, e o botão de
 * duplicar entrega uma cópia editável em um clique.
 */
export default function PainelEditores({
  aberto, setPainelAberto, modo, lista, codigos, editarCodigo, renomear, remover, duplicar,
}: Props) {
  const [abertos, setAbertos] = useState<string[]>([]);
  const [copiado, setCopiado] = useState<string | null>(null);

  if (!aberto) return null;

  function alternar(id: string) {
    setAbertos((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }

  async function copiar(id: string) {
    try {
      await navigator.clipboard.writeText(codigos[id] ?? "");
      setCopiado(id);
      setTimeout(() => setCopiado(null), 1600);
    } catch {
      /* área de transferência bloqueada: o texto segue selecionável */
    }
  }

  const series = [...doGrupo("estrategia", modo, lista), ...doGrupo("benchmark", modo, lista)];

  return (
    <div role="dialog" aria-label="Código das estratégias" className="gaveta-codigo">
      <div className="gaveta-codigo__topo">
        <div>
          <p className="gaveta-codigo__titulo">Código das estratégias</p>
          <p className="dica" style={{ marginTop: "2px" }}>
            Python rodando no navegador · modo {modo === "aportes" ? "Patrimônio" : "Rentabilidade"}
          </p>
        </div>
        <button className="botao-icone" onClick={() => setPainelAberto(false)} aria-label="Fechar">
          <Icone nome="fechar" tamanho={15} />
        </button>
      </div>

      {series.map((e) => {
        const estaAberto = abertos.includes(e.id);
        return (
          <div key={e.id} className="editor">
            <div className="editor__cabecalho">
              <button
                className="editor__abrir"
                onClick={() => alternar(e.id)}
                aria-expanded={estaAberto}
              >
                <span
                  className="estrategia__cor"
                  style={{
                    background: e.tracejado ? "transparent" : e.cor,
                    border: e.tracejado ? `2px dashed ${e.cor}` : "none",
                  }}
                />
                <span className="editor__nome">{e.titulo}</span>
                {!e.doUsuario && <span className="etiqueta">só leitura</span>}
                <Icone nome={estaAberto ? "recolher" : "expandir"} tamanho={15} />
              </button>

              <span className="editor__acoes">
                <button className="acao-mini" onClick={() => copiar(e.id)} title="Copiar código">
                  <Icone nome={copiado === e.id ? "check" : "duplicar"} tamanho={13} />
                </button>
                {e.doUsuario ? (
                  <button
                    className="acao-mini acao-mini--perigo"
                    onClick={() => remover(e.id)}
                    title="Apagar esta estratégia"
                  >
                    <Icone nome="lixeira" tamanho={13} />
                  </button>
                ) : (
                  <button
                    className="acao-mini"
                    onClick={() => duplicar(e)}
                    title="Duplicar para editar"
                  >
                    <Icone nome="adicionar" tamanho={13} />
                  </button>
                )}
              </span>
            </div>

            {estaAberto && (
              <div className="editor__corpo">
                {e.doUsuario && (
                  <input
                    className="campo editor__titulo"
                    value={e.titulo}
                    onChange={(ev) => renomear(e.id, ev.target.value)}
                    aria-label="Nome da estratégia"
                    placeholder="Nome da estratégia"
                  />
                )}

                {!e.doUsuario && (
                  <div className="aviso aviso--info" style={{ margin: "0 0 8px" }}>
                    <span className="aviso__icone"><Icone nome="info" tamanho={14} /></span>
                    <span>
                      Esta é uma das nossas — não dá para alterar aqui, para os
                      números continuarem reproduzíveis. Clique em <strong>+</strong> acima
                      para receber uma cópia editável com este mesmo código.
                    </span>
                  </div>
                )}

                <textarea
                  value={codigos[e.id] ?? ""}
                  onChange={(ev) => e.doUsuario && editarCodigo(e.id, ev.target.value)}
                  readOnly={!e.doUsuario}
                  spellCheck={false}
                  className={"editor__codigo" + (e.doUsuario ? "" : " editor__codigo--leitura")}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
