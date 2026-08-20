"use client";

import type { StatusDados } from "../lib/fonte-dados";
import Icone from "./Icone";
import Ajuda from "./Ajuda";
import AlternarTema from "./AlternarTema";

interface Props {
  painelAberto: boolean;
  setPainelAberto: (valor: boolean) => void;
  lateralAberta: boolean;
  setLateralAberta: (valor: boolean) => void;
  status: StatusDados;
}

/** Quantos dias corridos separam a data do último pregão de hoje. */
function diasDesde(iso: string | null): number | null {
  if (!iso) return null;
  const alvo = new Date(iso + "T00:00:00");
  if (Number.isNaN(alvo.getTime())) return null;
  return Math.floor((Date.now() - alvo.getTime()) / 86400000);
}

function formatarBR(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/**
 * Selo de atualidade dos dados.
 *
 * Existe porque o app já rodou 14 meses com cotações congeladas sem que nada
 * na tela indicasse isso. O ponto colorido dá o recado sem texto: verde é
 * fresco, âmbar está envelhecendo, vermelho é velho demais para confiar.
 */
function SeloDados({ status }: { status: StatusDados }) {
  const dias = diasDesde(status.ultimoPregao);
  const cor =
    dias === null ? "var(--texto-suave)"
    : dias <= 4 ? "var(--positivo)"
    : dias <= 30 ? "var(--atencao)"
    : "var(--negativo)";

  return (
    <span className="selo">
      <span className="selo__ponto" style={{ "--cor-selo": cor } as React.CSSProperties} />
      <span className="tabular">{formatarBR(status.ultimoPregao)}</span>
      <Ajuda alinhar="direita">
        Data do último pregão nos dados
        {dias !== null && ` — ${dias} dia${dias === 1 ? "" : "s"} atrás`}.
        As cotações são atualizadas uma vez por dia, após o fechamento.
      </Ajuda>
    </span>
  );
}

export default function Cabecalho({
  painelAberto,
  setPainelAberto,
  lateralAberta,
  setLateralAberta,
  status,
}: Props) {
  return (
    <header className="cabecalho">
      <div className="cabecalho__marca">
        <span className="cabecalho__logo" aria-hidden="true">
          <Icone nome="grafico" tamanho={16} />
        </span>
        <div>
          <h1 className="cabecalho__titulo">Portfolio Lab</h1>
          <p className="cabecalho__sub">B3</p>
        </div>
      </div>

      <div className="cabecalho__acoes">
        <SeloDados status={status} />
        <AlternarTema />

        {/* Abre a gaveta de configuração no celular */}
        <button
          className="botao-icone so-celular"
          onClick={() => setLateralAberta(!lateralAberta)}
          aria-expanded={lateralAberta}
          aria-label={lateralAberta ? "Fechar configuração" : "Abrir configuração"}
        >
          <Icone nome={lateralAberta ? "fechar" : "ajustes"} tamanho={17} />
        </button>

        <button
          className="botao-icone botao-icone--codigo"
          onClick={() => setPainelAberto(!painelAberto)}
          aria-expanded={painelAberto}
          aria-label="Editar o código Python das estratégias"
          title="Editar o código Python das estratégias"
        >
          <Icone nome="codigo" tamanho={17} />
        </button>
      </div>
    </header>
  );
}
