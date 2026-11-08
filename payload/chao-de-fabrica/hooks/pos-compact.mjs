#!/usr/bin/env node
// Gancho SessionStart (matcher "compact"): depois de toda compactação, reinjeta o estado que vive no
// disco: as últimas linhas do diário que ESTA conversa gravou por último ou, na falta dele, do
// orquestrador.md mais recente das últimas 48 h. Sem rede, sem subprocesso.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const LINHAS = 15;
const JANELA_FALLBACK_S = 48 * 3600;

function cauda(p, n) {
  try {
    const t = readFileSync(p, "utf8").split(/\r?\n/).filter((l) => l.trim().length);
    return t.slice(-n).join("\n");
  } catch { return null; }
}

function orquestradorMaisRecente(logs) {
  let melhor = null, mt = 0;
  try {
    for (const proc of readdirSync(logs)) {
      const p = join(logs, proc, "orquestrador.md");
      if (!existsSync(p)) continue;
      const m = statSync(p).mtimeMs;
      if (m > mt) { mt = m; melhor = p; }
    }
  } catch { return null; }
  return melhor && Date.now() - mt < JANELA_FALLBACK_S * 1000 ? melhor : null;
}

async function main() {
  let entrada = {};
  try { entrada = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { /* segue */ }
  const raiz = process.env.CLAUDE_PROJECT_DIR || entrada.cwd || process.cwd();
  const logs = join(raiz, "_processos", "_logs");
  let diario = null, origem = "";
  try {
    const { lerRastro } = await import("./compact-seguro.mjs");
    const r = lerRastro(entrada.transcript_path);
    if (r.diarioArquivo && existsSync(r.diarioArquivo) && /_processos[\\/]_logs/i.test(r.diarioArquivo)) {
      diario = r.diarioArquivo; origem = "último diário gravado por esta conversa";
    }
  } catch { /* segue para o plano B */ }
  if (!diario) { diario = orquestradorMaisRecente(logs); origem = "orquestrador.md mais recente (48 h)"; }

  let ctx = "[PÓS-COMPACT] O contexto foi compactado. Antes de qualquer ação: (1) leia o diário do processo em voo abaixo e confirme no disco (git log/status); (2) leia STATUS.md e docs/DECISOES.md do projeto; (3) agentes em voo continuam rodando: retome por SendMessage com o id do diário, nunca relance.";
  const c = diario ? cauda(diario, LINHAS) : null;
  if (c) ctx += `\n--- últimas ${LINHAS} linhas de ${diario} (${origem}) ---\n${c}`;
  else ctx += "\n(nenhum diário de processo gravado por esta conversa nem orquestrador.md nas últimas 48 h: procure em _processos/_logs e no STATUS.md)";
  process.stdout.write(JSON.stringify({ suppressOutput: true, hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: ctx } }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: "[PÓS-COMPACT] O contexto foi compactado e o gancho falhou ao ler o diário: leia _processos/_logs e o STATUS.md antes de agir." } }));
});
