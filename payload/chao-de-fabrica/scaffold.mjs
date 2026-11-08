#!/usr/bin/env node
// Cria a estrutura de pastas e documentos da fábrica num projeto. Nunca sobrescreve o que já existe.
//   node scaffold.mjs <pasta-do-projeto>
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync, copyFileSync, appendFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const TEMPLATES = join(dirname(fileURLToPath(import.meta.url)), "templates");
const IGNORAR = ["_processos/", ".claude/settings.local.json"];

function listar(d) {
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? listar(p) : [p];
  });
}

export function scaffold(alvo, { simular = false } = {}) {
  const criados = [], mantidos = [];
  for (const origem of listar(TEMPLATES)) {
    const rel = relative(TEMPLATES, origem).split(sep).join("/");
    const destino = join(alvo, rel);
    if (existsSync(destino)) { mantidos.push(rel); continue; }
    criados.push(rel);
    if (!simular) { mkdirSync(dirname(destino), { recursive: true }); copyFileSync(origem, destino); }
  }
  if (!simular) mkdirSync(join(alvo, "_processos", "_logs"), { recursive: true });

  const gi = join(alvo, ".gitignore");
  const atual = existsSync(gi) ? readFileSync(gi, "utf8") : "";
  const linhas = new Set(atual.split(/\r?\n/).map((l) => l.trim()));
  const faltam = IGNORAR.filter((l) => !linhas.has(l));
  if (faltam.length && !simular) {
    const prefixo = atual && !atual.endsWith("\n") ? "\n" : "";
    if (atual) appendFileSync(gi, prefixo + faltam.join("\n") + "\n", "utf8");
    else writeFileSync(gi, faltam.join("\n") + "\n", "utf8");
  }
  return { criados, mantidos, gitignore: faltam };
}

if (process.argv[1] && /scaffold\.mjs$/.test(process.argv[1])) {
  const alvo = resolve(process.argv[2] || process.cwd());
  const r = scaffold(alvo);
  console.log(`Projeto: ${alvo}`);
  for (const f of r.criados) console.log(`  criado    ${f}`);
  for (const f of r.mantidos) console.log(`  mantido   ${f}`);
  for (const l of r.gitignore) console.log(`  .gitignore + ${l}`);
}
