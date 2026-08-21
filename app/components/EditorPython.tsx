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
  /** Altura do editor embutido. Ignorado dentro do modal. */
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
  const [ampliado, setAmpliado] = useState(false);
  const [copiado, setCopiado] = useState(false);
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

  async function copiar() {
    try {
      await navigator.clipboard.writeText(codigo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1600);
    } catch {
      // Área de transferência bloqueada: o texto continua selecionável.
    }
  }

  // Esc fecha o modal. Só é registrado enquanto ele está aberto, para não
  // sequestrar o Esc de outros painéis.
  useEffect(() => {
    if (!ampliado) return;
    function aoTeclar(ev: KeyboardEvent) {
      if (ev.key === "Escape") { ev.stopPropagation(); setAmpliado(false); }
    }
    window.addEventListener("keydown", aoTeclar, true);
    return () => window.removeEventListener("keydown", aoTeclar, true);
  }, [ampliado]);

  /** Tab dentro do editor indenta, em vez de pular para o próximo campo. */
  function aoTeclarNaArea(ev: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (ev.key !== "Tab" || soLeitura || !onMudar) return;
    ev.preventDefault();
    const a = ev.currentTarget;
    const { selectionStart: i, selectionEnd: j } = a;
    onMudar(codigo.slice(0, i) + "    " + codigo.slice(j));
    requestAnimationFrame(() => {
      a.selectionStart = a.selectionEnd = i + 4;
    });
  }

  const ferramentas = (
    <div className="codigo-caixa__ferramentas">
      <button
        className="codigo-caixa__acao"
        onClick={copiar}
        title="Copiar o código"
        aria-label={`Copiar o código de ${titulo}`}
      >
        <Icone nome={copiado ? "check" : "duplicar"} tamanho={14} />
      </button>
      {!ampliado && (
        <button
          className="codigo-caixa__acao"
          onClick={() => setAmpliado(true)}
          title="Abrir ampliado"
          aria-label={`Abrir o código de ${titulo} ampliado`}
        >
          <Icone nome="expandirTela" tamanho={14} />
        </button>
      )}
    </div>
  );

  /**
   * O corpo existe UMA vez de cada vez.
   *
   * Renderizar a versão embutida e a ampliada ao mesmo tempo daria dois
   * <textarea> com o mesmo estado e três refs apontando para a última montada
   * — o scroll sincronizaria a camada errada.
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
        {ampliado ? (
          <p className="codigo-caixa__ausente">Aberto na janela ampliada.</p>
        ) : (
          <>
            {corpo}
            {ferramentas}
          </>
        )}
      </div>

      {ampliado && (
        /* Fundo escurecido: clicar nele fecha. O modal ocupa 70% da tela em
           vez de tudo — trocar a tela inteira faz parecer que o app mudou de
           página, e some a referência de onde a pessoa estava. */
        <div
          className="codigo-fundo"
          onMouseDown={(ev) => { if (ev.target === ev.currentTarget) setAmpliado(false); }}
        >
          <div
            className="codigo-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Código de ${titulo}`}
          >
            <div className="codigo-modal__topo">
              <p className="codigo-modal__titulo">{titulo}</p>
              <span className="etiqueta">{soLeitura ? "só leitura" : "editável"}</span>
              <span className="codigo-modal__contagem tabular">{linhas} linhas</span>
              {ferramentas}
              <button
                className="botao-icone"
                onClick={() => setAmpliado(false)}
                aria-label="Fechar"
                title="Fechar (Esc)"
              >
                <Icone nome="fechar" tamanho={16} />
              </button>
            </div>
            <div className="codigo-modal__corpo">{corpo}</div>
          </div>
        </div>
      )}
    </>
  );
}
