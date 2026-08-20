export const codigoParidade = `import pandas as pd
import numpy as np
from scipy.optimize import minimize

# tabela_precos já vem pronta do carregamento: datas em datetime, preços em
# float, linhas ordenadas. Montá-la aqui custaria ~85 ms por estratégia.
df = tabela_precos
ativos = list(tickers)

def recortar(inicio, fim):
    """Fatia a tabela por data via busca binária, sem máscara booleana."""
    i = np.searchsorted(datas_precos, np.datetime64(inicio), side='left')
    j = np.searchsorted(datas_precos, np.datetime64(fim), side='right')
    return df.iloc[i:j]

inicio = pd.to_datetime(data_inicio)
fim = pd.to_datetime(data_fim)

def calculate_risk_contributions(x, cov_matrix):
    sigma_x = np.dot(cov_matrix, x)
    total_risk = np.sqrt(np.dot(x.T, sigma_x))
    marginal_risk = sigma_x / total_risk if total_risk != 0 else np.zeros_like(sigma_x)
    return x * marginal_risk, total_risk

def objective(x, cov_matrix, b):
    variance = float(np.dot(x.T, np.dot(cov_matrix, x)))
    sqrt_variance = np.sqrt(variance) if variance > 0 else 1.0
    w = x / sqrt_variance
    return 0.5 * np.dot(w, b / (w + 1e-18)) - np.dot(b, np.log(w + 1e-18))

def gradiente(x, cov_matrix, b):
    """Derivada exata da objetivo. Sem ela o SLSQP estima o gradiente por
    diferenças finitas — uma avaliação extra por ativo a cada passo."""
    sigma_x = np.dot(cov_matrix, x)
    variancia = float(np.dot(x, sigma_x))
    if variancia <= 0:
        return np.zeros_like(x)
    return -b / (x + 1e-18) + sigma_x / variancia

def montar_b(ativos_do_mes):
    """Fatia de risco por ativo. Sem orcamento, 1/n (paridade classica).
    Com orcamento, o que o usuario pediu — renormalizado sobre os ativos que
    sobreviveram ao filtro de volatilidade."""
    n = len(ativos_do_mes)
    if not orcamento_risco:
        return np.ones(n) / n
    alvo = np.array([float(orcamento_risco.get(a, 0.0)) for a in ativos_do_mes], dtype=float)
    total = alvo.sum()
    return np.ones(n) / n if total <= 0 else alvo / total

def solve_paridade(cov_matrix, ativos_do_mes):
    n = len(ativos_do_mes)
    b = montar_b(ativos_do_mes)
    x0 = np.ones(n) / n
    result = minimize(
        objective, x0, args=(cov_matrix, b),
        jac=gradiente,
        method='SLSQP',
        bounds=[(1e-19, 1)] * n,
        constraints={'type': 'eq', 'fun': lambda x: np.sum(x) - 1.0,
                     'jac': lambda x: np.ones(n)},
        options={'maxiter': 1000, 'ftol': 1e-9}
    )
    if not result.success:
        return None
    return result.x

quantities = {ativo: 0.0 for ativo in ativos}
resultado = []
alocacao_mensal = []
min_vol_threshold = 13

# O aporte inicial vale para o PRIMEIRO mes efetivamente alocado.
# Comparar 'month == inicio' nao funcionava: date_range(freq='MS') devolve
# inicios de mes, entao com uma data como 03/01 o primeiro item ja e 01/02 e
# a igualdade nunca acontecia — o aporte inicial era silenciosamente perdido.
primeiro_aporte = True

for month in pd.date_range(start=inicio, end=fim, freq='MS'):
    investment_date = month + pd.offsets.BMonthBegin(0)
    investment_datetime = investment_date.replace(hour=16, minute=56, second=0)
    one_year_before = investment_date - pd.DateOffset(years=1)

    # Garantir que one_year_before não seja anterior ao primeiro dado disponível
    first_date = df['Data'].min()
    if one_year_before < first_date:
        one_year_before = first_date

    yearly_data = recortar(one_year_before, investment_date - pd.Timedelta(nanoseconds=1))
    yearly_dataaux = recortar(one_year_before, investment_datetime)

    # Se não houver dados anuais suficientes, usa todos os dados disponíveis
    if len(yearly_data) < 2:
        yearly_data = df[df['Data'] < investment_date].copy()
        yearly_dataaux = df[df['Data'] <= investment_datetime].copy()
        if len(yearly_data) < 2:
            continue

    returns = yearly_data[ativos].pct_change().dropna()
    if returns.empty:
        continue

    current_assets = ativos.copy()
    success = False

    for attempt in range(len(ativos)):
        if len(current_assets) <= 1:
            break

        current_returns = returns[current_assets]
        volatilities = current_returns.std() * (252 ** 0.5) * 100

        low_vol_assets = volatilities[volatilities < min_vol_threshold]
        if not low_vol_assets.empty:
            for asset in low_vol_assets.index:
                if asset in current_assets:
                    current_assets.remove(asset)
            if len(current_assets) <= 1:
                success = False
                break

        if len(current_assets) <= 1:
            break

        current_returns = returns[current_assets]
        cov_matrix = current_returns.cov().values * 1e-2

        try:
            np.linalg.cholesky(cov_matrix)
            success = True
            break
        except np.linalg.LinAlgError:
            if len(current_assets) <= 1:
                break
            volatilities = current_returns.std()
            min_vol_asset = volatilities.idxmin()
            if min_vol_asset in current_assets:
                current_assets.remove(min_vol_asset)
            if len(current_assets) <= 1:
                success = False
                break

    if not success:
        # Se sobrou apenas um ativo, investe 100% nele
        if len(current_assets) == 1:
            only_asset = current_assets[0]
            aporte = aporte_inicial if primeiro_aporte else aporte_mensal
            primeiro_aporte = False
            if yearly_dataaux.empty:
                continue
            current_price = yearly_dataaux.iloc[-1][only_asset]
            if current_price > 0:
                quantities[only_asset] += aporte / current_price

            pesos_ativos = {asset: 0.0 for asset in ativos}
            pesos_ativos[only_asset] = 1.0
            alocacao_mensal.append({
                "data": investment_date.strftime('%Y-%m-%d'),
                "pesos": pesos_ativos
            })

            start_of_month = month
            end_of_month = month + pd.offsets.MonthEnd(0)
            # Limita até a data final
            data_fim_periodo = min(end_of_month, fim)
            daily_data = recortar(start_of_month, data_fim_periodo)
            if not daily_data.empty:
                # Valor da carteira dia a dia = matriz de preços x vetor de
                # quantidades. Antes era um iterrows com uma soma em Python por
                # dia — mais caro que o otimizador inteiro.
                vetor_qtd = np.array([quantities[a] for a in ativos], dtype=float)
                valores = daily_data[ativos].to_numpy(dtype=float) @ vetor_qtd
                for data_texto, valor in zip(daily_data['Data'].dt.strftime('%Y-%m-%d'), valores):
                    resultado.append({"data": data_texto, "valor": float(valor)})
        continue

    if len(current_assets) < 2:
        continue

    cov_matrix = returns[current_assets].cov().values * 1e-2
    optimal_x = solve_paridade(cov_matrix, current_assets)

    if optimal_x is None:
        continue

    aporte = aporte_inicial if primeiro_aporte else aporte_mensal
    primeiro_aporte = False
    if yearly_dataaux.empty:
        continue
    current_prices = yearly_dataaux.iloc[-1][current_assets].to_dict()

    for i, asset in enumerate(current_assets):
        price = float(current_prices[asset])
        if price > 0:
            quantities[asset] += (aporte * optimal_x[i]) / price

    pesos_ativos = {asset: 0.0 for asset in ativos}
    for i, asset in enumerate(current_assets):
        pesos_ativos[asset] = float(optimal_x[i])
    alocacao_mensal.append({
        "data": investment_date.strftime('%Y-%m-%d'),
        "pesos": pesos_ativos
    })

    start_of_month = month
    end_of_month = month + pd.offsets.MonthEnd(0)
    # Limita até a data final
    data_fim_periodo = min(end_of_month, fim)
    daily_data = recortar(start_of_month, data_fim_periodo)

    if not daily_data.empty:
        vetor_qtd = np.array([quantities[a] for a in ativos], dtype=float)
        valores = daily_data[ativos].to_numpy(dtype=float) @ vetor_qtd
        for data_texto, valor in zip(daily_data['Data'].dt.strftime('%Y-%m-%d'), valores):
            resultado.append({"data": data_texto, "valor": float(valor)})

(alocacao_mensal if ('modo_retorno' in globals() and modo_retorno == 'alocacao') else resultado)`;