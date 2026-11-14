// Gera os PNGs do app (PWA, Google Play, App Store) a partir da geometria de
// app/icon.svg, usando o Chrome instalado em modo headless. Rodar de novo só se
// o logo mudar:  node scripts/gerar-icones.mjs
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CHROME = process.env.CHROME
  ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";

// Mesma pizza de app/icon.svg. `cantos` = true mantém o quadrado arredondado
// (ícone "any"); false sangra até a borda (maskable, Apple e Play, que
// recortam o formato por conta própria). A pizza ocupa 66% do lado, dentro da
// zona segura de 80% do maskable.
const pizza = (cantos) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" ${cantos ? 'rx="7"' : ""} fill="#115E59"/>
  <circle cx="16" cy="16" r="10.5" fill="#E2DCD0"/>
  <path d="M16 16H28M16 16 10 26.39M16 16 10 5.61" stroke="#115E59" stroke-width="2.4"/>
</svg>`;

// Arte de destaque da Google Play (1024x500).
const destaque = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 500">
  <rect width="1024" height="500" fill="#115E59"/>
  <g transform="translate(90 110) scale(8.75)">
    <circle cx="16" cy="16" r="10.5" fill="#E2DCD0"/>
    <path d="M16 16H28M16 16 10 26.39M16 16 10 5.61" stroke="#115E59" stroke-width="2.4"/>
  </g>
  <text x="430" y="235" font-family="Segoe UI, Arial, sans-serif" font-size="76" font-weight="800" fill="#E2DCD0">Portfolio Lab</text>
  <text x="432" y="300" font-family="Segoe UI, Arial, sans-serif" font-size="34" fill="#E2DCD0" opacity="0.85">Paridade de risco com ações da B3</text>
</svg>`;

const saidas = [
  // [arquivo, svg, largura, altura]
  ["public/icones/icon-192.png", pizza(true), 192, 192],
  ["public/icones/icon-512.png", pizza(true), 512, 512],
  ["public/icones/maskable-512.png", pizza(false), 512, 512],
  ["app/apple-icon.png", pizza(false), 180, 180],
  ["lojas/arte/icone-loja-512.png", pizza(false), 512, 512],
  ["lojas/arte/icone-appstore-1024.png", pizza(false), 1024, 1024],
  ["lojas/arte/destaque-play-1024x500.png", destaque, 1024, 500],
];

const tmp = mkdtempSync(join(tmpdir(), "icones-"));
for (const [arquivo, svg, w, h] of saidas) {
  const html = join(tmp, "i.html");
  writeFileSync(html, `<!doctype html><style>html,body{margin:0}svg{display:block;width:${w}px;height:${h}px}</style>${svg}`);
  const png = join(tmp, "i.png");
  execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars",
    "--force-device-scale-factor=1", "--default-background-color=00000000", `--window-size=${w},${h}`,
    `--screenshot=${png}`, pathToFileURL(html).href], { stdio: "ignore" });
  mkdirSync(resolve(arquivo, ".."), { recursive: true });
  copyFileSync(png, arquivo);
  // A Play pede o ícone em PNG 32 bits (com alfa), e o print do Chrome sai sem
  // alfa quando a imagem é opaca. O sharp vem com o @capacitor/assets.
  if (arquivo.endsWith("icone-loja-512.png")) {
    const sharp = (await import("sharp")).default;
    writeFileSync(arquivo, await sharp(arquivo).ensureAlpha().png().toBuffer());
  }
  console.log(arquivo, `${w}x${h}`);
}
