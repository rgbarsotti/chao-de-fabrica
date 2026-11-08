#!/usr/bin/env node
// Troca o modelo dos agentes da fábrica. Procura em ~/.claude/agents e em ./.claude/agents.
//   node trocar-modelo.mjs                                 tabela papel -> modelo
//   node trocar-modelo.mjs fabrica-qa fable                um papel
//   node trocar-modelo.mjs --de opus --para sonnet         todos os que estão em X
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MODELOS = new Set(["fable", "opus", "sonnet", "haiku", "inherit"]);
const RE = /^model:[ \t]*(\S+)[ \t]*$/m;
const pastas = [join(homedir(), ".claude", "agents"), join(process.cwd(), ".claude", "agents")].filter(existsSync);

function agentes() {
  const out = [];
  for (const p of pastas) {
    for (const n of readdirSync(p).filter((x) => /^fabrica-.*\.md$/.test(x))) {
      const caminho = join(p, n);
      out.push({ papel: n.slice(0, -3), caminho, modelo: readFileSync(caminho, "utf8").match(RE)?.[1] ?? null });
    }
  }
  return out;
}

function tabela() {
  for (const a of agentes()) console.log(`${a.papel.padEnd(24)} ${String(a.modelo).padEnd(8)} ${a.caminho}`);
}

function trocar(alvos, novo) {
  if (!MODELOS.has(novo)) { console.error(`modelo desconhecido: ${novo}`); process.exit(2); }
  if (!alvos.length) { console.error("nenhum agente corresponde"); process.exit(2); }
  for (const a of alvos) {
    writeFileSync(a.caminho, readFileSync(a.caminho, "utf8").replace(RE, `model: ${novo}`), "utf8");
    console.log(`${a.papel}: ${a.modelo} -> ${novo}`);
  }
}

const argv = process.argv.slice(2);
if (!argv.length) tabela();
else if (argv[0] === "--de") {
  const para = argv[argv.indexOf("--para") + 1];
  trocar(agentes().filter((a) => a.modelo === argv[1]), para);
} else if (argv.length === 2) trocar(agentes().filter((a) => a.papel === argv[0]), argv[1]);
else { console.error("uso: trocar-modelo.mjs [papel modelo | --de X --para Y]"); process.exit(2); }
