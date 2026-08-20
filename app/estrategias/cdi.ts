export const codigoCDI = `import pandas as pd

# tabela_cdi já vem pronta do carregamento.
dados_cdi_df = tabela_cdi

inicio = pd.to_datetime(data_inicio)
fim = pd.to_datetime(data_fim)

saldo = 0
resultado = []
meses = pd.date_range(start=inicio, end=fim, freq='MS')

for i, month in enumerate(meses):
    investment_date = month + pd.offsets.BMonthBegin(0)
    end_of_month = month + pd.offsets.MonthEnd(0)
    data_fim_periodo = min(end_of_month, fim)

    aporte = aporte_inicial if i == 0 else aporte_mensal
    saldo += aporte

    cdi_mes = dados_cdi_df[
        (dados_cdi_df['data'] >= investment_date) &
        (dados_cdi_df['data'] <= data_fim_periodo)
    ]

    for _, row in cdi_mes.iterrows():
        rendimento_dia = row['valor'] / 100
        saldo *= (1 + rendimento_dia)
        resultado.append({"data": row['data'].strftime('%Y-%m-%d'), "valor": float(saldo)})

resultado`;