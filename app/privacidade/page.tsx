import type { Metadata } from "next";
import Link from "next/link";

// Política de privacidade e contato. As duas lojas exigem um link público
// para ela, e a Apple pede uma URL de suporte: usar /privacidade/#contato.
// Também serve de aviso de que nada aqui é recomendação.
export const metadata: Metadata = { title: "Privacidade · Portfolio Lab" };

// Preencher antes de publicar nas lojas (LGPD: quem responde e por onde).
// scripts/build-app.mjs se recusa a gerar o app com estes campos vazios.
const RESPONSAVEL = "";
const EMAIL_CONTATO = "";

const REPOSITORIO = "https://github.com/au-gusto/portfolioLab-Temp";

export default function Privacidade() {
  return (
    <main className="texto-legal" style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px 64px", lineHeight: 1.6, color: "var(--texto)" }}>
      <p><Link href="/">← Voltar ao Portfolio Lab</Link></p>
      <h1>Política de privacidade</h1>
      <p><i>Última atualização: novembro de 2026.</i></p>

      <h2>Resumo</h2>
      <p>
        O Portfolio Lab não tem cadastro, não pede nenhum dado pessoal, não usa
        cookies de rastreamento, anúncios nem ferramentas de análise de uso, e
        não vende nada dentro do app.
      </p>

      <h2>O que fica no seu aparelho</h2>
      <ul>
        <li>Suas preferências (tema, ativos escolhidos, período, aportes, estratégias que você editou) ficam salvas só no armazenamento local do navegador ou do app.</li>
        <li>As simulações rodam no próprio aparelho, em Python. No app das lojas o Python já vem instalado; no site ele é baixado uma vez. Nenhum dado de carteira é enviado para servidor nosso.</li>
        <li>Se você carregar uma planilha própria, ela é lida no aparelho e não é enviada a lugar nenhum.</li>
      </ul>

      <h2>O que o app baixa da internet</h2>
      <p>
        O app só baixa as cotações públicas do dia, do nosso site
        (www.portfoliolab.com.br, hospedado na Vercel). Sem internet, ele usa as
        cotações que vieram no app. No site, o Python vem do jsDelivr e, só
        quando você importa uma planilha Excel, um pacote vem do PyPI. Como em
        qualquer conexão, esses serviços recebem dados técnicos (como o endereço
        IP) para entregar os arquivos, e os tratam por conta própria. Nós não
        recebemos nem guardamos esses dados, e nada que você faz no app é
        enviado junto.
      </p>

      <h2>Seus direitos</h2>
      <p>
        Pela Lei Geral de Proteção de Dados (Lei 13.709/2018), você pode pedir
        confirmação, acesso, correção ou eliminação de dados pessoais. Como o
        Portfolio Lab não coleta dados pessoais, não há o que guardar em nossos
        servidores; o que fica no aparelho você apaga limpando os dados do app
        ou do navegador.
      </p>

      <h2>Não é recomendação de investimento</h2>
      <p>
        O Portfolio Lab é uma ferramenta educacional. Os resultados são
        simulações com dados do passado, que não garantem resultados futuros, e
        nada aqui é recomendação de compra ou venda de ativos.
      </p>

      <h2 id="contato">Contato e suporte</h2>
      <p>
        {RESPONSAVEL && <>Responsável: {RESPONSAVEL}. </>}
        {EMAIL_CONTATO && <>Dúvidas, problemas ou pedidos: <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>. </>}
        O código é aberto e pode ser auditado em{" "}
        <a href={REPOSITORIO} target="_blank" rel="noopener noreferrer">{REPOSITORIO.replace("https://", "")}</a>
        {EMAIL_CONTATO ? "." : <>; dúvidas ou pedidos podem ser abertos como issue lá.</>}
      </p>
    </main>
  );
}
