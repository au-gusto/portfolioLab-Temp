# Portfolio Lab · B3

Comparador de estratégias de alocação de carteira no mercado brasileiro. Monte
uma carteira, escolha o período e veja como Paridade de Risco, Carteira
Eficiente, Menor Variância e Ingênua teriam se saído — contra CDI, Ibovespa,
poupança e IPCA.

As estratégias rodam em **Python de verdade dentro do navegador** (Pyodide +
numpy/pandas/scipy), num Web Worker. O código de cada uma fica visível e
editável na própria interface.

## Rodando

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>. Na primeira visita o navegador baixa ~20 MB de
Python; depois fica em cache.

## As bases de ativos

| Base | O que tem | Simulação a partir de |
| --- | --- | --- |
| **IBRX-100** | Carteira do índice, direto da API da B3 | 01/01/2024 |
| **Outros** | Carteira antiga do Ibovespa mais quem saiu do índice | o que houver no arquivo |
| **Meus dados** | Um Excel ou CSV seu, lido só no navegador | o que houver no arquivo |

O IBRX-100 tem cotação desde 2023 mas só é simulável a partir de 2024. O ano
extra não é folga: é a janela de covariância do primeiro mês. Sem ele a primeira
alocação sairia de um punhado de pregões — e o Python não recusaria esse caso,
calcularia e devolveria pesos de aparência normal.

Para trazer os seus dados, o arquivo precisa de uma coluna `Data` seguida de uma
coluna por ativo, com o código no cabeçalho. A conferência acontece antes de
qualquer número sair dali e diz exatamente o que está fora do padrão.

## Como os dados chegam aqui

A fonte da verdade são os CSVs versionados em `public/Dados`. **Não há banco de
dados nem função de servidor no caminho** — o build só produz rotas estáticas, e
o navegador busca os CSVs direto da CDN.

```
GitHub Action (dias úteis, 22h UTC)
  └─ scripts/atualizar-dados.mjs   busca Yahoo (ações, IBOV) e BCB (CDI, IPCA, poupança)
  └─ scripts/validar-dados.mjs     aborta se algo vier corrompido
  └─ git commit + push             a Vercel republica sozinha
```

O motivo dessa escolha: o histórico completo tem ~8 MB, muda uma vez por dia e é
idêntico para todos os usuários. Isso é um arquivo, não um banco. Um banco
acrescentaria latência, cota de tráfego e um modo de falha — o plano gratuito do
Supabase pausa após 7 dias sem requisição, e foi assim que a versão anterior
deste projeto ficou 14 meses servindo dados velhos sem ninguém notar.

### Comandos de dados

```bash
npm run dados              # atualiza os CSVs até o último pregão
npm run dados:validar      # confere integridade (ordem das datas, preços, saltos)
npm run dados:ibrx:simular # mostra o que a reavaliação do índice mudaria
npm run dados:ibrx         # aplica: quem entrou ganha coluna, quem saiu vai p/ "Outros"
```

O atualizador diário **anexa** ao histórico e nunca reescreve o que já existe —
assim nenhum backtest antigo muda de resultado.

O sincronizador do índice precisa reescrever os arquivos, porque acrescentar e
remover coluna exige isso. Mas nenhum preço que permanece pode mudar: ele compara
cada coluna preexistente antes e depois e **aborta sem gravar** se algum valor
divergir. Rode-o quando a B3 reavaliar a carteira, a cada quadrimestre.

Papel que sai do índice não é apagado — muda de base e continua simulável. Ele
para de receber pregão novo dois anos depois da saída; a data fica em
`public/Dados/historico-indice.json`.

## Configuração no GitHub

Para a Action conseguir commitar:

**Settings → Actions → General → Workflow permissions → Read and write permissions**

Para testar sem esperar o horário: aba **Actions → Atualizar cotações → Run workflow**.

Não há segredos a configurar.

## Estrutura

| Caminho | O que faz |
| --- | --- |
| `app/estrategias/` | O Python de cada estratégia, como string. Um arquivo por estratégia × modo |
| `app/lib/estrategias-meta.ts` | Catálogo das séries: id, cor, grupo. Fonte única para painel, editor e gráficos |
| `app/lib/catalogo-ativos.ts` | Catálogo das bases: arquivo, piso de data |
| `app/lib/metricas.ts` | Volatilidade, queda máxima e Sharpe, a partir da série já devolvida |
| `app/lib/realce-python.ts` | Tokenizador que colore o código no editor |
| `app/lib/diagnostico.ts` | O log do sistema |
| `app/lib/pyodideLoader.ts` | Ponte entre a interface e o worker |
| `public/pyodide-worker.js` | Hospeda o Pyodide fora da thread principal |
| `scripts/` | Coleta, validação e sincronização dos dados |

Sem Tailwind: o CSS é todo próprio, com um reset explícito no topo de
`app/globals.css`. Nenhuma classe utilitária era usada, e o que o Tailwind fazia
de fato — zerar os padrões do navegador — cabe em quarenta linhas.

## Diagnóstico

`Ctrl+Shift+D` abre o log do sistema: carregamento fase a fase, cada estratégia
com ida, execução e volta separadas, o que foi clicado, o que o app respondeu e
o que falhou. Filtra por categoria, destaca avisos e erros, e exporta em `.txt`
para colar num relatório.

`Ctrl+Shift+P` liga o profiler do Python — útil para achar gargalo dentro de uma
estratégia, mas dobra o tempo de execução.

## Base teórica

- Ferreira, França e Lemes — *Paridade de risco versus portfólio eficiente*
- Lemes, M. — *Como medir o risco de um investimento*
- Spinu, F. (2013) — *An algorithm for computing risk parity weights*
