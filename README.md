# Portfolio Lab · B3

Comparador de estratégias de alocação de carteira no mercado brasileiro.
Monte uma carteira com ações da B3, escolha o período e veja como Paridade de
Risco, Carteira Eficiente e Ingênua teriam se saído — contra CDI, Ibovespa,
poupança e IPCA.

As estratégias rodam em **Python de verdade dentro do navegador** (Pyodide +
numpy/pandas/scipy), num Web Worker. O código de cada uma é editável na própria
interface.

## Rodando

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>. Na primeira visita o navegador baixa ~20 MB de
Python; depois fica em cache.

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
npm run dados           # atualiza os CSVs até o último pregão
npm run dados:validar   # confere integridade (ordem das datas, preços, saltos)
npm run dados:espelhar  # opcional: copia para o Supabase (precisa dos segredos)
```

O script **anexa** ao histórico e nunca reescreve o que já existe — assim
nenhum backtest antigo muda de resultado.

## Configuração no GitHub

Para a Action conseguir commitar:

**Settings → Actions → General → Workflow permissions → Read and write permissions**

Para testar sem esperar o horário: aba **Actions → Atualizar cotações → Run workflow**.

O espelho no Supabase é opcional. Se quiser, crie os segredos `SUPABASE_URL` e
`SUPABASE_SERVICE_ROLE_KEY` em Settings → Secrets and variables → Actions. Sem
eles, o passo é pulado.

## Estrutura

| Caminho | O que faz |
| --- | --- |
| `app/estrategias/` | O Python de cada estratégia, como string. Um arquivo por estratégia × modo |
| `app/lib/estrategias-meta.ts` | Catálogo: id, cor, grupo. Fonte única para painel, editor e gráficos |
| `app/lib/pyodideLoader.ts` | Ponte entre a interface e o worker |
| `public/pyodide-worker.js` | Hospeda o Pyodide fora da thread principal |
| `scripts/` | Coleta, validação e espelho dos dados |

## Diagnóstico

`Ctrl+Shift+D` abre o painel de desempenho: tempo de cada fase do carregamento,
de cada estratégia (ida, execução e volta separadas) e do desenho dos gráficos.
`Ctrl+Shift+P` liga o profiler do Python — útil para achar gargalo dentro de uma
estratégia, mas dobra o tempo de execução.

## Base teórica

- Ferreira, França e Lemes — *Paridade de risco versus portfólio eficiente*
- Lemes, M. — *Como medir o risco de um investimento*
- Spinu, F. (2013) — *An algorithm for computing risk parity weights*
