/**
 * GET /api/auth/discord/callback — conclui o OAuth2 do Discord.
 * 1. Confere o "state" (anti-CSRF)  2. Troca o code pelo access_token
 * 3. Busca /users/@me (user_id, nome, avatar)  4. Grava/atualiza o usuário no D1
 * 5. Cria a sessão no D1 e devolve o cookie HttpOnly.
 */
import { cookie, criarSessao, lerCookie } from "../../../../lib/session.js";

function voltar(origin, motivo, extraCookies = []) {
  const headers = new Headers({ Location: new URL(`/?erro_login=${encodeURIComponent(motivo)}`, origin).href });
  for (const c of extraCookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const limparState = cookie("oauth_state", "", 0, request);

  if (url.searchParams.get("error")) return voltar(url.origin, url.searchParams.get("error"), [limparState]);

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const stateCookie = lerCookie(request, "oauth_state");
  if (!code || !state || !stateCookie || state !== stateCookie) {
    return voltar(url.origin, "state_invalido", [limparState]);
  }
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.DB) {
    return voltar(url.origin, "servidor_nao_configurado", [limparState]);
  }

  try {
    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: new URL("/api/auth/discord/callback", url.origin).href,
      }),
    });
    if (!tokenRes.ok) return voltar(url.origin, "troca_de_token_falhou", [limparState]);
    const { access_token } = await tokenRes.json();

    const userRes = await fetch("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (!userRes.ok) return voltar(url.origin, "perfil_discord_falhou", [limparState]);
    const du = await userRes.json();

    const userId = String(du.id);
    if (!/^\d{5,25}$/.test(userId)) return voltar(url.origin, "perfil_invalido", [limparState]);
    const username = String(du.global_name || du.username || "Estudante").slice(0, 80);
    const avatarUrl = du.avatar
      ? `https://cdn.discordapp.com/avatars/${userId}/${du.avatar}.${du.avatar.startsWith("a_") ? "gif" : "png"}?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(userId) >> 22n) % 6n)}.png`;

    await env.DB.prepare(
      `INSERT INTO usuarios (user_id, username, avatar_url) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, avatar_url = excluded.avatar_url,
                                          atualizado_em = CURRENT_TIMESTAMP`
    ).bind(userId, username, avatarUrl).run();

    const sessao = await criarSessao(env, userId, request);
    const headers = new Headers({ Location: new URL("/", url.origin).href });
    headers.append("Set-Cookie", sessao);
    headers.append("Set-Cookie", limparState);
    return new Response(null, { status: 302, headers });
  } catch (e) {
    console.error(e);
    return voltar(url.origin, "erro_inesperado", [limparState]);
  }
}
