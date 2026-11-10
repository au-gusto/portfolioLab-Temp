// Prints das lojas, com o Chrome instalado em modo headless (CDP pelo WebSocket
// nativo do Node 22, sem dependência). Monta a carteira da aula, simula e
// fotografa as telas principais nos tamanhos que as lojas aceitam:
//   Play:  1080x1920 (360x640 com escala 3; a Play recusa proporção acima de 2:1)
//   Apple: 1290x2796 (430x932 com escala 3, iPhone de 6,7")
//
//   npx serve out   (ou py -m http.server 4173 -d out, depois de npm run app:build -- --teste)
//   node scripts/capturar-prints.mjs http://localhost:4173/ lojas/prints
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [URL_APP = "http://localhost:4173/", SAIDA = "lojas/prints"] = process.argv.slice(2);
const CHROME = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const TAMANHOS = { android: [360, 640], iphone: [430, 932] };
const CARTEIRA = ["PETR4", "VALE3", "ITUB4", "WEGE3", "BBAS3", "ABEV3"];
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const porta = 9333;
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${porta}`, "--hide-scrollbars",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "prints-"))}`, "about:blank"], { stdio: "ignore" });

try {
  let alvo;
  for (let i = 0; i < 50 && !alvo; i++) {
    await espera(200);
    try { alvo = (await (await fetch(`http://127.0.0.1:${porta}/json`)).json()).find((t) => t.type === "page"); } catch { /* subindo */ }
  }
  const ws = new WebSocket(alvo.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let id = 0;
  const pendentes = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pendentes.has(m.id)) { pendentes.get(m.id)(m); pendentes.delete(m.id); }
  });
  const cdp = (method, params = {}) => new Promise((r) => { pendentes.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  const js = async (expr) => (await cdp("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;

  // Animações desligadas: a da gaveta de código congela no headless e o print
  // sairia com a gaveta deslocada.
  const semAnimacao = `const s=document.createElement('style');s.textContent='*{animation:none!important;transition:none!important}';document.head.append(s)`;
  mkdirSync(SAIDA, { recursive: true });

  for (const [aparelho, [w, h]] of Object.entries(TAMANHOS)) {
    await cdp("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 3, mobile: true });
    await cdp("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
    await cdp("Page.navigate", { url: URL_APP });
    await espera(3000);
    await js(`localStorage.clear(); localStorage.setItem('tema','claro'); location.reload()`);
    await espera(3000);
    await js(semAnimacao);
    await espera(30000); // Python + bibliotecas (no app vêm do pacote; sobra folga)
    await js(`(async () => {
      const inp = document.querySelector('input[placeholder="PETR4, VALE3..."]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      for (const t of ${JSON.stringify(CARTEIRA)}) {
        set.call(inp, t); inp.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 300));
        [...document.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(t) && !b.getAttribute('aria-label'))?.click();
        await new Promise(r => setTimeout(r, 300));
      }
      for (const nome of ['Paridade de Risco', 'Ingênua (1/N)', 'CDI', 'Ibovespa']) {
        const cb = [...document.querySelectorAll('label')].find(l => l.textContent.includes(nome))?.querySelector('input[type=checkbox]');
        if (cb && !cb.checked) cb.click();
      }
      [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Simular').click();
    })()`);
    await espera(20000);

    // Rola até o título da seção, descontando o cabeçalho fixo.
    const ate = (texto) => `(() => { const e = [...document.querySelectorAll('.secao__titulo, h2, h3, p')].find(e => e.textContent.trim().toLowerCase().startsWith(${JSON.stringify(texto)})); if (e) window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 80); })()`;
    const fotos = [
      ["1-desempenho", `window.scrollTo(0, 0)`],
      ["2-alocacao", ate("alocação atual")],
      ["3-risco", ate("risco e consist")],
      ["4-configuracao", `window.scrollTo(0, 0); document.querySelector('[aria-label="Abrir configuração"]')?.click()`],
      ["5-codigo", `document.querySelector('[aria-label="Abrir configuração"]')?.click(); document.querySelector('[aria-label="Editar o código Python das estratégias"]')?.click(); setTimeout(() => [...document.querySelectorAll('.gaveta-codigo button')].find(b => b.textContent.includes('Paridade de Risco'))?.click(), 300)`],
    ];
    for (const [nome, acao] of fotos) {
      await js(acao);
      await espera(1500);
      const { result } = await cdp("Page.captureScreenshot", { format: "png" });
      const arquivo = join(SAIDA, `${aparelho}-${nome}.png`);
      writeFileSync(arquivo, Buffer.from(result.data, "base64"));
      console.log(arquivo, `${w * 3}x${h * 3}`);
    }
  }
  ws.close();
} finally {
  chrome.kill();
}
