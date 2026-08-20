/**
 * app/estrategias/benchmarks.ts
 *
 * Referências de comparação: IBOV, IPCA e poupança.
 *
 * Todos aplicam a mesma ideia ingênua — comprar no começo e não mexer — e
 * cobrem EXATAMENTE a mesma janela das estratégias de carteira. Isso importa:
 * as estratégias percorrem `pd.date_range(freq='MS')` e só arrancam no primeiro
 * dia 1º depois da data escolhida. Um benchmark que começasse na data crua
 * acumularia um mês a mais de rendimento e apareceria melhor do que foi.
 */

/** Trecho comum: recorta a janela alinhada com as estratégias de carteira. */
const JANELA_ALINHADA = `
inicio = pd.to_datetime(data_inicio)
fim = pd.to_datetime(data_fim)

meses = pd.date_range(start=inicio, end=fim, freq='MS')
if len(meses) > 0:
    inicio_alinhado = meses[0]
    fim_alinhado = min(meses[-1] + pd.offsets.MonthEnd(0), fim)
else:
    inicio_alinhado, fim_alinhado = inicio, fim
`;

// ─── IBOV ─────────────────────────────────────────────────────────────────────

export const codigoIbov_rentabilidade = `import pandas as pd
import numpy as np
${JANELA_ALINHADA}
# Índice de preço: o retorno ingênuo é simplesmente quanto ele andou desde o
# primeiro pregão da janela. Uma divisão vetorizada resolve a série inteira.
i = np.searchsorted(datas_ibov, np.datetime64(inicio_alinhado), side='left')
j = np.searchsorted(datas_ibov, np.datetime64(fim_alinhado), side='right')
janela = tabela_ibov.iloc[i:j]

resultado = []
if not janela.empty:
    base = float(janela['IBOV'].iloc[0])
    valores = janela['IBOV'].to_numpy(dtype=float) / base - 1.0
    for data_texto, valor in zip(janela['Data'].dt.strftime('%Y-%m-%d'), valores):
        resultado.append({"data": data_texto, "valor": float(valor)})

resultado`;

// ─── Séries mensais (IPCA e poupança) ─────────────────────────────────────────

/**
 * IPCA e poupança vêm em % ao mês. Compomos mês a mês e marcamos o valor no
 * último dia de cada mês — assim a linha acompanha as demais no gráfico sem
 * fingir uma granularidade diária que o dado não tem.
 */
function mensal(coluna: string): string {
  return `import pandas as pd
import numpy as np
${JANELA_ALINHADA}
tabela = tabela_indices
janela = tabela[(tabela['Mes'] >= inicio_alinhado.replace(day=1)) & (tabela['Mes'] <= fim_alinhado)]

resultado = []
acumulado = 1.0
for _, linha in janela.iterrows():
    ultimo_dia = linha['Mes'] + pd.offsets.MonthEnd(0)
    taxa = float(linha['${coluna}']) / 100.0

    # Mês parcial (a data fim cai no meio dele) recebe a fração do rendimento
    # correspondente aos dias de exposição. Sem isso, escolher 01/03 como fim
    # creditaria o mês inteiro de março por um único dia investido.
    if ultimo_dia > fim_alinhado:
        dias_no_mes = ultimo_dia.day
        dias_corridos = max(0, (fim_alinhado - linha['Mes']).days + 1)
        if dias_corridos <= 0:
            break
        taxa = (1.0 + taxa) ** (dias_corridos / dias_no_mes) - 1.0
        data_ref = fim_alinhado
    else:
        data_ref = ultimo_dia

    acumulado *= (1.0 + taxa)
    resultado.append({
        "data": data_ref.strftime('%Y-%m-%d'),
        "valor": float(acumulado - 1.0)
    })

resultado`;
}

export const codigoIpca_rentabilidade = mensal("IPCA");
export const codigoPoupanca_rentabilidade = mensal("Poupanca");

// ─── Modo Patrimônio ──────────────────────────────────────────────────────────

export const codigoIbov = `import pandas as pd
import numpy as np

inicio = pd.to_datetime(data_inicio)
fim = pd.to_datetime(data_fim)

# Compra cotas do índice a cada aporte e nunca vende.
cotas = 0.0
resultado = []
primeiro_aporte = True

for mes in pd.date_range(start=inicio, end=fim, freq='MS'):
    data_compra = mes + pd.offsets.BMonthBegin(0)
    fim_periodo = min(mes + pd.offsets.MonthEnd(0), fim)

    i = np.searchsorted(datas_ibov, np.datetime64(mes), side='left')
    j = np.searchsorted(datas_ibov, np.datetime64(fim_periodo), side='right')
    do_mes = tabela_ibov.iloc[i:j]
    if do_mes.empty:
        continue

    k = np.searchsorted(datas_ibov, np.datetime64(data_compra), side='left')
    preco_compra = float(tabela_ibov['IBOV'].iloc[min(k, len(tabela_ibov) - 1)])

    aporte = aporte_inicial if primeiro_aporte else aporte_mensal
    primeiro_aporte = False
    if preco_compra > 0:
        cotas += aporte / preco_compra

    valores = do_mes['IBOV'].to_numpy(dtype=float) * cotas
    for data_texto, valor in zip(do_mes['Data'].dt.strftime('%Y-%m-%d'), valores):
        resultado.append({"data": data_texto, "valor": float(valor)})

resultado`;

function mensalPatrimonio(coluna: string): string {
  return `import pandas as pd

inicio = pd.to_datetime(data_inicio)
fim = pd.to_datetime(data_fim)

saldo = 0.0
resultado = []
primeiro_aporte = True

for mes in pd.date_range(start=inicio, end=fim, freq='MS'):
    linha = tabela_indices[tabela_indices['Mes'] == mes.replace(day=1)]
    if linha.empty:
        continue

    saldo += aporte_inicial if primeiro_aporte else aporte_mensal
    primeiro_aporte = False
    saldo *= (1.0 + float(linha['${coluna}'].iloc[0]) / 100.0)

    fim_do_mes = min(mes + pd.offsets.MonthEnd(0), fim)
    resultado.append({"data": fim_do_mes.strftime('%Y-%m-%d'), "valor": float(saldo)})

resultado`;
}

export const codigoIpca = mensalPatrimonio("IPCA");
export const codigoPoupanca = mensalPatrimonio("Poupanca");
