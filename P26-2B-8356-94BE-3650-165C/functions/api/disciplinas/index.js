/**
 * /api/disciplinas
 *   GET  — grade completa do aluno logado (disciplinas + avaliações + resumo calculado no servidor)
 *   POST — cadastra disciplina com a fórmula de média (pesos de provas, trabalhos e listas)
 */
import { json, lerJson, metodoNaoPermitido, rota } from "../../../lib/http.js";
import { exigirUsuario } from "../../../lib/session.js";
import { validarDisciplina } from "../../../lib/validacao.js";
import { criarDisciplina, listarDisciplinas } from "../../../lib/repositorio.js";

export const onRequestGet = rota(async ({ request, env }) => {
  const u = await exigirUsuario(env, request);
  return json({ ok: true, disciplinas: await listarDisciplinas(env, u.user_id) });
});

export const onRequestPost = rota(async ({ request, env }) => {
  const u = await exigirUsuario(env, request);
  const d = validarDisciplina(await lerJson(request));
  d.avaliacoes.forEach((a) => (a.id = null)); // ids só fazem sentido na edição
  return json({ ok: true, disciplina: await criarDisciplina(env, u.user_id, d) }, 201);
});

// HEAD: mesma resposta do GET; o _middleware remove o corpo.
export const onRequestHead = onRequestGet;
export const onRequest = metodoNaoPermitido("GET", "POST");
