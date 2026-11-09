/**
 * /api/disciplinas/:id
 *   GET    — uma disciplina do aluno
 *   PUT    — altera regras/fórmula (avaliações com id são mantidas com suas notas)
 *   DELETE — remove a disciplina e suas avaliações
 */
import { json, lerJson, rota } from "../../../lib/http.js";
import { exigirUsuario } from "../../../lib/session.js";
import { validarDisciplina, validarId } from "../../../lib/validacao.js";
import { atualizarDisciplina, excluirDisciplina, obterDisciplina } from "../../../lib/repositorio.js";

export const onRequestGet = rota(async ({ request, env, params }) => {
  const u = await exigirUsuario(env, request);
  return json({ ok: true, disciplina: await obterDisciplina(env, u.user_id, validarId(params.id)) });
});

export const onRequestPut = rota(async ({ request, env, params }) => {
  const u = await exigirUsuario(env, request);
  const id = validarId(params.id);
  const d = validarDisciplina(await lerJson(request));
  return json({ ok: true, disciplina: await atualizarDisciplina(env, u.user_id, id, d) });
});

export const onRequestDelete = rota(async ({ request, env, params }) => {
  const u = await exigirUsuario(env, request);
  await excluirDisciplina(env, u.user_id, validarId(params.id));
  return json({ ok: true });
});
