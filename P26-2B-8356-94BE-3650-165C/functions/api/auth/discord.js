/**
 * GET /api/auth/discord — inicia o login OAuth2 do Discord.
 * Gera um "state" aleatório (proteção CSRF) guardado em cookie e redireciona ao Discord.
 */
import { erro } from "../../../lib/http.js";
import { cookie, tokenAleatorio } from "../../../lib/session.js";

export async function onRequestGet({ request, env }) {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET) {
    return erro(503, "Login indisponível: defina DISCORD_CLIENT_ID e DISCORD_CLIENT_SECRET nas variáveis do Cloudflare Pages.");
  }
  const url = new URL(request.url);
  const state = tokenAleatorio(16);

  const authorize = new URL("https://discord.com/api/oauth2/authorize");
  authorize.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", new URL("/api/auth/discord/callback", url.origin).href);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", "identify");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("prompt", "none");

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.href,
      "Set-Cookie": cookie("oauth_state", state, 600, request),
    },
  });
}
