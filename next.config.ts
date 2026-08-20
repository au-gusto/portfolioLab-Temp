import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Os CSVs de cotações mudam uma vez por dia, depois do fechamento da
        // B3. A CDN guarda por uma hora e, passado esse tempo, serve a cópia
        // velha enquanto busca a nova em segundo plano — ninguém espera.
        source: "/Dados/:arquivo*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
