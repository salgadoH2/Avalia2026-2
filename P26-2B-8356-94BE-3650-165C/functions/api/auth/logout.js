/** POST /api/auth/logout — apaga a sessão no D1 e expira o cookie. */
import { json, rota } from "../../../lib/http.js";
import { encerrarSessao } from "../../../lib/session.js";

export const onRequestPost = rota(async ({ request, env }) => {
  const c = await encerrarSessao(env, request);
  return json({ ok: true }, 200, { "Set-Cookie": c });
});
