import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

/** Build do app das lojas (APP=1, ver next.config.ts): o Python vem do pacote. */
const APP = process.env.NEXT_PUBLIC_APP === "1";

export const metadata: Metadata = {
  title: "Portfolio Lab · B3",
  description: "Comparação entre estratégias de Portfólios no mercado brasileiro",
  applicationName: "Portfolio Lab",
  appleWebApp: { capable: true, title: "Portfolio Lab", statusBarStyle: "default" },
};

// Cor da barra de status no app instalado: a mesma do fundo de cada tema.
// viewport-fit=cover: no app a página vai até baixo do entalhe e da barra de
// gestos; o globals.css devolve o espaço com env(safe-area-inset-*).
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E2DCD0" },
    { media: "(prefers-color-scheme: dark)", color: "#070A08" },
  ],
};

/**
 * A fonte é servida pelo próprio domínio (o next/font baixa no build), então
 * não há requisição ao Google em tempo de execução nem o texto piscando com a
 * fonte do sistema antes de trocar.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
  variable: "--fonte-marca",
});

/**
 * Aplica o tema salvo antes da primeira pintura. Sem isso a página nasce com o
 * tema do sistema e pisca ao trocar. Sem nada salvo, o atributo não é escrito e
 * o CSS decide pelo prefers-color-scheme.
 */
const TEMA_INICIAL = `try{var t=localStorage.getItem('tema');if(t==='claro'||t==='escuro'){document.documentElement.dataset.tema=t}}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={jakarta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: TEMA_INICIAL }} />
        {/* O Pyodide não é carregado aqui — quem o baixa é o worker
            (public/pyodide-worker.js), fora da thread principal. Abrir a
            conexão com o CDN desde já poupa DNS + TLS quando ele pedir. */}
        {!APP && <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />}
        {!APP && <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />}
      </head>
      <body>{children}</body>
    </html>
  );
}
