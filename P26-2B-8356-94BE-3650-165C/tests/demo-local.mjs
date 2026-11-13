/**
 * Ambiente de demonstração local (zero dependências) — para ver a interface com dados realistas.
 *
 *   node tests/demo-local.mjs
 *
 * O que faz:
 *   1. recria um D1 local em %TEMP%\avalia-demo (o D1 local falha em caminhos com acento/OneDrive);
 *   2. aplica as migrações (wrangler d1 migrations apply DB --local --persist-to ...);
 *   3. grava um aluno de demonstração, uma sessão (SHA-256 do token) e 9 disciplinas em 2 semestres,
 *      cobrindo todas as situações (aprovado garantido, em andamento, exame inevitável, exame com
 *      média final, reprovado, recém-criada sem notas) nas escalas 0–10 e 0–100;
 *   4. sobe `wrangler pages dev --port 8788` (troque com DEMO_PORT) e imprime a URL e o comando
 *      para definir o cookie no navegador. Ctrl+C encerra o servidor.
 * Nunca usa --remote nem a URL de produção.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WIN = process.platform === "win32";
const PORTA = Number(process.env.DEMO_PORT || 8788);
const BASE = `http://127.0.0.1:${PORTA}`;
const PERSIST = join(tmpdir(), "avalia-demo");

const aspas = (a) => (WIN && /[\s"&|<>^()%!]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
function comandoNpx(args) {
  if (!WIN) return ["npx", ["--yes", "wrangler", ...args], {}];
  return [["npx.cmd", "--yes", "wrangler", ...args].map(aspas).join(" "), [], { shell: true }];
}
function wrangler(args) {
  const [cmd, argv, extra] = comandoNpx(args);
  const r = spawnSync(cmd, argv, {
    cwd: RAIZ, encoding: "utf8", env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" },
    timeout: 180_000, ...extra,
  });
  if (r.status !== 0) throw new Error(`wrangler ${args.slice(0, 3).join(" ")} falhou (código ${r.status}):\n${r.stdout}\n${r.stderr}`);
  return r.stdout;
}

/* ───────────── dados de demonstração ───────────── */
const USUARIO = "200000000000000001";
const sql = (s) => `'${String(s).replace(/'/g, "''")}'`;
const n = (v) => (v === null ? "NULL" : String(v));

// [nome, semestre, max, aprov, exame, final, [[avaliação, tipo, peso, nota|null], ...]]
const DISCIPLINAS = [
  // 2026.2 — semestre atual
  ["Engenharia de Requisitos", "2026.2", 10, 7, 4, 5, [ // aprovação garantida antes do fim
    ["Prova 1", "prova", 30, 9.5], ["Prova 2", "prova", 30, 9], ["Trabalho em grupo", "trabalho", 25, 8.5], ["Listas", "lista", 15, null]]],
  ["Estruturas de Dados", "2026.2", 10, 7, 4, 5, [ // em andamento
    ["Prova 1", "prova", 35, 6.5], ["Prova 2", "prova", 35, null], ["Trabalho prático", "trabalho", 20, 8],
    ["Lista 1", "lista", 5, 9], ["Lista 2", "lista", 5, null]]],
  ["Cálculo II", "2026.2", 10, 7, 4, 5, [ // exame inevitável
    ["Prova 1", "prova", 40, 3], ["Prova 2", "prova", 40, 4], ["Listas de exercícios", "lista", 20, null]]],
  ["Banco de Dados", "2026.2", 100, 70, 40, 50, [ // escala 0–100, concluída, exame com média final
    ["Prova 1", "prova", 40, 55], ["Prova 2", "prova", 40, 48], ["Projeto de modelagem", "trabalho", 20, 70]]],
  ["Interação Humano-Computador", "2026.2", 10, 7, 4, 5, [ // reprovado antes do fim
    ["Prova 1", "prova", 45, 1], ["Prova 2", "prova", 45, 1.5], ["Lista", "lista", 10, null]]],
  ["Gestão de Projetos", "2026.2", 10, 7, 4, 5, [ // recém-criada, sem notas
    ["Prova 1", "prova", 35, null], ["Prova 2", "prova", 35, null], ["Trabalho", "trabalho", 20, null], ["Listas de exercícios", "lista", 10, null]]],
  // 2026.1 — semestre anterior (concluído)
  ["Programação Orientada a Objetos", "2026.1", 10, 7, 4, 5, [
    ["Prova 1", "prova", 35, 8], ["Prova 2", "prova", 35, 7.5], ["Projeto final", "trabalho", 20, 9], ["Listas", "lista", 10, 10]]],
  ["Matemática Discreta", "2026.1", 10, 7, 4, 5, [
    ["Prova 1", "prova", 40, 5], ["Prova 2", "prova", 40, 6], ["Listas", "lista", 20, 7]]],
  ["Sistemas Operacionais", "2026.1", 100, 70, 40, 50, [
    ["Prova 1", "prova", 50, 80], ["Prova 2", "prova", 50, 74]]],
];

function sqlSeed(tokenHash) {
  const expira = Math.floor(Date.now() / 1000) + 7 * 86400 - 60;
  const linhas = [
    `INSERT INTO usuarios (user_id, username, avatar_url) VALUES (${sql(USUARIO)}, 'Ana Demonstração', NULL);`,
    `INSERT INTO sessoes (token_hash, user_id, expira_em) VALUES (${sql(tokenHash)}, ${sql(USUARIO)}, ${expira});`,
  ];
  DISCIPLINAS.forEach(([nome, sem, max, ap, ex, fin, avs], i) => {
    const id = i + 1;
    linhas.push(`INSERT INTO disciplinas (id, user_id, nome, semestre, nota_maxima, media_aprovacao, media_minima_exame, media_final_exame)
      VALUES (${id}, ${sql(USUARIO)}, ${sql(nome)}, ${sql(sem)}, ${max}, ${ap}, ${ex}, ${fin});`);
    avs.forEach(([an, tipo, peso, nota], ordem) => {
      linhas.push(`INSERT INTO avaliacoes (disciplina_id, nome, tipo, peso, nota, ordem) VALUES (${id}, ${sql(an)}, ${sql(tipo)}, ${peso}, ${n(nota)}, ${ordem});`);
    });
  });
  return linhas.join("\n");
}

/* ───────────── execução ───────────── */
let servidor = null;
function derrubar() {
  if (!servidor || servidor.exitCode !== null) return;
  try {
    if (WIN) spawnSync("taskkill", ["/pid", String(servidor.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-servidor.pid, "SIGTERM");
  } catch { /* já encerrado */ }
}
for (const sinal of ["SIGINT", "SIGTERM", "SIGBREAK"]) {
  process.on(sinal, () => { console.log("\nEncerrando o servidor de demonstração…"); derrubar(); process.exit(0); });
}
process.on("exit", derrubar);

async function esperarPronto(limiteMs = 120_000) {
  const ate = Date.now() + limiteMs;
  while (Date.now() < ate) {
    if (servidor.exitCode !== null) throw new Error(`wrangler pages dev terminou (código ${servidor.exitCode}).`);
    try {
      const r = await fetch(`${BASE}/api/status`);
      if (r.ok && (await r.json()).d1Conectado) return;
    } catch { /* subindo */ }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  throw new Error(`Servidor não respondeu em ${limiteMs / 1000}s.`);
}

rmSync(PERSIST, { recursive: true, force: true });
mkdirSync(PERSIST, { recursive: true });
console.log(`D1 de demonstração em ${PERSIST}`);
process.stdout.write("Aplicando migrações… ");
wrangler(["d1", "migrations", "apply", "DB", "--local", "--persist-to", PERSIST]);
console.log("ok");

const tokenSessao = randomBytes(32).toString("hex");
const arq = join(PERSIST, "seed-demo.sql");
writeFileSync(arq, sqlSeed(createHash("sha256").update(tokenSessao).digest("hex")));
process.stdout.write(`Gravando aluno, sessão e ${DISCIPLINAS.length} disciplinas… `);
try {
  wrangler(["d1", "execute", "DB", "--local", "--persist-to", PERSIST, "--file", arq]);
} finally {
  rmSync(arq, { force: true });
}
console.log("ok");

process.stdout.write(`Subindo wrangler pages dev em ${BASE}… `);
const [cmd, argv, extra] = comandoNpx(["pages", "dev", "--port", String(PORTA), "--ip", "127.0.0.1", "--persist-to", PERSIST]);
servidor = spawn(cmd, argv, {
  cwd: RAIZ, detached: !WIN, env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false", BROWSER: "none" },
  stdio: ["ignore", "pipe", "pipe"], ...extra,
});
let log = "";
const guardar = (b) => { log = (log + b.toString()).slice(-8000); };
servidor.stdout.on("data", guardar);
servidor.stderr.on("data", guardar);
try {
  await esperarPronto();
} catch (e) {
  console.error(`falhou\n${e.message}\n${log}`);
  derrubar();
  process.exit(1);
}
console.log("pronto!\n");
console.log(`  URL:     ${BASE}/`);
console.log("  Cookie:  abra a URL, pressione F12 > Console e cole:");
console.log(`           document.cookie="sid=${tokenSessao}; path=/"; location.reload()`);
console.log("\nCtrl+C encerra o servidor.");
servidor.on("exit", (c) => { console.log(`wrangler encerrou (código ${c}).`); process.exit(c ?? 0); });
