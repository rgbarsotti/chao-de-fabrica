#!/usr/bin/env node
// Barra de status do Claude Code, em 2 linhas:
//   [ nome-da-sessao ]  |  Modelo  |  pasta (branch)
//   [####------] [ 38% ] ctx  |  5h [ 23% ] (zera 17:00) falta 2h30  |  sem [ 41% ] (zera ter)
// É a única peça que recebe o consumo do Claude Code: grava um resumo por sessão, e os ganchos leem
// dali. Sem dependências, sem subprocesso, sem rede.
// Baseada em github.com/DBR77Red/context-window-live-visualization (licença MIT; ver THIRD-PARTY.md).

import { readFileSync, statSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, resolve, isAbsolute, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const AQUI = dirname(fileURLToPath(import.meta.url));
const RITMO_DIR = process.env.FABRICA_ESTADO || join(homedir(), ".claude", "chao-de-fabrica", "estado");
const CFG = (() => {
  const d = { salvar5h: 90, salvar7d: 93, parar5h: 96, parar7d: 96, margemMin: 5 };
  const p = process.env.FABRICA_CONFIG || join(AQUI, "..", "config.json");
  try { return { ...d, ...JSON.parse(readFileSync(p, "utf8")) }; } catch { return d; }
})();
function gravarEstadoRitmo(d) {
  try {
    mkdirSync(RITMO_DIR, { recursive: true });
    const sid = String(d.session_id ?? d.sessionId ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
    const estado = {
      ts: Math.floor(Date.now() / 1000),
      session_id: sid || null,
      five_hour: d.rate_limits?.five_hour ?? null,
      seven_day: d.rate_limits?.seven_day ?? null,
      context_pct: d.context_window?.used_percentage ?? null,
      context_size: d.context_window?.context_window_size ?? null,
      model: d.model?.display_name ?? null,
    };
    const texto = JSON.stringify(estado);
    if (sid) writeFileSync(join(RITMO_DIR, `estado-${sid}.json`), texto);
    writeFileSync(join(RITMO_DIR, "estado.json"), texto);
  } catch { /* barra nunca falha por causa do ritmo */ }
}
const JANELAS = ["five_hour", "seven_day"];
const NAO_E_HUMANO = /<task-notification>|<system-reminder>|<local-command|<command-name>|tool-use-id|hookSpecificOutput/i;
const normP = (p) => String(p || "").replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
const segs = (v) => (v > 1e12 ? Math.floor(v / 1000) : Math.floor(v));
function travasSoltas(cwd) {
  const r = { janelas: new Set(), ate: {} };
  let o;
  try { o = JSON.parse(readFileSync(join(RITMO_DIR, "stops_desligados.json"), "utf8")); } catch { return r; }
  const agora = Math.floor(Date.now() / 1000);
  const lista = o && Array.isArray(o.entradas) ? o.entradas : [o];
  for (const e of lista) {
    if (!e || typeof e !== "object" || typeof e.ordem !== "string" || !e.ordem.trim() || NAO_E_HUMANO.test(e.ordem)) continue;
    if (e.ate !== undefined && !(typeof e.ate === "number" && segs(e.ate) > agora)) continue;
    if (e.projeto !== undefined) {
      if (typeof e.projeto !== "string" || !e.projeto.trim()) continue;
      const p = normP(e.projeto), c = normP(cwd);
      if (!(c === p || c.startsWith(p + "/"))) continue;
    }
    let js;
    if (e.janelas === undefined) js = JANELAS;
    else if (Array.isArray(e.janelas) && e.janelas.length && e.janelas.every((j) => JANELAS.includes(j))) js = e.janelas;
    else continue;
    const prazo = typeof e.ate === "number" ? segs(e.ate) : null;
    for (const j of js) {
      const antes = r.janelas.has(j) ? r.ate[j] : undefined;
      r.janelas.add(j);
      r.ate[j] = antes === null || prazo === null ? null : Math.max(antes ?? 0, prazo);
    }
  }
  return r;
}
const quando = (s) => { const d = new Date(s * 1000); return `${["dom","seg","ter","qua","qui","sex","sáb"][d.getDay()]} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; };

function segmentoJanela(w5, soltas) {
  if (!w5 || w5.used_percentage == null || !w5.resets_at) return "";
  const zera = w5.resets_at > 1e12 ? Math.floor(w5.resets_at / 1000) : w5.resets_at;
  const falta = Math.max(0, zera - Math.floor(Date.now() / 1000));
  const u5 = Math.round(w5.used_percentage);
  const stopsOff = soltas.janelas.has("five_hour");
  let aviso = "";
  if (stopsOff) aviso = soltas.ate.five_hour ? ` ⚠ trava 5h SOLTA até ${quando(soltas.ate.five_hour)}` : " ⚠ trava 5h SOLTA sem prazo";
  else if (u5 >= CFG.parar5h) aviso = " ⛔PARE";
  else if (u5 >= CFG.salvar5h) aviso = " 💾SALVAR";
  const h = Math.floor(falta / 3600), m = Math.floor((falta % 3600) / 60);
  return `falta ${h}h${String(m).padStart(2, "0")}${aviso}`;
}

const RESET = "\x1b[0m";
const paint = (c, s) => `\x1b[${c}m${s}${RESET}`;
const dim = (s) => paint("2", s);
const pad2 = (n) => String(n).padStart(2, "0");

let ansiOnly = false;
try {
  const t = JSON.parse(readFileSync(join(homedir(), ".claude", "settings.json"), "utf8")).theme || "";
  ansiOnly = t.endsWith("-ansi");
} catch { /* assume truecolor */ }

const BG = ansiOnly ? "46;30" : "48;2;8;145;178;30";
const FG = ansiOnly ? "36" : "38;2;8;145;178";
const badge = (s) => paint(BG, ` ${s} `);

function gitBranch(start) {
  try {
    let d = resolve(start);
    for (let i = 0; i < 40; i++) {
      const g = join(d, ".git");
      if (existsSync(g)) {
        let gd = g;
        if (statSync(g).isFile()) {
          const m = readFileSync(g, "utf8").match(/gitdir:\s*(.+)/);
          if (!m) return null;
          gd = m[1].trim();
          if (!isAbsolute(gd)) gd = resolve(d, gd);
        }
        const head = readFileSync(join(gd, "HEAD"), "utf8").trim();
        const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/);
        return ref ? ref[1] : head.slice(0, 7);
      }
      const p = dirname(d);
      if (p === d) break;
      d = p;
    }
  } catch { /* fora de repo */ }
  return null;
}

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const hora = (s) => { const d = new Date(s * 1000); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const dia = (s) => DIAS[new Date(s * 1000).getDay()];

function limite(rotulo, w, fmt) {
  if (!w || w.used_percentage == null) return dim(`${rotulo} …`);
  const seg = `${rotulo} ${badge(`${Math.round(w.used_percentage)}%`)}`;
  return w.resets_at ? seg + " " + dim(`(zera ${fmt(w.resets_at)})`) : seg;
}

function main() {
  let d = {};
  try { d = JSON.parse(readFileSync(0, "utf8")); } catch { /* placeholders */ }
  const sep = dim("  |  ");

  const cwd = d.workspace?.current_dir || d.cwd || "";
  const br = cwd ? gitBranch(cwd) : null;
  const linha1 = [
    d.session_name ? badge(d.session_name) : dim("sem nome — /rename"),
    paint("1", d.model?.display_name || "Claude"),
    cwd ? basename(cwd) + (br ? ` ${dim(`(${br})`)}` : "") : "",
  ].filter(Boolean).join(sep);

  gravarEstadoRitmo(d);
  const pct = Math.round(d.context_window?.used_percentage ?? 0);
  const n = Math.min(10, Math.max(0, Math.round(pct / 10)));
  const barra = "[" + paint(FG, "▓".repeat(n)) + dim("░".repeat(10 - n)) + "]";
  const soltas = travasSoltas(cwd);
  const janela = segmentoJanela(d.rate_limits?.five_hour, soltas);
  const linha2 = [
    `${barra} ${badge(`${pct}%`)} ${dim("ctx")}`,
    limite("5h", d.rate_limits?.five_hour, hora) + (janela ? " " + dim(janela) : ""),
    limite("sem", d.rate_limits?.seven_day, dia) + (() => {
      const u7 = d.rate_limits?.seven_day?.used_percentage;
      if (soltas.janelas.has("seven_day")) {
        const a = soltas.ate.seven_day;
        return " " + dim(a ? `⚠ trava semana SOLTA até ${quando(a)}` : "⚠ trava semana SOLTA sem prazo");
      }
      if (u7 == null) return "";
      return Math.round(u7) >= CFG.parar7d ? " " + dim("⛔PARE") : Math.round(u7) >= CFG.salvar7d ? " " + dim("💾SALVAR") : "";
    })(),
  ].join(sep);

  process.stdout.write(linha1 + "\n" + linha2 + "\n");
}

try { main(); } catch { process.stdout.write("Claude\n"); } // nunca em branco, nunca stack trace
