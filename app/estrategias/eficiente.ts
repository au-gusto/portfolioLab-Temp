export const codigoEficiente = `import pandas as pd
import numpy as np

# tabela_precos e tabela_cdi já vêm prontas do carregamento: datas em datetime,
# valores em float, linhas ordenadas. Montá-las aqui custaria ~85 ms por
# estratégia, repetidos a cada simulação.
df = tabela_precos
ativos = list(tickers)
cdi_df = tabela_cdi

def recortar(inicio_, fim_):
    """Fatia a tabela por data via busca binária, sem máscara booleana."""
    i = np.searchsorted(datas_precos, np.datetime64(inicio_), side='left')
    j = np.searchsorted(datas_precos, np.datetime64(fim_), side='right')
    return df.iloc[i:j]

inicio = pd.to_datetime(data_inicio)
fim = pd.to_datetime(data_fim)

quantities = {ativo: 0.0 for ativo in ativos}
resultado = []
min_vol_threshold = 13

def filter_cdi_data(month, df_cdi, df_assets):
    one_year_before = month - pd.DateOffset(years=1)
    cdi_filtered = df_cdi[(df_cdi['data'] >= one_year_before) & (df_cdi['data'] < month)].copy()
    cdi_filtered['data'] = cdi_filtered['data'].dt.normalize()
    cdi_filtered = cdi_filtered[cdi_filtered['data'].isin(df_assets['Data'].dt.normalize())]
    return cdi_filtered

# =============================================
# TETO DE ALAVANCAGEM
# =============================================

# Markowitz sem restricao produz pesos que somam 1 mas podem ser enormes em
# modulo: comprar 800% de um papel vendendo 700% de outro tambem soma 1. A
# carteira resultante e matematicamente otima e financeiramente impossivel —
# era dai que saia o retorno de +6.042.416% no historico completo.
#
# O limite e a exposicao BRUTA maxima: soma dos modulos dos pesos. 2.0 permite,
# por exemplo, 150% comprado contra 50% vendido. Aumente se quiser a carteira
# irrestrita de volta; 1.0 forcaria long-only.
limite_alavancagem = 2.0

def limitar_alavancagem(pesos, limite=limite_alavancagem):
    """Puxa os pesos na direcao do 1/N ate a exposicao bruta caber no limite.

    Encolher na direcao do peso igual (e nao simplesmente multiplicar tudo por
    uma constante) preserva a soma 1: a carteira continua totalmente investida,
    so deixa de ser alavancada. Como a exposicao bruta e convexa no fator de
    mistura, o conjunto que respeita o limite e um intervalo e a busca binaria
    acha a borda com seguranca.
    """
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

def calculate_investment(total_portfolio_value, weights, current_prices, asset_cols):
    quantities2 = {}
    for i, asset in enumerate(asset_cols):
        current_price = current_prices[asset]
        amount_to_invest_in_asset = total_portfolio_value * weights[i]
        if current_price > 0:
            quantities2[asset] = amount_to_invest_in_asset / current_price
        else:
            quantities2[asset] = 0
    return quantities2

# O aporte inicial vale para o PRIMEIRO mes efetivamente alocado.
# Comparar 'month == inicio' nao funcionava: date_range(freq='MS') devolve
# inicios de mes, entao com uma data como 03/01 o primeiro item ja e 01/02 e
# a igualdade nunca acontecia — o aporte inicial era silenciosamente perdido.
primeiro_aporte = True

for month in pd.date_range(start=inicio, end=fim, freq='MS'):
    investment_date = month + pd.offsets.BMonthBegin(0)
    investment_datetime = investment_date.replace(hour=16, minute=56, second=0)
    one_year_before = investment_date - pd.DateOffset(years=1)

    first_date = df['Data'].min()
    if one_year_before < first_date:
        one_year_before = first_date

    yearly_data = recortar(one_year_before, investment_date - pd.Timedelta(nanoseconds=1))
    yearly_dataaux = recortar(one_year_before, investment_datetime)

    if len(yearly_data) < 2:
        yearly_data = df[df['Data'] < investment_date].copy()
        yearly_dataaux = df[df['Data'] <= investment_datetime].copy()
        if len(yearly_data) < 2:
            continue

    cdidiario_filtered = filter_cdi_data(month, cdi_df, yearly_data)
    returns = yearly_data[ativos].pct_change().dropna()

    if returns.empty:
        continue

    current_assets = ativos.copy()
    success = False

    for attempt in range(len(ativos)):
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

        current_returns = returns[current_assets]
        cov_matrix = current_returns.cov()

        try:
            _ = np.linalg.cholesky(cov_matrix)
            success = True
            break
        except np.linalg.LinAlgError:
            volatilities = current_returns.std()
            min_vol_asset = volatilities.idxmin()
            if min_vol_asset in current_assets:
                current_assets.remove(min_vol_asset)
            if len(current_assets) <= 1:
                success = False
                break
            if len(current_assets) == 2:
                success = True
                break

    if not success:
        if len(current_assets) == 1:
            only_asset = current_assets[0]
            aporte = aporte_inicial if primeiro_aporte else aporte_mensal
            primeiro_aporte = False
            current_price = yearly_dataaux.iloc[-1][only_asset]
            if current_price > 0:
                quantities[only_asset] += aporte / current_price

            start_of_month = month
            end_of_month = month + pd.offsets.MonthEnd(0)
            data_fim_periodo = min(end_of_month, fim)
            daily_data = recortar(start_of_month, data_fim_periodo)
            if not daily_data.empty:
                daily_prices = daily_data[ativos].ffill()
                portfolio_daily_values = daily_prices.multiply(list(quantities.values()), axis=1).sum(axis=1)
                for data, valor in zip(daily_data['Data'], portfolio_daily_values):
                    resultado.append({"data": data.strftime('%Y-%m-%d'), "valor": float(valor)})
        continue

    expected_returns = current_returns.mean().values
    e_transposto = np.ones(len(current_assets)).reshape(1, -1)
    CDIRet = cdidiario_filtered['valor'].mean() if not cdidiario_filtered.empty else 0.0
    Rf_e = np.full((len(current_assets), 1), CDIRet / 100)
    M_Rfe = expected_returns.reshape(-1, 1) - Rf_e

    L = np.linalg.cholesky(cov_matrix)
    L_inv = np.linalg.inv(L)
    cov_matrix_inv = L_inv.T @ L_inv

    V_M_Rfe = np.matmul(cov_matrix_inv, M_Rfe).flatten()
    V_eT = np.matmul(e_transposto, cov_matrix_inv)
    Div = np.matmul(V_eT, M_Rfe)[0, 0]
    if Div == 0:
        continue

    percentages = limitar_alavancagem(V_M_Rfe / Div)
    full_percentages = {asset: 0.0 for asset in ativos}
    for asset, pct in zip(current_assets, percentages):
        full_percentages[asset] = pct

    aporte = aporte_inicial if primeiro_aporte else aporte_mensal
    primeiro_aporte = False
    current_prices = yearly_dataaux.iloc[-1][ativos].to_dict()
    new_quantities = calculate_investment(aporte, list(full_percentages.values()), current_prices, ativos)
    for asset in ativos:
        quantities[asset] += new_quantities[asset]

    start_of_month = month
    end_of_month = month + pd.offsets.MonthEnd(0)
    data_fim_periodo = min(end_of_month, fim)
    daily_data = recortar(start_of_month, data_fim_periodo)

    if not daily_data.empty:
        daily_prices = daily_data[ativos].ffill()
        portfolio_daily_values = daily_prices.multiply(list(quantities.values()), axis=1).sum(axis=1)
        for data, valor in zip(daily_data['Data'], portfolio_daily_values):
            resultado.append({"data": data.strftime('%Y-%m-%d'), "valor": float(valor)})

resultado`;