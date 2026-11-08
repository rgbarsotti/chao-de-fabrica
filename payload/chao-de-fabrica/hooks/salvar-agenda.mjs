#!/usr/bin/env node
// AVISO DE SALVAR + DESPERTADOR (ganchos PostToolUse e UserPromptSubmit).
//
// A 90% da janela de 5 h ou a 93% da semanal: salvar tudo e programar a volta para 5 minutos depois
// da renovação. Só o modelo consegue criar o despertador (CronCreate), então este gancho detecta a
// travessia do limiar e injeta UMA instrução com a hora já calculada. Uma vez por janela, por sessão
// e por agente. O número vem da mesma agregação da parada dura. Nunca bloqueia nada.
import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";
import { DIR as ESTADO } from "./parada-dura.mjs";

const MARCA = join(ESTADO, "salvar_avisado.json");
const REPETE_AVISO_S = 1800;
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/** "ter 29/09 05:05" no fuso da máquina. */
export function horaLocal(s) {
  const d = new Date(s * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${DIAS[d.getDay()]} ${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Expressão cron de 5 campos no fuso local (o CronCreate interpreta no fuso local). */
export function cronLocal(s) {
  const d = new Date(s * 1000);
  return `${d.getMinutes()} ${d.getHours()} ${d.getDate()} ${d.getMonth() + 1} *`;
}

/** Hora da renovação e do despertador. Sem `resets_at` não há o que calcular. */
export function despertador(zera, margemS) {
  if (zera == null) return { renov: null, acorda: null };
  return { renov: zera, acorda: zera + margemS };
}

function textoInstrucao({ janela, valor, limiar, idade, d, subagente, parado, margemMin }) {
  const rotulo = janela === "five_hour" ? "5 h" : "semana";
  const nome = janela === "five_hour" ? "janela de 5 h" : "janela SEMANAL";
  const velha = idade != null && idade > 900 ? ` (leitura de ${Math.round(idade / 60)} min atrás; o consumo só sobe)` : "";
  const cab = `[SALVAR ${janela === "five_hour" ? "5h" : "semana"}] A ${nome} chegou a ${valor}% (limiar ${limiar}%)${velha}.`;
  const pare = parado ? " A PARADA DURA JÁ ESTÁ ATIVA: só passam Write/Edit em _processos, docs/_progresso, memória, STATUS.md, SESSION_LOG e CronCreate/CronList/ToolSearch." : "";
  if (subagente) {
    return `${cab}${pare} Você é SUBAGENTE: (1) grave no SEU diário em _processos/_logs/<processo>/ onde parou, com FEITO / PRÓXIMO / CUIDADO; (2) faça commit do que compila, com o estado REAL na mensagem; (3) não comece passo novo e ENCERRE devolvendo ao orquestrador. Não crie despertador: isso é do orquestrador.`;
  }
  let agenda;
  if (d.acorda == null) {
    agenda = `(3) a leitura NÃO trouxe a hora de renovação: use a hora "zera" da barra de status + ${margemMin} min e crie o despertador com CronCreate (recurring: false).`;
  } else {
    agenda = `(3) crie UM despertador único: CronCreate com cron "${cronLocal(d.acorda)}" e recurring: false = ${horaLocal(d.acorda)}, renovação ${horaLocal(d.renov)} + ${margemMin} min. ` +
      `Prompt do despertador: "Retomada automática (${rotulo} renovada): leia o diário do processo em voo e o STATUS.md, confirme no disco (git log/status) e reative cada agente interrompido por SendMessage, nunca relance do zero." ` +
      `(Se CronCreate não aparecer na lista de ferramentas, carregue com ToolSearch "select:CronCreate".)`;
  }
  const hora = d.acorda ? horaLocal(d.acorda) : "?";
  const fecho = janela === "seven_day"
    ? ` (4) O despertador é DA SESSÃO: volta com \`claude --continue\` se a hora ainda não passou, e a sessão pode não viver até lá. Escreva a RETOMADA no STATUS.md (o que está em voo, agente por agente, próximo passo, onde está o diário) e diga ao usuário numa linha: "se fechar o terminal, reabra com \`claude --continue\` nesta pasta antes de ${hora}; se já tiver passado, diga 'retome'". (5) Confirme: salvo, despertador ${hora}.`
    : ` (4) Confirme ao usuário numa linha: salvo, despertador ${hora}.`;
  return `${cab}${pare} Faça AGORA, nesta ordem: (1) grave no diário do processo em voo (_processos/_logs/<processo>/orquestrador.md) o que está em voo, agente por agente, com ID e próximo passo de cada um, e faça commit do que compila; (2) não lance agente nem tarefa nova; ${agenda}${fecho}`;
}

/** Núcleo puro: decide o que injetar e devolve a marca atualizada. */
export function decidir({ G, agora, cwd, sessao, agente, marca }) {
  const m = marca && typeof marca === "object" ? marca : {};
  const chave = `${sessao || "?"}|${agente || "main"}`;
  const reg = { ...(m[chave] || {}) };
  const injetar = [], avisos = [], resumo = [];

  const amostras = G.coletar(agora);
  const off = G.janelasDesligadas(cwd, agora);
  const lim = { five_hour: G.SALVAR_5H, seven_day: G.SALVAR_7D };
  const stop = { five_hour: G.STOP_5H, seven_day: G.STOP_7D };
  const ms = { five_hour: G.melhor(amostras, agora, "five_hour"), seven_day: G.melhor(amostras, agora, "seven_day") };
  const parado = ["five_hour", "seven_day"].some((j) => !off.has(j) && ms[j].valor != null && ms[j].valor >= stop[j]);
  const margemMin = G.CFG.margemMin;

  let semNumero = true, velhaAbaixo = false;
  for (const janela of ["five_hour", "seven_day"]) {
    const { valor, idade, zera } = ms[janela];
    if (valor == null) continue;
    semNumero = false;
    if (off.has(janela)) continue;
    if (valor < lim[janela]) { if (idade == null || idade > G.VELHO_S) velhaAbaixo = true; continue; }
    const d = despertador(zera, margemMin * 60);
    const periodo = janela === "five_hour" ? 18000 : 604800;
    const id = zera ?? `sem-hora-${Math.floor(agora / periodo)}`;
    if (reg[janela] === id) continue;
    reg[janela] = id;
    injetar.push(textoInstrucao({ janela, valor, limiar: lim[janela], idade, d, subagente: !!agente, parado, margemMin }));
    resumo.push(`${janela === "five_hour" ? "5h" : "semana"} ${valor}%` + (agente ? " (subagente: salvar e encerrar)" : d.acorda ? ` -> despertador ${horaLocal(d.acorda)}` : " -> sem hora de renovação na leitura"));
  }

  const ultimoAviso = typeof m._aviso_ts === "number" ? m._aviso_ts : 0;
  const podeAvisar = agora - ultimoAviso >= REPETE_AVISO_S;
  let marcouAviso = false;
  if (!amostras.length || semNumero) {
    if (podeAvisar) {
      avisos.push("aviso de SALVAR SEM LEITURA de consumo: a barra de status não gravou número utilizável. O número só existe em contas Pro, Max e Ultra, depois da primeira resposta da sessão. Sem ele, o SALVAR e o despertador não disparam.");
      marcouAviso = true;
    }
  } else if (velhaAbaixo && !injetar.length && podeAvisar) {
    avisos.push("aviso de SALVAR julgando por leitura de consumo VELHA (mais de 15 min). Se a barra parou de gravar, o limiar pode passar sem o aviso.");
    marcouAviso = true;
  }

  const nova = {};
  for (const [k, v] of Object.entries(m)) {
    if (k.startsWith("_") || k === chave || !v || typeof v !== "object") continue;
    if (typeof v.ts === "number" && v.ts > agora - 8 * 86400) nova[k] = v;
  }
  for (const j of ["five_hour", "seven_day"]) if (typeof reg[j] === "number" && reg[j] <= agora) delete reg[j];
  reg.ts = agora;
  nova[chave] = reg;
  nova._aviso_ts = marcouAviso ? agora : ultimoAviso;
  return { injetar, avisos, resumo, marca: nova };
}

function lerMarca() { try { return JSON.parse(readFileSync(MARCA, "utf8")); } catch { return {}; } }
function gravarMarca(o) {
  mkdirSync(ESTADO, { recursive: true });
  const tmp = MARCA + ".tmp";
  writeFileSync(tmp, JSON.stringify(o, null, 1), "utf8");
  renameSync(tmp, MARCA);
}

async function main() {
  let entrada = {};
  try { entrada = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* segue */ }
  const evento = entrada.hook_event_name === "UserPromptSubmit" ? "UserPromptSubmit" : "PostToolUse";
  const G = await import("./parada-dura.mjs");
  const agora = Math.floor(Date.now() / 1000);
  const r = decidir({ G, agora, cwd: entrada.cwd || process.cwd(), sessao: entrada.session_id, agente: entrada.agent_id, marca: lerMarca() });
  gravarMarca(r.marca);
  const saida = {};
  if (r.injetar.length) saida.hookSpecificOutput = { hookEventName: evento, additionalContext: r.injetar.join("\n\n") };
  const msgs = [];
  if (r.resumo.length) msgs.push(`[SALVAR] ${r.resumo.join("; ")}: instrução de salvar e agendar entregue ao modelo.`);
  for (const a of r.avisos) msgs.push(`[SALVAR] ${a}`);
  if (msgs.length) saida.systemMessage = msgs.join(" ");
  if (Object.keys(saida).length) process.stdout.write(JSON.stringify(saida));
}

if (process.argv[1] && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase()) {
  main().catch((err) => {
    process.stdout.write(JSON.stringify({
      systemMessage: `[SALVAR] O AVISO DE SALVAR FALHOU (${err && err.message ? err.message : "erro"}). O limiar NÃO vai gerar instrução de salvar nem despertador. A parada dura é outro arquivo e segue valendo.`,
    }));
  });
}
