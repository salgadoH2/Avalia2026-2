/**
 * PATCH /api/avaliacoes/:id  { "nota": 7.5 | null }
 * Lançamento rápido de nota. O servidor confere se a avaliação é do aluno logado
 * e se a nota está entre 0 e a nota máxima da disciplina; devolve o resumo recalculado.
 */
import { exigirObjeto, json, lerJson, metodoNaoPermitido, rota, HttpError } from "../../../lib/http.js";
import { exigirUsuario } from "../../../lib/session.js";
import { validarId, validarNota } from "../../../lib/validacao.js";
import { buscarAvaliacaoDoUsuario, obterDisciplina, salvarNota } from "../../../lib/repositorio.js";

export const onRequestPatch = rota(async ({ request, env, params }) => {
  const u = await exigirUsuario(env, request);
  const id = validarId(params.id);
  const body = exigirObjeto(await lerJson(request), 'Envie um objeto JSON com o campo "nota" (número ou null).');
  if (!("nota" in body)) throw new HttpError(400, 'Informe o campo "nota" (número ou null).');

  const av = await buscarAvaliacaoDoUsuario(env, u.user_id, id); // 404 se não for do usuário
  const nota = validarNota(body.nota, av.nota_maxima);
  await salvarNota(env, u.user_id, id, av.disciplina_id, nota);

  return json({ ok: true, disciplina: await obterDisciplina(env, u.user_id, av.disciplina_id) });
});

export const onRequest = metodoNaoPermitido("PATCH");
