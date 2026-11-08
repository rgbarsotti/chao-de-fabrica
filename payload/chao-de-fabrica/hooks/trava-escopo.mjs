#!/usr/bin/env node
// Portão antes de gravar (gancho PreToolUse em Write/Edit). Saída 2 bloqueia antes de escrever.
// Barra rascunho disfarçado de pronto e segredo escrito no código.
// Rascunho declarado: `WORK-IN-PROGRESS` na primeira linha do arquivo.
import { readFileSync } from "node:fs";

export function bloqueios(entrada) {
  const ti = entrada?.tool_input || {};
  const fp = ti.file_path;
  const conteudo = ti.content || ti.new_string;
  if (!fp || !/\.(py|ts|tsx)$/i.test(fp) || !conteudo) return [];
  const b = [];
  const rascunho = conteudo.split(/\r?\n/)[0].includes("WORK-IN-PROGRESS");
  if (!rascunho) {
    const pendencia = new RegExp("(^|[^A-Za-z])(" + ["TO" + "DO", "FIX" + "ME", "XXX", "HACK"].join("|") + ")([^A-Za-z]|$)");
    if (pendencia.test(conteudo)) b.push("Contém marca de pendência: termine, ou declare WORK-IN-PROGRESS na 1a linha");
    if (/\.py$/i.test(fp)) {
      if (/raise\s+NotImplementedError|\bNotImplemented\b/i.test(conteudo)) b.push("NotImplementedError em .py");
      if (/:\s*\r?\n\s+(pass|\.\.\.)\s*\r?\n/i.test(conteudo)) b.push("Corpo de função vazio (pass/...) em .py");
    }
    if (/\.tsx?$/i.test(fp) && /not[\s_]?implemented/i.test(conteudo)) b.push("TS marcado como não implementado");
  }
  if (/(password|secret|api_?key|token)\s*=\s*['"][^'"]{8,}['"]/i.test(conteudo) &&
      !/(os\.environ|getenv|process\.env|example|placeholder|changeme|dummy)/i.test(conteudo)) {
    b.push("Possível segredo escrito no código");
  }
  return b;
}

function main() {
  let entrada;
  try { entrada = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return 0; }
  const b = bloqueios(entrada);
  if (!b.length) return 0;
  process.stderr.write("BLOQUEIO antes de gravar:\n- " + b.join("\n- ") + "\n");
  return 2;
}

if (process.argv[1] && /trava-escopo\.mjs$/.test(process.argv[1])) process.exitCode = main();
