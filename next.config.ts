import type { NextConfig } from "next";

// APP=1 gera o app das lojas: site exportado como arquivos estáticos em out/,
// que o Capacitor empacota (ver capacitor.config.ts e lojas/README.md).
const app = !!process.env.APP;

const nextConfig: NextConfig = app
  ? { output: "export", trailingSlash: true, env: { NEXT_PUBLIC_APP: "1" } }
  : {
      async headers() {
        return [
          {
            // Os CSVs de cotações mudam uma vez por dia, depois do fechamento da
            // B3. A CDN guarda por uma hora e, passado esse tempo, serve a cópia
            // velha enquanto busca a nova em segundo plano — ninguém espera.
            // CORS liberado: o app das lojas busca daqui as cotações do dia.
            source: "/Dados/:arquivo*",
            headers: [
              {
                key: "Cache-Control",
                value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
              },
              { key: "Access-Control-Allow-Origin", value: "*" },
            ],
          },
        ];
      },
    };

export default nextConfig;
