#!/usr/bin/env node
// Comandos de liga/desliga das travas (gancho UserPromptSubmit). Lê só a PRIMEIRA linha da mensagem:
// falar do assunto nunca dispara, só o comando sozinho. Soltar recusa mensagem com marca de sistema;
// armar vale sempre, porque religar proteção nunca é perigoso. Datas no fuso da máquina.
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, renameSync, unlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";

const DIR = process.env.FABRICA_ESTADO || join(homedir(), ".claude", "chao-de-fabrica", "estado");
const ARQ = join(DIR, "stops_desligados.json");
const HORA = 3600, DIA = 86400, TETO = 7 * DIA;
const NOME = { "5h": "five_hour", semana: "seven_day" };
const ROTULO = { five_hour: "5 h", seven_day: "semanal" };
const TODAS = ["five_hour", "seven_day"];
const NAO_E_HUMANO =
  /<task-notification>|<system-reminder>|<local-command|<command-name>|<cross-session-message|tool-use-id|hookSpecificOutput/i;
const FORMAS =
  'formas aceitas, sozinhas na 1ª linha: "soltar trava 5h", "soltar trava semana", com prazo opcional ' +
  '("12h", "2d" ou "até 22/09 05:00"); "armar trava 5h", "armar trava semana", "armar travas", "estado das travas".';

const lerJson = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const seg = (v) => (v > 1e12 ? Math.floor(v / 1000) : Math.floor(v));

function legivel(s) {
  const d = new Date(s * 1000);
  const dias = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const p = (n) => String(n).padStart(2, "0");
  return `${dias[d.getDay()]}, ${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function responder(texto) {
  process.stdout.write(JSON.stringify({
    systemMessage: `[TRAVAS] ${texto}`,
    hookSpecificOutput: {
      hookEventName: "UserPromptSubmit",
      additionalContext: `[TRAVAS] ${texto} Confirme isto ao usuário na primeira linha da resposta.`,
    },
  }));
}

export function primeiraLinha(prompt) {
  for (const l of String(prompt || "").split(/\r?\n/)) if (l.trim()) return l.trim();
  return "";
}

export function interpretar(linha) {
  const s = linha.toLowerCase().replace(/[.!;]+$/, "").replace(/\s+/g, " ").trim();
  let m;
  if (s === "estado das travas") return { acao: "estado" };
  if (s === "armar travas") return { acao: "armar_tudo" };
  if ((m = s.match(/^armar trava (5h|semana)$/))) return { acao: "armar", janela: NOME[m[1]] };
  if ((m = s.match(/^soltar trava (5h|semana)$/))) return { acao: "soltar", janela: NOME[m[1]], prazo: null };
  if ((m = s.match(/^soltar trava (5h|semana) (\d{1,3}) ?(h|d)$/)))
    return { acao: "soltar", janela: NOME[m[1]], prazo: { rel: Number(m[2]) * (m[3] === "h" ? HORA : DIA) } };
  if ((m = s.match(/^soltar trava (5h|semana) at[eé] (\d{1,2})\/(\d{1,2}) (\d{1,2}):(\d{2})$/)))
    return { acao: "soltar", janela: NOME[m[1]], prazo: { abs: m.slice(2, 6).map(Number) } };
  if (/^(soltar|armar) travas?\b/.test(s) || /^estado das travas\b/.test(s)) return { acao: "invalido" };
  return null;
}

function viradaDaSemana(agora) {
  let fim = null;
  try {
    for (const n of readdirSync(DIR)) {
      if (!/^estado(-[A-Za-z0-9_-]+)?\.json$/.test(n)) continue;
      const r = lerJson(join(DIR, n))?.seven_day?.resets_at;
      if (typeof r === "number" && seg(r) > agora) fim = Math.max(fim ?? 0, seg(r));
    }
  } catch { /* sem leitura */ }
  return fim;
}

function prazoDe(cmd, agora) {
  let ate, nota = "";
  if (!cmd.prazo) {
    if (cmd.janela === "seven_day") {
      ate = viradaDaSemana(agora);
      if (ate) nota = " (padrão: até a semana virar)";
      else { ate = agora + DIA; nota = " (padrão: 24 h — a barra não informou quando a semana vira)"; }
    } else { ate = agora + DIA; nota = " (padrão: 24 h)"; }
  } else if (cmd.prazo.rel != null) {
    if (cmd.prazo.rel <= 0) return { erro: "prazo zero ou negativo" };
    ate = agora + cmd.prazo.rel;
  } else {
    const [dia, mes, hh, mm] = cmd.prazo.abs;
    if (mes < 1 || mes > 12 || hh > 23 || mm > 59) return { erro: "data ou hora inválida" };
    const ano = new Date(agora * 1000).getFullYear();
    const conf = new Date(ano, mes - 1, dia, hh, mm);
    const utc = Math.floor(conf.getTime() / 1000);
    if (conf.getDate() !== dia || conf.getMonth() !== mes - 1) return { erro: "essa data não existe" };
    if (utc <= agora) return { erro: `${legivel(utc)} já passou` };
    ate = utc;
  }
  if (ate - agora > TETO) { ate = agora + TETO; nota += " (limitado ao teto de 7 dias)"; }
  return { ate, nota };
}

function projetoDe(cwd) {
  const casa = resolve(homedir());
  let d = resolve(cwd || process.cwd()), achado = null;
  for (let i = 0; i < 40; i++) {
    if (d !== casa && existsSync(join(d, "CLAUDE.md"))) achado = d;
    const p = dirname(d);
    if (p === d) break;
    d = p;
  }
  return (achado || resolve(cwd || process.cwd())).replace(/\\/g, "/");
}

function entradasAtuais(agora) {
  const o = lerJson(ARQ);
  if (!o) return [];
  const lista = Array.isArray(o.entradas) ? o.entradas : [o];
  return lista.filter((e) => e && typeof e === "object" && !(typeof e.ate === "number" && seg(e.ate) <= agora));
}

function semJanela(entradas, janela) {
  const out = [];
  for (const e of entradas) {
    const js = (Array.isArray(e.janelas) ? e.janelas : TODAS).filter((j) => j !== janela);
    if (js.length) out.push({ ...e, janelas: js });
  }
  return out;
}

function gravar(entradas) {
  if (!entradas.length) { if (existsSync(ARQ)) unlinkSync(ARQ); return; }
  mkdirSync(DIR, { recursive: true });
  const tmp = ARQ + ".tmp";
  writeFileSync(tmp, JSON.stringify({ entradas }, null, 2), "utf8");
  renameSync(tmp, ARQ);
}

function descrever(entradas) {
  if (!entradas.length) return "todas as travas ARMADAS (5 h e semanal).";
  const partes = [];
  for (const j of TODAS) {
    const e = entradas.find((x) => (Array.isArray(x.janelas) ? x.janelas : TODAS).includes(j));
    partes.push(e
      ? `${ROTULO[j]} SOLTA até ${typeof e.ate === "number" ? legivel(seg(e.ate)) : "SEM PRAZO"}` +
        (e.projeto ? ` em ${e.projeto}` : " em qualquer pasta")
      : `${ROTULO[j]} ARMADA`);
  }
  return partes.join("; ") + ".";
}

function main() {
  let entrada = {};
  try { entrada = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return; }
  const prompt = String(entrada.prompt ?? "");
  const cmd = interpretar(primeiraLinha(prompt));
  if (!cmd) return;
  const agora = Math.floor(Date.now() / 1000);

  if (cmd.acao === "invalido") return responder(`comando não reconhecido — NADA mudou. ${FORMAS}`);
  if (cmd.acao === "estado") return responder(`estado: ${descrever(entradasAtuais(agora))}`);
  if (cmd.acao === "armar_tudo") {
    gravar([]);
    return responder(`todas as travas ARMADAS (5 h e semanal).`);
  }
  if (cmd.acao === "armar") {
    const resto = semJanela(entradasAtuais(agora), cmd.janela);
    gravar(resto);
    return responder(`trava ${ROTULO[cmd.janela]} ARMADA. Agora: ${descrever(resto)}`);
  }
  if (NAO_E_HUMANO.test(prompt)) {
    return responder("recusado: a mensagem traz marca de texto de sistema, e soltar trava só vale " +
      "de mensagem digitada por você. NADA mudou.");
  }
  const p = prazoDe(cmd, agora);
  if (p.erro) return responder(`prazo recusado (${p.erro}) — NADA mudou. ${FORMAS}`);
  const nova = {
    ordem: primeiraLinha(prompt),
    quem: "digitado pelo usuário (gancho travas-comando)",
    desde: new Date(agora * 1000).toISOString(),
    janelas: [cmd.janela],
    ate: p.ate,
    ate_legivel: legivel(p.ate),
    projeto: projetoDe(entrada.cwd),
  };
  const todas = [...semJanela(entradasAtuais(agora), cmd.janela), nova];
  gravar(todas);
  return responder(`trava ${ROTULO[cmd.janela]} SOLTA até ${legivel(p.ate)}${p.nota}, só em ` +
    `${nova.projeto}. Agora: ${descrever(todas)}`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    main();
  } catch (err) {
    responder(`o gancho de travas FALHOU (${err && err.message ? err.message : "erro desconhecido"}). ` +
      "O arquivo das travas pode não ter mudado — confira com \"estado das travas\" antes de contar com ele.");
  }
}
