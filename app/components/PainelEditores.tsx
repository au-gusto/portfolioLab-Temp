"use client";

import { useState } from "react";
import { doGrupo, type MetaEstrategia } from "../lib/estrategias-meta";
import Icone from "./Icone";
import EditorPython from "./EditorPython";

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
  // Grupos começam abertos: quem entra aqui quer ver o código, e obrigar dois
  // cliques para chegar nele seria trocar poluição por atrito.
  const [gruposFechados, setGruposFechados] = useState<string[]>([]);

  if (!aberto) return null;

  function alternar(id: string) {
    setAbertos((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  }

  function alternarGrupo(titulo: string) {
    setGruposFechados((g) => (g.includes(titulo) ? g.filter((x) => x !== titulo) : [...g, titulo]));
  }


  /**
   * Três grupos, não dois.
   *
   * O que o usuário escreveu é a única coisa editável da lista, e ficava
   * misturada às nossas — que abrem em só leitura. Separar deixa claro, antes
   * de abrir qualquer uma, onde é que dá para mexer.
   */
  const doGrupoEstrategia = doGrupo("estrategia", modo, lista);
  const grupos: { titulo: string; itens: MetaEstrategia[] }[] = [
    { titulo: "Estratégias", itens: doGrupoEstrategia.filter((e) => !e.doUsuario) },
    { titulo: "Benchmarks", itens: doGrupo("benchmark", modo, lista) },
    { titulo: "Autorais", itens: doGrupoEstrategia.filter((e) => e.doUsuario) },
  ].filter((g) => g.itens.length > 0);

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

      {grupos.map((grupo) => (
        <section key={grupo.titulo} className="grupo-codigo">
          <button
            className="grupo-codigo__titulo"
            onClick={() => alternarGrupo(grupo.titulo)}
            aria-expanded={!gruposFechados.includes(grupo.titulo)}
          >
            <Icone
              nome={gruposFechados.includes(grupo.titulo) ? "expandir" : "recolher"}
              tamanho={13}
            />
            {grupo.titulo}
            <span className="tabular grupo-codigo__contagem">{grupo.itens.length}</span>
          </button>

          {!gruposFechados.includes(grupo.titulo) && grupo.itens.map((e) => {
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

                <EditorPython
                  titulo={e.titulo}
                  codigo={codigos[e.id] ?? ""}
                  soLeitura={!e.doUsuario}
                  onMudar={e.doUsuario ? (texto) => editarCodigo(e.id, texto) : undefined}
                />
              </div>
            )}
          </div>
        );
          })}
        </section>
      ))}
    </div>
  );
}
