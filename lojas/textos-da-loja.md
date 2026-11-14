# Textos das fichas das lojas (rascunho para revisar)

## Nome
Portfolio Lab (13 caracteres; a Play aceita até 30, a Apple até 30)

## Subtítulo (App Store, até 30)
Paridade de risco na B3

## Descrição curta (Google Play, até 80)
Compare estratégias de carteira com ações da B3. Grátis, sem cadastro.

## Palavras-chave (App Store, até 100 caracteres, separadas por vírgula)
carteira,ações,B3,investimentos,risco,paridade,markowitz,ibovespa,CDI,simulador,educação

## Descrição completa (as duas lojas, até 4.000)

O Portfolio Lab compara estratégias de montagem de carteiras com dados reais
de ações da B3. Escolha as empresas, o período e quanto investir, e veja lado a
lado como cada estratégia teria se saído.

O QUE VOCÊ PODE FAZER
• Paridade de risco: cada ação contribui com a mesma fatia de risco da carteira
• Carteira eficiente de Markowitz e carteira de menor variância
• Carteira ingênua (dividir igual entre todas)
• Comparar com CDI, Ibovespa, poupança e inflação (IPCA)
• Simular aportes mensais e ver o patrimônio crescer
• Ver o risco de cada estratégia: volatilidade e queda máxima
• Ver a alocação de cada ativo e a contribuição de risco de cada um
• Editar as estratégias em Python e testar as suas próprias ideias

COMO FUNCIONA
Os cálculos rodam no seu próprio aparelho, em Python, que já vem instalado no
app. Funciona sem internet desde a primeira abertura. Com internet, o app
busca as cotações mais recentes das empresas do IBRX-100, atualizadas todo dia
útil.

GRÁTIS, SEM CADASTRO E DE CÓDIGO ABERTO
Não tem login, anúncio nem compra dentro do app, e nenhum dado seu sai do
aparelho. O código é aberto para quem quiser auditar ou estudar.

Projeto de iniciação científica do Instituto de Matemática e Estatística da
Universidade Federal de Goiás (IME/UFG).

AVISO
O Portfolio Lab é uma ferramenta educacional. Os resultados são simulações com
dados do passado, que não garantem resultados futuros, e nada no app é
recomendação de investimento.

## Notas para o revisor da Apple (em inglês)

Portfolio Lab is a free educational tool, developed as an undergraduate
research project at the Federal University of Goiás (Brazil), that compares
portfolio allocation strategies (risk parity, Markowitz mean-variance, equal
weight) using historical prices of Brazilian stocks.

All computations run on the device. The app bundles a Python runtime compiled
to WebAssembly (Pyodide) together with numpy, pandas and scipy, and runs the
optimization code locally. It works fully offline from the first launch; when
online, it only downloads the day's public price files (CSV) from our website
to refresh the data. There is no login, no account, no ads, no in-app
purchases, no data collection, and it does not offer any financial service (no
trading, no brokerage, no money handling). It is a simulator for learning only.

Regarding guideline 2.5.2: the app lets students read and edit the Python code
of each strategy (the ">_" button) and run it on the device. This code is
completely viewable and editable by the user, it does not change the app's
features, and the app does not download executable code.

To test: open the app, wait a few seconds for Python to load, pick a few stocks
(e.g. PETR4, VALE3, ITUB4) and tap "Simular". Tap ">_" to see the Python code.

## Categoria
- Google Play: Educação
- App Store: Educação (secundária: Finanças)
