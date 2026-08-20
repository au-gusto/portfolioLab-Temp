import PaginaPrincipal from "./components/PaginaPrincipal";
import { lerTickers, lerStatus } from "./lib/fonte-dados";

export default function Home() {
  // Só a lista de tickers e o status dos dados viajam no HTML. As cotações
  // vêm depois, por /api/dados/precos, buscadas pelo worker do Python.
  const tickers = lerTickers();
  const status = lerStatus();

  return <PaginaPrincipal tickers={tickers} status={status} />;
}
