# Portfolio Lab nas lojas (Google Play e App Store)

Atualizado em 2026-11-10. Troca o plano de 06/11 (PWA + TWA + PWABuilder) por um
**app de verdade feito com Capacitor 8**. Motivos, conferidos numa auditoria das
regras atuais das lojas:

- o empacotador de iOS do PWABuilder foi arquivado em 2025;
- a Apple recusa "site embrulhado" (diretriz 4.2);
- o PWA não funcionava offline na primeira visita.

## Como o app funciona

O app é o próprio site exportado como arquivos estáticos (`APP=1 next build` → `out/`),
**com o Python dentro**: Pyodide 0.29.3 + numpy, pandas, scipy e openpyxl (~35 MB) em
`out/pyodide/`. O mesmo `out/` vira o projeto Android (`android/`) e o iOS (`ios/`).

| | Com internet | Sem internet |
|---|---|---|
| Interface e Python | do pacote | do pacote |
| Cotações (`/Dados`) | do dia, de `www.portfoliolab.com.br` (prazo de 4 s) | as que vieram no pacote, do dia do build |
| Selo da data | data do site | data do pacote (o ponto fica âmbar/vermelho) |
| Planilha Excel | do pacote | do pacote |

Código: `public/pyodide-worker.js` (`baixarDados`, `modoApp`), `next.config.ts` (`APP`),
`scripts/baixar-pyodide.mjs`, `scripts/build-app.mjs` e `capacitor.config.ts`. O site na
Vercel continua igual e não leva o `public/pyodide/` (está no `.gitignore`).

Limite conhecido: a **lista de tickers** é a do build. Uma ação que entrar no IBRX depois
só aparece na versão seguinte do app. Gerar uma versão nova de tempos em tempos também
renova as cotações embutidas.

## Comandos

```bash
npm run app:build            # baixa o Python (1ª vez), exporta para out/ e copia para android/ e ios/
npm run app:build -- --teste # idem, sem exigir o e-mail de contato (só para testar)
npm run app:android          # abre o Android Studio
npm run app:ios              # abre o Xcode (só no Mac)
node scripts/capturar-prints.mjs http://localhost:4173/ lojas/prints   # prints das lojas
```

Para testar no navegador: `py -m http.server 4173 -d out` e abrir `http://localhost:4173`.
Conferido em 10/11: o Python carrega de `/pyodide/` (nada do jsDelivr), as cotações vêm do
site, e sem o site o app usa as do pacote e simula a Paridade normalmente.

## Antes do primeiro envio (só o Augusto)

1. **Contato:** preencher `RESPONSAVEL` e `EMAIL_CONTATO` em `app/privacidade/page.tsx`.
   O `npm run app:build` se recusa a rodar sem eles. As duas lojas e a LGPD pedem um
   contato direto, e uma issue no GitHub exige conta. Publicar o site depois disso.
2. **Contas pessoais, nunca no time/organização da Tactive** (Play Console, Apple
   Developer, chave da API do App Store Connect, Google Group dos testadores, e-mail).
3. **Aval do orientador** para citar a UFG na ficha e nas notas ao revisor. Se não tiver,
   tirar a menção de `textos-da-loja.md`.
4. **Repositório e licença:** a política aponta para `au-gusto/portfolioLab-Temp`. Um nome
   "Temp" que mude depois quebra o link que as lojas conferem. Decidir o nome definitivo e
   colocar um `LICENSE`, já que o texto diz "código aberto".

## Google Play

**O gargalo é o teste fechado.** Conta pessoal criada depois de 13/11/2023 só libera a
produção depois de **12 testadores inscritos por 14 dias seguidos**. Quem sai e volta
reinicia a contagem. Começar cedo.

1. Criar a conta no Play Console (US$ 25), com verificação de identidade e **verificação
   de acesso a um celular Android físico** (Android 10+, sem root, pelo app Play Console;
   pode ser emprestado).
2. Instalar o **Android Studio** (traz o JDK 21 e o SDK 36; nesta máquina só há Java 8).
   `npm run app:build` → `npm run app:android` → *Build → Generate Signed App Bundle* →
   criar a chave de upload (`.jks`). O projeto já sai com **target API 36**, exigido desde
   31/08/2026.
3. No Console: criar o app (gratuito), ativar a Assinatura de apps do Google Play, subir o
   `.aab` num **teste fechado** e convidar os testadores (lista de e-mails ou Google Group).
   Cada um precisa de um Android com a conta inscrita e de instalar pela Play.
4. *Conteúdo do app*:
   - Política de privacidade: `https://www.portfoliolab.com.br/privacidade/`
   - Anúncios: não. Acesso: tudo liberado, sem login.
   - Segurança dos dados: **não coleta nem compartilha**. Justificativa: não há SDK de
     análise; o app só baixa CSVs públicos; o IP visto pela Vercel serve só para entregar
     os arquivos.
   - **Declaração de recursos financeiros:** marcar *"My app doesn't provide any financial
     features"*. Não marcar "Stock trading and portfolio management". Categoria
     **Educação** (não Finanças), para não cair na regra de "apps financeiros só por
     conta de organização".
   - Classificação (IARC): livre. Público-alvo: 18+.
5. Ficha: textos em `textos-da-loja.md`, ícone `arte/icone-loja-512.png` (RGBA), destaque
   `arte/destaque-play-1024x500.png`, prints `prints/android-*.png` (1080×1920; a Play
   recusa proporção acima de 2:1, por isso não 1080×2400).
6. Depois dos 14 dias: pedir a produção (há um questionário sobre o teste; responder com
   detalhes) e publicar. A revisão leva de 1 a 7 dias.

Atualização: aumentar `versionCode` em `android/app/build.gradle` a cada envio.

## App Store (iPhone)

1. Apple Developer Program, pessoa física (US$ 99/ano). Declarar **"não trader"** no DSA
   da UE. Trader individual mostra endereço e telefone publicamente na UE.
2. **Precisa de Xcode 26** (exigido desde abril de 2026), num Mac com macOS 15.6+. Sem Mac:
   um Mac emprestado por uma tarde, ou um workflow do GitHub Actions com runner
   `macos-26` + chave .p8 da API do App Store Connect nos *secrets* (criar quando a conta
   existir).
3. No Mac: `npm ci && npm run app:build && npm run app:ios`. No Xcode: escolher a equipe,
   *Product → Archive → Distribute → App Store Connect*. O projeto já está como **só
   iPhone** (sem prints de iPad) e com `ITSAppUsesNonExemptEncryption = NO`.
4. App Store Connect:
   - Categoria **Educação** (secundária: Finanças).
   - Privacidade: **Dados não coletados**. URL: `https://www.portfoliolab.com.br/privacidade/`.
   - URL de suporte: `https://www.portfoliolab.com.br/privacidade/#contato`.
   - Classificação etária: o questionário novo (4+/9+/13+/16+/18+). Responder **não** a
     "Unrestricted Web Access": o app não navega para fora (links externos abrem no
     navegador do sistema).
   - Prints: `prints/iphone-*.png` (1290×2796, 6,7").
   - Notas ao revisor: o texto está em `textos-da-loja.md`. Ele cita a exceção educacional
     da diretriz 2.5.2: o app roda Python, mas o código fica visível e editável pelo usuário.
5. TestFlight num iPhone de verdade (o maior risco é memória em iPhone antigo: o Python com
   scipy ocupa centenas de MB) e depois enviar à revisão (1 a 3 dias).
6. Se cair na 4.2 mesmo assim: acrescentar um recurso nativo, por exemplo
   `@capacitor/share` para compartilhar o resultado da simulação.

## Backup (guardar fora do PC, num gerenciador de senhas ou cofre)

- Chave de upload do Android (`.jks`), alias e as duas senhas. Sem ela, trocar a chave
  depende do suporte da Google e demora.
- Chave `.p8` da API do App Store Connect (só pode ser baixada uma vez), Issuer ID e Key ID.
- Logins das duas contas, com autenticação em dois fatores.

## Riscos para acompanhar

- **Domínio e Vercel:** o app busca as cotações em `www.portfoliolab.com.br`. Se o domínio
  vencer, o app continua funcionando com os dados do pacote, mas para de atualizar.
  Deixar a renovação automática no registro.br.
- **Deploy quebrado:** um CSV errado em produção chega a todos os apps no mesmo dia. A
  Action diária já valida os dados (`npm run dados:validar`); não desligar isso.
- **CVM (Resoluções 19 e 20/2021):** não chamar nada de "recomendação", "melhor carteira" ou
  "sugestão de investimento" na ficha nem no app. O aviso educacional já está no rodapé e
  na política.
- **Dados do Yahoo Finance:** os termos limitam a redistribuição. O risco é baixo num
  projeto acadêmico e gratuito, mas citar a fonte na política e na ajuda ajuda.
- **Acessibilidade:** antes do envio, passar o Lighthouse/axe no celular e conferir os
  rótulos dos botões que só têm ícone (`>_`).

## Prazo realista

| | Trabalho | Espera |
|---|---|---|
| Google Play | 1 tarde (Android Studio + Console) | 14 dias de teste fechado + 1 a 7 dias de revisão |
| App Store | 1 tarde com um Mac | 1 a 3 dias de revisão; mais uma rodada se cair na 4.2 |
