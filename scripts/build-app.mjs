// Gera o app das lojas: baixa o Python (se faltar), exporta o site com APP=1
// para out/ e copia para os projetos Android e iOS do Capacitor.
//
//   npm run app:build
//
// Node em vez de "APP=1 next build" no package.json: assim roda igual no
// Windows, no Mac e no GitHub Actions.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

// As lojas recusam app sem contato na política de privacidade.
const politica = readFileSync("app/privacidade/page.tsx", "utf8");
if (/const (RESPONSAVEL|EMAIL_CONTATO) = "";/.test(politica) && !process.argv.includes("--teste")) {
  console.error("Preencha RESPONSAVEL e EMAIL_CONTATO em app/privacidade/page.tsx (ou use --teste para um build local).");
  process.exit(1);
}

const rodar = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

rodar("node scripts/baixar-pyodide.mjs");
rodar("npx next build", { APP: "1" });
rodar("npx cap sync");
