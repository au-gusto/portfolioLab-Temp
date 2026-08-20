/**
 * app/lib/tema.ts
 *
 * Assinatura do tema atual, para quem precisa reagir à troca.
 *
 * O tema não é estado do React: mora no atributo `data-tema` do <html>,
 * escrito antes da primeira pintura por um script no layout — é o que evita a
 * tela piscar branca ao carregar. Quem quiser saber dele usa
 * `useSyncExternalStore(assinarTema, ...)`, que existe justamente para assinar
 * estado que vive fora do React.
 *
 * O conjunto de ouvintes precisa ser um só, compartilhado. Enquanto ele morava
 * dentro do botão de alternar, qualquer outro componente que assinasse criava
 * a própria lista e nunca era avisado da troca — o gráfico continuaria com as
 * cores do tema anterior até alguma outra coisa forçar um render.
 */

const ouvintes = new Set<() => void>();

export type Tema = "claro" | "escuro";

export function assinarTema(aoMudar: () => void) {
  ouvintes.add(aoMudar);
  // Sem escolha salva o atributo não existe e quem manda é o sistema, então a
  // media query também é fonte de mudança.
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", aoMudar);
  return () => {
    ouvintes.delete(aoMudar);
    mq.removeEventListener("change", aoMudar);
  };
}

/** Avisa todo mundo que o tema mudou. Chamado por quem escreve o atributo. */
export function notificarTema() {
  ouvintes.forEach((f) => f());
}

export function lerTemaNoCliente(): Tema {
  const explicito = document.documentElement.dataset.tema as Tema | undefined;
  if (explicito === "claro" || explicito === "escuro") return explicito;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

/** No servidor não dá para saber; o React reconcilia depois da hidratação. */
export function lerTemaNoServidor(): Tema {
  return "escuro";
}

/**
 * Lê um número definido como variável CSS no <html>.
 *
 * Serve para valores que mudam com o tema mas precisam chegar ao JavaScript —
 * o caso concreto é a opacidade das linhas de benchmark, que no claro vão a
 * cheio e no escuro recuam.
 */
export function lerNumeroDoTema(variavel: string, padrao: number): number {
  const bruto = getComputedStyle(document.documentElement).getPropertyValue(variavel);
  const n = Number(bruto);
  return Number.isFinite(n) && bruto.trim() !== "" ? n : padrao;
}
