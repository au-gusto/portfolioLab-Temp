export const codigoMinVar_rentabilidade = `import pandas as pd
import numpy as np

# =============================================
# CARTEIRA DE MENOR VARIÂNCIA (Markowitz)
# =============================================
#
# A Carteira Eficiente maximiza o Sharpe e, para isso, precisa estimar o
# retorno esperado de cada ativo. Essa estimativa é notoriamente ruim: a média
# histórica de um ano diz muito pouco sobre o próximo mês, e o otimizador
# amplifica o erro — ele coloca peso grande justamente onde o retorno estimado
# saiu alto por acaso.
#
# Esta carteira ignora o retorno esperado por completo. Só minimiza a variância:
#
#     w = Σ⁻¹1 / (1ᵀΣ⁻¹1)
#
# Ela não tenta ganhar mais; tenta oscilar menos. É o ponto mais à esquerda da
# fronteira eficiente, e serve de contraponto honesto à Eficiente no gráfico.

tabela_ativos = tabela_precos
lista_ativos = list(tickers)

def recortar(inicio, fim):
    """Fatia a tabela por data via busca binária, sem máscara booleana."""
    i = np.searchsorted(datas_precos, np.datetime64(inicio), side='left')
    j = np.searchsorted(datas_precos, np.datetime64(fim), side='right')
    return tabela_ativos.iloc[i:j]

data_inicio_simulacao = pd.to_datetime(data_inicio)
data_fim_simulacao = pd.to_datetime(data_fim)

resultado = []
retorno_acumulado = 1.0

# Mesmo limiar da Eficiente: ativo quase parado deixa a matriz de covariância
# mal condicionada e a inversão devolve peso gigante para ele.
limiar_volatilidade_minima = 13

# =============================================
# TETO DE ALAVANCAGEM
# =============================================
#
# A menor variância sem restrição também alavanca: a forma mais barata de
# reduzir variância costuma ser comprar muito de um papel e vender muito de
# outro quase igual. Soma 1, mas é impossível de montar.
limite_alavancagem = 2.0

def limitar_alavancagem(pesos, limite=limite_alavancagem):
    """Puxa os pesos na direção do 1/N até a exposição bruta caber no limite."""
    pesos = np.asarray(pesos, dtype=float)
    n = len(pesos)
    if n == 0 or not np.all(np.isfinite(pesos)):
        return pesos
    if np.abs(pesos).sum() <= limite:
        return pesos

    referencia = np.full(n, 1.0 / n)
    baixo, alto = 0.0, 1.0
    for _ in range(50):
        meio = (baixo + alto) / 2.0
        if np.abs(meio * pesos + (1.0 - meio) * referencia).sum() <= limite:
            baixo = meio
        else:
            alto = meio
    return baixo * pesos + (1.0 - baixo) * referencia

# =============================================
# PESOS
# =============================================

def calcular_pesos_minima_variancia(retornos_historicos_, ativos_validos_):
    """w = Σ⁻¹1 / (1ᵀΣ⁻¹1) — nenhuma estimativa de retorno entra aqui."""
    matriz_cov = retornos_historicos_[ativos_validos_].cov()

    # Cholesky em vez de inv() direto: falha explicitamente quando a matriz não
    # é positiva definida, em vez de devolver lixo numérico.
    L = np.linalg.cholesky(matriz_cov)
    L_inv = np.linalg.inv(L)
    matriz_cov_inv = L_inv.T @ L_inv

    uns = np.ones(len(ativos_validos_))
    numerador = matriz_cov_inv @ uns
    denominador = uns @ numerador
    if denominador == 0:
        return None
    return limitar_alavancagem(numerador / denominador)

# =============================================
# LOOP MENSAL
# =============================================

for mes in pd.date_range(start=data_inicio_simulacao, end=data_fim_simulacao, freq='MS'):

    data_rebalanceamento = mes + pd.offsets.BMonthBegin(0)
    um_ano_antes = data_rebalanceamento - pd.DateOffset(years=1)

    primeira_data_disponivel = tabela_ativos['Data'].min()
    if um_ano_antes < primeira_data_disponivel:
        um_ano_antes = primeira_data_disponivel

    dados_ultimo_ano = recortar(um_ano_antes, data_rebalanceamento - pd.Timedelta(nanoseconds=1))
    if len(dados_ultimo_ano) < 2:
        dados_ultimo_ano = tabela_ativos[tabela_ativos['Data'] < data_rebalanceamento].copy()
        if len(dados_ultimo_ano) < 2:
            continue

    retornos_historicos = dados_ultimo_ano[lista_ativos].pct_change().dropna()
    if retornos_historicos.empty:
        continue

    # ---- SELEÇÃO DE ATIVOS VÁLIDOS ----
    ativos_validos = lista_ativos.copy()
    selecao_bem_sucedida = False

    for tentativa in range(len(lista_ativos)):
        if len(ativos_validos) <= 1:
            break

        retornos_ativos_validos = retornos_historicos[ativos_validos]
        volatilidade_anualizada = retornos_ativos_validos.std() * (252 ** 0.5) * 100

        baixa_vol = volatilidade_anualizada[volatilidade_anualizada < limiar_volatilidade_minima]
        if not baixa_vol.empty:
            for ativo in baixa_vol.index:
                if ativo in ativos_validos:
                    ativos_validos.remove(ativo)
            if len(ativos_validos) <= 1:
                break

        retornos_ativos_validos = retornos_historicos[ativos_validos]
        try:
            np.linalg.cholesky(retornos_ativos_validos.cov())
            selecao_bem_sucedida = True
            break
        except np.linalg.LinAlgError:
            menor_vol = retornos_ativos_validos.std().idxmin()
            if menor_vol in ativos_validos:
                ativos_validos.remove(menor_vol)
            if len(ativos_validos) <= 1:
                break
            if len(ativos_validos) == 2:
                selecao_bem_sucedida = True
                break

    if not selecao_bem_sucedida or len(ativos_validos) < 2:
        continue

    pesos_otimos = calcular_pesos_minima_variancia(retornos_historicos, ativos_validos)
    if pesos_otimos is None:
        continue

    # ---- RETORNO DO MÊS ----
    inicio_mes = mes
    fim_mes = mes + pd.offsets.MonthEnd(0)
    fim_periodo = min(fim_mes, data_fim_simulacao)
    dados_mes = recortar(inicio_mes, fim_periodo)
    if dados_mes.empty:
        continue

    # Preço do último pregão ANTES do mês é a base do rebalanceamento; sem ele
    # o retorno da virada do mês se perde.
    anteriores = recortar(tabela_ativos['Data'].iloc[0], inicio_mes - pd.Timedelta(nanoseconds=1))
    if anteriores.empty:
        precos_base = dados_mes[ativos_validos].iloc[0].to_numpy(dtype=float)
    else:
        precos_base = anteriores[ativos_validos].iloc[-1].to_numpy(dtype=float)

    precos_mes = dados_mes[ativos_validos].to_numpy(dtype=float)
    fatores = (precos_mes / precos_base) @ np.asarray(pesos_otimos, dtype=float)
    valores = retorno_acumulado * fatores

    for data_texto, valor in zip(dados_mes['Data'].dt.strftime('%Y-%m-%d'), valores):
        resultado.append({"data": data_texto, "valor": float(valor - 1)})

    retorno_acumulado = float(valores[-1])

resultado`;
