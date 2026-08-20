/**
 * app/estrategias/modelo.ts
 *
 * Ponto de partida de uma estratégia escrita pelo usuário.
 *
 * Não é um exemplo vazio de propósito: ele já roda e devolve um resultado
 * válido (peso igual entre os ativos). Começar de algo que funciona e ir
 * mudando é bem mais fácil do que encarar um arquivo em branco sem saber
 * quais variáveis existem nem qual formato de saída o gráfico espera.
 */

export const ESQUELETO_ESTRATEGIA = `import pandas as pd
import numpy as np

# ─────────────────────────────────────────────────────────────────────────────
# O QUE VOCÊ RECEBE (já pronto, não precisa carregar nada)
#
#   tabela_precos    cotações de todos os ativos da B3
#                    coluna 'Data' (datetime) + uma coluna por ticker (float)
#   datas_precos     as datas em numpy, para usar com np.searchsorted
#   tabela_cdi       colunas 'data' e 'valor' (% ao dia)
#   tabela_ibov      colunas 'Data' e 'IBOV'
#   tabela_indices   colunas 'Mes', 'IPCA' e 'Poupanca' (% ao mês)
#
#   tickers          os ativos que você escolheu na lateral
#   data_inicio      texto 'AAAA-MM-DD'
#   data_fim         texto 'AAAA-MM-DD'
#   aporte_inicial   número (só usado no modo Patrimônio)
#   aporte_mensal    número (idem)
#   orcamento_risco  {ticker: fração}, vazio se você não definiu
#
# O QUE VOCÊ DEVE DEVOLVER
#
#   Uma lista de dicionários {"data": 'AAAA-MM-DD', "valor": número}.
#   No modo Rentabilidade, 'valor' é o retorno acumulado (0.03 = +3%).
#   No modo Patrimônio, é o valor da carteira em reais.
#
#   A ÚLTIMA LINHA do arquivo precisa ser a expressão com o resultado.
# ─────────────────────────────────────────────────────────────────────────────

tabela_ativos = tabela_precos
lista_ativos = list(tickers)

inicio = pd.to_datetime(data_inicio)
fim = pd.to_datetime(data_fim)

def recortar(de, ate):
    """Fatia a tabela por data. Busca binária, sem varrer tudo."""
    i = np.searchsorted(datas_precos, np.datetime64(de), side='left')
    j = np.searchsorted(datas_precos, np.datetime64(ate), side='right')
    return tabela_ativos.iloc[i:j]

resultado = []
retorno_acumulado = 1.0
primeira_data = tabela_ativos['Data'].iloc[0]

# Rebalanceia todo mês, no primeiro dia útil.
for mes in pd.date_range(start=inicio, end=fim, freq='MS'):
    fim_do_mes = min(mes + pd.offsets.MonthEnd(0), fim)
    dados_mes = recortar(mes, fim_do_mes)
    if dados_mes.empty:
        continue

    # ►►► MUDE AQUI: decida o peso de cada ativo neste mês. ◄◄◄
    # Agora é peso igual para todos (1/N). Para algo mais esperto, olhe a
    # janela de histórico anterior ao mês:
    #     janela = recortar(mes - pd.DateOffset(years=1), mes - pd.Timedelta(nanoseconds=1))
    #     retornos = janela[lista_ativos].pct_change().dropna()
    #     cov = retornos.cov().values
    pesos = np.full(len(lista_ativos), 1.0 / len(lista_ativos))

    # Preço do último pregão ANTES do mês: é a base do rebalanceamento.
    # Sem isso o retorno da virada do mês se perde.
    anteriores = recortar(primeira_data, mes - pd.Timedelta(nanoseconds=1))
    if anteriores.empty:
        precos_base = dados_mes[lista_ativos].iloc[0].to_numpy(dtype=float)
    else:
        precos_base = anteriores[lista_ativos].iloc[-1].to_numpy(dtype=float)

    # A carteira flutua durante o mês, com os pesos fixados na virada.
    precos_mes = dados_mes[lista_ativos].to_numpy(dtype=float)
    fatores = (precos_mes / precos_base) @ pesos
    valores = retorno_acumulado * fatores

    for data_texto, valor in zip(dados_mes['Data'].dt.strftime('%Y-%m-%d'), valores):
        resultado.append({"data": data_texto, "valor": float(valor - 1)})

    retorno_acumulado = float(valores[-1])

resultado`;
