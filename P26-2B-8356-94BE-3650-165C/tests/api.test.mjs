/**
 * Testes de integração da API (Pages Functions + D1 local) — zero dependências.
 *
 *   node tests/api.test.mjs
 *
 * A suíte, sozinha:
 *   1. cria um diretório de persistência em os.tmpdir() (o D1 local falha em caminhos com
 *      acento/OneDrive, então nunca persiste dentro da pasta do projeto);
 *   2. aplica as migrações locais (wrangler d1 migrations apply DB --local --persist-to ...);
 *   3. cria 2 usuários e as sessões de teste direto no D1 local (token de 64 hex no cookie,
 *      SHA-256 do token em sessoes.token_hash), sem passar pelo Discord;
 *   4. sobe `wrangler pages dev` na porta 8792 (ou API_TEST_PORT) e espera /api/status;
 *   5. roda os casos em ordem, derruba o servidor (mesmo em falha), confere o banco depois
 *      da exclusão de conta e sai com código 1 se algum caso falhar.
 * Nunca usa --remote nem a URL de produção.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";
import assert from "node:assert/strict";
import { resumoDisciplina } from "../public/js/calc.js";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WIN = process.platform === "win32";
const PORTA = Number(process.env.API_TEST_PORT || 8792);
const BASE = `http://127.0.0.1:${PORTA}`;
const PERSIST = mkdtempSync(join(tmpdir(), `avalia-d1-testes-${Date.now()}-`));

/* ───────────────────────── infraestrutura ───────────────────────── */

const aspas = (a) => (WIN && /[\s"&|<>^()%!]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);

/**
 * npx.cmd só roda via shell no Windows (Node ≥ 18.20 recusa .cmd sem shell). Com shell, o
 * comando vai como UMA string já com aspas (evita o aviso DEP0190 de argumentos concatenados).
 */
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
  if (r.status !== 0) {
    throw new Error(`wrangler ${args.slice(0, 3).join(" ")} falhou (código ${r.status}):\n${r.stdout}\n${r.stderr}`);
  }
  return r.stdout;
}

function executarSql(sql) {
  const arq = join(PERSIST, `seed-${Date.now()}-${Math.random().toString(16).slice(2)}.sql`);
  writeFileSync(arq, sql);
  try {
    return wrangler(["d1", "execute", "DB", "--local", "--persist-to", PERSIST, "--file", arq]);
  } finally {
    rmSync(arq, { force: true });
  }
}

function consultar(sql) {
  const out = wrangler(["d1", "execute", "DB", "--local", "--persist-to", PERSIST, "--json", "--command", sql]);
  const json = JSON.parse(out.slice(out.indexOf("[")));
  return json[0].results;
}

let servidor = null;
let logServidor = "";

function subirServidor() {
  const [cmd, argv, extra] = comandoNpx(["pages", "dev", "--port", String(PORTA), "--ip", "127.0.0.1", "--persist-to", PERSIST]);
  servidor = spawn(cmd, argv, {
    cwd: RAIZ, detached: !WIN, env: { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false", BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"], ...extra,
  });
  const guardar = (b) => { logServidor = (logServidor + b.toString()).slice(-20_000); };
  servidor.stdout.on("data", guardar);
  servidor.stderr.on("data", guardar);
}

function derrubarServidor() {
  if (!servidor || servidor.exitCode !== null) return;
  try {
    if (WIN) spawnSync("taskkill", ["/pid", String(servidor.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-servidor.pid, "SIGTERM");
  } catch { /* já encerrado */ }
}

async function esperarPronto(limiteMs = 120_000) {
  const ate = Date.now() + limiteMs;
  while (Date.now() < ate) {
    if (servidor.exitCode !== null) throw new Error(`wrangler pages dev terminou (código ${servidor.exitCode}).\n${logServidor}`);
    try {
      const r = await fetch(`${BASE}/api/status`);
      if (r.ok && (await r.json()).d1Conectado) return;
    } catch { /* ainda subindo */ }
    await new Promise((ok) => setTimeout(ok, 500));
  }
  throw new Error(`Servidor não respondeu em ${limiteMs / 1000}s.\n${logServidor}`);
}

for (const sinal of ["SIGINT", "SIGTERM"]) process.on(sinal, () => { derrubarServidor(); process.exit(130); });
process.on("exit", derrubarServidor);

/* ───────────────────────── sessões de teste ───────────────────────── */

const sha256 = (t) => createHash("sha256").update(t).digest("hex");
const token = () => randomBytes(32).toString("hex");
const UA = "100000000000000001";
const UB = "100000000000000002";
const T = { A1: token(), A2: token(), A3: token(), B1: token(), expirada: token(), semUsuario: token() };

function sqlSeed() {
  const agora = Math.floor(Date.now() / 1000);
  const valida = agora + 7 * 86400 - 60;
  return `
INSERT INTO usuarios (user_id, username, avatar_url) VALUES ('${UA}', 'Aluna A', NULL), ('${UB}', 'Aluno B', NULL);
INSERT INTO sessoes (token_hash, user_id, expira_em) VALUES
  ('${sha256(T.A1)}', '${UA}', ${valida}),
  ('${sha256(T.A2)}', '${UA}', ${valida}),
  ('${sha256(T.A3)}', '${UA}', ${valida}),
  ('${sha256(T.B1)}', '${UB}', ${valida}),
  ('${sha256(T.expirada)}', '${UA}', ${agora - 10});
`;
}

/* ───────────────────────── cliente HTTP ───────────────────────── */

async function req(metodo, caminho, { sid, cookie, body, raw, tipo, headers = {} } = {}) {
  const h = { ...headers };
  if (sid) h.Cookie = `sid=${sid}`;
  if (cookie !== undefined) h.Cookie = cookie;
  let corpo;
  if (raw !== undefined) corpo = raw;
  else if (body !== undefined) corpo = JSON.stringify(body);
  if (corpo !== undefined && tipo !== null) h["Content-Type"] = tipo ?? "application/json";
  const init = { method: metodo, headers: h, redirect: "manual" };
  if (corpo !== undefined) {
    init.body = corpo;
    if (corpo instanceof ReadableStream) init.duplex = "half";
  }
  const res = await fetch(BASE + caminho, init);
  const texto = await res.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* não é JSON */ }
  return { status: res.status, headers: res.headers, texto, json };
}

function esperaStatus(r, status, contexto = "") {
  assert.equal(r.status, status, `${contexto} esperado HTTP ${status}, obtido ${r.status}: ${r.texto.slice(0, 300)}`);
}

/** Erro da API: status, JSON {ok:false, erro:string} e cabeçalhos da API. */
function esperaErro(r, status, contexto = "") {
  esperaStatus(r, status, contexto);
  assert.ok(r.json && r.json.ok === false && typeof r.json.erro === "string" && r.json.erro.length > 0,
    `${contexto} corpo de erro deveria ser {ok:false, erro}, veio: ${r.texto.slice(0, 200)}`);
  assert.match(r.headers.get("content-type") || "", /^application\/json/, `${contexto} Content-Type`);
  assert.equal(r.headers.get("cache-control"), "no-store", `${contexto} Cache-Control`);
}

const norm = (v) => JSON.parse(JSON.stringify(v));
function confereResumo(d, contexto = "") {
  const local = resumoDisciplina(d);
  assert.deepEqual(norm(d.resumo), norm(local), `${contexto} resumo do servidor difere de calc.js`);
}

/* ───────────────────────── casos ───────────────────────── */

const casos = [];
const teste = (nome, fn) => casos.push({ nome, fn });
const ctx = {}; // estado compartilhado entre casos (ids criados etc.)

const MODELO = () => ({
  nome: "Engenharia de Requisitos",
  semestre: "2026.2",
  nota_maxima: 10, media_aprovacao: 7, media_minima_exame: 4, media_final_exame: 5,
  avaliacoes: [
    { nome: "Prova 1", tipo: "prova", peso: 35 },
    { nome: "Prova 2", tipo: "prova", peso: 35 },
    { nome: "Trabalho", tipo: "trabalho", peso: 20 },
    { nome: "Listas", tipo: "lista", peso: 10 },
  ],
});

// ── 1. Infra e cabeçalhos ──
teste("GET /api/status: chave do projeto e D1 migrado", async () => {
  const r = await req("GET", "/api/status");
  esperaStatus(r, 200);
  assert.equal(r.json.chave, "P26-2B-8356-94BE-3650-165C");
  assert.equal(r.json.d1Conectado, true);
});

teste("página inicial: todos os cabeçalhos de public/_headers (bloco /*) presentes e exatos", async () => {
  const esperados = cabecalhosDoArquivo("/*");
  assert.ok(Object.keys(esperados).length >= 5, "bloco /* do _headers não foi lido");
  for (const caminho of ["/", "/js/app.js", "/styles.css"]) {
    const r = await req("GET", caminho);
    esperaStatus(r, 200, caminho);
    for (const [k, v] of Object.entries(esperados)) {
      assert.equal(r.headers.get(k), v, `${caminho}: cabeçalho ${k}`);
    }
  }
});

teste("API: Cache-Control exatamente no-store (sem duplicar) e nosniff, inclusive em /api/me e /api/status", async () => {
  for (const [m, c, o] of [["GET", "/api/status", {}], ["GET", "/api/me", {}], ["GET", "/api/disciplinas", { sid: T.A1 }], ["GET", "/api/nao-existe", {}]]) {
    const r = await req(m, c, o);
    assert.equal(r.headers.get("cache-control"), "no-store", `${c}`);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff", `${c}`);
    assert.match(r.headers.get("content-type") || "", /^application\/json/, `${c}`);
  }
});

// ── 2. Autenticação ──
const ROTAS_DADOS = [
  ["GET", "/api/disciplinas"],
  ["POST", "/api/disciplinas", MODELO()],
  ["GET", "/api/disciplinas/1"],
  ["PUT", "/api/disciplinas/1", MODELO()],
  ["DELETE", "/api/disciplinas/1"],
  ["PATCH", "/api/avaliacoes/1", { nota: 5 }],
  ["GET", "/api/conta/exportar"],
  ["DELETE", "/api/conta", { confirmar: "EXCLUIR" }],
];

teste("401 sem cookie em todas as rotas de dados", async () => {
  for (const [m, c, body] of ROTAS_DADOS) esperaErro(await req(m, c, { body }), 401, `${m} ${c}`);
});

teste("401 com cookie malformado / desconhecido / expirado (nunca 500)", async () => {
  const cookies = {
    "percent inválido": "sid=%E0%A4%A",
    "hex maiúsculo": `sid=${T.A1.toUpperCase()}`,
    "curto": "sid=abc",
    "token + lixo": `sid=${T.A1}x`,
    "válido mas inexistente": `sid=${T.semUsuario}`,
    "sessão expirada": `sid=${T.expirada}`,
    "vazio": "sid=",
    "sem igual": "sid",
  };
  for (const [nome, cookie] of Object.entries(cookies)) {
    for (const [m, c, body] of ROTAS_DADOS) esperaErro(await req(m, c, { cookie, body }), 401, `${nome} → ${m} ${c}`);
    const me = await req("GET", "/api/me", { cookie });
    esperaStatus(me, 200, `${nome} /api/me`);
    assert.equal(me.json.usuario, null, `${nome} /api/me`);
  }
});

teste("cookie de sessão válido entre outros cookies é reconhecido; /api/me não expõe dados acadêmicos", async () => {
  const r = await req("GET", "/api/me", { cookie: `tema=escuro; sid=${T.A1}; outro=1` });
  esperaStatus(r, 200);
  assert.deepEqual(r.json.usuario, { user_id: UA, username: "Aluna A", avatar_url: null });
  assert.equal(r.json.disciplinas, undefined);
});

// ── 3. Corpo da requisição ──
teste("415 quando o corpo não é application/json (POST, PUT, PATCH)", async () => {
  const corpo = JSON.stringify(MODELO());
  for (const [m, c] of [["POST", "/api/disciplinas"], ["PUT", "/api/disciplinas/1"], ["PATCH", "/api/avaliacoes/1"]]) {
    esperaErro(await req(m, c, { sid: T.A1, raw: corpo, tipo: "text/plain" }), 415, `${m} ${c} text/plain`);
    esperaErro(await req(m, c, { sid: T.A1, raw: new TextEncoder().encode(corpo), tipo: null }), 415, `${m} ${c} sem Content-Type`);
    esperaErro(await req(m, c, { sid: T.A1, raw: corpo, tipo: "application/x-www-form-urlencoded" }), 415, `${m} ${c} form`);
  }
  // Variações legítimas do mesmo tipo passam do filtro (chegam à validação → 400, não 415)
  esperaErro(await req("POST", "/api/disciplinas", { sid: T.A1, raw: "{}", tipo: "Application/JSON; charset=utf-8" }), 400, "maiúsculas+charset");
});

teste("400 para corpo vazio, JSON inválido, não-objeto e UTF-8 inválido", async () => {
  const casosCorpo = {
    vazio: "", espacos: "   ", quebrado: '{"nome":', array: "[]", nulo: "null", numero: "42", texto: '"oi"',
  };
  for (const [nome, raw] of Object.entries(casosCorpo)) {
    esperaErro(await req("POST", "/api/disciplinas", { sid: T.A1, raw }), 400, `POST corpo ${nome}`);
  }
  const utf8Ruim = new Uint8Array([0x7b, 0x22, 0x6e, 0x22, 0x3a, 0x22, 0xff, 0xfe, 0x22, 0x7d]);
  esperaErro(await req("POST", "/api/disciplinas", { sid: T.A1, raw: utf8Ruim }), 400, "UTF-8 inválido");
});

teste("413 para corpo acima de 20000 bytes (com Content-Length e chunked); 20000 exatos não é 413", async () => {
  const grande = JSON.stringify({ ...MODELO(), lixo: "x".repeat(20_001) });
  esperaErro(await req("POST", "/api/disciplinas", { sid: T.A1, raw: grande }), 413, "Content-Length");
  const bytes = new TextEncoder().encode(grande);
  const stream = new ReadableStream({
    start(c) { for (let i = 0; i < bytes.length; i += 4096) c.enqueue(bytes.slice(i, i + 4096)); c.close(); },
  });
  esperaErro(await req("POST", "/api/disciplinas", { sid: T.A1, raw: stream }), 413, "chunked");
  esperaErro(await req("PATCH", "/api/avaliacoes/1", { sid: T.A1, raw: grande }), 413, "PATCH grande");
  // limite exato: 20000 bytes de JSON válido → passa do limite de tamanho e cai na validação (400)
  const base = '{"x":""}';
  const exato = `{"x":"${"a".repeat(20_000 - base.length)}"}`;
  assert.equal(Buffer.byteLength(exato), 20_000);
  esperaErro(await req("POST", "/api/disciplinas", { sid: T.A1, raw: exato }), 400, "20000 bytes exatos");
});

// ── 4. Regras de validação ──
const INVALIDOS = {
  "nome com 1 caractere": (d) => { d.nome = "A"; },
  "nome com 81 caracteres": (d) => { d.nome = "N".repeat(81); },
  "nome só com espaços/controle": (d) => { d.nome = " \u0000\u0007 \t "; },
  "nome não-texto": (d) => { d.nome = 12345; },
  "semestre com 3 caracteres": (d) => { d.semestre = "202"; },
  "semestre com 21 caracteres": (d) => { d.semestre = "2".repeat(21); },
  "nota_maxima 0": (d) => { d.nota_maxima = 0; },
  "nota_maxima negativa": (d) => { d.nota_maxima = -10; },
  "nota_maxima 1001": (d) => { d.nota_maxima = 1001; },
  "nota_maxima texto": (d) => { d.nota_maxima = "dez"; },
  "nota_maxima '1e3'": (d) => { d.nota_maxima = "1e3"; },
  "nota_maxima booleano": (d) => { d.nota_maxima = true; },
  "media_aprovacao 0": (d) => { d.media_aprovacao = 0; },
  "media_aprovacao > nota_maxima": (d) => { d.media_aprovacao = 11; },
  "media_minima_exame > media_aprovacao": (d) => { d.media_minima_exame = 8; },
  "media_minima_exame negativa": (d) => { d.media_minima_exame = -1; },
  "media_final_exame 0": (d) => { d.media_final_exame = 0; },
  "media_final_exame > nota_maxima": (d) => { d.media_final_exame = 10.5; },
  "avaliacoes ausente": (d) => { delete d.avaliacoes; },
  "avaliacoes vazia": (d) => { d.avaliacoes = []; },
  "avaliacoes não-array": (d) => { d.avaliacoes = { 0: d.avaliacoes[0] }; },
  "31 avaliações": (d) => { d.avaliacoes = Array.from({ length: 31 }, (_, i) => ({ nome: `L${i}`, tipo: "lista", peso: 1 })); },
  "avaliação null": (d) => { d.avaliacoes[1] = null; },
  "avaliação array": (d) => { d.avaliacoes[1] = ["prova"]; },
  "tipo inválido (seminario)": (d) => { d.avaliacoes[0].tipo = "seminario"; },
  "tipo em maiúsculas": (d) => { d.avaliacoes[0].tipo = "Prova"; },
  "tipo ausente": (d) => { delete d.avaliacoes[0].tipo; },
  "peso 0": (d) => { d.avaliacoes[0].peso = 0; },
  "peso negativo": (d) => { d.avaliacoes[0].peso = -5; },
  "peso 0,001 (arredonda para 0)": (d) => { d.avaliacoes[0].peso = 0.001; },
  "peso > 100": (d) => { d.avaliacoes[0].peso = 101; },
  "peso texto": (d) => { d.avaliacoes[0].peso = "muito"; },
  "peso ausente": (d) => { delete d.avaliacoes[0].peso; },
  "nome da avaliação vazio": (d) => { d.avaliacoes[0].nome = "   "; },
  "nome da avaliação com 61": (d) => { d.avaliacoes[0].nome = "x".repeat(61); },
  "nota > nota máxima": (d) => { d.avaliacoes[0].nota = 10.5; },
  "nota negativa": (d) => { d.avaliacoes[0].nota = -0.5; },
  "nota texto": (d) => { d.avaliacoes[0].nota = "sete"; },
};

teste("POST /api/disciplinas: 400 para cada regra de validação, e nada é gravado", async () => {
  for (const [nome, mutar] of Object.entries(INVALIDOS)) {
    const d = MODELO();
    mutar(d);
    esperaErro(await req("POST", "/api/disciplinas", { sid: T.A1, body: d }), 400, nome);
  }
  const lista = await req("GET", "/api/disciplinas", { sid: T.A1 });
  esperaStatus(lista, 200);
  assert.deepEqual(lista.json.disciplinas, [], "nenhuma disciplina deveria ter sido criada");
});

teste("POST aceita os limites exatos e normaliza textos (espaços, controle, bidi)", async () => {
  const d = {
    nome: "  Cál\u0000culo \t\n  II‮  ", semestre: "2026",
    nota_maxima: "10,0", media_aprovacao: 10, media_minima_exame: 0, media_final_exame: 10,
    avaliacoes: [
      { nome: "y".repeat(60), tipo: "prova", peso: 100, nota: 10 },
      { nome: "z", tipo: "lista", peso: "0,01", nota: 0 },
    ],
  };
  const r = await req("POST", "/api/disciplinas", { sid: T.A1, body: d });
  esperaStatus(r, 201);
  const c = r.json.disciplina;
  assert.equal(c.nome, "Cálculo II");
  assert.equal(c.nota_maxima, 10);
  assert.equal(c.avaliacoes[1].peso, 0.01);
  assert.equal(c.avaliacoes[1].nota, 0, "nota zero é nota");
  confereResumo(c, "limites");
  const longo = await req("POST", "/api/disciplinas", { sid: T.A1, body: { ...MODELO(), nome: "N".repeat(80), semestre: "S".repeat(20) } });
  esperaStatus(longo, 201, "nome 80 / semestre 20");
  for (const id of [c.id, longo.json.disciplina.id]) esperaStatus(await req("DELETE", `/api/disciplinas/${id}`, { sid: T.A1 }), 200);
});

teste("ids inválidos → 400; id válido inexistente → 404", async () => {
  for (const id of ["0", "-1", "abc", "1.5", "1e3", "01", "%201", "99999999999999999", "0x10"]) {
    esperaErro(await req("GET", `/api/disciplinas/${id}`, { sid: T.A1 }), 400, `GET id ${id}`);
    esperaErro(await req("DELETE", `/api/disciplinas/${id}`, { sid: T.A1 }), 400, `DELETE id ${id}`);
    esperaErro(await req("PUT", `/api/disciplinas/${id}`, { sid: T.A1, body: MODELO() }), 400, `PUT id ${id}`);
    esperaErro(await req("PATCH", `/api/avaliacoes/${id}`, { sid: T.A1, body: { nota: 1 } }), 400, `PATCH id ${id}`);
  }
  esperaErro(await req("GET", "/api/disciplinas/999999", { sid: T.A1 }), 404);
  esperaErro(await req("PATCH", "/api/avaliacoes/999999", { sid: T.A1, body: { nota: 1 } }), 404);
});

// ── 5. Fluxo completo ──
teste("fluxo: criar disciplina (201) e resumo inicial confere com calc.js (nota mínima 7 em tudo)", async () => {
  const r = await req("POST", "/api/disciplinas", { sid: T.A1, body: MODELO() });
  esperaStatus(r, 201);
  const d = r.json.disciplina;
  ctx.d = d;
  ctx.av = Object.fromEntries(d.avaliacoes.map((a) => [a.nome, a.id]));
  assert.deepEqual(d.avaliacoes.map((a) => [a.nome, a.tipo, a.peso, a.nota]),
    [["Prova 1", "prova", 35, null], ["Prova 2", "prova", 35, null], ["Trabalho", "trabalho", 20, null], ["Listas", "lista", 10, null]]);
  confereResumo(d);
  assert.deepEqual(d.resumo.aprovacao, { status: "possivel", nota: 7 });
  assert.equal(d.resumo.situacao, "em_andamento");
  assert.equal(d.resumo.mediaParcial, null);
});

teste("fluxo: PATCH notas → resumo do servidor = calc.js e = conta feita à mão", async () => {
  let r = await req("PATCH", `/api/avaliacoes/${ctx.av["Prova 1"]}`, { sid: T.A1, body: { nota: 5 } });
  esperaStatus(r, 200);
  confereResumo(r.json.disciplina, "após P1");
  r = await req("PATCH", `/api/avaliacoes/${ctx.av.Trabalho}`, { sid: T.A1, body: { nota: "8,0" } });
  esperaStatus(r, 200);
  const d = r.json.disciplina;
  confereResumo(d, "após T");
  // K = 35·5 + 20·8 = 335 · R = 45 · aprovação (700−335)/45 = 8,111 → 8,12 · exame (400−335)/45 = 1,444 → 1,45
  assert.deepEqual(d.resumo.aprovacao, { status: "possivel", nota: 8.12 });
  assert.deepEqual(d.resumo.evitarReprovacao, { status: "possivel", nota: 1.45 });
  assert.equal(d.resumo.mediaParcial, 6.09);
  assert.equal(d.resumo.pontosGarantidos, 3.35);
  assert.equal(d.resumo.mediaMaxima, 7.85);
  // nota zero conta; null e "" desfazem
  r = await req("PATCH", `/api/avaliacoes/${ctx.av.Listas}`, { sid: T.A1, body: { nota: 0 } });
  assert.equal(r.json.disciplina.avaliacoes.find((a) => a.id === ctx.av.Listas).nota, 0);
  assert.equal(r.json.disciplina.resumo.restantes, 1);
  confereResumo(r.json.disciplina, "nota zero");
  r = await req("PATCH", `/api/avaliacoes/${ctx.av.Listas}`, { sid: T.A1, body: { nota: "" } });
  assert.equal(r.json.disciplina.avaliacoes.find((a) => a.id === ctx.av.Listas).nota, null);
  r = await req("PATCH", `/api/avaliacoes/${ctx.av.Listas}`, { sid: T.A1, body: { nota: null } });
  esperaStatus(r, 200);
  // GET individual e listagem devolvem o mesmo
  const g = await req("GET", `/api/disciplinas/${ctx.d.id}`, { sid: T.A1 });
  esperaStatus(g, 200);
  assert.deepEqual(g.json.disciplina, r.json.disciplina);
  const l = await req("GET", "/api/disciplinas", { sid: T.A1 });
  assert.deepEqual(l.json.disciplinas, [r.json.disciplina]);
  ctx.d = g.json.disciplina;
});

teste("PATCH: 400 para nota > máximo, negativa, texto, booleano, sem campo nota e corpo não-objeto", async () => {
  const id = ctx.av["Prova 2"];
  for (const body of [{ nota: 10.01 }, { nota: 11 }, { nota: -1 }, { nota: "abc" }, { nota: "1e1" }, { nota: true }, { nota: [5] }, { nota: { v: 5 } }, {}, { valor: 5 }]) {
    esperaErro(await req("PATCH", `/api/avaliacoes/${id}`, { sid: T.A1, body }), 400, JSON.stringify(body));
  }
  for (const raw of ["[5]", "5", "null"]) esperaErro(await req("PATCH", `/api/avaliacoes/${id}`, { sid: T.A1, raw }), 400, raw);
  const g = await req("GET", `/api/disciplinas/${ctx.d.id}`, { sid: T.A1 });
  assert.deepEqual(g.json.disciplina, ctx.d, "nada deveria ter mudado");
});

teste("PUT fórmula: renomeia, muda pesos, remove e adiciona avaliações e PRESERVA as notas lançadas", async () => {
  const body = {
    ...MODELO(), nome: "Eng. de Requisitos", media_aprovacao: 6,
    avaliacoes: [
      { id: ctx.av.Trabalho, nome: "Trabalho final", tipo: "trabalho", peso: 30, nota: 0 }, // nota enviada deve ser ignorada
      { id: ctx.av["Prova 1"], nome: "P1", tipo: "prova", peso: 40, nota: 10 },
      { nome: "Prova 3", tipo: "prova", peso: 30 },
      // Prova 2 e Listas removidas
    ],
  };
  const r = await req("PUT", `/api/disciplinas/${ctx.d.id}`, { sid: T.A1, body });
  esperaStatus(r, 200);
  const d = r.json.disciplina;
  assert.equal(d.nome, "Eng. de Requisitos");
  assert.equal(d.media_aprovacao, 6);
  assert.deepEqual(d.avaliacoes.map((a) => [a.nome, a.peso, a.nota]), [["Trabalho final", 30, 8], ["P1", 40, 5], ["Prova 3", 30, null]]);
  assert.equal(d.avaliacoes[0].id, ctx.av.Trabalho);
  assert.equal(d.avaliacoes[1].id, ctx.av["Prova 1"]);
  confereResumo(d, "após PUT");
  // (30·8 + 40·5) = 440; meta 6·100 = 600 → (600−440)/30 = 5,333 → 5,34
  assert.deepEqual(d.resumo.aprovacao, { status: "possivel", nota: 5.34 });
  // avaliações removidas não existem mais
  esperaErro(await req("PATCH", `/api/avaliacoes/${ctx.av["Prova 2"]}`, { sid: T.A1, body: { nota: 1 } }), 404, "avaliação removida");
  ctx.d = d;
  ctx.av = Object.fromEntries(d.avaliacoes.map((a) => [a.nome, a.id]));
});

teste("PUT recusa nota máxima menor que nota já lançada, id de outra disciplina, ids repetidos (400) sem alterar nada", async () => {
  const outra = await req("POST", "/api/disciplinas", { sid: T.A1, body: { ...MODELO(), nome: "Outra disciplina" } });
  esperaStatus(outra, 201);
  ctx.outra = outra.json.disciplina;
  const base = () => ({ ...MODELO(), nome: ctx.d.nome, media_aprovacao: 6,
    avaliacoes: ctx.d.avaliacoes.map(({ id, nome, tipo, peso }) => ({ id, nome, tipo, peso })) });

  const menorMax = { ...base(), nota_maxima: 6, media_aprovacao: 6, media_minima_exame: 4, media_final_exame: 5 };
  esperaErro(await req("PUT", `/api/disciplinas/${ctx.d.id}`, { sid: T.A1, body: menorMax }), 400, "nota 8 > novo máximo 6");

  const alheia = base();
  alheia.avaliacoes.push({ id: ctx.outra.avaliacoes[0].id, nome: "roubada", tipo: "prova", peso: 5 });
  esperaErro(await req("PUT", `/api/disciplinas/${ctx.d.id}`, { sid: T.A1, body: alheia }), 400, "id de outra disciplina");

  const repetida = base();
  repetida.avaliacoes.push({ ...repetida.avaliacoes[0] });
  esperaErro(await req("PUT", `/api/disciplinas/${ctx.d.id}`, { sid: T.A1, body: repetida }), 400, "id repetido");

  for (const id of [0, -3, "abc", 1.5, "1e3"]) {
    const b = base();
    b.avaliacoes[0].id = id;
    esperaErro(await req("PUT", `/api/disciplinas/${ctx.d.id}`, { sid: T.A1, body: b }), 400, `id de avaliação ${id}`);
  }
  for (const [nome, mutar] of Object.entries(INVALIDOS)) {
    const b = base();
    mutar(b);
    esperaErro(await req("PUT", `/api/disciplinas/${ctx.d.id}`, { sid: T.A1, body: b }), 400, `PUT ${nome}`);
  }
  assert.deepEqual((await req("GET", `/api/disciplinas/${ctx.d.id}`, { sid: T.A1 })).json.disciplina, ctx.d, "disciplina mudou");
  assert.deepEqual((await req("GET", `/api/disciplinas/${ctx.outra.id}`, { sid: T.A1 })).json.disciplina, ctx.outra, "outra mudou");
});

teste("DELETE disciplina → 200; depois GET/PUT/DELETE/PATCH dela → 404", async () => {
  const id = ctx.outra.id;
  esperaStatus(await req("DELETE", `/api/disciplinas/${id}`, { sid: T.A1 }), 200);
  esperaErro(await req("GET", `/api/disciplinas/${id}`, { sid: T.A1 }), 404);
  esperaErro(await req("PUT", `/api/disciplinas/${id}`, { sid: T.A1, body: MODELO() }), 404);
  esperaErro(await req("DELETE", `/api/disciplinas/${id}`, { sid: T.A1 }), 404);
  esperaErro(await req("PATCH", `/api/avaliacoes/${ctx.outra.avaliacoes[0].id}`, { sid: T.A1, body: { nota: 1 } }), 404);
  const l = await req("GET", "/api/disciplinas", { sid: T.A1 });
  assert.deepEqual(l.json.disciplinas.map((d) => d.id), [ctx.d.id]);
});

// ── 6. IDOR ──
teste("IDOR: B não lê, altera nem exclui disciplina/avaliação de A (404 idêntico ao de id inexistente)", async () => {
  const id = ctx.d.id;
  const inexistente = await req("GET", "/api/disciplinas/999999", { sid: T.B1 });
  const g = await req("GET", `/api/disciplinas/${id}`, { sid: T.B1 });
  esperaErro(g, 404, "GET");
  assert.deepEqual(g.json, inexistente.json, "a resposta não pode revelar que o id existe");
  esperaErro(await req("PUT", `/api/disciplinas/${id}`, { sid: T.B1, body: MODELO() }), 404, "PUT");
  esperaErro(await req("DELETE", `/api/disciplinas/${id}`, { sid: T.B1 }), 404, "DELETE");
  for (const av of ctx.d.avaliacoes) {
    esperaErro(await req("PATCH", `/api/avaliacoes/${av.id}`, { sid: T.B1, body: { nota: 0 } }), 404, `PATCH ${av.id}`);
  }
  const lb = await req("GET", "/api/disciplinas", { sid: T.B1 });
  assert.deepEqual(lb.json.disciplinas, []);
  // B tenta "adotar" uma avaliação de A dentro da própria disciplina
  const db = await req("POST", "/api/disciplinas", { sid: T.B1, body: { ...MODELO(), nome: "Disciplina de B", semestre: "2026.1" } });
  esperaStatus(db, 201);
  ctx.dB = db.json.disciplina;
  const adotar = { ...MODELO(), nome: "Disciplina de B", semestre: "2026.1",
    avaliacoes: [{ id: ctx.d.avaliacoes[0].id, nome: "hack", tipo: "prova", peso: 1 }] };
  esperaErro(await req("PUT", `/api/disciplinas/${ctx.dB.id}`, { sid: T.B1, body: adotar }), 400, "adotar avaliação de A");
  // A continua exatamente igual
  assert.deepEqual((await req("GET", `/api/disciplinas/${id}`, { sid: T.A1 })).json.disciplina, ctx.d);
  // e o inverso: A não vê B
  esperaErro(await req("GET", `/api/disciplinas/${ctx.dB.id}`, { sid: T.A1 }), 404, "A → B");
  esperaErro(await req("PATCH", `/api/avaliacoes/${ctx.dB.avaliacoes[0].id}`, { sid: T.A1, body: { nota: 1 } }), 404, "A → B PATCH");
});

// ── 7. CSRF / origem ──
teste("403 para escrita vinda de outra origem (Origin ou Sec-Fetch-Site), e nada é alterado", async () => {
  const evil = { Origin: "http://evil.example" };
  esperaErro(await req("POST", "/api/disciplinas", { sid: T.A1, body: MODELO(), headers: evil }), 403, "POST Origin");
  esperaErro(await req("PATCH", `/api/avaliacoes/${ctx.av.P1}`, { sid: T.A1, body: { nota: 0 }, headers: { "Sec-Fetch-Site": "cross-site" } }), 403, "PATCH Sec-Fetch-Site");
  esperaErro(await req("PUT", `/api/disciplinas/${ctx.d.id}`, { sid: T.A1, body: MODELO(), headers: { Origin: "null" } }), 403, "PUT Origin null");
  esperaErro(await req("DELETE", `/api/disciplinas/${ctx.d.id}`, { sid: T.A1, headers: evil }), 403, "DELETE disciplina");
  esperaErro(await req("DELETE", "/api/conta", { sid: T.A1, body: { confirmar: "EXCLUIR" }, headers: evil }), 403, "DELETE conta");
  esperaErro(await req("POST", "/api/auth/logout", { sid: T.A1, headers: evil }), 403, "logout");
  esperaErro(await req("POST", "/api/disciplinas", { sid: T.A1, body: MODELO(), headers: { Origin: `http://127.0.0.1:${PORTA + 1}` } }), 403, "outra porta");
  assert.deepEqual((await req("GET", `/api/disciplinas/${ctx.d.id}`, { sid: T.A1 })).json.disciplina, ctx.d);
  assert.equal((await req("GET", "/api/me", { sid: T.A1 })).json.usuario?.user_id, UA, "sessão continua válida");
  // mesma origem passa; leitura de outra origem não é bloqueada pelo middleware (a CORS do navegador cuida)
  esperaErro(await req("POST", "/api/disciplinas", { sid: T.A1, raw: "{}", headers: { Origin: BASE, "Sec-Fetch-Site": "same-origin" } }), 400, "mesma origem");
  esperaStatus(await req("GET", "/api/disciplinas", { sid: T.A1, headers: evil }), 200);
  const r = await req("GET", "/api/disciplinas", { sid: T.A1, headers: evil });
  assert.equal(r.headers.get("access-control-allow-origin"), null, "API não deve liberar CORS");
});

// ── 8. Rotas e métodos ──
teste("404 em JSON para rota de API inexistente (qualquer método)", async () => {
  for (const [m, c] of [["GET", "/api/nao-existe"], ["POST", "/api/nao-existe"], ["GET", "/api/disciplinas/1/extra"], ["GET", "/api/avaliacoes"], ["DELETE", "/api/x/y/z"]]) {
    const r = await req(m, c, { sid: T.A1, raw: m === "GET" ? undefined : "{}" });
    esperaErro(r, 404, `${m} ${c}`);
    assert.ok(!r.texto.includes("<html"), "não pode cair no index.html");
  }
});

teste("405 com cabeçalho Allow (e OPTIONS 204) para métodos não suportados", async () => {
  const esperado = [
    ["POST", "/api/me", "GET, HEAD, OPTIONS"],
    ["DELETE", "/api/status", "GET, HEAD, OPTIONS"],
    ["DELETE", "/api/disciplinas", "GET, HEAD, POST, OPTIONS"],
    ["PATCH", "/api/disciplinas/1", "GET, HEAD, PUT, DELETE, OPTIONS"],
    ["POST", "/api/disciplinas/1", "GET, HEAD, PUT, DELETE, OPTIONS"],
    ["GET", "/api/avaliacoes/1", "PATCH, OPTIONS"],
    ["PUT", "/api/avaliacoes/1", "PATCH, OPTIONS"],
    ["POST", "/api/conta/exportar", "GET, HEAD, OPTIONS"],
    ["GET", "/api/conta", "DELETE, OPTIONS"],
    ["GET", "/api/auth/logout", "POST, OPTIONS"],
    ["POST", "/api/auth/discord", "GET, HEAD, OPTIONS"],
  ];
  for (const [m, c, allow] of esperado) {
    const r = await req(m, c, { sid: T.A1, raw: ["GET"].includes(m) ? undefined : "{}" });
    esperaErro(r, 405, `${m} ${c}`);
    assert.equal(r.headers.get("allow"), allow, `${m} ${c} Allow`);
    const o = await req("OPTIONS", c);
    esperaStatus(o, 204, `OPTIONS ${c}`);
    assert.equal(o.headers.get("allow"), allow, `OPTIONS ${c} Allow`);
  }
});

teste("HEAD em rota GET responde como o GET, sem corpo", async () => {
  const h = await req("HEAD", "/api/status");
  esperaStatus(h, 200, "HEAD /api/status");
  assert.equal(h.texto.length, 0, "HEAD sem corpo");
  assert.match(h.headers.get("content-type") || "", /application\/json/, "HEAD Content-Type");
  const semLogin = await req("HEAD", "/api/disciplinas");
  esperaStatus(semLogin, 401, "HEAD /api/disciplinas sem sessão");
});

// ── 9. Limite de disciplinas ──
teste("limite de 40 disciplinas por usuário → 409 na 41ª", async () => {
  const atual = (await req("GET", "/api/disciplinas", { sid: T.B1 })).json.disciplinas.length;
  for (let i = atual; i < 40; i++) {
    esperaStatus(await req("POST", "/api/disciplinas", { sid: T.B1, body: { ...MODELO(), nome: `Extra ${String(i).padStart(2, "0")}` } }), 201, `criar ${i + 1}ª`);
  }
  esperaErro(await req("POST", "/api/disciplinas", { sid: T.B1, body: MODELO() }), 409, "41ª");
  assert.equal((await req("GET", "/api/disciplinas", { sid: T.B1 })).json.disciplinas.length, 40);
  ctx.snapshotB = (await req("GET", "/api/disciplinas", { sid: T.B1 })).json.disciplinas;
});

// ── 10. Exportação ──
teste("GET /api/conta/exportar: cabeçalhos de download e conteúdo igual a GET /api/disciplinas", async () => {
  const r = await req("GET", "/api/conta/exportar", { sid: T.A1 });
  esperaStatus(r, 200);
  assert.equal(r.headers.get("content-disposition"), `attachment; filename="meus-dados-${UA}.json"`);
  assert.match(r.headers.get("content-type") || "", /^application\/json/);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  const lista = await req("GET", "/api/disciplinas", { sid: T.A1 });
  assert.deepEqual(r.json.disciplinas, lista.json.disciplinas);
  assert.equal(r.json.usuario.user_id, UA);
  assert.equal(r.json.usuario.username, "Aluna A");
  assert.ok(!Number.isNaN(Date.parse(r.json.exportado_em)), "exportado_em ISO");
  assert.ok(!r.texto.includes(UB) && !r.texto.includes("Disciplina de B"), "exportação de A não contém dados de B");
  const rb = await req("GET", "/api/conta/exportar", { sid: T.B1 });
  assert.equal(rb.json.disciplinas.length, 40);
  assert.ok(!rb.texto.includes(UA));
});

// ── 11. Login / logout ──
teste("login Discord sem configuração local → 503 JSON; callback sem state → 302 para /?erro_login=state_invalido", async () => {
  const me = await req("GET", "/api/me");
  if (me.json.loginDisponivel) return; // há .dev.vars com Discord: não testa o 503
  esperaErro(await req("GET", "/api/auth/discord"), 503);
  const cb = await req("GET", "/api/auth/discord/callback?code=x&state=y");
  esperaStatus(cb, 302);
  assert.equal(new URL(cb.headers.get("location")).search, "?erro_login=state_invalido");
  assert.equal(cb.headers.get("cache-control"), "no-store");
  const neg = await req("GET", "/api/auth/discord/callback?error=access_denied");
  assert.equal(new URL(neg.headers.get("location")).searchParams.get("erro_login"), "access_denied");
  const xss = await req("GET", `/api/auth/discord/callback?error=${encodeURIComponent("<script>alert(1)</script>")}`);
  assert.equal(new URL(xss.headers.get("location")).searchParams.get("erro_login"), "erro_discord");
});

teste("logout: apaga a sessão no D1 e expira o cookie (HttpOnly, SameSite=Lax); outras sessões seguem válidas", async () => {
  const r = await req("POST", "/api/auth/logout", { sid: T.A3 });
  esperaStatus(r, 200);
  const sc = r.headers.get("set-cookie") || "";
  assert.match(sc, /^sid=;/);
  assert.match(sc, /Max-Age=0/);
  assert.match(sc, /HttpOnly/);
  assert.match(sc, /SameSite=Lax/);
  assert.match(sc, /Path=\//);
  esperaErro(await req("GET", "/api/disciplinas", { sid: T.A3 }), 401, "sessão encerrada");
  esperaStatus(await req("GET", "/api/disciplinas", { sid: T.A1 }), 200, "A1 continua");
});

// ── 12. Exclusão de conta ──
teste("DELETE /api/conta: 400 sem a confirmação exata (nada é apagado)", async () => {
  const corpos = [
    { raw: undefined }, { raw: "" }, { body: {} }, { body: { confirmar: "excluir" } }, { body: { confirmar: " EXCLUIR" } },
    { body: { confirmar: true } }, { body: ["EXCLUIR"] }, { raw: '{"confirmar":"EXCLUIR"}', tipo: "text/plain" },
  ];
  for (const c of corpos) esperaErro(await req("DELETE", "/api/conta", { sid: T.A1, ...c }), 400, JSON.stringify(c));
  esperaErro(await req("DELETE", "/api/conta", { sid: T.A1, raw: JSON.stringify({ confirmar: "EXCLUIR", x: "y".repeat(20_001) }) }), 413);
  const g = await req("GET", `/api/disciplinas/${ctx.d.id}`, { sid: T.A1 });
  assert.deepEqual(g.json.disciplina, ctx.d, "dados de A intactos");
});

teste("DELETE /api/conta com confirmação: 200, cookie expirado, todas as sessões de A → 401, B intacto", async () => {
  const r = await req("DELETE", "/api/conta", { sid: T.A1, body: { confirmar: "EXCLUIR" } });
  esperaStatus(r, 200);
  assert.match(r.headers.get("set-cookie") || "", /^sid=;.*Max-Age=0/);
  for (const t of [T.A1, T.A2]) {
    esperaErro(await req("GET", "/api/disciplinas", { sid: t }), 401, "sessão de A após exclusão");
    esperaErro(await req("GET", "/api/conta/exportar", { sid: t }), 401);
    assert.equal((await req("GET", "/api/me", { sid: t })).json.usuario, null);
  }
  const lb = await req("GET", "/api/disciplinas", { sid: T.B1 });
  esperaStatus(lb, 200);
  assert.deepEqual(lb.json.disciplinas, ctx.snapshotB, "dados de B mudaram");
});

/* ───────────────────────── execução ───────────────────────── */

/** Lê o bloco `padrao` de public/_headers → { nome: valor }. */
function cabecalhosDoArquivo(padrao) {
  const linhas = readFileSync(join(RAIZ, "public", "_headers"), "utf8").split(/\r?\n/);
  const saida = {};
  let dentro = false;
  for (const l of linhas) {
    if (!l.trim() || l.trim().startsWith("#")) continue;
    if (!/^\s/.test(l)) { dentro = l.trim() === padrao; continue; }
    if (dentro) {
      const i = l.indexOf(":");
      saida[l.slice(0, i).trim().toLowerCase()] = l.slice(i + 1).trim();
    }
  }
  return saida;
}

async function principal() {
  let falhas = 0;
  const t0 = Date.now();
  console.log(`D1 local temporário: ${PERSIST}`);
  try {
    process.stdout.write("Aplicando migrações… ");
    wrangler(["d1", "migrations", "apply", "DB", "--local", "--persist-to", PERSIST]);
    console.log("ok");
    process.stdout.write("Criando usuários e sessões de teste… ");
    executarSql(sqlSeed());
    console.log("ok");
    process.stdout.write(`Subindo wrangler pages dev em ${BASE}… `);
    subirServidor();
    await esperarPronto();
    console.log("ok\n");

    for (const c of casos) {
      try {
        await c.fn();
        console.log(`✅ ${c.nome}`);
      } catch (e) {
        falhas++;
        console.log(`❌ ${c.nome}\n   ${String(e.message).split("\n").join("\n   ")}`);
      }
    }
  } catch (e) {
    falhas++;
    console.error(`\n❌ Falha na preparação: ${e.message}`);
  } finally {
    derrubarServidor();
  }

  // Conferência direta no banco (com o servidor já parado): a exclusão de conta não deixa resto.
  if (casos.length && servidor) {
    await new Promise((ok) => setTimeout(ok, 1500));
    const nome = "banco após exclusão: nenhuma linha de A em usuarios/sessoes/disciplinas e nenhuma avaliação órfã";
    try {
      // Uma linha só: o argumento passa pelo cmd.exe no Windows.
      const [r] = consultar([
        `SELECT (SELECT COUNT(*) FROM usuarios WHERE user_id='${UA}') AS u,`,
        `(SELECT COUNT(*) FROM sessoes WHERE user_id='${UA}') AS s,`,
        `(SELECT COUNT(*) FROM disciplinas WHERE user_id='${UA}') AS d,`,
        "(SELECT COUNT(*) FROM avaliacoes WHERE disciplina_id NOT IN (SELECT id FROM disciplinas)) AS orfas,",
        `(SELECT COUNT(*) FROM disciplinas WHERE user_id='${UB}') AS db`,
      ].join(" "));
      assert.deepEqual(r, { u: 0, s: 0, d: 0, orfas: 0, db: 40 });
      console.log(`✅ ${nome}`);
    } catch (e) {
      falhas++;
      console.log(`❌ ${nome}\n   ${e.message}`);
    }
  }

  const total = casos.length + 1;
  console.log(`\n${total - falhas}/${total} casos passaram em ${((Date.now() - t0) / 1000).toFixed(1)}s.`);
  if (falhas && logServidor) console.log(`\n── últimas linhas do wrangler ──\n${logServidor.split("\n").slice(-30).join("\n")}`);
  try { rmSync(PERSIST, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); } catch { /* arquivo preso no Windows */ }
  process.exitCode = falhas ? 1 : 0;
}

await principal();
