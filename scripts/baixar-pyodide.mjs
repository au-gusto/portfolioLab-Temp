// Baixa o Pyodide e as bibliotecas que o app usa para public/pyodide/, para o
// app das lojas (Capacitor) levar o Python DENTRO do pacote e funcionar sem
// internet desde a primeira abertura. O site continua usando o jsDelivr.
//
//   node scripts/baixar-pyodide.mjs
//
// A lista de arquivos sai do pyodide-lock.json (dependências de PACOTES), não
// é escrita à mão. Se public/pyodide/VERSAO já bate, não baixa nada.
// A versão tem que ser a mesma de VERSAO_PYODIDE em public/pyodide-worker.js.
import fs from "node:fs";
import path from "node:path";

const VERSAO = "0.29.3";
const CDN = `https://cdn.jsdelivr.net/pyodide/v${VERSAO}/full/`;
const PACOTES = ["numpy", "pandas", "scipy", "micropip"];
// Python puro, fora da distribuição do Pyodide: vêm do PyPI (leitura de .xlsx).
const DO_PYPI = ["openpyxl", "et-xmlfile"];
const DESTINO = path.join(import.meta.dirname, "..", "public", "pyodide");
const NUCLEO = ["pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];

async function baixar(url, nome) {
  const alvo = path.join(DESTINO, nome);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  const bytes = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(alvo, bytes);
  console.log(`  ${nome} (${(bytes.length / 1048576).toFixed(2)} MB)`);
}

fs.mkdirSync(DESTINO, { recursive: true });
const versaoGravada = path.join(DESTINO, "VERSAO");
if (fs.existsSync(versaoGravada) && fs.readFileSync(versaoGravada, "utf8").trim() === VERSAO) {
  console.log(`Pyodide ${VERSAO} já está em public/pyodide/`);
  process.exit(0);
}

console.log(`Baixando Pyodide ${VERSAO}...`);
for (const nome of NUCLEO) await baixar(CDN + nome, nome);

const lock = JSON.parse(fs.readFileSync(path.join(DESTINO, "pyodide-lock.json"), "utf8"));
const precisa = new Set();
const incluir = (nome) => {
  nome = nome.toLowerCase();
  if (precisa.has(nome)) return;
  const p = lock.packages[nome];
  if (!p) throw new Error(`pacote ${nome} não está no pyodide-lock.json`);
  precisa.add(nome);
  (p.depends ?? []).forEach(incluir);
};
PACOTES.forEach(incluir);
for (const nome of precisa) await baixar(CDN + lock.packages[nome].file_name, lock.packages[nome].file_name);

const wheels = [];
for (const nome of DO_PYPI) {
  const info = await (await fetch(`https://pypi.org/pypi/${nome}/json`)).json();
  const whl = info.urls.find((u) => u.packagetype === "bdist_wheel" && u.filename.endsWith("none-any.whl"));
  if (!whl) throw new Error(`${nome}: sem wheel Python puro no PyPI`);
  await baixar(whl.url, whl.filename);
  wheels.push(whl.filename);
}
// O worker lê esta lista para instalar o openpyxl sem internet.
fs.writeFileSync(path.join(DESTINO, "extras.json"), JSON.stringify(wheels));
fs.writeFileSync(versaoGravada, VERSAO);
console.log("Pronto.");
