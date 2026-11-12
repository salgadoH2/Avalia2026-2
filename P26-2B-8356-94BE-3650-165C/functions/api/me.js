/**
 * GET /api/me — perfil do Discord da sessão atual (ou { usuario: null }).
 * É a única rota de leitura que não exige login: a interface a usa para decidir
 * entre a tela de login e o painel. Não devolve nenhum dado acadêmico.
 */
import { json, metodoNaoPermitido, rota } from "../../lib/http.js";
import { usuarioDaSessao } from "../../lib/session.js";

export const onRequestGet = rota(async ({ request, env }) => {
  const u = await usuarioDaSessao(env, request);
  return json({
    ok: true,
    loginDisponivel: Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET),
    usuario: u ? { user_id: u.user_id, username: u.username, avatar_url: u.avatar_url } : null,
  });
});

// HEAD: mesma resposta do GET; o _middleware remove o corpo.
export const onRequestHead = onRequestGet;
export const onRequest = metodoNaoPermitido("GET");
