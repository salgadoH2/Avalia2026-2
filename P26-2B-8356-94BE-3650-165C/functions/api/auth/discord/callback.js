/**
 * GET /api/auth/discord/callback — conclui o OAuth2 do Discord.
 * 1. Confere o "state" (anti-CSRF)  2. Troca o code pelo access_token
 * 3. Busca /users/@me (user_id, nome, avatar)  4. Grava/atualiza o usuário no D1
 * 5. Cria a sessão no D1 e devolve o cookie HttpOnly.
 */
import { metodoNaoPermitido } from "../../../../lib/http.js";
import { cookie, criarSessao, encerrarSessao, lerCookie } from "../../../../lib/session.js";
import { limparTexto } from "../../../../lib/validacao.js";

function voltar(origin, motivo, extraCookies = []) {
  const headers = new Headers({ Location: new URL(`/?erro_login=${encodeURIComponent(motivo)}`, origin).href });
  for (const c of extraCookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

/** O código de erro do Discord volta para a URL do app: só aceita o formato padrão do OAuth2. */
function codigoErroSeguro(v) {
  return /^[a-z_]{1,40}$/.test(v) ? v : "erro_discord";
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const limparState = cookie("oauth_state", "", 0, request);

  const erroDiscord = url.searchParams.get("error");
  if (erroDiscord) return voltar(url.origin, codigoErroSeguro(erroDiscord), [limparState]);

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
    const username = limparTexto(String(du.global_name || du.username || ""), 80) || "Estudante";
    // O hash do avatar vai para uma URL gravada no banco: só aceita o formato do Discord.
    const avatar = typeof du.avatar === "string" && /^(a_)?[0-9a-f]{32}$/.test(du.avatar) ? du.avatar : null;
    const avatarUrl = avatar
      ? `https://cdn.discordapp.com/avatars/${userId}/${avatar}.${avatar.startsWith("a_") ? "gif" : "png"}?size=128`
      : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(userId) >> 22n) % 6n)}.png`;

    await env.DB.prepare(
      `INSERT INTO usuarios (user_id, username, avatar_url) VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET username = excluded.username, avatar_url = excluded.avatar_url,
                                          atualizado_em = CURRENT_TIMESTAMP`
    ).bind(userId, username, avatarUrl).run();

    await encerrarSessao(env, request); // descarta a sessão anterior deste navegador, se houver
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

// HEAD não executa o OAuth (o code só pode ser trocado uma vez): responde vazio, sem efeitos.
export const onRequestHead = () => new Response(null, { status: 204 });
export const onRequest = metodoNaoPermitido("GET");
