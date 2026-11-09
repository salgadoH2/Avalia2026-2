/**
 * Sessões do servidor guardadas no D1.
 * O cookie "sid" leva um token aleatório de 256 bits; o banco guarda apenas o SHA-256 dele,
 * então um vazamento da tabela não permite sequestrar sessões.
 */
import { HttpError } from "./http.js";

export const COOKIE_SESSAO = "sid";
const DURACAO_SEG = 60 * 60 * 24 * 30; // 30 dias

export function lerCookie(request, nome) {
  const header = request.headers.get("Cookie") || "";
  for (const parte of header.split(";")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    if (parte.slice(0, i).trim() === nome) {
      try {
        return decodeURIComponent(parte.slice(i + 1).trim());
      } catch {
        return null; // cookie malformado (ex.: "%E0") = sem sessão, nunca erro 500
      }
    }
  }
  return null;
}

export function cookie(nome, valor, maxAge, request) {
  const seguro = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${nome}=${encodeURIComponent(valor)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${seguro}`;
}

export function tokenAleatorio(bytes = 32) {
  const arr = crypto.getRandomValues(new Uint8Array(bytes));
  return [...arr].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256(texto) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function criarSessao(env, userId, request) {
  const token = tokenAleatorio();
  const agora = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessoes WHERE expira_em < ?").bind(agora),
    env.DB.prepare("INSERT INTO sessoes (token_hash, user_id, expira_em) VALUES (?, ?, ?)")
      .bind(await sha256(token), userId, agora + DURACAO_SEG),
  ]);
  return cookie(COOKIE_SESSAO, token, DURACAO_SEG, request);
}

/** Retorna o usuário logado ou null. */
export async function usuarioDaSessao(env, request) {
  const token = lerCookie(request, COOKIE_SESSAO);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const row = await env.DB.prepare(
    `SELECT u.user_id, u.username, u.avatar_url
       FROM sessoes s JOIN usuarios u ON u.user_id = s.user_id
      WHERE s.token_hash = ? AND s.expira_em > ?`
  ).bind(await sha256(token), Math.floor(Date.now() / 1000)).first();
  return row || null;
}

/** Igual a usuarioDaSessao, mas lança 401 se não houver login. */
export async function exigirUsuario(env, request) {
  const u = await usuarioDaSessao(env, request);
  if (!u) throw new HttpError(401, "Faça login com o Discord.");
  return u;
}

export async function encerrarSessao(env, request) {
  const token = lerCookie(request, COOKIE_SESSAO);
  if (token && /^[0-9a-f]{64}$/.test(token)) {
    await env.DB.prepare("DELETE FROM sessoes WHERE token_hash = ?").bind(await sha256(token)).run();
  }
  return cookie(COOKIE_SESSAO, "", 0, request);
}
