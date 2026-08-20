export const codigoParidade_rentabilidade = `import pandas as pd
import numpy as np
from scipy.optimize import minimize

# =============================================
# PREPARAÇÃO DOS DADOS
# =============================================

# tabela_precos já vem pronta do carregamento: datas em datetime, preços em
# float, linhas ordenadas. Montá-la aqui custaria ~85 ms por estratégia.
tabela_ativos = tabela_precos
lista_ativos = list(tickers)

data_inicio_simulacao = pd.to_datetime(data_inicio)
data_fim_simulacao = pd.to_datetime(data_fim)

# Lista que vai acumular os resultados diários {data, valor}
resultado = []

# Lista que vai acumular a alocação mensal {data, pesos} (usada pelos gráficos)
alocacao_mensal = []

# Fator de retorno acumulado — começa em 1.0 (representa 0% de retorno)
retorno_acumulado = 1.0

# Limiar mínimo de volatilidade anualizada (%) para um ativo entrar na paridade.
# Ativos quase parados distorcem a matriz de covariância.
limiar_volatilidade_minima = 13

# =============================================
# FUNÇÕES
# =============================================

def recortar(inicio, fim):
    """Fatia a tabela por data sem varrer as 2 mil linhas com máscara booleana.

    As datas estão ordenadas, então searchsorted acha os limites em O(log n) e
    o .iloc devolve uma fatia. A versão com (Data >= a) & (Data < b) construía
    dois vetores booleanos do tamanho da tabela inteira a cada mês."""
    i = np.searchsorted(datas_precos, np.datetime64(inicio), side='left')
    j = np.searchsorted(datas_precos, np.datetime64(fim), side='right')
    return tabela_ativos.iloc[i:j]

# Contribuição de risco de cada ativo na carteira
def calcular_contribuicoes_risco(x, matriz_covariancia):
    risco_ponderado = np.dot(matriz_covariancia, x)
    risco_total = np.sqrt(np.dot(x.T, risco_ponderado))
    risco_marginal = risco_ponderado / risco_total if risco_total != 0 else np.zeros_like(risco_ponderado)
    return x * risco_marginal, risco_total

# Função objetivo (Spinu, 2013). Note que 0.5 * w·(b/w) é a constante 0.5,
# porque w = x/sqrt(x'Σx) faz w'Σw valer 1 por construção.
def funcao_objetivo(x, matriz_covariancia, vetor_alvo):
    variancia = float(np.dot(x.T, np.dot(matriz_covariancia, x)))
    raiz_variancia = np.sqrt(variancia) if variancia > 0 else 1.0
    pesos_normalizados = x / raiz_variancia
    return 0.5 * np.dot(pesos_normalizados, vetor_alvo / (pesos_normalizados + 1e-18)) - np.dot(vetor_alvo, np.log(pesos_normalizados + 1e-18))

def gradiente_objetivo(x, matriz_covariancia, vetor_alvo):
    """Derivada exata da função acima.

    Sem ela o SLSQP estima o gradiente por diferenças finitas, o que custa uma
    avaliação extra por ativo a cada passo: eram 96 chamadas da objetivo por
    otimização contra 19 com o gradiente. O ponto de chegada é o mesmo."""
    risco_ponderado = np.dot(matriz_covariancia, x)
    variancia = float(np.dot(x, risco_ponderado))
    if variancia <= 0:
        return np.zeros_like(x)
    return -vetor_alvo / (x + 1e-18) + risco_ponderado / variancia

def montar_vetor_alvo(ativos):
    """Fatia de risco que cada ativo deve carregar.

    Sem orcamento definido pelo usuario, todos carregam 1/n — que e a Paridade
    de Risco classica. Com orcamento, cada um carrega o que foi pedido (secao
    4.3 do artigo: PDR, Portfolio com Distribuicao de Risco).

    A renormalizacao no fim e obrigatoria: o filtro de volatilidade minima pode
    ter descartado ativos, e o vetor precisa somar 1 sobre os que sobraram."""
    n = len(ativos)
    if not orcamento_risco:
        return np.ones(n) / n

    alvo = np.array([float(orcamento_risco.get(a, 0.0)) for a in ativos], dtype=float)
    total = alvo.sum()
    if total <= 0:
        return np.ones(n) / n
    return alvo / total

def resolver_paridade(matriz_covariancia, ativos):
    numero_ativos = len(ativos)
    vetor_alvo = montar_vetor_alvo(ativos)
    pesos_iniciais = np.ones(numero_ativos) / numero_ativos

    resultado_otimizacao = minimize(
        funcao_objetivo,
        pesos_iniciais,
        args=(matriz_covariancia, vetor_alvo),
        jac=gradiente_objetivo,
        method='SLSQP',
        bounds=[(1e-19, 1)] * numero_ativos,
        constraints={
            'type': 'eq',
            'fun': lambda x: np.sum(x) - 1.0,
            'jac': lambda x: np.ones(numero_ativos),
        },
        options={'maxiter': 1000, 'ftol': 1e-9}
    )

    if not resultado_otimizacao.success:
        return None

    return resultado_otimizacao.x

# =============================================
# LOOP MENSAL
# =============================================

primeira_data_disponivel = tabela_ativos['Data'].iloc[0]

for mes in pd.date_range(start=data_inicio_simulacao, end=data_fim_simulacao, freq='MS'):

    # Primeiro dia útil do mês — data do rebalanceamento
    data_rebalanceamento = mes + pd.offsets.BMonthBegin(0)

    # Janela de 1 ano de histórico usada para estimar risco
    um_ano_antes = data_rebalanceamento - pd.DateOffset(years=1)
    if um_ano_antes < primeira_data_disponivel:
        um_ano_antes = primeira_data_disponivel

    dados_ultimo_ano = recortar(um_ano_antes, data_rebalanceamento - pd.Timedelta(nanoseconds=1))

    if len(dados_ultimo_ano) < 2:
        dados_ultimo_ano = recortar(primeira_data_disponivel, data_rebalanceamento - pd.Timedelta(nanoseconds=1))
        if len(dados_ultimo_ano) < 2:
            continue

    retornos_historicos = dados_ultimo_ano[lista_ativos].pct_change().dropna()
    if retornos_historicos.empty:
        continue

    # ---- SELEÇÃO DE ATIVOS VÁLIDOS ----
    ativos_validos = lista_ativos.copy()
    otimizacao_bem_sucedida = False

    for tentativa in range(len(lista_ativos)):
        if len(ativos_validos) <= 1:
            break

        retornos_ativos_validos = retornos_historicos[ativos_validos]
        volatilidade_anualizada = retornos_ativos_validos.std() * (252 ** 0.5) * 100

        ativos_baixa_volatilidade = volatilidade_anualizada[volatilidade_anualizada < limiar_volatilidade_minima]
        if not ativos_baixa_volatilidade.empty:
            for ativo in ativos_baixa_volatilidade.index:
                if ativo in ativos_validos:
                    ativos_validos.remove(ativo)
            if len(ativos_validos) <= 1:
                break
            retornos_ativos_validos = retornos_historicos[ativos_validos]

        matriz_cov = retornos_ativos_validos.cov().values * 1e-2

        try:
            # Cholesky confirma que a matriz é positiva definida
            np.linalg.cholesky(matriz_cov)
            otimizacao_bem_sucedida = True
            break
        except np.linalg.LinAlgError:
            ativo_menor_vol = volatilidade_anualizada.idxmin()
            if ativo_menor_vol in ativos_validos:
                ativos_validos.remove(ativo_menor_vol)
            if len(ativos_validos) <= 1:
                break

    if not otimizacao_bem_sucedida or len(ativos_validos) < 2:
        continue

    pesos_otimos = resolver_paridade(matriz_cov, ativos_validos)
    if pesos_otimos is None:
        continue

    pesos_ativos = {ativo: 0.0 for ativo in lista_ativos}
    for i, ativo in enumerate(ativos_validos):
        pesos_ativos[ativo] = float(pesos_otimos[i])
    # Guarda tambem o alvo de risco usado no mes: e o que permite comparar
    # "risco pedido" com "risco entregue" no grafico.
    alvo_do_mes = montar_vetor_alvo(ativos_validos)
    risco_alvo = {ativo: 0.0 for ativo in lista_ativos}
    for i, ativo in enumerate(ativos_validos):
        risco_alvo[ativo] = float(alvo_do_mes[i])

    alocacao_mensal.append({
        "data": data_rebalanceamento.strftime('%Y-%m-%d'),
        "pesos": pesos_ativos,
        "risco_alvo": risco_alvo
    })

    # ---- RETORNO DIÁRIO DO MÊS ----
    inicio_mes = mes
    fim_periodo = min(mes + pd.offsets.MonthEnd(0), data_fim_simulacao)
    dados_mes = recortar(inicio_mes, fim_periodo)
    if dados_mes.empty:
        continue

    # Preço do último pregão ANTES do mês: é a base do rebalanceamento. Sem ele
    # o retorno da virada do mês se perdia (~5% dos pregões entravam como zero).
    anteriores = recortar(primeira_data_disponivel, inicio_mes - pd.Timedelta(nanoseconds=1))
    if anteriores.empty:
        precos_base = dados_mes[ativos_validos].iloc[0].to_numpy(dtype=float)
    else:
        precos_base = anteriores[ativos_validos].iloc[-1].to_numpy(dtype=float)

    # Rebalanceamento MENSAL: pesos fixos na virada, carteira flutuando até o
    # mês seguinte. Toda a conta do mês vira uma multiplicação de matrizes —
    # percorrer dia a dia com iterrows custava mais que o otimizador inteiro.
    precos_mes = dados_mes[ativos_validos].to_numpy(dtype=float)
    fatores = (precos_mes / precos_base) @ np.asarray(pesos_otimos, dtype=float)
    valores = retorno_acumulado * fatores

    for data_texto, valor in zip(dados_mes['Data'].dt.strftime('%Y-%m-%d'), valores):
        resultado.append({"data": data_texto, "valor": float(valor - 1)})

    retorno_acumulado = float(valores[-1])

(alocacao_mensal if ('modo_retorno' in globals() and modo_retorno == 'alocacao') else resultado)`;
