"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { realcarPython, contarLinhas } from "../lib/realce-python";
import Icone from "./Icone";

interface Props {
  codigo: string;
  onMudar?: (codigo: string) => void;
  soLeitura?: boolean;
  /** Nome mostrado no cabeçalho da tela cheia. */
  titulo: string;
  /** Altura mínima do editor embutido. Ignorado em tela cheia. */
  altura?: number;
}

/**
 * Editor de Python com realce.
 *
 * A técnica é um `<pre>` colorido por baixo e um `<textarea>` transparente por
 * cima, alinhados ao pixel. Escrever um editor de verdade (CodeMirror, Monaco)
 * custaria centenas de KB para um recurso que aparece atrás de um clique; o
 * `<textarea>` já entrega cursor, seleção, desfazer e acessibilidade de graça,
 * e o que falta é só cor.
 *
 * O alinhamento é frágil por natureza: qualquer diferença de fonte, tamanho,
 * entrelinha ou espaçamento entre as duas camadas desloca o texto. Por isso
 * ambas herdam as mesmas medidas de uma classe só, e o scroll de uma é copiado
 * para a outra.
 */
export default function EditorPython({
  codigo, onMudar, soLeitura = false, titulo, altura = 340,
}: Props) {
  const [cheia, setCheia] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);
  const reguaRef = useRef<HTMLDivElement>(null);

  const realce = useMemo(() => realcarPython(codigo), [codigo]);
  const linhas = useMemo(() => contarLinhas(codigo), [codigo]);

  function sincronizar() {
    const a = areaRef.current;
    if (!a) return;
    if (preRef.current) {
      preRef.current.scrollTop = a.scrollTop;
      preRef.current.scrollLeft = a.scrollLeft;
    }
    // A régua só acompanha a vertical: ela não rola na horizontal.
    if (reguaRef.current) reguaRef.current.scrollTop = a.scrollTop;
  }

  // Esc fecha a tela cheia. Só é registrado enquanto ela está aberta, para não
  // sequestrar o Esc de outros painéis.
  useEffect(() => {
    if (!cheia) return;
    function aoTeclar(ev: KeyboardEvent) {
      if (ev.key === "Escape") { ev.stopPropagation(); setCheia(false); }
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [cheia]);

  /** Tab dentro do editor indenta, em vez de pular para o próximo campo. */
  function aoTeclarNaArea(ev: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (ev.key !== "Tab" || soLeitura || !onMudar) return;
    ev.preventDefault();
    const a = ev.currentTarget;
    const { selectionStart: i, selectionEnd: j } = a;
    const novo = codigo.slice(0, i) + "    " + codigo.slice(j);
    onMudar(novo);
    // Recoloca o cursor depois da indentação assim que o React repintar.
    requestAnimationFrame(() => {
      a.selectionStart = a.selectionEnd = i + 4;
    });
  }

  /**
   * O corpo existe UMA vez de cada vez.
   *
   * Renderizar a versão embutida e a de tela cheia ao mesmo tempo daria dois
   * <textarea> com o mesmo estado e três refs apontando para a última montada
   * — o scroll sincronizaria a camada errada. Enquanto a tela cheia está
   * aberta, a caixa embutida vira só um espaço reservado.
   */
  const corpo = (
    <div className={"codigo" + (soLeitura ? " codigo--leitura" : "")}>
      <div className="codigo__regua" ref={reguaRef} aria-hidden="true">
        {Array.from({ length: linhas }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>

      <div className="codigo__campo">
        <pre className="codigo__realce" ref={preRef} aria-hidden="true">
          <code dangerouslySetInnerHTML={{ __html: realce }} />
        </pre>
        <textarea
          ref={areaRef}
          className="codigo__area"
          value={codigo}
          onChange={(ev) => onMudar?.(ev.target.value)}
          onScroll={sincronizar}
          onKeyDown={aoTeclarNaArea}
          readOnly={soLeitura}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          aria-label={`Código Python de ${titulo}`}
        />
      </div>
    </div>
  );

  return (
    <>
      <div className="codigo-caixa" style={{ height: altura }}>
        {cheia ? (
          <p className="codigo-caixa__ausente">
            Aberto em tela cheia.
          </p>
        ) : (
          <>
            {corpo}
            <button
              className="codigo-caixa__expandir"
              onClick={() => setCheia(true)}
              title="Abrir em tela cheia"
              aria-label={`Abrir o código de ${titulo} em tela cheia`}
            >
              <Icone nome="expandirTela" tamanho={14} />
            </button>
          </>
        )}
      </div>

      {cheia && (
        <div className="codigo-cheia" role="dialog" aria-modal="true" aria-label={`Código de ${titulo}`}>
          <div className="codigo-cheia__topo">
            <p className="codigo-cheia__titulo">{titulo}</p>
            <span className="etiqueta">{soLeitura ? "só leitura" : "editável"}</span>
            <span className="codigo-cheia__contagem tabular">{linhas} linhas</span>
            <button
              className="botao-icone"
              onClick={() => setCheia(false)}
              aria-label="Fechar tela cheia"
              title="Fechar (Esc)"
            >
              <Icone nome="fechar" tamanho={16} />
            </button>
          </div>
          <div className="codigo-cheia__corpo">{corpo}</div>
        </div>
      )}
    </>
  );
}
