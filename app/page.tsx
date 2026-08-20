import PaginaPrincipal from "./components/PaginaPrincipal";
import { lerTickersPorBase, lerEstreiasPorBase, lerStatus } from "./lib/fonte-dados";

export default function Home() {
  // Só as listas de tickers e o status dos dados viajam no HTML. As cotações
  // vêm depois, do CDN direto para o worker do Python.
  const tickersPorBase = lerTickersPorBase();
  const estreiasPorBase = lerEstreiasPorBase();
  const status = lerStatus();

  return (
    <PaginaPrincipal
      tickersPorBase={tickersPorBase}
      estreiasPorBase={estreiasPorBase}
      status={status}
    />
  );
}
