import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

export const metadata: Metadata = {
  title: "Portfolio Lab · B3",
  description: "Comparação entre estratégias de Portfólios no mercado brasileiro",
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
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://cdn.jsdelivr.net" />
      </head>
      <body>
        {children}
      </body>
    </html>
  );
}
