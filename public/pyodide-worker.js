/**
 * public/pyodide-worker.js
 *
 * Web Worker que hospeda o Pyodide (Python no navegador).
 *
 * Por que um worker?
 *   O Pyodide roda WebAssembly de forma síncrona. Se ele viver na thread
 *   principal, TODA a interface congela enquanto o Python executa — nenhum
 *   spinner gira, nenhum clique responde. Aqui dentro ele roda isolado:
 *   a página continua fluida e ainda recebe mensagens de progresso.
 *
 * Protocolo de mensagens (worker -> página):
 *   { tipo: "progresso", fase, pct, detalhe, mbBaixados }
 *   { tipo: "pronto" }
 *   { tipo: "falha", mensagem }
 *   { tipo: "resultado", id, dados }
 *   { tipo: "erro", id, mensagem }
 *   { tipo: "metrica", evento, ... }   <- telemetria de desempenho
 *
 * Protocolo (página -> worker):
 *   { tipo: "iniciar" }
 *   { tipo: "executar", id, codigo, variaveis, perfilar, base }
 */

const VERSAO_PYODIDE = "0.29.3";
const CDN = `https://cdn.jsdelivr.net/pyodide/v${VERSAO_PYODIDE}/full/`;
// numpy e pandas sao obrigatorios: sem eles nenhuma estrategia roda.
// scipy (14,7 MB, ~7 s) so e usado pelo otimizador da Paridade, entao carrega
// em segundo plano DEPOIS que a interface ja esta liberada.
const PACOTES = ["numpy", "pandas"];
const PACOTE_ADIADO = "scipy";

// Arquivos estaticos, servidos direto pela CDN. Nao ha funcao de servidor no
// caminho: os CSVs sao gerados uma vez por dia por uma GitHub Action e ficam
// versionados no repositorio. Menos partes moveis e menos coisa para quebrar.
const ARQUIVOS_CSV = {
  ativos: "/Dados/Dados_Ativos_B3_AdjClose.csv",
  cdi: "/Dados/cdi_data_total.csv",
  ibov: "/Dados/ibov.csv",
  indices: "/Dados/indices_mensais.csv",
};

let pyodide = null;
let bytesBaixados = 0;
let scipyPromise = null;
let openpyxlPromise = null;

// Qual base de precos esta montada em `tabela_precos` neste momento. Trocar de
// base custa um read_csv (~130 ms), entao os bytes ja baixados ficam em cache:
// ir e voltar entre Ibovespa e IBRX-100 nao repete o download.
let baseAtual = "ibov";
const bytesPorBase = new Map();

// Remonta `tabela_precos` e `datas_precos` a partir do que estiver gravado em
// /tmp/precos.csv. E o mesmo trecho do bootstrap, isolado para poder rodar de
// novo quando a base muda.
const PY_REMONTAR_PRECOS = `
tabela_precos = pd.read_csv('/tmp/precos.csv', decimal=',')
tabela_precos['Data'] = pd.to_datetime(tabela_precos['Data'], format='%d/%m/%Y %H:%M:%S')
if not tabela_precos['Data'].is_monotonic_increasing:
    tabela_precos = tabela_precos.sort_values('Data').reset_index(drop=True)
datas_precos = tabela_precos['Data'].values
`;

/**
 * Deixa `tabela_precos` apontando para a base pedida.
 *
 * Nao faz nada se ela ja estiver montada — trocar de aba de ativos nao deve
 * custar um reparse.
 */
async function garantirBase(id, url) {
  if (baseAtual === id) return;

  let bytes = bytesPorBase.get(id);
  if (!bytes) {
    bytes = await medir(`download da base ${id}`, async () => {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`base ${id}: HTTP ${r.status}`);
      return new Uint8Array(await r.arrayBuffer());
    });
    bytesPorBase.set(id, bytes);
  }

  await medir(`montagem da base ${id}`, async () => {
    pyodide.FS.writeFile("/tmp/precos.csv", bytes);
    await pyodide.runPythonAsync(PY_REMONTAR_PRECOS);
  });
  baseAtual = id;
}

/**
 * Garante o openpyxl antes de ler um .xlsx.
 *
 * So e baixado quando alguem realmente sobe um Excel — a maioria das visitas
 * nunca faz isso, e o pacote nao tem por que pesar no carregamento de todo
 * mundo.
 */
function garantirOpenpyxl() {
  if (!openpyxlPromise) {
    // O openpyxl nao faz parte da distribuicao do Pyodide, entao vem do PyPI
    // pelo micropip. E Python puro: nao ha nada para compilar.
    openpyxlPromise = medir("pacote openpyxl (sob demanda)", async () => {
      await pyodide.loadPackage("micropip");
      await pyodide.runPythonAsync(`
import micropip
await micropip.install('openpyxl')
`);
    });
  }
  return openpyxlPromise;
}

/** Garante o scipy antes de uma estrategia que dependa dele. */
function garantirScipy() {
  if (!scipyPromise) {
    scipyPromise = medir(`pacote ${PACOTE_ADIADO} (segundo plano)`,
      () => pyodide.loadPackage(PACOTE_ADIADO));
  }
  return scipyPromise;
}

// ─── Telemetria ───────────────────────────────────────────────────────────────
// Cada fase cara reporta quanto levou. Sem isso, "o site esta lento" nao tem
// como virar uma correcao: o gargalo pode estar no download, no interpretador,
// na conversao de dados ou dentro do Python — e sao remedios diferentes.

function metrica(evento, dados) {
  self.postMessage({ tipo: "metrica", evento, ...dados, quando: Date.now() });
}

async function medir(nome, fn) {
  const t = performance.now();
  const r = await fn();
  metrica("carregamento", { fase: nome, ms: performance.now() - t, mb: bytesBaixados / 1048576 });
  return r;
}

// ─── Progresso ────────────────────────────────────────────────────────────────

function avisar(fase, pct, detalhe) {
  self.postMessage({
    tipo: "progresso",
    fase,
    pct: Math.round(pct),
    detalhe: detalhe || "",
    mbBaixados: bytesBaixados / 1048576,
  });
}

/**
 * Envolve o fetch global para contar quantos bytes o Pyodide já baixou.
 * Serve só para mostrar um número real ao usuário ("18,4 MB baixados") —
 * o percentual continua vindo das fases, que são mais confiáveis.
 */
function instrumentarFetch() {
  const fetchOriginal = self.fetch.bind(self);

  self.fetch = async (...args) => {
    const resposta = await fetchOriginal(...args);
    if (!resposta.body) return resposta;

    const leitor = resposta.body.getReader();
    const fluxo = new ReadableStream({
      async pull(controlador) {
        const { done, value } = await leitor.read();
        if (done) {
          controlador.close();
          return;
        }
        bytesBaixados += value.byteLength;
        controlador.enqueue(value);
      },
      cancel(motivo) {
        return leitor.cancel(motivo);
      },
    });

    return new Response(fluxo, {
      status: resposta.status,
      statusText: resposta.statusText,
      headers: resposta.headers,
    });
  };
}

/**
 * Enquanto uma etapa longa roda, a barra avança sozinha em direção ao teto
 * da fase (sem nunca alcançá-lo). Evita a sensação de "travou" — o download
 * do Pyodide não expõe progresso byte a byte de forma confiável.
 */
function animarAte(fase, de, ate, detalhe) {
  let atual = de;
  const timer = setInterval(() => {
    atual += (ate - atual) * 0.06;
    avisar(fase, atual, detalhe);
  }, 400);
  return () => clearInterval(timer);
}

// ─── Carregamento ─────────────────────────────────────────────────────────────

async function iniciar() {
  const tInicio = performance.now();
  instrumentarFetch();

  // 1. Script do Pyodide (~300 KB)
  let parar = animarAte("runtime", 1, 8, "Conectando ao CDN");
  await medir("script do Pyodide", async () => importScripts(`${CDN}pyodide.js`));
  parar();

  // 2. Runtime + stdlib (~10 MB) — a parte mais pesada e sem progresso nativo
  parar = animarAte("runtime", 8, 38, "Interpretador Python + stdlib");
  pyodide = await medir("interpretador + stdlib", () => self.loadPyodide({ indexURL: CDN }));
  parar();
  avisar("runtime", 40, "Interpretador pronto");

  // 3. Bibliotecas científicas, em paralelo, com contagem individual
  let carregados = 0;
  const passo = 45 / PACOTES.length;
  const pararPacotes = animarAte("pacotes", 40, 84, PACOTES.join(", "));

  await Promise.all(
    PACOTES.map(async (pacote) => {
      await medir(`pacote ${pacote}`, () => pyodide.loadPackage(pacote));
      carregados++;
      avisar("pacotes", 40 + carregados * passo, `${pacote} pronto (${carregados}/${PACOTES.length})`);
    })
  );
  pararPacotes();
  avisar("pacotes", 85, "Bibliotecas prontas");

  // 4. Dados de mercado — baixados como CSV estático e lidos direto no pandas.
  //    Ficam em variáveis globais do Python e são reaproveitados em toda
  //    simulação, em vez de serem reconvertidos de JS a cada clique.
  avisar("dados", 88, "Baixando cotações");
  const [bufAtivos, bufCdi, bufIbov, bufIndices] = await medir("download das cotações", () => Promise.all([
    fetch(ARQUIVOS_CSV.ativos).then((r) => r.arrayBuffer()),
    fetch(ARQUIVOS_CSV.cdi).then((r) => r.arrayBuffer()),
    fetch(ARQUIVOS_CSV.ibov).then((r) => r.arrayBuffer()),
    fetch(ARQUIVOS_CSV.indices).then((r) => r.arrayBuffer()),
  ]));
  metrica("carregamento", {
    fase: "tamanho dos CSVs",
    ms: 0,
    mb: (bufAtivos.byteLength + bufCdi.byteLength + bufIbov.byteLength + bufIndices.byteLength) / 1048576,
  });

  // Os CSVs entram como BYTES, gravados no sistema de arquivos virtual do
  // Pyodide. Passá-los como string via globals.set custava ~3,8 s: o Pyodide
  // reconverte cada caractere de UTF-16 para o formato interno do Python.
  // Aqui a memória é copiada em bloco e o pandas lê o arquivo direto.
  //
  // Este também é o ponto de entrada para a base própria do usuário: um CSV
  // que ele escolha no navegador vira Uint8Array e é gravado aqui do mesmo
  // jeito, sem passar por servidor nenhum. Ver `montarTabelaPrecos`.
  avisar("dados", 92, "Preparando tabelas");
  await medir("cópia dos CSVs para o Python", async () => {
    pyodide.FS.writeFile("/tmp/precos.csv", new Uint8Array(bufAtivos));
    pyodide.FS.writeFile("/tmp/cdi.csv", new Uint8Array(bufCdi));
    pyodide.FS.writeFile("/tmp/ibov.csv", new Uint8Array(bufIbov));
    pyodide.FS.writeFile("/tmp/indices.csv", new Uint8Array(bufIndices));
  });

  // O primeiro `import pandas` executa a inicializacao inteira da biblioteca
  // dentro do WASM — e cara e acontece uma vez so. Medimos separado para nao
  // parecer que montar as tabelas custa segundos: montar custa ~130 ms.
  await medir("primeiro import do pandas", () => pyodide.runPythonAsync("import pandas as pd"));

  await medir("montagem das tabelas (pandas)", () => pyodide.runPythonAsync(`
import time
import pandas as pd

# As tabelas sao montadas UMA VEZ, aqui, e reaproveitadas por toda estrategia
# em toda simulacao. Antes cada estrategia recebia uma lista de 2.142 dicts e
# reconstruia o DataFrame do zero: 88 colunas convertidas de texto para numero,
# datas reparseadas, tudo multiplicado pelo numero de estrategias marcadas.
_marcos = []
def _marco(nome, t):
    _marcos.append('%8.0f ms  %s' % ((time.perf_counter() - t) * 1000, nome))

# decimal=',' faz o parser em C do pandas converter numero por numero enquanto
# le o arquivo, em vez de converter coluna a coluna depois com str.replace().
_t = time.perf_counter()
tabela_precos = pd.read_csv('/tmp/precos.csv', decimal=',')
_marco('read_csv das cotacoes', _t)

_t = time.perf_counter()
tabela_precos['Data'] = pd.to_datetime(tabela_precos['Data'], format='%d/%m/%Y %H:%M:%S')
_marco('to_datetime da coluna Data', _t)

_t = time.perf_counter()
if not tabela_precos['Data'].is_monotonic_increasing:
    tabela_precos = tabela_precos.sort_values('Data').reset_index(drop=True)
_marco('ordenacao por data', _t)

# Vetor de datas em numpy: as estrategias usam searchsorted nele para recortar
# a janela de 12 meses sem varrer a tabela inteira com mascara booleana.
_t = time.perf_counter()
datas_precos = tabela_precos['Data'].values
_marco('vetor de datas', _t)

_t = time.perf_counter()
tabela_cdi = pd.read_csv('/tmp/cdi.csv')
tabela_cdi['data'] = pd.to_datetime(tabela_cdi['data'], dayfirst=True)
if not tabela_cdi['data'].is_monotonic_increasing:
    tabela_cdi = tabela_cdi.sort_values('data').reset_index(drop=True)
_marco('tabela do CDI', _t)

# Referencias: Ibovespa (diario, serie de preco) e IPCA/poupanca (mensais, %).
_t = time.perf_counter()
tabela_ibov = pd.read_csv('/tmp/ibov.csv', decimal=',')
tabela_ibov['Data'] = pd.to_datetime(tabela_ibov['Data'], format='%d/%m/%Y %H:%M:%S')
tabela_ibov = tabela_ibov.sort_values('Data').reset_index(drop=True)
datas_ibov = tabela_ibov['Data'].values

tabela_indices = pd.read_csv('/tmp/indices.csv')
tabela_indices['Mes'] = pd.to_datetime(tabela_indices['Mes'], format='%Y-%m')
tabela_indices = tabela_indices.sort_values('Mes').reset_index(drop=True)
_marco('tabelas de referencia (IBOV, IPCA, poupanca)', _t)

del _t
`));

  metrica("carregamento", { fase: "TOTAL até pronto", ms: performance.now() - tInicio, mb: bytesBaixados / 1048576 });
  try {
    const marcos = pyodide.globals.get("_marcos");
    const lista = marcos?.toJs ? marcos.toJs() : [];
    if (marcos?.destroy) marcos.destroy();
    if (lista.length) metrica("carregamento", { fase: "↳ dentro da montagem", ms: 0, detalhe: lista });
  } catch { /* telemetria nunca pode derrubar o carregamento */ }

  avisar("pronto", 100, "Tudo pronto");
  self.postMessage({ tipo: "pronto" });

  // A partir daqui a interface ja responde. O scipy continua baixando por
  // baixo; so a Paridade espera por ele, e so se ainda nao tiver chegado.
  garantirScipy().catch(() => { scipyPromise = null; });
}

// ─── Execução de estratégias ──────────────────────────────────────────────────

// O Pyodide pode devolver dicionarios como Map ou como objeto simples,
// dependendo da versao. Lemos os dois jeitos.
function campo(item, nome) {
  return item instanceof Map ? item.get(nome) : item?.[nome];
}

/**
 * Roda a estrategia sob cProfile e devolve as funcoes mais caras.
 *
 * O tempo total ja e medido do lado do JS; isto responde a pergunta seguinte,
 * que e a que importa: QUAL parte do Python consumiu o tempo. Custa caro
 * (o profiler instrumenta cada chamada), entao so roda quando pedido.
 */
const PERFILAR = `
import cProfile, pstats, io as _io
_linhas = _codigo_alvo.rstrip().split(chr(10))
_corpo, _ultima = chr(10).join(_linhas[:-1]), _linhas[-1].strip()
_pr = cProfile.Profile()
_pr.enable()
exec(compile(_corpo, '<estrategia>', 'exec'), globals())
_saida_perfil = eval(_ultima, globals())
_pr.disable()
_st = pstats.Stats(_pr)
_top = sorted(_st.stats.items(), key=lambda kv: -kv[1][2])[:12]
_perfil_texto = [
    "%8.1f ms  %7d x  %s" % (_v[2]*1000, _v[1], _k[2])
    for _k, _v in _top
]
_saida_perfil
`;

async function executar({ id, codigo, variaveis, perfilar, base }) {
  const t0 = performance.now();

  // A base certa tem que estar montada antes da estrategia rodar: e dela que
  // sai `tabela_precos`, que o codigo do usuario le direto.
  if (base && base.id && base.arquivo) await garantirBase(base.id, base.arquivo);

  // A Paridade importa scipy.optimize. Se o download em segundo plano ainda
  // nao terminou, esperamos aqui — em vez de segurar a interface inteira.
  if (codigo.includes("scipy")) await garantirScipy();

  for (const [nome, valor] of Object.entries(variaveis)) {
    pyodide.globals.set(nome, pyodide.toPy(valor));
  }
  const tVariaveis = performance.now();

  let saida;
  if (perfilar) {
    pyodide.globals.set("_codigo_alvo", codigo);
    saida = await pyodide.runPythonAsync(PERFILAR);
  } else {
    saida = await pyodide.runPythonAsync(codigo);
  }
  const tPython = performance.now();

  const convertido = saida?.toJs ? saida.toJs({ create_proxies: false }) : saida;
  if (saida?.destroy) saida.destroy();
  const tConversao = performance.now();

  let perfil = null;
  if (perfilar) {
    const linhas = pyodide.globals.get("_perfil_texto");
    perfil = linhas?.toJs ? linhas.toJs() : null;
    if (linhas?.destroy) linhas.destroy();
  }

  const pontos = Array.isArray(convertido) ? convertido.length : 0;
  metrica("execucao", {
    estrategia: variaveis?.__nome ?? id,
    msVariaveis: tVariaveis - t0,
    msPython: tPython - tVariaveis,
    msConversao: tConversao - tPython,
    msTotal: tConversao - t0,
    pontos,
    perfil,
  });

  if (!Array.isArray(convertido)) return [];
  return convertido.map((item) => ({
    data: campo(item, "data"),
    valor: campo(item, "valor"),
  }));
}

// ─── Roteador de mensagens ────────────────────────────────────────────────────

/**
 * Confere o arquivo do usuario ANTES de ele virar `tabela_precos`.
 *
 * Um arquivo fora do padrao que passasse batido nao daria erro: daria numero
 * errado com cara de certo. Por isso a checagem e explicita e o retorno conta
 * o que foi encontrado, e nao so "deu ruim".
 *
 * Devolve JSON (string) para o JS nao ter que desembrulhar objeto do Python.
 */
const PY_VALIDAR_BASE = `
import json
import pandas as pd

def _validar_base(caminho, eh_excel):
    aviso = []

    try:
        if eh_excel:
            bruto = pd.read_excel(caminho)
        else:
            bruto = pd.read_csv(caminho, decimal=',')
    except Exception as e:
        return {'ok': False, 'erro': 'Nao consegui abrir o arquivo: ' + str(e)}

    if bruto.shape[1] < 2:
        return {'ok': False, 'erro':
                'O arquivo tem ' + str(bruto.shape[1]) + ' coluna. '
                'O padrao e uma coluna Data seguida de uma coluna por ativo.'}

    # O BOM do Excel gruda no primeiro cabecalho e faz 'Data' deixar de ser 'Data'.
    bruto.columns = [str(c).replace('\\ufeff', '').strip() for c in bruto.columns]
    primeira = bruto.columns[0]

    # O cabecalho tem que ser lido CRU, antes do pandas mexer nele: coluna
    # repetida vira 'PETR4' e 'PETR4.1' sozinha, e a duplicata que deveria ser
    # recusada entraria como um ativo a mais, com preco identico ao vizinho.
    try:
        if eh_excel:
            _linha = pd.read_excel(caminho, header=None, nrows=1)
            cru = [str(c) for c in _linha.iloc[0].tolist()]
        else:
            import csv as _csv
            with open(caminho, 'rb') as _f:
                _texto = _f.readline().decode('utf-8-sig', errors='replace')
            cru = next(_csv.reader([_texto.strip()]))
        cru = [c.strip() for c in cru]
    except Exception:
        cru = list(bruto.columns)

    _vistos = {}
    for c in cru[1:]:
        _vistos[c] = _vistos.get(c, 0) + 1
    repetidos_cru = sorted([c for c, n in _vistos.items() if n > 1 and c != ''])
    if repetidos_cru:
        return {'ok': False, 'erro':
                'Estes ativos aparecem em mais de uma coluna: '
                + ', '.join(repetidos_cru)
                + '. Cada ativo pode ter uma coluna so.'}

    if primeira.lower() != 'data':
        return {'ok': False, 'erro':
                'A primeira coluna precisa se chamar "Data" e a sua se chama "'
                + primeira + '". Renomeie o cabecalho e suba de novo.'}

    tickers = list(bruto.columns[1:])
    repetidos = sorted(set([t for t in tickers if tickers.count(t) > 1]))
    if repetidos:
        return {'ok': False, 'erro':
                'Estes ativos aparecem em mais de uma coluna: '
                + ', '.join(repetidos) + '. Cada ativo pode ter uma coluna so.'}

    vazias = [t for t in tickers if t == '' or t.lower().startswith('unnamed')]
    if vazias:
        return {'ok': False, 'erro':
                'Ha ' + str(len(vazias)) + ' coluna(s) sem nome no cabecalho. '
                'Toda coluna de preco precisa do codigo do ativo.'}

    # ── Datas ────────────────────────────────────────────────────────────────
    coluna_data = bruto[primeira]
    if not pd.api.types.is_datetime64_any_dtype(coluna_data):
        datas = pd.to_datetime(coluna_data, format='%d/%m/%Y %H:%M:%S', errors='coerce')
        if datas.isna().all():
            datas = pd.to_datetime(coluna_data, dayfirst=True, errors='coerce')
    else:
        datas = coluna_data

    ruins = int(datas.isna().sum())
    if ruins == len(datas):
        return {'ok': False, 'erro':
                'Nao reconheci nenhuma data na coluna Data. '
                'Use dd/mm/aaaa (por exemplo 03/01/2024).'}
    if ruins:
        aviso.append(str(ruins) + ' linha(s) com data ilegivel foram descartadas.')

    df = bruto.copy()
    df[primeira] = datas
    df = df[df[primeira].notna()].copy()

    if len(df) < 2:
        return {'ok': False, 'erro':
                'Sobraram ' + str(len(df)) + ' linha(s) com data valida. '
                'Preciso de pelo menos dois pregoes para calcular retorno.'}

    # ── Precos ───────────────────────────────────────────────────────────────
    # CSV brasileiro usa virgula decimal, o exportado de fora usa ponto. Se com
    # virgula quase tudo virou texto, o arquivo e do outro tipo — releio.
    def quantos_numericos(quadro):
        return sum(1 for t in tickers
                   if pd.api.types.is_numeric_dtype(quadro[t]))

    if not eh_excel and quantos_numericos(df) < max(1, len(tickers) // 2):
        try:
            outro = pd.read_csv(caminho, decimal='.')
            outro.columns = [str(c).replace('\\ufeff', '').strip() for c in outro.columns]
            outro[primeira] = datas
            outro = outro[outro[primeira].notna()].copy()
            if quantos_numericos(outro) > quantos_numericos(df):
                df = outro
                aviso.append('Li os precos com ponto decimal.')
        except Exception:
            pass

    for t in tickers:
        df[t] = pd.to_numeric(df[t], errors='coerce')

    sem_nada = [t for t in tickers if df[t].notna().sum() == 0]
    if len(sem_nada) == len(tickers):
        return {'ok': False, 'erro':
                'Nenhuma coluna de preco tem numero. Confira se os valores nao '
                'vieram como texto do Excel.'}
    if sem_nada:
        aviso.append('Sem nenhum preco valido: ' + ', '.join(sem_nada[:6])
                     + ('...' if len(sem_nada) > 6 else '')
                     + '. Esses ativos nao vao aparecer na lista.')

    uteis = [t for t in tickers if t not in sem_nada]

    negativos = [t for t in uteis if (df[t].dropna() <= 0).any()]
    if negativos:
        aviso.append('Preco zerado ou negativo em: ' + ', '.join(negativos[:6])
                     + ('...' if len(negativos) > 6 else '') + '.')

    df = df.sort_values(primeira).reset_index(drop=True)

    duplicadas = int(df[primeira].duplicated().sum())
    if duplicadas:
        df = df[~df[primeira].duplicated(keep='last')].reset_index(drop=True)
        aviso.append(str(duplicadas) + ' data(s) repetida(s): mantive a ultima de cada.')

    # ── Publica como base corrente ───────────────────────────────────────────
    global tabela_precos, datas_precos
    df = df[[primeira] + uteis]
    df = df.rename(columns={primeira: 'Data'})
    tabela_precos = df
    datas_precos = df['Data'].values

    buracos = int(df[uteis].isna().sum().sum())
    if buracos:
        aviso.append(str(buracos) + ' celula(s) sem preco. As estrategias '
                     'ignoram o ativo no dia em que ele falta.')

    return {
        'ok': True,
        'tickers': uteis,
        'pregoes': int(len(df)),
        'inicio': df['Data'].iloc[0].strftime('%Y-%m-%d'),
        'fim': df['Data'].iloc[-1].strftime('%Y-%m-%d'),
        'avisos': aviso,
    }

json.dumps(_validar_base(_arquivo_usuario, bool(_eh_excel)))
`;

self.onmessage = async (evento) => {
  const msg = evento.data;

  if (msg.tipo === "iniciar") {
    try {
      await iniciar();
    } catch (erro) {
      self.postMessage({ tipo: "falha", mensagem: String(erro?.message || erro) });
    }
    return;
  }

  // Troca a base de cotações por um CSV que o usuário escolheu na máquina dele.
  // Os bytes nunca saem do navegador: vão do <input type="file"> direto para o
  // sistema de arquivos virtual do Pyodide.
  // Troca a base de precos por um arquivo que o usuario escolheu na maquina
  // dele. Os bytes nunca saem do navegador: vao do <input type="file"> direto
  // para o sistema de arquivos virtual do Pyodide.
  //
  // A validacao roda ANTES de qualquer coisa virar `tabela_precos`. Um arquivo
  // fora do padrao que passasse daqui nao daria erro: daria numero errado, com
  // cara de certo, e o usuario nao teria como desconfiar.
  if (msg.tipo === "usarBasePropria") {
    try {
      const excel = /\.xlsx?$/i.test(msg.nome || "");
      if (excel) await garantirOpenpyxl();

      pyodide.FS.writeFile(excel ? "/tmp/base.xlsx" : "/tmp/base.csv",
                           new Uint8Array(msg.bytes));

      pyodide.globals.set("_arquivo_usuario", excel ? "/tmp/base.xlsx" : "/tmp/base.csv");
      pyodide.globals.set("_eh_excel", excel);

      const relatorio = await pyodide.runPythonAsync(PY_VALIDAR_BASE);
      const laudo = JSON.parse(relatorio);

      if (laudo.ok) {
        baseAtual = "propria";
        bytesPorBase.delete("propria");
      }
      self.postMessage({ tipo: "resultado", id: msg.id, dados: laudo });
    } catch (erro) {
      self.postMessage({ tipo: "erro", id: msg.id, mensagem: String(erro?.message || erro) });
    }
    return;
  }

  if (msg.tipo === "executar") {
    try {
      const dados = await executar(msg);
      self.postMessage({ tipo: "resultado", id: msg.id, dados });
    } catch (erro) {
      self.postMessage({ tipo: "erro", id: msg.id, mensagem: String(erro?.message || erro) });
    }
    return;
  }

  // Lê uma variável que a estratégia deixou nos globais do Python.
  // Evita rodar a mesma otimização duas vezes só para pegar um subproduto.
  if (msg.tipo === "lerVariavel") {
    try {
      const valor = pyodide.globals.get(msg.nome);
      const dados = valor?.toJs ? valor.toJs({ create_proxies: false }) : (valor ?? null);
      if (valor?.destroy) valor.destroy();
      self.postMessage({ tipo: "resultado", id: msg.id, dados });
    } catch (erro) {
      self.postMessage({ tipo: "erro", id: msg.id, mensagem: String(erro?.message || erro) });
    }
  }
};
