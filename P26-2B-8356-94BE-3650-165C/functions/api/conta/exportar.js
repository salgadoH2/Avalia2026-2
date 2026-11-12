/**
 * GET /api/conta/exportar — portabilidade dos dados (LGPD, art. 18, V).
 * Devolve um arquivo JSON para download com o perfil e todas as disciplinas do aluno logado,
 * no mesmo formato de GET /api/disciplinas (avaliações + resumo calculado no servidor):
 *   { exportado_em, usuario: { user_id, username, avatar_url, criado_em }, disciplinas: [...] }
 */
import { CABECALHOS_API, metodoNaoPermitido, rota } from "../../../lib/http.js";
import { exigirUsuario } from "../../../lib/session.js";
import { exportarDados } from "../../../lib/repositorio.js";

export const onRequestGet = rota(async ({ request, env }) => {
  const u = await exigirUsuario(env, request);
  const dados = await exportarDados(env, u.user_id);
  // user_id do Discord é numérico; o filtro só impede qualquer caractere estranho no cabeçalho.
  const arquivo = `meus-dados-${String(u.user_id).replace(/[^0-9A-Za-z_-]/g, "")}.json`;
  return new Response(JSON.stringify(dados, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
      ...CABECALHOS_API,
    },
  });
});

// HEAD: mesma resposta do GET; o _middleware remove o corpo.
export const onRequestHead = onRequestGet;
export const onRequest = metodoNaoPermitido("GET");
