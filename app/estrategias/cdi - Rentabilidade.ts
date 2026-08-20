export const codigoCDI_rentabilidade = `import pandas as pd

# tabela_cdi já vem pronta do carregamento (datas e valores convertidos).
dados_cdi_df = tabela_cdi

# Define o período da simulação
inicio = pd.to_datetime(data_inicio)
fim = pd.to_datetime(data_fim)

# O CDI precisa cobrir EXATAMENTE a mesma janela das estratégias de carteira,
# senão a comparação fica torta. Elas percorrem pd.date_range(freq='MS'), que
# começa no primeiro dia 1º a partir de data_inicio — com 02/01, por exemplo,
# a carteira só arranca em 01/02. Antes o CDI começava em 02/01 e acumulava um
# mês inteiro de rendimento a mais, aparecendo melhor do que realmente foi.
meses = pd.date_range(start=inicio, end=fim, freq='MS')
if len(meses) > 0:
    inicio_alinhado = meses[0]
    fim_alinhado = min(meses[-1] + pd.offsets.MonthEnd(0), fim)
else:
    inicio_alinhado, fim_alinhado = inicio, fim

# Filtra apenas os dias dentro do período e ordena por data
df_periodo = dados_cdi_df[
    (dados_cdi_df['data'] >= inicio_alinhado) & (dados_cdi_df['data'] <= fim_alinhado)
].sort_values('data')

resultado = []
retorno_acumulado = 1.0  # começa em 0% (fator 1)

for _, linha in df_periodo.iterrows():
    # Converte o valor do CDI (ex: 0.1% → 0.001) e aplica ao fator acumulado
    fator_diario = 1 + linha['valor'] / 100
    retorno_acumulado *= fator_diario

    resultado.append({
        "data": linha['data'].strftime('%Y-%m-%d'),
        "valor": retorno_acumulado - 1  # rentabilidade acumulada (ex: 0.03 = 3%)
    })

resultado`;