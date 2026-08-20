/**
 * app/components/Icone.tsx
 *
 * Conjunto de ícones em SVG, traçado de 1.5px sobre grade de 24.
 *
 * Tudo aqui era glifo de texto antes (⚙ ✕ ⚠ ◐ ✓ ▸), que renderiza diferente
 * em cada sistema e some quando a fonte não tem o caractere. SVG inline
 * herda a cor do texto, escala sem borrar e não depende de fonte.
 */

export type NomeIcone =
  | "ajuda" | "ajustes" | "codigo" | "fechar" | "busca" | "calendario"
  | "alerta" | "info" | "check" | "carregando" | "expandir" | "recolher"
  | "tendencia" | "carteira" | "sol" | "lua" | "adicionar" | "grafico"
  | "duplicar" | "lixeira" | "expandirTela" | "recolherLateral" | "expandirLateral";

interface Props {
  nome: NomeIcone;
  /** Tamanho em px (largura e altura). */
  tamanho?: number;
  className?: string;
}

const CAMINHOS: Record<NomeIcone, React.ReactNode> = {
  ajuda: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.2a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .9-1 1.6v.4" />
      <path d="M12 17.2v.01" />
    </>
  ),
  ajustes: (
    <>
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h10M18 18h2" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="16" cy="18" r="2" />
    </>
  ),
  codigo: (
    <>
      <path d="M9 7 4 12l5 5" />
      <path d="m15 7 5 5-5 5" />
    </>
  ),
  fechar: <path d="M6 6l12 12M18 6L6 18" />,
  busca: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  calendario: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
    </>
  ),
  alerta: (
    <>
      <path d="M10.6 4.2 2.9 17.5a1.6 1.6 0 0 0 1.4 2.4h15.4a1.6 1.6 0 0 0 1.4-2.4L13.4 4.2a1.6 1.6 0 0 0-2.8 0Z" />
      <path d="M12 9.5v4M12 17v.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 7.8v.01" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  carregando: (
    <>
      <path d="M12 3.5v4" opacity="1" />
      <path d="M12 16.5v4" opacity="0.3" />
      <path d="M20.5 12h-4" opacity="0.75" />
      <path d="M7.5 12h-4" opacity="0.45" />
      <path d="m18 6-2.8 2.8" opacity="0.9" />
      <path d="M8.8 15.2 6 18" opacity="0.35" />
      <path d="m18 18-2.8-2.8" opacity="0.6" />
      <path d="M8.8 8.8 6 6" opacity="0.2" />
    </>
  ),
  expandir: <path d="m6 9.5 6 6 6-6" />,
  recolher: <path d="m6 14.5 6-6 6 6" />,
  tendencia: (
    <>
      <path d="M3.5 16.5 9 11l3.5 3.5L20.5 6.5" />
      <path d="M15.5 6.5h5v5" />
    </>
  ),
  carteira: (
    <>
      <path d="M3.5 8.5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2Z" />
      <path d="M3.5 9.5h17a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-4a2.5 2.5 0 0 1 0-5" />
    </>
  ),
  sol: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </>
  ),
  lua: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  adicionar: <path d="M12 5.5v13M5.5 12h13" />,
  grafico: (
    <>
      <path d="M4 4v15a1 1 0 0 0 1 1h15" />
      <path d="M8 15.5v-3M12.5 15.5v-7M17 15.5v-5" />
    </>
  ),
  duplicar: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5.5 15H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v.5" />
    </>
  ),
  expandirTela: (
    <>
      <path d="M9 4H5a1 1 0 0 0-1 1v4" />
      <path d="M15 4h4a1 1 0 0 1 1 1v4" />
      <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
      <path d="M4 15v4a1 1 0 0 0 1 1h4" />
    </>
  ),
  recolherLateral: (
    <>
      <path d="M14 6.5 8.5 12l5.5 5.5" />
    </>
  ),
  expandirLateral: (
    <>
      <path d="M10 6.5 15.5 12 10 17.5" />
    </>
  ),
  lixeira: (
    <>
      <path d="M4 6.5h16" />
      <path d="M9.5 6.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
      <path d="M6.5 6.5 7.3 19a1 1 0 0 0 1 1h7.4a1 1 0 0 0 1-1l.8-12.5" />
      <path d="M10.5 10v6M13.5 10v6" />
    </>
  ),
};

export default function Icone({ nome, tamanho = 16, className }: Props) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flexShrink: 0, display: "block" }}
    >
      {CAMINHOS[nome]}
    </svg>
  );
}
