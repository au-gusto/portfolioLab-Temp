/**
 * app/components/Icone.tsx
 *
 * Conjunto de ícones em SVG, traçado de 1.5px sobre grade de 24.
 *
 * Tudo aqui era glifo de texto antes (⚙ ✕ ⚠ ◐ ✓ ▸), que renderiza diferente
 * em cada sistema e some quando a fonte não tem o caractere. SVG inline
 * herda a cor do texto, escala sem borrar e não depende de fonte.
 *
 * Ponta quadrada e canto vivo de propósito: o traço redondo de 1.6px é o do
 * Lucide, que está em todo painel gerado por IA. Pontos (do "?", do "i", do
 * "!") são quadrados cheios, pelo mesmo motivo.
 */

export type NomeIcone =
  | "ajuda" | "ajustes" | "codigo" | "fechar" | "busca"
  | "alerta" | "info" | "check" | "carregando" | "expandir" | "recolher"
  | "percentual" | "patrimonio" | "sol" | "lua" | "adicionar" | "grafico"
  | "duplicar" | "lixeira" | "expandirTela" | "recolherLateral" | "expandirLateral"
  | "executar" | "baixar";

interface Props {
  nome: NomeIcone;
  /** Tamanho em px (largura e altura). */
  tamanho?: number;
  className?: string;
}

const ponto = (x: number, y: number) => (
  <rect x={x - 0.9} y={y - 0.9} width="1.8" height="1.8" fill="currentColor" stroke="none" />
);

const CAMINHOS: Record<NomeIcone, React.ReactNode> = {
  ajuda: (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M9.75 9.75a2.25 2.25 0 1 1 3 2.12c-.45.16-.75.58-.75 1.06v.57" />
      {ponto(12, 16.5)}
    </>
  ),
  // Mesa de som: alças quadradas em vez de bolinhas.
  ajustes: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3" />
      <rect x="13" y="5" width="4" height="4" />
      <rect x="7" y="10" width="4" height="4" />
      <rect x="13" y="15" width="4" height="4" />
    </>
  ),
  // Prompt do interpretador: o código aqui é Python, não HTML.
  codigo: <path d="M4.5 7l5 5-5 5M12.5 17.5h7" />,
  fechar: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  busca: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15l4.75 4.75" />
    </>
  ),
  alerta: (
    <>
      <path d="M12 4.5l8.5 14.75h-17z" />
      <path d="M12 10v4" />
      {ponto(12, 16.75)}
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.75" />
      <path d="M12 11v5.25" />
      {ponto(12, 7.9)}
    </>
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  carregando: (
    <>
      <path d="M12 4v3" opacity="1" />
      <path d="M12 17v3" opacity="0.3" />
      <path d="M20 12h-3" opacity="0.75" />
      <path d="M7 12H4" opacity="0.45" />
      <path d="M17.66 6.34l-2.12 2.12" opacity="0.9" />
      <path d="M8.46 15.54l-2.12 2.12" opacity="0.35" />
      <path d="M17.66 17.66l-2.12-2.12" opacity="0.6" />
      <path d="M8.46 8.46L6.34 6.34" opacity="0.2" />
    </>
  ),
  expandir: <path d="M6.5 9.5l5.5 5.5 5.5-5.5" />,
  recolher: <path d="M6.5 14.5L12 9l5.5 5.5" />,
  // Rentabilidade: é um número em %, não uma seta subindo.
  percentual: (
    <>
      <path d="M18 6L6 18" />
      <rect x="5.5" y="5.5" width="3.5" height="3.5" />
      <rect x="15" y="15" width="3.5" height="3.5" />
    </>
  ),
  // Patrimônio: camadas que se acumulam a cada aporte.
  patrimonio: <path d="M4 19.5h16v-4H4zM5.75 15.5v-4h12.5v4M7.5 11.5v-4h9v4" />,
  sol: (
    <>
      <circle cx="12" cy="12" r="3.75" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.64 5.64l1.41 1.41M16.95 16.95l1.41 1.41M18.36 5.64l-1.41 1.41M7.05 16.95l-1.41 1.41" />
    </>
  ),
  lua: <path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" />,
  adicionar: <path d="M12 5.5v13M5.5 12h13" />,
  grafico: <path d="M4 4v16h16M7.5 15.5l3.5-4.5 3 2.5 5-6.5" />,
  duplicar: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" />
      <path d="M15.5 5V4.5h-11v11H5" />
    </>
  ),
  expandirTela: <path d="M9 4.5H4.5V9M15 4.5h4.5V9M19.5 15v4.5H15M4.5 15v4.5H9" />,
  recolherLateral: <path d="M14.5 6.5L9 12l5.5 5.5" />,
  expandirLateral: <path d="M9.5 6.5L15 12l-5.5 5.5" />,
  lixeira: <path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l.9 13.5h9.2l.9-13.5M10.5 10.5v6M13.5 10.5v6" />,
  executar: <path d="M7.5 5v14l11-7z" />,
  baixar: <path d="M12 4.5v10M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15" />,
};

export default function Icone({ nome, tamanho = 16, className }: Props) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flexShrink: 0, display: "block" }}
    >
      {CAMINHOS[nome]}
    </svg>
  );
}
