#!/usr/bin/env node
// COMPACTAÇÃO SEGURA (ganchos PreCompact, PostToolUse e UserPromptSubmit).
// Quem compacta é o auto-compact nativo. Este gancho só ADIA enquanto não for seguro: esta conversa
// precisa ter gravado o diário há até 20 min e depois do último resultado de agente. Nunca adia com
// ctx em 50% ou mais, nem compactação manual. Anti-loop: duas automáticas com menos de 10 min, a
// segunda é adiada. Também detecta sessão com janela de compactação diferente da do arquivo de
// configurações. O desconto do limiar nativo (33 mil tokens) foi medido na versão 2.1.282.
import { mkdirSync, readFileSync, writeFileSync, renameSync, openSync, readSync, fstatSync, closeSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const ESTADO = process.env.FABRICA_ESTADO || join(homedir(), ".claude", "chao-de-fabrica", "estado");
const MARCA = join(ESTADO, "compact_marca.json");
const REGISTRO = join(ESTADO, "compact_registro.log");
const SETTINGS = process.env.FABRICA_SETTINGS || join(homedir(), ".claude", "settings.json");
const agoraS = () => Number(process.env.FABRICA_AGORA) || Math.floor(Date.now() / 1000);

export const C = {
  AVISO_ANTES: 5,
  TETO_PCT: 50,
  DIARIO_MAX_S: 20 * 60,
  ANTI_LOOP_S: 10 * 60,
  REARMA_PCT: 15,
  RASTRO_BYTES: 6 * 1024 * 1024,
  JANELA_PADRAO: 1_000_000,
  DESCONTO_LIMIAR: 20000 + 13000,
  DIVERGE_FRACAO: 0.85,
  SUB_RECENTE_S: 180,
  QUEDA_PCT: 10,
  AVISO_DIVERGE_S: 30 * 60,
  PROVA_DIVERGE_S: 30 * 60, // compactação abaixo do limiar nos últimos 30 min = janela em memória divergente
};
const DIARIO_RE = /(_processos[\\/]_logs|STATUS\.md|SESSION_LOG\.md|docs[\\/]_progresso)/i;
const FERRAMENTA_ESCRITA = /^(Write|Edit|MultiEdit|NotebookEdit)$/;
const FERRAMENTA_SHELL = /^(Bash|PowerShell)$/;

const RE_REDIR = /(?:^|[^<>&])(?:\d|&)?>>?(?!&)\s*("([^"]+)"|'([^']+)'|([^\s;|&()<>]+))/g;
const RE_TEE = /\btee\b((?:\s+-{1,2}[A-Za-z-]+)*)((?:\s+(?:"[^"]+"|'[^']+'|[^\s;|&()<>"']+))+)/g;
export function alvosDeEscrita(cmd) {
  const s = String(cmd || "");
  const alvos = [];
  for (const m of s.matchAll(RE_REDIR)) alvos.push(m[2] ?? m[3] ?? m[4]);
  for (const m of s.matchAll(RE_TEE)) {
    for (const a of m[2].matchAll(/"([^"]+)"|'([^']+)'|([^\s"']+)/g)) alvos.push(a[1] ?? a[2] ?? a[3]);
  }
  return alvos.filter(Boolean).map((a) => a.replace(/^\/([A-Za-z])\//, (_, l) => `${l.toUpperCase()}:/`));
}

const lerJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

export function lerRastro(caminho, bytes = C.RASTRO_BYTES) {
  const r = { ultimoDiario: null, diarioArquivo: null, ultimaNotif: null, ultimoCompact: null, lido: false };
  if (!caminho || !existsSync(caminho)) return r;
  let fd;
  try {
    fd = openSync(caminho, "r");
    const tam = fstatSync(fd).size;
    const n = Math.min(tam, bytes);
    const buf = Buffer.alloc(n);
    readSync(fd, buf, 0, n, tam - n);
    let linhas = buf.toString("utf8").split("\n");
    if (n < tam) linhas = linhas.slice(1);
    r.lido = true;
    for (const l of linhas) {
      if (!l.includes("task-notification") && !l.includes('"tool_use"') && !l.includes("compact_boundary")) continue;
      let o; try { o = JSON.parse(l); } catch { continue; }
      if (o.isSidechain) continue;
      const ts = o.timestamp ? Math.floor(Date.parse(o.timestamp) / 1000) : null;
      if (ts == null || Number.isNaN(ts)) continue;
      if (o.type === "system" && o.subtype === "compact_boundary") {
        if (r.ultimoCompact == null || ts > r.ultimoCompact) { r.ultimoCompact = ts; r.ultimoCompactPre = o.compactMetadata?.preTokens ?? null; }
      } else if (o.type === "queue-operation" && o.operation === "enqueue" && String(o.content || "").includes("<task-notification>")) {
        if (r.ultimaNotif == null || ts > r.ultimaNotif) r.ultimaNotif = ts;
      } else if (o.type === "user") {
        const c = o.message?.content;
        const txt = typeof c === "string" ? c : Array.isArray(c) ? c.map((x) => (typeof x?.text === "string" ? x.text : "")).join(" ") : "";
        if (txt.includes("<task-notification>") && (r.ultimaNotif == null || ts > r.ultimaNotif)) r.ultimaNotif = ts;
      } else if (o.type === "assistant" && Array.isArray(o.message?.content)) {
        for (const b of o.message.content) {
          if (b?.type !== "tool_use") continue;
          let alvos;
          if (FERRAMENTA_ESCRITA.test(b.name || "")) alvos = [b.input?.file_path || b.input?.notebook_path || ""];
          else if (FERRAMENTA_SHELL.test(b.name || "")) alvos = alvosDeEscrita(String(b.input?.command || ""));
          else continue;
          for (const alvo of alvos) {
            if (DIARIO_RE.test(alvo) && (r.ultimoDiario == null || ts >= r.ultimoDiario)) { r.ultimoDiario = ts; r.diarioArquivo = alvo; }
          }
        }
      }
    }
  } catch { /* r.lido fica como estiver */ }
  finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
  return r;
}

export function limiarNativo(janelaTokens, tamanhoCtx) {
  if (!janelaTokens) return null;
  const w = Math.min(Math.max(janelaTokens, 100000), tamanhoCtx || C.JANELA_PADRAO);
  return w - C.DESCONTO_LIMIAR;
}

export function subagentesAtivos(transcript, sessao, agora) {
  const out = [];
  if (!transcript || !sessao) return out;
  const pasta = join(dirname(transcript), String(sessao), "subagents");
  let nomes = [];
  try { nomes = readdirSync(pasta).filter((n) => n.endsWith(".jsonl")); } catch { return out; }
  for (const n of nomes) {
    const p = join(pasta, n);
    let fd;
    try {
      const st = statSync(p);
      if (st.mtimeMs / 1000 < agora - C.SUB_RECENTE_S) continue;
      fd = openSync(p, "r");
      const k = Math.min(st.size, 512 * 1024), buf = Buffer.alloc(k);
      readSync(fd, buf, 0, k, st.size - k);
      const linhas = buf.toString("utf8").split("\n");
      let tokens = null, fronteira = null;
      for (let i = linhas.length - 1; i >= 0 && (tokens == null || fronteira == null); i--) {
        const l = linhas[i];
        if (fronteira == null && l.includes("compact_boundary")) {
          try { const o = JSON.parse(l); if (o.subtype === "compact_boundary") fronteira = { ts: Math.floor(Date.parse(o.timestamp) / 1000), pre: o.compactMetadata?.preTokens ?? null }; } catch {}
        } else if (tokens == null && l.includes('"usage"')) {
          try { const u = JSON.parse(l).message?.usage; if (u) tokens = (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0); } catch {}
        }
      }
      if (tokens != null) out.push({ arquivo: n, tokens, fronteira });
    } catch { /* arquivo sumiu ou ilegível: ignora */ }
    finally { if (fd !== undefined) try { closeSync(fd); } catch {} }
  }
  return out;
}

export function decidirPreCompact({ trigger, agente, ctxPct, rastro, ultimoCompact, agora, janela = null, tamanhoCtx = null, ativos = [] }) {
  if (trigger !== "auto") return { bloquear: false, motivo: "compactação manual: sempre passa", registrar: true };
  if (agente) return { bloquear: false, motivo: "compactação de subagente: não é adiada", registrar: false };
  if (ctxPct == null) return { bloquear: false, motivo: "sem leitura de ctx: não dá para julgar, deixa passar (adiar às cegas pode fazer a requisição falhar no limite)", registrar: true };
  if (ctxPct >= C.TETO_PCT) return { bloquear: false, motivo: `ctx ${ctxPct}% ≥ teto ${C.TETO_PCT}%: passa sempre (segurança acima de completude)`, registrar: true };
  const lim = limiarNativo(janela, tamanhoCtx);
  if (lim != null) {
    const principal = Math.round((ctxPct / 100) * (tamanhoCtx || C.JANELA_PADRAO));
    const maior = Math.max(principal, ...ativos.map((a) => a.tokens || 0));
    const fronteiras = [rastro?.ultimoCompact ? { ts: rastro.ultimoCompact, pre: rastro.ultimoCompactPre } : null, ...ativos.map((a) => a.fronteira)];
    const baixa = fronteiras.find((f) => f && f.pre != null && f.pre < lim * C.DIVERGE_FRACAO && agora - f.ts < C.PROVA_DIVERGE_S);
    if (baixa) {
      return { bloquear: true, divergente: true, registrar: false,
        motivo: `JANELA DIVERGENTE: houve compactação há ${Math.round((agora - baixa.ts) / 60)} min com só ${Math.round(baixa.pre / 1000)}k tokens, abaixo do limiar das configurações (${Math.round(lim / 1000)}k para autoCompactWindow ${janela}). A sessão está com OUTRA janela em memória (o arquivo só vale no lançamento): rode /autocompact ${janela} nesta sessão ou reinicie o Claude Code. Adiada para não entrar no loop "Autocompact is thrashing".` };
    }
    if (maior < lim * C.DIVERGE_FRACAO) {
      return { bloquear: true, divergente: true, registrar: false,
        motivo: `JANELA DIVERGENTE: pediu compactação com a principal em ${Math.round(principal / 1000)}k e ${ativos.length} subagente(s) ativo(s) (maior ${Math.round(maior / 1000)}k), tudo abaixo do limiar das configurações (${Math.round(lim / 1000)}k para autoCompactWindow ${janela}). A sessão está com OUTRA janela em memória (o arquivo só vale no lançamento): rode /autocompact ${janela} nesta sessão ou reinicie o Claude Code. Adiada para não entrar no loop "Autocompact is thrashing".` };
    }
    if (principal < lim * C.DIVERGE_FRACAO && maior >= lim * C.DIVERGE_FRACAO) {
      return { bloquear: false, motivo: `pedido de SUBAGENTE: principal em ${Math.round(principal / 1000)}k, subagente ativo em ${Math.round(maior / 1000)}k (limiar ${Math.round(lim / 1000)}k): passa`, registrar: false };
    }
  }
  if (ultimoCompact != null && agora - ultimoCompact < C.ANTI_LOOP_S) {
    return { bloquear: true, motivo: `ANTI-LOOP: esta sessão compactou há ${Math.round((agora - ultimoCompact) / 60)} min (mínimo ${C.ANTI_LOOP_S / 60} min entre automáticas). Se isto se repetir, o gatilho está ABAIXO do piso de contexto: é um loop de compactação`, registrar: false };
  }
  if (!rastro?.lido) return { bloquear: false, motivo: "transcript ilegível: não dá para conferir o diário, deixa passar", registrar: true };
  if (rastro.ultimoDiario == null) return { bloquear: true, motivo: "nenhuma gravação de diário (_processos/_logs, STATUS.md, SESSION_LOG, docs/_progresso) nesta conversa recente", registrar: false };
  const idade = agora - rastro.ultimoDiario;
  if (idade > C.DIARIO_MAX_S) return { bloquear: true, motivo: `diário desta conversa gravado há ${Math.round(idade / 60)} min (máximo ${C.DIARIO_MAX_S / 60} min)`, registrar: false };
  if (rastro.ultimaNotif != null && rastro.ultimaNotif > rastro.ultimoDiario) {
    return { bloquear: true, motivo: "chegou resultado de agente/tarefa DEPOIS da última gravação do diário — o resultado ainda não está no disco", registrar: false };
  }
  return { bloquear: false, motivo: `seguro: diário gravado há ${Math.round(idade / 60)} min, depois do último resultado`, registrar: true };
}

export function lerAutoCompact(caminho = SETTINGS) {
  const s = lerJson(caminho);
  if (!s) return { ligado: null, janela: null };
  return {
    ligado: s.autoCompactEnabled === undefined ? true : s.autoCompactEnabled === true,
    janela: typeof s.autoCompactWindow === "number" ? s.autoCompactWindow : null,
  };
}

export function gatilhoPct(janelaTokens, tamanhoCtx) {
  const tam = tamanhoCtx || C.JANELA_PADRAO;
  if (!janelaTokens) return 100;
  return Math.round((Math.min(Math.max(janelaTokens, 100000), tam) / tam) * 100);
}

export function decidirAviso({ ctxPct, auto, tamanhoCtx, reg, agora }) {
  const r = { ...(reg || {}) };
  const injetar = [], avisos = [];
  if (ctxPct == null) return { injetar, avisos, reg: r };
  const g = gatilhoPct(auto.janela, tamanhoCtx);

  if (r.ctxAnterior != null && ctxPct <= r.ctxAnterior - C.QUEDA_PCT) {
    r.ultimoCompact = agora; r.piso = ctxPct; r.pisoMedido = true; r.loopAvisado = false;
  }
  r.ctxAnterior = ctxPct;
  r.ultimaLeitura = agora;
  if (r.divergente && r.divergente - (r.divergenteAvisado || 0) >= C.AVISO_DIVERGE_S) {
    avisos.push(`JANELA DIVERGENTE: o auto-compact desta sessão quis compactar abaixo do limiar do autoCompactWindow das configurações (${auto.janela}). A sessão guarda a janela do LANÇAMENTO; mudar o arquivo não muda a sessão em curso. O gancho está ADIANDO essas compactações (sem loop). Para alinhar: /autocompact ${auto.janela} nesta sessão, ou reiniciar o Claude Code. Registro: ~/.claude/chao-de-fabrica/estado/compact_registro.log.`);
    r.divergenteAvisado = r.divergente;
  }
  if (auto.ligado && r.pisoMedido && r.piso != null && r.piso >= g - C.AVISO_ANTES && !r.loopAvisado) {
    avisos.push(`RISCO DE LOOP DE COMPACT: depois da última compactação o ctx ficou em ${r.piso}%, e o gatilho do auto-compact está em ${g}% (autoCompactWindow ${auto.janela ?? "padrão"}). Piso a menos de ${C.AVISO_ANTES} pontos do gatilho = compacta de novo logo em seguida. O anti-loop segura 1 compactação a cada ${C.ANTI_LOOP_S / 60} min; suba o autoCompactWindow ou corte o piso.`);
    r.loopAvisado = true;
  }
  if (r.loopSuspeito && r.loopSuspeito > (r.loopSuspeitoAvisado || 0)) {
    avisos.push(`RISCO DE LOOP DE COMPACT: o auto-compact quis compactar de novo menos de ${C.ANTI_LOOP_S / 60} min depois da última. O anti-loop ADIOU; a sessão segue trabalhando e compacta no máx. 1x a cada ${C.ANTI_LOOP_S / 60} min. Causa provável: autoCompactWindow (${auto.janela ?? "padrão"}) abaixo do piso de contexto. Registro: ~/.claude/chao-de-fabrica/estado/compact_registro.log.`);
    r.loopSuspeitoAvisado = r.loopSuspeito;
  }

  if (ctxPct < C.REARMA_PCT) { r.nivel = 0; r.antesAvisado = false; }

  if (auto.ligado) {
    const limiarAntes = Math.max(C.REARMA_PCT + 1, g - C.AVISO_ANTES);
    if (ctxPct >= limiarAntes && !r.antesAvisado && g < 100) {
      injetar.push(`[COMPACT] ctx ${ctxPct}%. A compactação automática dispara perto de ${g}% (autoCompactWindow ${auto.janela}) e SÓ PASSA quando for seguro: esta conversa gravou o diário (_processos/_logs/<processo>/orquestrador.md, STATUS.md ou docs/_progresso) há no máx. ${C.DIARIO_MAX_S / 60} min E depois do último resultado de agente/tarefa. No próximo ponto seguro, grave no diário: o que está em voo, agente por agente com ID e próximo passo, e FEITO / PRÓXIMO / CUIDADO. Depois siga trabalhando; a compactação acontece sozinha.`);
      r.antesAvisado = true;
    }
    if (r.pendente && r.pendente.ts > (r.pendenteAvisado || 0)) {
      injetar.push(`[COMPACT ADIADA] ctx ${ctxPct}%: a compactação automática foi ADIADA — ${r.pendente.motivo}. Para liberar: grave AGORA no diário desta sessão o estado em voo (agentes com ID e próximo passo, resultados que chegaram, FEITO / PRÓXIMO / CUIDADO). Ela roda sozinha na próxima chamada. Acima de ${C.TETO_PCT}% ela passa de qualquer jeito.`);
      r.pendenteAvisado = agora;
    }
  } else {
    const nivel = Math.floor(ctxPct / 10) * 10;
    if (ctxPct >= 30 && nivel > (r.nivel || 0)) {
      injetar.push(`[COMPACT] ctx ${ctxPct}% e o auto-compact está DESLIGADO nas configurações. No primeiro ponto seguro: grave no diário o estado em voo (agentes com ID e próximo passo, FEITO / PRÓXIMO / CUIDADO) e diga numa linha: "ctx ${ctxPct}%, estado salvo, pode compactar".`);
      r.nivel = nivel;
    }
  }
  return { injetar, avisos, reg: r };
}

function lerMarca() { return lerJson(MARCA) || {}; }
function gravarMarca(m) {
  const agora = agoraS();
  for (const [k, v] of Object.entries(m)) if (!v || typeof v !== "object" || (v.ultimaLeitura || v.ultimoCompact || 0) < agora - 8 * 86400) delete m[k];
  mkdirSync(ESTADO, { recursive: true });
  const tmp = MARCA + ".tmp";
  writeFileSync(tmp, JSON.stringify(m, null, 1), "utf8");
  renameSync(tmp, MARCA);
}
function registrar(linha) {
  try { mkdirSync(ESTADO, { recursive: true }); writeFileSync(REGISTRO, `${new Date().toISOString()} ${linha}\n`, { flag: "a", encoding: "utf8" }); } catch {}
}
function lerCtx(sessao) {
  const e = sessao ? lerJson(join(ESTADO, `estado-${String(sessao).replace(/[^A-Za-z0-9_-]/g, "")}.json`)) : null;
  if (!e) return { pct: null, tam: null };
  const idade = e.ts ? agoraS() - e.ts : null;
  if (idade != null && idade > 600) return { pct: null, tam: e.context_size ?? null };
  return { pct: typeof e.context_pct === "number" ? Math.round(e.context_pct) : null, tam: e.context_size ?? null };
}

function main() {
  let entrada = {};
  try { entrada = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* segue */ }
  const evento = entrada.hook_event_name || "";
  const agora = agoraS();
  const sessao = entrada.session_id || "?";
  const marca = lerMarca();
  const reg = marca[sessao] || {};
  const { pct, tam } = lerCtx(entrada.session_id);

  if (evento === "PreCompact") {
    const auto = entrada.trigger === "auto" && !entrada.agent_id;
    const rastro = auto ? lerRastro(entrada.transcript_path) : null;
    const ativos = auto ? subagentesAtivos(entrada.transcript_path, entrada.session_id, agora) : [];
    const ultimoReal = Math.max(rastro?.ultimoCompact || 0, reg.ultimoCompact || 0) || null;
    const d = decidirPreCompact({
      trigger: entrada.trigger, agente: entrada.agent_id, ctxPct: pct, rastro, ultimoCompact: ultimoReal, agora,
      janela: lerAutoCompact().janela, tamanhoCtx: tam, ativos,
    });
    registrar(`PreCompact sessao=${sessao} trigger=${entrada.trigger} ctx=${pct ?? "?"} ativos=${ativos.map((a) => `${a.arquivo.slice(6, 14)}:${Math.round(a.tokens / 1000)}k`).join(",") || "-"} -> ${d.bloquear ? "ADIA" : "PASSA"}: ${d.motivo}`);
    if (d.bloquear) {
      if (d.divergente) reg.divergente = agora;
      else reg.pendente = { ts: agora, motivo: d.motivo };
      if (d.motivo.startsWith("ANTI-LOOP")) reg.loopSuspeito = agora;
    } else {
      reg.ultimaAprovacao = agora;
      delete reg.pendente;
    }
    marca[sessao] = reg; gravarMarca(marca);
    if (d.bloquear) process.stdout.write(JSON.stringify({ decision: "block", reason: `[COMPACT ADIADA] ${d.motivo}` }));
    return;
  }

  if (entrada.agent_id) return;
  const nomeEvento = evento === "UserPromptSubmit" ? "UserPromptSubmit" : "PostToolUse";
  const d = decidirAviso({ ctxPct: pct, auto: lerAutoCompact(), tamanhoCtx: tam, reg, agora });
  marca[sessao] = d.reg; gravarMarca(marca);
  const saida = {};
  if (d.injetar.length) saida.hookSpecificOutput = { hookEventName: nomeEvento, additionalContext: d.injetar.join("\n\n") };
  if (d.avisos.length) saida.systemMessage = d.avisos.map((a) => `[COMPACT] ${a}`).join(" ");
  if (Object.keys(saida).length) process.stdout.write(JSON.stringify(saida));
}

const executadoDireto = !!process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (executadoDireto) {
  try { main(); }
  catch (err) {
    process.stdout.write(JSON.stringify({ systemMessage: `[COMPACT] O gancho compact-seguro FALHOU (${err && err.message ? err.message : "erro"}). A compactação segue o comportamento nativo, sem a checagem de diário nem o anti-loop. Conserte compact-seguro.mjs.` }));
  }
}
