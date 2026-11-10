import type { MetadataRoute } from "next";

// Manifesto web: deixa o site "instalável" pelo navegador. O app das lojas é
// o Capacitor (lojas/README.md). Ícones gerados por scripts/gerar-icones.mjs.
// Estático: o build do app (output: export) não tem servidor.
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Portfolio Lab",
    short_name: "Portfolio Lab",
    description: "Compare estratégias de carteira com ações da B3: paridade de risco, Markowitz e 1/N. Grátis, sem cadastro e de código aberto.",
    lang: "pt-BR",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#E2DCD0",
    theme_color: "#115E59",
    categories: ["education", "finance"],
    icons: [
      { src: "/icones/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icones/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icones/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
