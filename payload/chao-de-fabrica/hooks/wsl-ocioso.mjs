#!/usr/bin/env node
// WSL OCIOSO (gancho PostToolUse em Bash|PowerShell, assíncrono). Só age no Windows.
// A VM do WSL sobe com systemd (e docker, se houver) a cada wsl.exe e continua segurando 1 GB ou mais
// depois que o comando acaba. Numa máquina de pouca RAM isso derruba o resto. Este gancho desliga a VM
// quando ela fica ociosa.
//
// Depois de um comando que chamou wsl, espera alguns segundos e roda `wsl --shutdown` SOMENTE se:
//   1. nenhum wsl.exe está rodando no Windows (outra sessão em primeiro plano), e
//   2. dentro da VM não há processo de usuário (fora da lista de sistema) nem container rodando, e
//   3. a conferência 1, repetida logo antes de desligar, continua zero.
// Qualquer dúvida ou erro = NÃO desliga. Desligar mataria o trabalho de outra sessão; manter só custa RAM.
// Comando em segundo plano: um vigia destacado espera o wsl.exe acabar e só então decide (teto de 3 h).
//
// Desligar o gancho: criar <estado>/wsl_ocioso_desligado.json (qualquer conteúdo).
// Registro de toda decisão: <estado>/wsl_ocioso.log
import { execFileSync, spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DIR = process.env.FABRICA_ESTADO || join(homedir(), ".claude", "chao-de-fabrica", "estado");
const LOG = join(DIR, "wsl_ocioso.log");
const DESLIGADO = join(DIR, "wsl_ocioso_desligado.json");
const ESPERA_MS = Number(process.env.WSL_OCIOSO_ESPERA_MS ?? 4000);

// Processos da própria VM, do WSL e de serviços de fundo: não contam como "alguém usando".
export const SISTEMA = new Set([
  "init", "systemd", "(sd-pam)", "systemd-journal", "systemd-udevd", "systemd-resolve", "systemd-timesyn",
  "systemd-logind", "systemd-network", "systemd-userdbd", "systemd-userwor", "dbus-daemon", "dbus-broker",
  "dbus-broker-lau", "cron", "rsyslogd", "polkitd", "agetty", "login", "snapd", "unattended-upgr",
  "wsl-pro-service", "dockerd", "containerd", "containerd-shim", "containerd-shim-runc-v2", "networkd-dispat",
  "udisksd", "ModemManager", "packagekitd", "multipathd", "Relay", "SessionLeader", "plan9", "gns",
  "avahi-daemon", "kthreadd", "atd", "irqbalance", "chronyd", "ntpd", "sshd", "wslconnect",
  // a própria conferência deste gancho
  "sh", "ps", "docker",
]);

// wsl como COMANDO (início, ou depois de espaço ; & | aspas parênteses), não dentro de nome de arquivo.
export function comandoUsaWsl(cmd) {
  if (typeof cmd !== "string") return false;
  if (!/(^|[\s;&|("'])wsl(\.exe)?(?=\s|$|["');&|])/i.test(cmd)) return false;
  if (/\bwsl(\.exe)?\s+(--shutdown|--terminate|-t\s|--list|-l\b|--status|--version)/i.test(cmd)) return false;
  return true;
}

export function contarWslExe(saidaTasklist) {
  return String(saidaTasklist).split(/\r?\n/).filter((l) => /^"wsl\.exe"/i.test(l.trim())).length;
}

// saida = linhas de `ps -eo pid=,ppid=,comm=`, depois "---", depois ids de containers.
// Toda VM recém-ligada tem uma sessão de console do próprio WSL (login -> bash), mesmo sem ninguém:
// o bash cujo pai é "login" não conta. O bash interativo de uma pessoa aparece como wsl.exe no Windows.
export function usoDentroDaVm(saida) {
  const [psParte, dockerParte = ""] = String(saida).split(/^---\s*$/m);
  const procs = psParte.split(/\r?\n/).map((s) => s.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(\d+)\s+(\d+)\s+(.+)$/);
    return m ? { pid: m[1], ppid: m[2], comm: m[3].trim() } : { pid: null, ppid: null, comm: l };
  });
  const nome = new Map(procs.filter((p) => p.pid).map((p) => [p.pid, p.comm]));
  const usuarios = procs.filter((p) => {
    const c = p.comm;
    if (SISTEMA.has(c)) return false;
    if (/^(kworker|ksoftirqd|migration|rcu_|cpuhp|idle_inject|jbd2|hv_|systemd-|Relay\(|init\(|init-|\()/.test(c)) return false;
    if (/^-?bash$/.test(c) && nome.get(p.ppid) === "login") return false;
    return true;
  }).map((p) => p.comm);
  const containers = dockerParte.split(/\r?\n/).map((s) => s.trim()).filter((s) => /^[0-9a-f]{6,}$/i.test(s));
  return { usuarios, containers, ocupada: usuarios.length > 0 || containers.length > 0 };
}

function registrar(msg) {
  try { mkdirSync(DIR, { recursive: true }); appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`, "utf8"); } catch { /* nada */ }
}

function wslExeRodando() {
  const out = execFileSync("tasklist", ["/FI", "IMAGENAME eq wsl.exe", "/FO", "CSV", "/NH"], { encoding: "utf8", windowsHide: true });
  return contarWslExe(out);
}

function vmLigada() {
  const buf = execFileSync("wsl.exe", ["-l", "--running", "-q"], { windowsHide: true });
  const txt = buf.toString("utf16le").replace(/\0/g, "").trim();
  return txt.length > 0 && !/n.o h. distribui|no running|There are no/i.test(txt);
}

function conferirDentro() {
  return execFileSync("wsl.exe", ["-e", "sh", "-c", "ps -eo pid=,ppid=,comm=; echo ---; docker ps -q 2>/dev/null || true"],
    { encoding: "utf8", windowsHide: true, timeout: 15000 });
}

async function main() {
  let entrada = "";
  for await (const pedaco of process.stdin) entrada += pedaco;
  if (process.platform !== "win32") return;
  let dados = {};
  try { dados = JSON.parse(entrada || "{}"); } catch { return; }
  const cmd = dados?.tool_input?.command;
  if (!comandoUsaWsl(cmd)) return;
  const sid = String(dados?.session_id || "?").slice(0, 8);
  if (existsSync(DESLIGADO)) { registrar(`${sid} gancho desligado por arquivo; nada feito`); return; }
  if (dados?.tool_input?.run_in_background) {
    const filho = spawn(process.execPath, [fileURLToPath(import.meta.url), "--vigiar", sid],
      { detached: true, stdio: "ignore", windowsHide: true });
    filho.unref();
    registrar(`${sid} comando em segundo plano; vigia ${filho.pid} decide quando o wsl.exe acabar`);
    return;
  }
  await new Promise((r) => setTimeout(r, ESPERA_MS));
  decidir(sid);
}

async function vigiar(sid) {
  const fim = Date.now() + 3 * 3600 * 1000;
  await new Promise((r) => setTimeout(r, 30000));
  while (Date.now() < fim) {
    try { if (wslExeRodando() === 0) break; } catch { registrar(`${sid} vigia: erro no tasklist; não desliguei`); return; }
    await new Promise((r) => setTimeout(r, 30000));
  }
  if (Date.now() >= fim) { registrar(`${sid} vigia: 3 h sem o wsl.exe acabar; desisti, não desliguei`); return; }
  await new Promise((r) => setTimeout(r, ESPERA_MS));
  decidir(sid + " vigia");
}

function decidir(sid) {
  try {
    const n1 = wslExeRodando();
    if (n1 > 0) { registrar(`${sid} mantida: ${n1} wsl.exe de outra sessão`); return; }
    if (!vmLigada()) { registrar(`${sid} VM já desligada`); return; }
    const uso = usoDentroDaVm(conferirDentro());
    if (uso.ocupada) {
      registrar(`${sid} mantida: processos=${uso.usuarios.slice(0, 20).join(",")} containers=${uso.containers.length}`);
      return;
    }
    const n2 = wslExeRodando();
    if (n2 > 0) { registrar(`${sid} mantida na 2a conferência: ${n2} wsl.exe`); return; }
    execFileSync("wsl.exe", ["--shutdown"], { windowsHide: true, timeout: 30000 });
    registrar(`${sid} DESLIGADA: ociosa (sem wsl.exe, sem processo de usuário, sem container)`);
  } catch (e) {
    registrar(`${sid} erro na conferência (${e?.name || "Erro"}); não desliguei`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  if (process.argv[2] === "--vigiar") vigiar(String(process.argv[3] || "?")).catch(() => {});
  else main().catch(() => {});
}
