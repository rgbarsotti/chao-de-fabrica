#!/usr/bin/env node
// Instalador do Chão de Fábrica. Só usa Node, sem dependências.
//
//   node install.mjs                                   pergunta o escopo no terminal
//   node install.mjs --escopo global
//   node install.mjs --escopo projeto --alvo <pasta>
//   node install.mjs --escopo <e> --simular            mostra o que faria e não grava nada
//   node install.mjs --escopo <e> --verificar          confere uma instalação existente
//   node install.mjs --escopo <e> --desinstalar        desfaz tudo o que instalou
//
// Global: ~/.claude e ~/.claude/settings.json.
// Projeto: <pasta>/.claude e .claude/settings.local.json. A barra e os ganchos ficam no arquivo local
// porque medem o consumo da SUA conta, e o caminho absoluto deles só vale na sua máquina. Regras e
// agentes ficam em .claude/ e podem ser versionados com o time.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { scaffold } from "./payload/chao-de-fabrica/scaffold.mjs";

const RAIZ = dirname(fileURLToPath(import.meta.url));
const PAYLOAD = join(RAIZ, "payload");
const PASTA = "chao-de-fabrica";
const SUFIXO_COPIA = ".antes-fabrica";

const barra = (p) => p.split(sep).join("/");
const lerJson = (p) => JSON.parse(readFileSync(p, "utf8").replace(/^﻿/, ""));
const gravarJson = (p, o) => {
  mkdirSync(dirname(p), { recursive: true });
  const tmp = p + ".tmp";
  writeFileSync(tmp, JSON.stringify(o, null, 2) + "\n", "utf8");
  renameSync(tmp, p);
};

function falhar(msg, codigo = 1) {
  console.error(`ERRO: ${msg}`);
  process.exit(codigo);
}

function args(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--simular" || a === "--verificar" || a === "--desinstalar") o[a.slice(2)] = true;
    else if (a === "--escopo" || a === "--alvo" || a === "--home") o[a.slice(2)] = argv[++i];
    else falhar(`opção desconhecida: ${a}`, 2);
  }
  return o;
}

async function perguntarEscopo() {
  if (!process.stdin.isTTY) {
    falhar('falta o escopo. Use --escopo global (todos os projetos) ou --escopo projeto --alvo <pasta>.', 2);
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log("Onde instalar o Chão de Fábrica?\n  1) Só neste projeto\n  2) Em todos os projetos");
  const r = (await rl.question("Escolha 1 ou 2: ")).trim();
  rl.close();
  if (r === "1") return "projeto";
  if (r === "2") return "global";
  falhar("resposta inválida; nada foi alterado.", 2);
}

function listar(d) {
  if (!existsSync(d)) return [];
  return readdirSync(d).flatMap((n) => {
    const p = join(d, n);
    return statSync(p).isDirectory() ? listar(p) : [p];
  });
}

function contexto(o) {
  const home = resolve(o.home || homedir());
  const alvo = resolve(o.alvo || process.cwd());
  const global = o.escopo === "global";
  const claude = global ? join(home, ".claude") : join(alvo, ".claude");
  return {
    home, alvo, global, claude,
    settings: join(claude, global ? "settings.json" : "settings.local.json"),
    raizInstalada: join(claude, PASTA),
    manifesto: join(claude, PASTA, "manifest.json"),
    manifestoGlobal: join(home, ".claude", PASTA, "manifest.json"),
    manifestoProjeto: join(alvo, ".claude", PASTA, "manifest.json"),
  };
}

function ganchos(raiz) {
  const h = (nome, timeout) => ({ type: "command", command: `node "${barra(raiz)}/hooks/${nome}.mjs"`, timeout });
  return {
    PreToolUse: [
      { matcher: "Write|Edit|MultiEdit", hooks: [h("trava-escopo", 5)] },
      { matcher: "Bash|PowerShell|Read|NotebookEdit", hooks: [h("trava-segredo", 5)] },
      { hooks: [h("parada-dura", 5)] },
    ],
    PostToolUse: [{ hooks: [h("salvar-agenda", 5), h("compact-seguro", 5)] }],
    UserPromptSubmit: [{ hooks: [h("travas-comando", 10)] }, { hooks: [h("salvar-agenda", 5), h("compact-seguro", 5)] }],
    SessionStart: [{ matcher: "compact", hooks: [h("pos-compact", 15)] }],
    PreCompact: [{ hooks: [h("compact-seguro", 10)] }],
  };
}

const nossoGancho = (h) => typeof h?.command === "string" && h.command.includes(`/${PASTA}/hooks/`);
const nossaBarra = (s) => typeof s?.command === "string" && s.command.includes(`/${PASTA}/statusline.mjs`);

function semNossosGanchos(cfg) {
  if (!cfg.hooks) return;
  for (const evento of Object.keys(cfg.hooks)) {
    cfg.hooks[evento] = cfg.hooks[evento]
      .map((e) => ({ ...e, hooks: (e.hooks || []).filter((h) => !nossoGancho(h)) }))
      .filter((e) => e.hooks.length);
    if (!cfg.hooks[evento].length) delete cfg.hooks[evento];
  }
  if (!Object.keys(cfg.hooks).length) delete cfg.hooks;
}

function lerSettings(caminho) {
  if (!existsSync(caminho)) return {};
  try { return lerJson(caminho); }
  catch { falhar(`${caminho} não é JSON válido. Corrija o arquivo; nada foi alterado.`); }
}

function mapaDeArquivos(c) {
  return listar(PAYLOAD).map((origem) => {
    const rel = relative(PAYLOAD, origem);
    return { origem, destino: join(c.claude, rel), rel: barra(rel) };
  });
}

function instalar(c, simular) {
  const outra = c.global ? c.manifestoProjeto : c.manifestoGlobal;
  if (existsSync(outra)) {
    falhar(`já existe instalação em ${dirname(dirname(outra))}. Ter as duas dispararia cada gancho duas vezes. Desinstale a outra antes.`);
  }
  const anterior = existsSync(c.manifesto) ? lerJson(c.manifesto) : null;
  const cfg = lerSettings(c.settings);
  const arquivos = mapaDeArquivos(c);
  const copias = anterior?.copias ? [...anterior.copias] : [];

  console.log(`Escopo: ${c.global ? "todos os projetos" : "este projeto"}`);
  console.log(`Destino: ${c.claude}`);
  console.log(`Arquivos: ${arquivos.length}`);
  console.log(`Configuração: ${c.settings}`);
  const barraAlheia = cfg.statusLine && !nossaBarra(cfg.statusLine);
  if (barraAlheia) console.log("Barra de status existente: será substituída e restaurada ao desinstalar.");

  if (simular) {
    for (const a of arquivos) console.log(`  ${a.rel}`);
    if (!c.global) {
      const r = scaffold(c.alvo, { simular: true });
      for (const f of r.criados) console.log(`  (projeto) criaria ${f}`);
    }
    console.log("Simulação: nada foi gravado.");
    return;
  }

  const conhecidos = new Set(anterior?.arquivos || []);
  for (const a of arquivos) {
    mkdirSync(dirname(a.destino), { recursive: true });
    const eConfig = a.rel === `${PASTA}/config.json`;
    if (eConfig && existsSync(a.destino)) continue;
    if (existsSync(a.destino) && !conhecidos.has(a.rel)) {
      copyFileSync(a.destino, a.destino + SUFIXO_COPIA);
      copias.push(a.rel);
    }
    copyFileSync(a.origem, a.destino);
  }
  mkdirSync(join(c.home, ".claude", PASTA, "estado"), { recursive: true });

  const copiaSettings = c.settings + SUFIXO_COPIA;
  const settingsExistia = anterior ? anterior.settingsExistia : existsSync(c.settings);
  if (existsSync(c.settings) && !existsSync(copiaSettings)) copyFileSync(c.settings, copiaSettings);

  semNossosGanchos(cfg);
  cfg.hooks = cfg.hooks || {};
  const novos = ganchos(c.raizInstalada);
  for (const [evento, entradas] of Object.entries(novos)) {
    cfg.hooks[evento] = [...(cfg.hooks[evento] || []), ...entradas];
  }
  const barraAnterior = anterior ? anterior.statusLineAnterior : (cfg.statusLine ?? null);
  cfg.statusLine = { type: "command", command: `node "${barra(c.raizInstalada)}/statusline.mjs"`, refreshInterval: 2 };
  gravarJson(c.settings, cfg);

  gravarJson(c.manifesto, {
    produto: PASTA,
    escopo: c.global ? "global" : "projeto",
    instaladoEm: new Date().toISOString(),
    arquivos: arquivos.map((a) => a.rel),
    copias: [...new Set(copias)],
    statusLineAnterior: barraAnterior,
    settingsExistia,
  });

  if (!c.global) {
    const r = scaffold(c.alvo);
    for (const f of r.criados) console.log(`  criado no projeto: ${f}`);
    for (const f of r.mantidos) console.log(`  mantido no projeto: ${f}`);
    for (const l of r.gitignore) console.log(`  .gitignore + ${l}`);
  }
  console.log("Instalação concluída. Reinicie o Claude Code para a barra e os ganchos valerem.");
}

function removerVaziosAcima(p, ate) {
  let d = dirname(p);
  while (d !== ate && d.startsWith(ate)) {
    try { rmdirSync(d); } catch { return; }
    d = dirname(d);
  }
}

function desinstalar(c) {
  if (!existsSync(c.manifesto)) falhar(`nenhuma instalação encontrada em ${c.claude}.`);
  const m = lerJson(c.manifesto);
  for (const rel of m.arquivos) {
    const p = join(c.claude, rel);
    rmSync(p, { force: true });
    if (m.copias?.includes(rel) && existsSync(p + SUFIXO_COPIA)) renameSync(p + SUFIXO_COPIA, p);
    removerVaziosAcima(p, c.claude);
  }
  const cfg = lerSettings(c.settings);
  semNossosGanchos(cfg);
  if (nossaBarra(cfg.statusLine)) {
    if (m.statusLineAnterior) cfg.statusLine = m.statusLineAnterior;
    else delete cfg.statusLine;
  }
  if (!m.settingsExistia && !Object.keys(cfg).length) rmSync(c.settings, { force: true });
  else gravarJson(c.settings, cfg);
  rmSync(c.settings + SUFIXO_COPIA, { force: true });
  rmSync(c.raizInstalada, { recursive: true, force: true });
  if (!c.global && !existsSync(c.manifestoGlobal)) {
    rmSync(join(c.home, ".claude", PASTA), { recursive: true, force: true });
  }
  console.log(`Desinstalado de ${c.claude}.`);
  if (!c.global) console.log("STATUS.md, docs/ e _processos/ foram mantidos: são dados do seu projeto.");
}

function verificar(c) {
  if (!existsSync(c.manifesto)) falhar(`nenhuma instalação encontrada em ${c.claude}.`);
  const m = lerJson(c.manifesto);
  const faltam = m.arquivos.filter((r) => !existsSync(join(c.claude, r)));
  if (faltam.length) falhar(`faltam arquivos: ${faltam.join(", ")}`);
  const cfg = lerSettings(c.settings);
  const nossos = Object.values(cfg.hooks || {}).flat().flatMap((e) => e.hooks || []).filter(nossoGancho);
  const esperados = Object.values(ganchos(c.raizInstalada)).flat().flatMap((e) => e.hooks).length;
  if (nossos.length !== esperados) falhar(`ganchos: esperava ${esperados}, achei ${nossos.length}`);
  if (!nossaBarra(cfg.statusLine)) falhar("a barra de status não aponta para a fábrica");

  const estado = mkdtempSync(join(tmpdir(), "fabrica-verifica-"));
  try {
    const env = { ...process.env, FABRICA_ESTADO: estado };
    const amostra = JSON.stringify({
      session_id: "verifica", model: { display_name: "Teste" }, context_window: { used_percentage: 12, context_window_size: 200000 },
      rate_limits: { five_hour: { used_percentage: 10, resets_at: Math.floor(Date.now() / 1000) + 3600 }, seven_day: { used_percentage: 20, resets_at: Math.floor(Date.now() / 1000) + 86400 } },
    });
    const saida = execFileSync(process.execPath, [join(c.raizInstalada, "statusline.mjs")], { input: amostra, env, encoding: "utf8" });
    if (!/ctx/.test(saida) || !/falta/.test(saida)) falhar("a barra não produziu a linha esperada");
    for (const nome of ["parada-dura", "salvar-agenda", "compact-seguro", "travas-comando", "pos-compact", "trava-segredo", "trava-escopo"]) {
      execFileSync(process.execPath, [join(c.raizInstalada, "hooks", `${nome}.mjs`)], { input: "{}", env, encoding: "utf8" });
    }
    console.log(`OK: ${m.arquivos.length} arquivos, ${nossos.length} ganchos e barra de status funcionando.`);
    console.log(saida.replace(/\x1b\[[0-9;]*m/g, "").trim());
  } finally {
    rmSync(estado, { recursive: true, force: true });
  }
}

async function main() {
  const [maior] = process.versions.node.split(".").map(Number);
  if (maior < 18) falhar(`Node 18 ou mais novo é necessário (encontrado ${process.versions.node}).`);
  const o = args(process.argv.slice(2));
  if (!o.escopo) o.escopo = await perguntarEscopo();
  if (o.escopo !== "global" && o.escopo !== "projeto") falhar(`escopo inválido: ${o.escopo}`, 2);
  const c = contexto(o);
  if (o.desinstalar) return desinstalar(c);
  if (o.verificar) return verificar(c);
  return instalar(c, !!o.simular);
}

main().catch((e) => falhar(e?.message || String(e)));
