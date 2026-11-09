/** GET /api/me — perfil do Discord da sessão atual (ou { usuario: null }). */
import { json, rota } from "../../lib/http.js";
import { usuarioDaSessao } from "../../lib/session.js";

export const onRequestGet = rota(async ({ request, env }) => {
  const u = await usuarioDaSessao(env, request);
  return json({
    ok: true,
    loginDisponivel: Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET),
    usuario: u ? { user_id: u.user_id, username: u.username, avatar_url: u.avatar_url } : null,
  });
});
