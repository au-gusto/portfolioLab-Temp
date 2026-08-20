export const codigoIngenua_rentabilidade = `import pandas as pd
import numpy as np

# =============================================
# PREPARAÇÃO DOS DADOS
# =============================================

# tabela_precos já vem pronta do carregamento: datas em datetime, preços em
# float, linhas ordenadas. Montá-la aqui custaria ~85 ms por estratégia.
tabela_ativos = tabela_precos
lista_ativos = list(tickers)

data_inicio_simulacao = pd.to_datetime(data_inicio)
data_fim_simulacao = pd.to_datetime(data_fim)

resultado = []
retorno_acumulado = 1.0

def recortar(inicio, fim):
    """Fatia a tabela por data via busca binária, sem máscara booleana."""
    i = np.searchsorted(datas_precos, np.datetime64(inicio), side='left')
    j = np.searchsorted(datas_precos, np.datetime64(fim), side='right')
    return tabela_ativos.iloc[i:j]

# =============================================
# LOOP MENSAL
# =============================================
# A estratégia Ingênua distribui o capital igualmente entre todos os ativos
# (peso = 1/N). Não precisa de otimização nem de janela histórica.

numero_ativos = len(lista_ativos)
primeira_data_disponivel = tabela_ativos['Data'].iloc[0]

if numero_ativos > 0:
    pesos_mes = np.full(numero_ativos, 1.0 / numero_ativos)

    for mes in pd.date_range(start=data_inicio_simulacao, end=data_fim_simulacao, freq='MS'):
        inicio_mes = mes
        fim_periodo = min(mes + pd.offsets.MonthEnd(0), data_fim_simulacao)
        dados_mes = recortar(inicio_mes, fim_periodo)
        if dados_mes.empty:
            continue

        # Preço do último pregão ANTES do mês: base do rebalanceamento. Sem ele
        # o retorno da virada do mês se perdia (~5% dos pregões viravam zero).
        anteriores = recortar(primeira_data_disponivel, inicio_mes - pd.Timedelta(nanoseconds=1))
        if anteriores.empty:
            precos_base = dados_mes[lista_ativos].iloc[0].to_numpy(dtype=float)
        else:
            precos_base = anteriores[lista_ativos].iloc[-1].to_numpy(dtype=float)

        # Rebalanceamento MENSAL vetorizado: o mês inteiro vira uma
        # multiplicação de matrizes, em vez de um laço dia a dia.
        precos_mes = dados_mes[lista_ativos].to_numpy(dtype=float)
        fatores = (precos_mes / precos_base) @ pesos_mes
        valores = retorno_acumulado * fatores

        for data_texto, valor in zip(dados_mes['Data'].dt.strftime('%Y-%m-%d'), valores):
            resultado.append({"data": data_texto, "valor": float(valor - 1)})

        retorno_acumulado = float(valores[-1])

resultado`;
