/**
 * app/lib/amostragem.ts
 *
 * Reduz a quantidade de pontos que vai para o gráfico.
 *
 * Uma simulação de 6 anos produz ~1.580 pregões por estratégia. Num gráfico de
 * 900 px isso é quase dois pontos por pixel: o navegador calcula coordenada,
 * monta caminho SVG e pinta o dobro do que a tela consegue mostrar. Em máquina
 * fraca esse desenho chega a custar mais que o cálculo inteiro.
 *
 * Os números exibidos (retorno final, cartões) continuam vindo da série
 * completa — isto afeta só o traçado.
 */

/**
 * Largest Triangle Three Buckets.
 *
 * Amostragem ingênua (pegar 1 a cada N) apaga picos e vales, e justamente os
 * extremos são o que interessa numa curva de patrimônio. O LTTB divide a série
 * em faixas e escolhe de cada uma o ponto que forma o maior triângulo com o
 * vizinho anterior e a média da faixa seguinte — o que preserva a silhueta.
 */
export function reduzirPontos<T>(
  pontos: T[],
  alvo: number,
  valorDe: (p: T) => number
): T[] {
  if (alvo >= pontos.length || alvo < 3) return pontos;

  const saida: T[] = [pontos[0]];
  const passo = (pontos.length - 2) / (alvo - 2);
  let indiceAnterior = 0;

  for (let i = 0; i < alvo - 2; i++) {
    // Média da faixa seguinte, usada como terceiro vértice do triângulo
    const inicioProxima = Math.floor((i + 1) * passo) + 1;
    const fimProxima = Math.min(Math.floor((i + 2) * passo) + 1, pontos.length);
    const tamanho = fimProxima - inicioProxima;

    let mediaX = 0;
    let mediaY = 0;
    for (let j = inicioProxima; j < fimProxima; j++) {
      mediaX += j;
      mediaY += valorDe(pontos[j]);
    }
    if (tamanho > 0) {
      mediaX /= tamanho;
      mediaY /= tamanho;
    }

    const inicio = Math.floor(i * passo) + 1;
    const fim = Math.floor((i + 1) * passo) + 1;
    const xAnterior = indiceAnterior;
    const yAnterior = valorDe(pontos[indiceAnterior]);

    let maiorArea = -1;
    let escolhido = inicio;
    for (let j = inicio; j < Math.min(fim, pontos.length); j++) {
      const area = Math.abs(
        (xAnterior - mediaX) * (valorDe(pontos[j]) - yAnterior) -
        (xAnterior - j) * (mediaY - yAnterior)
      );
      if (area > maiorArea) {
        maiorArea = area;
        escolhido = j;
      }
    }

    saida.push(pontos[escolhido]);
    indiceAnterior = escolhido;
  }

  saida.push(pontos[pontos.length - 1]);
  return saida;
}

/** Quantos pontos vale a pena desenhar. Acima disso o olho não distingue. */
/**
 * Quantos pontos cada linha desenha.
 *
 * O gráfico tem cerca de 950px de largura. Com 500 pontos eram dois por
 * pixel — o segundo nunca chegava a aparecer, mas custava caminho de SVG,
 * memória e, sobretudo, tempo de recálculo quando a área muda de tamanho.
 * 280 dá um ponto a cada ~3px, que é indistinguível a olho e corta quase pela
 * metade o trabalho de redesenhar.
 */
export const PONTOS_NO_GRAFICO = 280;
