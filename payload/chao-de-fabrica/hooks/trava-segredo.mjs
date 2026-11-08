#!/usr/bin/env node
// Trava MECÂNICA contra vazamento de credencial (gancho PreToolUse).
// Fronteira é runtime, não prompt. Saída 2 cancela a chamada e devolve o motivo ao agente.
// Vale para o orquestrador e para todo subagente. O log guarda só o motivo, nunca o comando.
import { readFileSync, appendFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const REGRAS = [
  [/(^|[\s|;&(`])env\s*($|\||[;&>])/i, "o comando `env` despeja todas as variáveis de ambiente, credenciais inclusive"],
  [/docker\s+(exec|run)[^|;&]*\benv\b/i, "`docker exec ... env` despeja o ambiente do container, onde vivem as chaves"],
  [/\bprintenv\b/i, "`printenv` despeja variáveis de ambiente"],
  [/(^|[\s|;&(`])set\s*($|\|)/i, "`set` sozinho despeja o ambiente do shell"],
  [/\bdocker\s+inspect\b/i, "`docker inspect` devolve as variáveis de ambiente do container em JSON"],
  [/\baws\s+configure\s+get\b/i, "`aws configure get` imprime credencial armazenada"],
  [/\bos\.environ\b(?![\s\S]{0,40}\.get\()/i, "leitura direta de os.environ em linha de comando pode imprimir segredo"],
  [/(cat|head|tail|sed|awk|cut|strings|xxd|od|less|more|type|Get-Content)\b[^|;&]*(\.env\b|\.env\.|\/secrets?\/|credential|\.pem\b|\.key\b|\.p12\b|\.pfx\b|id_rsa|id_ed25519|\.ssh\/)/i, "comando que emite conteúdo apontado para arquivo de segredo"],
  [/\becho\s+\$\{?(AWS_|ANTHROPIC_|OPENAI_|.*SECRET|.*TOKEN|.*_KEY)/i, "echo de variável que contém credencial"],
];

const ALVO_LEITURA = /(^|[\\/])\.env(\.|$)|[\\/]secrets?[\\/]|credential|\.pem$|\.key$|\.p12$|\.pfx$|id_rsa|id_ed25519|[\\/]\.ssh[\\/]/i;

export function avaliar(entrada) {
  const ti = entrada?.tool_input || {};
  const nome = entrada?.tool_name || "";
  if (typeof ti.command === "string" && ti.command.trim()) {
    if (ti.command.includes("DONO-AUTORIZA-SEGREDO")) return { escape: true };
    for (const [re, motivo] of REGRAS) if (re.test(ti.command)) return { motivo };
    return null;
  }
  if (nome === "Read" && typeof ti.file_path === "string" && ALVO_LEITURA.test(ti.file_path)) {
    return { motivo: "leitura direta de arquivo de segredo" };
  }
  return null;
}

function registrar(texto) {
  try {
    const dir = process.env.FABRICA_ESTADO || join(homedir(), ".claude", "chao-de-fabrica", "estado");
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "trava-segredo.log"), `${new Date().toISOString()}\t${texto}\n`, "utf8");
  } catch { /* log nunca derruba a trava */ }
}

function main() {
  let entrada;
  try { entrada = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { return 0; }
  const r = avaliar(entrada);
  if (!r) return 0;
  if (r.escape) { registrar("ESCAPE-USADO"); return 0; }
  registrar(`BLOQUEADO\t${r.motivo}`);
  process.stderr.write(`BLOQUEADO PELA TRAVA DE SEGREDO.

Motivo: ${r.motivo}.

A trava é mecânica: não lê intenção e não tem exceção para "só quero ver o formato".
Sobre arquivo, variável ou metadado que possa conter credencial, só são permitidos:
    wc -c <arquivo>             (tamanho)
    wc -l <arquivo>             (número de linhas)
    grep -c <padrão> <arquivo>  (contagem)

Precisa saber algo sobre a credencial? Pergunte ao usuário.
Precisa USAR a credencial? Rode o código dentro do ambiente que já a tem, sem imprimir o valor.
`);
  return 2;
}

if (process.argv[1] && /trava-segredo\.mjs$/.test(process.argv[1])) process.exitCode = main();
