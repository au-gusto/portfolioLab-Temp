/**
 * scripts/espelhar-supabase.mjs
 *
 * Copia as cotações para o Supabase. OPCIONAL — o app não lê daqui.
 *
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/espelhar-supabase.mjs
 *
 * Para que serve, já que a fonte da verdade é o CSV:
 *   - consultar o histórico por SQL sem baixar 1,5 MB;
 *   - base para features que precisem de escrita por usuário (carteira própria);
 *   - manter o projeto ativo (o plano gratuito pausa após 7 dias sem requisição).
 *
 * Se as variáveis não existirem, sai em silêncio: espelho ausente não é erro.
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!URL || !CHAVE) {
  console.log("Supabase nao configurado — espelho ignorado.");
  process.exit(0);
}

const ARQUIVO = path.join(process.cwd(), "public", "Dados", "Dados_Ativos_B3_AdjClose.csv");
const LOTE = 1000;   // o Supabase recusa payloads muito grandes de uma vez

function lerLinhaCSV(linha) {
  const saida = [];
  let atual = "";
  let aspas = false;
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i];
    if (aspas) {
      if (c === '"') {
        if (linha[i + 1] === '"') { atual += '"'; i++; }
        else aspas = false;
      } else atual += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { saida.push(atual); atual = ""; }
    else atual += c;
  }
  saida.push(atual);
  return saida;
}

const supabase = createClient(URL, CHAVE, { auth: { persistSession: false } });

// Só espelhamos o que ainda não está lá: reenviar 186 mil linhas todo dia
// gastaria a cota de egress à toa.
const { data: ultima, error: erroConsulta } = await supabase
  .from("stock_prices")
  .select("date")
  .order("date", { ascending: false })
  .limit(1);

if (erroConsulta) {
  console.error("Falha ao consultar o Supabase:", erroConsulta.message);
  process.exit(1);
}

const desde = ultima?.[0]?.date ?? "1900-01-01";
console.log(`Supabase ja tem ate ${desde}`);

const linhas = fs.readFileSync(ARQUIVO, "utf-8").split(/\r?\n/).filter((l) => l.trim());
const tickers = lerLinhaCSV(linhas[0]).slice(1);

const novas = [];
for (let i = 1; i < linhas.length; i++) {
  const celulas = lerLinhaCSV(linhas[i]);
  const [d, m, a] = celulas[0].split(" ")[0].split("/");
  const data = `${a}-${m}-${d}`;
  if (data <= desde) continue;

  tickers.forEach((ticker, c) => {
    const preco = Number(String(celulas[c + 1]).replace(",", "."));
    if (Number.isFinite(preco) && preco > 0) {
      novas.push({ ticker, date: data, close_price: preco });
    }
  });
}

if (!novas.length) {
  console.log("Nada novo para espelhar.");
  process.exit(0);
}

console.log(`Enviando ${novas.length} linhas em lotes de ${LOTE}...`);
for (let i = 0; i < novas.length; i += LOTE) {
  const { error } = await supabase
    .from("stock_prices")
    .upsert(novas.slice(i, i + LOTE), { onConflict: "ticker,date" });

  if (error) {
    console.error(`Falha no lote ${i / LOTE + 1}:`, error.message);
    process.exit(1);
  }
  process.stdout.write(`\r  ${Math.min(i + LOTE, novas.length)}/${novas.length}`);
}

console.log("\nEspelho atualizado.");
