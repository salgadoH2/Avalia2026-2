/**
 * DELETE /api/conta  { "confirmar": "EXCLUIR" } — exclusão da conta (LGPD, art. 18, VI).
 * Apaga avaliações, disciplinas, sessões e o usuário numa única transação (batch do D1)
 * e expira o cookie de sessão. Qualquer corpo diferente do exigido → 400 (nada é apagado).
 */
import { HttpError, json, lerJson, metodoNaoPermitido, rota } from "../../../lib/http.js";
import { cookieSessaoExpirado, exigirUsuario } from "../../../lib/session.js";
import { validarConfirmacaoExclusao } from "../../../lib/validacao.js";
import { excluirConta } from "../../../lib/repositorio.js";

export const onRequestDelete = rota(async ({ request, env }) => {
  const u = await exigirUsuario(env, request);

  let body = null;
  try {
    body = await lerJson(request);
  } catch (e) {
    // Corpo grande demais continua 413; ausente, sem JSON ou com outro Content-Type → 400 abaixo.
    if (e instanceof HttpError && e.status === 413) throw e;
  }
  validarConfirmacaoExclusao(body);

  await excluirConta(env, u.user_id);
  return json({ ok: true }, 200, { "Set-Cookie": cookieSessaoExpirado(request) });
});

export const onRequest = metodoNaoPermitido("DELETE");
