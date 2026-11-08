#!/usr/bin/env node
// PARADA DURA (gancho PreToolUse). A 96% da janela de 5 h ou da semanal, nega qualquer ferramenta,
// exceto gravar o estado e agendar a volta. Este guarda não importa nenhum outro módulo: se outro
// arquivo quebrar, ele continua de pé. Nunca falha em silêncio, e leitura velha perto do limite é
// tratada como perigo. O consumo é da conta: entre sessões divergentes vale o maior número.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const AQUI = dirname(fileURLToPath(import.meta.url));
const DIR = process.env.FABRICA_ESTADO || join(homedir(), ".claude", "chao-de-fabrica", "estado");
const CFG = (() => {
  const d = { salvar5h: 90, salvar7d: 93, parar5h: 96, parar7d: 96, margemMin: 5 };
  const p = process.env.FABRICA_CONFIG || join(AQUI, "..", "config.json");
  try { return { ...d, ...JSON.parse(readFileSync(p, "utf8")) }; } catch { return d; }
})();
const ESTADO = join(DIR, "estado.json");
const STOPS_OFF = join(DIR, "stops_desligados.json");

const STOP_5H = CFG.parar5h, STOP_7D = CFG.parar7d;
const VIGILIA_5H = 85, VIGILIA_7D = 88;
const VELHO_S = 900;

const PERMITIDO_SALVAR =
  /(_processos|docs[\\/]_progresso|\.claude[\\/]projects[\\/].*memory|STATUS\.md|SESSION_LOG\.md)/i;

const NAO_E_HUMANO =
  /<task-notification>|<system-reminder>|<local-command|<command-name>|tool-use-id|hookSpecificOutput/i;

const lerJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const seg = (v) => (v == null ? null : (v > 1e12 ? Math.floor(v / 1000) : Math.floor(v)));

function negar(motivo) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `[STOP] PARADA DURA: ${motivo}. Como se os tokens tivessem acabado. Permitido só gravar ` +
        `o estado (Write/Edit em _processos, docs/_progresso, memória, STATUS/SESSION_LOG). ` +
        `Espere a renovação. Só o usuário solta a trava, escrevendo "soltar trava 5h" ou "soltar trava semana" sozinho na primeira linha.`,
    },
  }));
}

function avisar(texto) {
  process.stdout.write(JSON.stringify({ systemMessage: `[STOP] ${texto}` }));
}

const JANELAS = ["five_hour", "seven_day"];
const norm = (p) => String(p || "").replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");

function janelasDesligadas(cwd, agora) {
  if (!existsSync(STOPS_OFF)) return new Set();
  const o = lerJson(STOPS_OFF);
  if (o && Array.isArray(o.entradas)) {
    const todas = new Set();
    for (const e of o.entradas) for (const j of entradaSolta(e, cwd, agora)) todas.add(j);
    return todas;
  }
  return entradaSolta(o, cwd, agora);
}

function entradaSolta(o, cwd, agora) {
  const nada = new Set();
  if (!o || typeof o !== "object" || typeof o.ordem !== "string" || !o.ordem.trim()) return nada;
  if (NAO_E_HUMANO.test(o.ordem)) return nada;
  if (o.ate !== undefined && !(typeof o.ate === "number" && seg(o.ate) > agora)) return nada;
  if (o.projeto !== undefined) {
    if (typeof o.projeto !== "string" || !o.projeto.trim()) return nada;
    const p = norm(o.projeto), c = norm(cwd);
    if (!(c === p || c.startsWith(p + "/"))) return nada;
  }
  if (o.janelas === undefined) return new Set(JANELAS);
  if (!Array.isArray(o.janelas) || !o.janelas.length ||
      o.janelas.some((j) => !JANELAS.includes(j))) return nada;
  return new Set(o.janelas);
}

function coletar(agora) {
  let arquivos = [];
  try {
    arquivos = readdirSync(DIR)
      .filter((n) => /^estado(-[A-Za-z0-9_-]+)?\.json$/.test(n))
      .map((n) => join(DIR, n));
  } catch { arquivos = [ESTADO]; }
  if (!arquivos.length) arquivos = [ESTADO];

  const vistos = new Set();
  const amostras = [];
  for (const f of arquivos) {
    const e = lerJson(f);
    if (!e) continue;
    const chave = `${e.session_id ?? "?"}|${e.ts ?? "?"}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    amostras.push(e);
  }
  return amostras;
}

function melhor(amostras, agora, janela) {
  let n = null, idadeMin = null, zeraN = null;
  for (const e of amostras) {
    const w = e?.[janela];
    const u = w?.used_percentage;
    if (u == null) continue;
    const zera = seg(w?.resets_at);
    if (zera != null && zera <= agora) continue;
    const idade = e?.ts ? agora - seg(e.ts) : null;
    if (idade != null && idade > VELHO_S * 4) continue;
    const v = Math.round(u);
    if (n == null || v > n) { n = v; zeraN = zera; }
    if (idade != null && (idadeMin == null || idade < idadeMin)) idadeMin = idade;
  }
  return { valor: n, idade: idadeMin, zera: zeraN };
}

function avaliar(agora, off = new Set()) {
  const amostras = coletar(agora);
  if (!amostras.length) return { parar: false, anomalia: "sem leitura de consumo (nenhum estado*.json legível) — a parada não tem como julgar" };

  const m5 = melhor(amostras, agora, "five_hour");
  const m7 = melhor(amostras, agora, "seven_day");
  const n5 = m5.valor, n7 = m7.valor;
  if (n5 == null && n7 == null) return { parar: false, anomalia: "nenhuma sessão gravou número de consumo utilizável" };

  const julga5 = !off.has("five_hour"), julga7 = !off.has("seven_day");
  const soltas = [];
  if (!julga5 && n5 != null && n5 >= STOP_5H) soltas.push(`janela de 5 h em ${n5}% ≥ ${STOP_5H}%`);
  if (!julga7 && n7 != null && n7 >= STOP_7D) soltas.push(`janela semanal em ${n7}% ≥ ${STOP_7D}%`);
  const soltasMsg = soltas.length ? `${soltas.join("; ")} — trava solta por ordem do usuário. Seguindo` : null;

  if (julga5 && n5 != null && n5 >= STOP_5H) return { parar: true, motivo: `janela de 5 h em ${n5}% ≥ ${STOP_5H}%` };
  if (julga7 && n7 != null && n7 >= STOP_7D) return { parar: true, motivo: `janela semanal em ${n7}% ≥ ${STOP_7D}%` };

  const temJulgada = (julga5 && n5 != null) || (julga7 && n7 != null);
  if (!temJulgada) return soltasMsg ? { parar: false, anomalia: soltasMsg } : { parar: false };

  const idades = [julga5 ? m5.idade : null, julga7 ? m7.idade : null].filter((x) => x != null);
  const idade = idades.length ? Math.min(...idades) : null;
  const velho = idade == null || idade > VELHO_S;
  const a5 = julga5 && n5 != null && n5 >= VIGILIA_5H;
  const a7 = julga7 && n7 != null && n7 >= VIGILIA_7D;

  if (velho) {
    const quanto = idade == null ? "sem carimbo de hora" : `${Math.round(idade / 60)} min`;
    if (a5 || a7) {
      return {
        parar: true,
        motivo: `leitura de consumo VELHA (${quanto}) e o último valor conhecido já estava alto ` +
          `(5 h ${n5 ?? "?"}%, semana ${n7 ?? "?"}%). Parando por precaução: o consumo só sobe ` +
          `dentro da janela, e sem leitura fresca não dá para saber se já passou de ${STOP_5H}%`,
      };
    }
    const velhaMsg = `leitura de consumo VELHA (${quanto}); último valor: 5 h ${n5 ?? "?"}%, semana ${n7 ?? "?"}%. ` +
      `A barra de status pode ter parado de gravar — a parada dura está julgando por dado antigo`;
    return { parar: false, anomalia: [velhaMsg, soltasMsg].filter(Boolean).join(". ") };
  }
  return soltasMsg ? { parar: false, anomalia: soltasMsg } : { parar: false };
}

function main() {
  let entrada = {};
  try { entrada = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* segue com {} */ }

  const agora = Math.floor(Date.now() / 1000);
  const v = avaliar(agora, janelasDesligadas(entrada.cwd || process.cwd(), agora));

  if (!v.parar) {
    if (v.anomalia) avisar(`${v.anomalia}.`);
    return;
  }
  const tool = entrada.tool_name || "";
  const alvo = entrada.tool_input?.file_path || "";
  if ((tool === "Write" || tool === "Edit") && PERMITIDO_SALVAR.test(alvo)) return;
  if (PERMITIDO_AGENDAR.test(tool)) return;

  negar(v.motivo);
}

const PERMITIDO_AGENDAR = /^(CronCreate|CronList|CronDelete|ToolSearch)$/;

const SALVAR_5H = CFG.salvar5h, SALVAR_7D = CFG.salvar7d;

export {
  CFG, coletar, melhor, avaliar, janelasDesligadas, lerJson, seg,
  STOP_5H, STOP_7D, SALVAR_5H, SALVAR_7D, VELHO_S, DIR, PERMITIDO_SALVAR, PERMITIDO_AGENDAR,
};

const executadoDireto = (() => {
  try { return !!process.argv[1] && fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1]).toLowerCase(); }
  catch { return true; }
})();

if (executadoDireto) {
  try {
    main();
  } catch (err) {
    avisar(
      `O GUARDA DE PARADA FALHOU (${err && err.message ? err.message : "erro desconhecido"}). ` +
      `As paradas de 5 h e semanal NÃO estão sendo aplicadas agora. Conserte ` +
      `parada-dura.mjs antes de continuar trabalho longo.`
    );
  }
}
