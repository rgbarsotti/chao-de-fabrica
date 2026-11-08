// Suíte do Chão de Fábrica: node --test test/fabrica.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CF = join(RAIZ, "payload", "chao-de-fabrica");
const HOOKS = join(CF, "hooks");
const agora = () => Math.floor(Date.now() / 1000);
const tmp = (p = "fabrica-") => mkdtempSync(join(tmpdir(), p));
const lerJ = (p) => JSON.parse(readFileSync(p, "utf8"));

function instalador(...a) {
  return spawnSync(process.execPath, [join(RAIZ, "install.mjs"), ...a], { encoding: "utf8", input: "" });
}

function gancho(nome, entrada, estado, env = {}) {
  return spawnSync(process.execPath, [join(HOOKS, `${nome}.mjs`)], {
    input: JSON.stringify(entrada), encoding: "utf8",
    env: { ...process.env, FABRICA_ESTADO: estado, FABRICA_CONFIG: join(CF, "config.json"), ...env },
  });
}

function consumo(estado, { h5, d7, idade = 0, zera5 = agora() + 3600, zera7 = agora() + 86400, sid = "s1" }) {
  mkdirSync(estado, { recursive: true });
  writeFileSync(join(estado, `estado-${sid}.json`), JSON.stringify({
    ts: agora() - idade, session_id: sid,
    five_hour: h5 == null ? null : { used_percentage: h5, resets_at: zera5 },
    seven_day: d7 == null ? null : { used_percentage: d7, resets_at: zera7 },
    context_pct: 10, context_size: 200000,
  }));
}

const negou = (r) => r.stdout.includes('"permissionDecision":"deny"');

// ---- instalador ----

function casaComConfig() {
  const home = tmp();
  mkdirSync(join(home, ".claude"), { recursive: true });
  const original = {
    theme: "dark",
    statusLine: { type: "command", command: "minha-barra" },
    hooks: { PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "meu-gancho" }] }] },
  };
  writeFileSync(join(home, ".claude", "settings.json"), JSON.stringify(original));
  return { home, original };
}

test("global: instala, preserva o que existia e registra a barra anterior", () => {
  const { home } = casaComConfig();
  const r = instalador("--escopo", "global", "--home", home);
  assert.equal(r.status, 0, r.stderr);
  const c = join(home, ".claude");
  assert.ok(existsSync(join(c, "rules", "fabrica-10-esteira.md")));
  assert.ok(existsSync(join(c, "agents", "fabrica-qa.md")));
  assert.ok(existsSync(join(c, "skills", "iniciar-fabrica", "SKILL.md")));
  const s = lerJ(join(c, "settings.json"));
  assert.equal(s.theme, "dark");
  assert.ok(s.hooks.PreToolUse.some((e) => e.hooks[0].command === "meu-gancho"));
  assert.match(s.statusLine.command, /chao-de-fabrica\/statusline\.mjs/);
  assert.equal(lerJ(join(c, "chao-de-fabrica", "manifest.json")).statusLineAnterior.command, "minha-barra");
  rmSync(home, { recursive: true });
});

test("global: reinstalar não duplica ganchos nem perde a barra anterior", () => {
  const { home } = casaComConfig();
  instalador("--escopo", "global", "--home", home);
  const a = readFileSync(join(home, ".claude", "settings.json"), "utf8");
  instalador("--escopo", "global", "--home", home);
  assert.equal(readFileSync(join(home, ".claude", "settings.json"), "utf8"), a);
  assert.equal(lerJ(join(home, ".claude", "chao-de-fabrica", "manifest.json")).statusLineAnterior.command, "minha-barra");
  rmSync(home, { recursive: true });
});

test("global: desinstalar devolve a configuração original", () => {
  const { home, original } = casaComConfig();
  instalador("--escopo", "global", "--home", home);
  const r = instalador("--escopo", "global", "--home", home, "--desinstalar");
  assert.equal(r.status, 0, r.stderr);
  const c = join(home, ".claude");
  assert.deepEqual(lerJ(join(c, "settings.json")), original);
  assert.ok(!existsSync(join(c, "rules", "fabrica-10-esteira.md")));
  assert.ok(!existsSync(join(c, "chao-de-fabrica")));
  rmSync(home, { recursive: true });
});

test("projeto: usa settings.local.json, cria a estrutura e não sobrescreve", () => {
  const home = tmp(), alvo = tmp();
  writeFileSync(join(alvo, "STATUS.md"), "meu status");
  writeFileSync(join(alvo, ".gitignore"), "node_modules/");
  const r = instalador("--escopo", "projeto", "--alvo", alvo, "--home", home);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(join(alvo, ".claude", "settings.local.json")));
  assert.ok(!existsSync(join(alvo, ".claude", "settings.json")));
  assert.equal(readFileSync(join(alvo, "STATUS.md"), "utf8"), "meu status");
  assert.ok(existsSync(join(alvo, "docs", "DECISOES.md")));
  instalador("--escopo", "projeto", "--alvo", alvo, "--home", home);
  assert.equal(readFileSync(join(alvo, ".gitignore"), "utf8").match(/_processos\//g).length, 1);
  assert.equal(instalador("--escopo", "projeto", "--alvo", alvo, "--home", home, "--verificar").status, 0);
  const d = instalador("--escopo", "projeto", "--alvo", alvo, "--home", home, "--desinstalar");
  assert.equal(d.status, 0, d.stderr);
  assert.ok(!existsSync(join(alvo, ".claude", "settings.local.json")));
  assert.ok(existsSync(join(alvo, "docs", "DECISOES.md")));
  rmSync(home, { recursive: true }); rmSync(alvo, { recursive: true });
});

test("sem escopo e sem terminal: recusa e não grava", () => {
  const home = tmp();
  const r = instalador("--home", home);
  assert.equal(r.status, 2);
  assert.ok(!existsSync(join(home, ".claude")));
  rmSync(home, { recursive: true });
});

test("simular não grava nada", () => {
  const home = tmp();
  assert.equal(instalador("--escopo", "global", "--home", home, "--simular").status, 0);
  assert.ok(!existsSync(join(home, ".claude")));
  rmSync(home, { recursive: true });
});

test("configuração corrompida: aborta sem tocar no arquivo", () => {
  const home = tmp();
  mkdirSync(join(home, ".claude"));
  writeFileSync(join(home, ".claude", "settings.json"), "{ quebrado");
  assert.equal(instalador("--escopo", "global", "--home", home).status, 1);
  assert.equal(readFileSync(join(home, ".claude", "settings.json"), "utf8"), "{ quebrado");
  assert.ok(!existsSync(join(home, ".claude", "rules")));
  rmSync(home, { recursive: true });
});

test("instalação global existente impede a de projeto", () => {
  const home = tmp(), alvo = tmp();
  instalador("--escopo", "global", "--home", home);
  assert.equal(instalador("--escopo", "projeto", "--alvo", alvo, "--home", home).status, 1);
  assert.ok(!existsSync(join(alvo, ".claude")));
  rmSync(home, { recursive: true }); rmSync(alvo, { recursive: true });
});

test("config.json editado sobrevive à reinstalação", () => {
  const home = tmp();
  instalador("--escopo", "global", "--home", home);
  const p = join(home, ".claude", "chao-de-fabrica", "config.json");
  writeFileSync(p, '{"salvar5h":70}');
  instalador("--escopo", "global", "--home", home);
  assert.equal(lerJ(p).salvar5h, 70);
  rmSync(home, { recursive: true });
});

// ---- parada dura ----

test("parada: 95% passa, 96% nega", () => {
  const e = tmp();
  consumo(e, { h5: 95, d7: 10 });
  assert.ok(!negou(gancho("parada-dura", { tool_name: "Bash", tool_input: { command: "ls" } }, e)));
  consumo(e, { h5: 96, d7: 10 });
  assert.ok(negou(gancho("parada-dura", { tool_name: "Bash", tool_input: { command: "ls" } }, e)));
  rmSync(e, { recursive: true });
});

test("parada: semana a 96% nega", () => {
  const e = tmp();
  consumo(e, { h5: 1, d7: 96 });
  assert.ok(negou(gancho("parada-dura", { tool_name: "Read", tool_input: { file_path: "a" } }, e)));
  rmSync(e, { recursive: true });
});

test("parada: ainda permite salvar o estado e agendar a volta", () => {
  const e = tmp();
  consumo(e, { h5: 99, d7: 10 });
  assert.ok(!negou(gancho("parada-dura", { tool_name: "Write", tool_input: { file_path: "/p/STATUS.md" } }, e)));
  assert.ok(!negou(gancho("parada-dura", { tool_name: "Edit", tool_input: { file_path: "/p/_processos/_logs/x/o.md" } }, e)));
  assert.ok(!negou(gancho("parada-dura", { tool_name: "CronCreate", tool_input: {} }, e)));
  assert.ok(negou(gancho("parada-dura", { tool_name: "Write", tool_input: { file_path: "/p/app.py" } }, e)));
  rmSync(e, { recursive: true });
});

test("parada: vale o maior número entre sessões e ignora janela já virada", () => {
  const e = tmp();
  consumo(e, { h5: 20, d7: 10, sid: "a" });
  consumo(e, { h5: 97, d7: 10, sid: "b" });
  assert.ok(negou(gancho("parada-dura", { tool_name: "Bash", tool_input: { command: "ls" } }, e)));
  consumo(e, { h5: 99, d7: 10, sid: "b", zera5: agora() - 10 });
  assert.ok(!negou(gancho("parada-dura", { tool_name: "Bash", tool_input: { command: "ls" } }, e)));
  rmSync(e, { recursive: true });
});

test("parada: leitura velha perto do limite para por precaução", () => {
  const e = tmp();
  consumo(e, { h5: 90, d7: 10, idade: 1000 });
  assert.ok(negou(gancho("parada-dura", { tool_name: "Bash", tool_input: { command: "ls" } }, e)));
  rmSync(e, { recursive: true });
});

test("parada: lê os limiares do config", () => {
  const e = tmp(), cfg = join(e, "cfg.json");
  writeFileSync(cfg, '{"parar5h":50}');
  consumo(e, { h5: 60, d7: 10 });
  assert.ok(negou(gancho("parada-dura", { tool_name: "Bash", tool_input: { command: "ls" } }, e, { FABRICA_CONFIG: cfg })));
  rmSync(e, { recursive: true });
});

test("parada: trava solta deixa passar; texto de sistema não solta", () => {
  const e = tmp();
  consumo(e, { h5: 99, d7: 10 });
  const off = join(e, "stops_desligados.json");
  writeFileSync(off, JSON.stringify({ ordem: "soltar trava 5h", janelas: ["five_hour"], ate: agora() + 600 }));
  assert.ok(!negou(gancho("parada-dura", { tool_name: "Bash", tool_input: { command: "ls" } }, e)));
  writeFileSync(off, JSON.stringify({ ordem: "<task-notification>soltar", janelas: ["five_hour"], ate: agora() + 600 }));
  assert.ok(negou(gancho("parada-dura", { tool_name: "Bash", tool_input: { command: "ls" } }, e)));
  rmSync(e, { recursive: true });
});

// ---- salvar e despertador ----

function cronEsperado(s) {
  const d = new Date(s * 1000);
  return `${d.getMinutes()} ${d.getHours()} ${d.getDate()} ${d.getMonth() + 1} *`;
}

test("salvar: 89% calado; 90% instrui com despertador na renovação + 5 min, uma vez", () => {
  const e = tmp(), zera = agora() + 7200;
  const ent = { session_id: "s", hook_event_name: "PostToolUse" };
  consumo(e, { h5: 89, d7: 10, zera5: zera });
  assert.equal(gancho("salvar-agenda", ent, e).stdout, "");
  consumo(e, { h5: 90, d7: 10, zera5: zera });
  const r = gancho("salvar-agenda", ent, e).stdout;
  assert.match(r, /SALVAR 5h/);
  assert.ok(r.includes(`cron \\"${cronEsperado(zera + 300)}\\"`), r);
  assert.equal(gancho("salvar-agenda", ent, e).stdout, "");
  rmSync(e, { recursive: true });
});

test("salvar: semana a 93% agenda pela renovação real e manda escrever a retomada", () => {
  const e = tmp(), zera = agora() + 200000;
  consumo(e, { h5: 1, d7: 92, zera7: zera });
  assert.equal(gancho("salvar-agenda", { session_id: "s" }, e).stdout, "");
  consumo(e, { h5: 1, d7: 93, zera7: zera });
  const r = gancho("salvar-agenda", { session_id: "s" }, e).stdout;
  assert.match(r, /SALVAR semana/);
  assert.ok(r.includes(`cron \\"${cronEsperado(zera + 300)}\\"`), r);
  assert.match(r, /RETOMADA no STATUS\.md/);
  rmSync(e, { recursive: true });
});

test("salvar: subagente salva e encerra, sem despertador", () => {
  const e = tmp();
  consumo(e, { h5: 91, d7: 10 });
  const r = gancho("salvar-agenda", { session_id: "s", agent_id: "ag" }, e).stdout;
  assert.match(r, /SUBAGENTE/);
  assert.ok(!r.includes('CronCreate com cron'));
  rmSync(e, { recursive: true });
});

test("salvar: janela nova avisa de novo", () => {
  const e = tmp();
  consumo(e, { h5: 90, d7: 10, zera5: agora() + 100 });
  assert.match(gancho("salvar-agenda", { session_id: "s" }, e).stdout, /SALVAR/);
  consumo(e, { h5: 90, d7: 10, zera5: agora() + 18000 });
  assert.match(gancho("salvar-agenda", { session_id: "s" }, e).stdout, /SALVAR/);
  rmSync(e, { recursive: true });
});

// ---- comandos das travas ----

test("travas: comando na primeira linha solta; falar do assunto não", () => {
  const e = tmp(), arq = join(e, "stops_desligados.json");
  assert.equal(gancho("travas-comando", { prompt: "acho que devemos soltar trava 5h amanhã", cwd: e }, e).stdout, "");
  assert.ok(!existsSync(arq));
  const r = gancho("travas-comando", { prompt: "soltar trava 5h 12h", cwd: e }, e);
  assert.match(r.stdout, /SOLTA/);
  assert.deepEqual(lerJ(arq).entradas[0].janelas, ["five_hour"]);
  gancho("travas-comando", { prompt: "armar travas", cwd: e }, e);
  assert.ok(!existsSync(arq));
  rmSync(e, { recursive: true });
});

test("travas: comando mal escrito avisa e não muda nada", () => {
  const e = tmp();
  assert.match(gancho("travas-comando", { prompt: "soltar trava mes", cwd: e }, e).stdout, /NADA mudou/);
  assert.ok(!existsSync(join(e, "stops_desligados.json")));
  rmSync(e, { recursive: true });
});

test("travas: data absoluta usa o fuso da máquina", () => {
  const e = tmp();
  const ano = new Date().getFullYear();
  const alvo = new Date(ano, 11, 31, 23, 30);
  const faltam = alvo.getTime() - Date.now();
  if (faltam > 0 && faltam < 6 * 86400 * 1000) {
    gancho("travas-comando", { prompt: "soltar trava 5h até 31/12 23:30", cwd: e }, e);
    assert.equal(lerJ(join(e, "stops_desligados.json")).entradas[0].ate, Math.floor(alvo.getTime() / 1000));
  } else {
    assert.match(gancho("travas-comando", { prompt: "soltar trava 5h até 31/02 10:00", cwd: e }, e).stdout, /não existe/);
  }
  rmSync(e, { recursive: true });
});

// ---- compactação ----

const { decidirPreCompact, C, limiarNativo, gatilhoPct } = await import(new URL("../payload/chao-de-fabrica/hooks/compact-seguro.mjs", import.meta.url));
const base = () => ({ trigger: "auto", ctxPct: 30, agora: 100000, ultimoCompact: null, rastro: { lido: true, ultimoDiario: 99900, ultimaNotif: null } });

test("compact: manual sempre passa; teto sempre passa", () => {
  assert.equal(decidirPreCompact({ ...base(), trigger: "manual" }).bloquear, false);
  assert.equal(decidirPreCompact({ ...base(), ctxPct: C.TETO_PCT, rastro: { lido: true } }).bloquear, false);
});

test("compact: com diário recente passa; sem diário adia", () => {
  assert.equal(decidirPreCompact(base()).bloquear, false);
  assert.equal(decidirPreCompact({ ...base(), rastro: { lido: true, ultimoDiario: null } }).bloquear, true);
});

test("compact: resultado de agente depois do diário adia", () => {
  assert.equal(decidirPreCompact({ ...base(), rastro: { lido: true, ultimoDiario: 99900, ultimaNotif: 99950 } }).bloquear, true);
});

test("compact: anti-loop adia a segunda em menos de 10 minutos", () => {
  const d = decidirPreCompact({ ...base(), ultimoCompact: 100000 - 300 });
  assert.equal(d.bloquear, true);
  assert.match(d.motivo, /ANTI-LOOP/);
});

test("compact: gatilho em tokens e percentual do visor", () => {
  assert.equal(limiarNativo(333000, 1000000), 300000);
  assert.equal(gatilhoPct(300000, 1000000), 30);
  assert.equal(gatilhoPct(null, 200000), 100);
});

// ---- barra de status ----

function barra(estado, entrada) {
  return spawnSync(process.execPath, [join(CF, "statusline.mjs")], {
    input: JSON.stringify(entrada), encoding: "utf8",
    env: { ...process.env, FABRICA_ESTADO: estado, FABRICA_CONFIG: join(CF, "config.json") },
  }).stdout.replace(/\x1b\[[0-9;]*m/g, "");
}

test("barra: mostra ctx, 5h com virada e tempo restante, semana, e grava o estado", () => {
  const e = tmp(), zera = agora() + 2 * 3600 + 600;
  const s = barra(e, { session_id: "abc", context_window: { used_percentage: 38, context_window_size: 200000 }, rate_limits: { five_hour: { used_percentage: 23, resets_at: zera }, seven_day: { used_percentage: 41, resets_at: agora() + 86400 } } });
  assert.match(s, /38%.*ctx/);
  assert.match(s, /5h\s+23%\s+\(zera \d\d:\d\d\) falta 2h/);
  assert.match(s, /sem\s+41%/);
  assert.equal(lerJ(join(e, "estado-abc.json")).five_hour.used_percentage, 23);
  rmSync(e, { recursive: true });
});

test("barra: SALVAR a 90% da 5 h e a 93% da semana", () => {
  const e = tmp();
  const f = (h, d) => barra(e, { rate_limits: { five_hour: { used_percentage: h, resets_at: agora() + 100 }, seven_day: { used_percentage: d, resets_at: agora() + 1000 } } });
  assert.ok(!f(89, 92).includes("SALVAR"));
  assert.ok(f(90, 10).includes("SALVAR"));
  assert.ok(f(10, 93).includes("SALVAR"));
  assert.ok(f(96, 10).includes("PARE"));
  rmSync(e, { recursive: true });
});

test("barra: sem número de consumo não mente zero", () => {
  const e = tmp();
  const s = barra(e, { context_window: { used_percentage: 5 } });
  assert.match(s, /5h …/);
  rmSync(e, { recursive: true });
});

// ---- travas de segredo e de escopo ----

test("segredo: bloqueia despejo de ambiente e leitura de credencial", () => {
  const e = tmp();
  for (const command of ["env", "printenv", "cat .env", "docker inspect x", "echo $AWS_SECRET_ACCESS_KEY"]) {
    assert.equal(gancho("trava-segredo", { tool_name: "Bash", tool_input: { command } }, e).status, 2, command);
  }
  assert.equal(gancho("trava-segredo", { tool_name: "Read", tool_input: { file_path: "/p/.env" } }, e).status, 2);
  rmSync(e, { recursive: true });
});

test("segredo: permite contagem e comando comum", () => {
  const e = tmp();
  for (const command of ["wc -c .env", "grep -c KEY .env", "npm test", "ls -la"]) {
    assert.equal(gancho("trava-segredo", { tool_name: "Bash", tool_input: { command } }, e).status, 0, command);
  }
  assert.equal(gancho("trava-segredo", { tool_name: "Read", tool_input: { file_path: "/p/src/app.py" } }, e).status, 0);
  rmSync(e, { recursive: true });
});

test("segredo: o log nunca guarda o comando", () => {
  const e = tmp();
  gancho("trava-segredo", { tool_name: "Bash", tool_input: { command: "cat .env.producao-marca" } }, e);
  assert.ok(!readFileSync(join(e, "trava-segredo.log"), "utf8").includes("producao-marca"));
  rmSync(e, { recursive: true });
});

test("escopo: barra pendência e segredo no código; aceita rascunho declarado", () => {
  const e = tmp();
  const marca = "TO" + "DO";
  assert.equal(gancho("trava-escopo", { tool_input: { file_path: "a.py", content: `# ${marca} terminar\n` } }, e).status, 2);
  assert.equal(gancho("trava-escopo", { tool_input: { file_path: "a.py", content: `# WORK-IN-PROGRESS\n# ${marca} terminar\n` } }, e).status, 0);
  assert.equal(gancho("trava-escopo", { tool_input: { file_path: "a.ts", content: 'const api_key = "abcdefghij12";' } }, e).status, 2);
  assert.equal(gancho("trava-escopo", { tool_input: { file_path: "notas.md", content: `${marca}` } }, e).status, 0);
  rmSync(e, { recursive: true });
});

// ---- agentes ----

test("todo agente tem nome, descrição e modelo válidos", async () => {
  const { readdirSync } = await import("node:fs");
  const pasta = join(RAIZ, "payload", "agents");
  const nomes = readdirSync(pasta);
  assert.equal(nomes.length, 13);
  for (const n of nomes) {
    const t = readFileSync(join(pasta, n), "utf8");
    assert.match(t, new RegExp(`^---\\nname: ${n.slice(0, -3)}\\ndescription: ".+"\\nmodel: (opus|sonnet|haiku)\\n---\\n`), n);
  }
});
