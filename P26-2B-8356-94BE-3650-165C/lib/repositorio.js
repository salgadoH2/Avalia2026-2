/** Acesso ao Cloudflare D1 — sempre filtrando pelo user_id da sessão. */
import { HttpError } from "./http.js";
import { resumoDisciplina } from "../public/js/calc.js";
import { LIMITE_DISCIPLINAS } from "./validacao.js";

const COLS = "id, nome, semestre, nota_maxima, media_aprovacao, media_minima_exame, media_final_exame, atualizado_em";

function montar(disciplinas, avaliacoes) {
  const porDisc = new Map(disciplinas.map((d) => [d.id, { ...d, avaliacoes: [] }]));
  for (const a of avaliacoes) porDisc.get(a.disciplina_id)?.avaliacoes.push({
    id: a.id, nome: a.nome, tipo: a.tipo, peso: a.peso, nota: a.nota,
  });
  return [...porDisc.values()].map((d) => ({ ...d, resumo: resumoDisciplina(d) }));
}

export async function listarDisciplinas(env, userId) {
  const [ds, as] = await env.DB.batch([
    env.DB.prepare(`SELECT ${COLS} FROM disciplinas WHERE user_id = ? ORDER BY semestre DESC, nome COLLATE NOCASE`).bind(userId),
    env.DB.prepare(
      `SELECT a.id, a.disciplina_id, a.nome, a.tipo, a.peso, a.nota
         FROM avaliacoes a JOIN disciplinas d ON d.id = a.disciplina_id
        WHERE d.user_id = ? ORDER BY a.disciplina_id, a.ordem, a.id`
    ).bind(userId),
  ]);
  return montar(ds.results || [], as.results || []);
}

export async function obterDisciplina(env, userId, id) {
  const [ds, as] = await env.DB.batch([
    env.DB.prepare(`SELECT ${COLS} FROM disciplinas WHERE id = ? AND user_id = ?`).bind(id, userId),
    env.DB.prepare(
      `SELECT a.id, a.disciplina_id, a.nome, a.tipo, a.peso, a.nota
         FROM avaliacoes a JOIN disciplinas d ON d.id = a.disciplina_id
        WHERE d.id = ? AND d.user_id = ? ORDER BY a.ordem, a.id`
    ).bind(id, userId),
  ]);
  const [d] = montar(ds.results || [], as.results || []);
  if (!d) throw new HttpError(404, "Disciplina não encontrada.");
  return d;
}

export async function criarDisciplina(env, userId, d) {
  // Contagem e inserção na MESMA instrução: duas abas criando ao mesmo tempo não furam o limite.
  const ins = await env.DB.prepare(
    `INSERT INTO disciplinas (user_id, nome, semestre, nota_maxima, media_aprovacao, media_minima_exame, media_final_exame)
     SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE (SELECT COUNT(*) FROM disciplinas WHERE user_id = ?) < ?
     RETURNING id`
  ).bind(userId, d.nome, d.semestre, d.nota_maxima, d.media_aprovacao, d.media_minima_exame, d.media_final_exame,
    userId, LIMITE_DISCIPLINAS).first();
  if (!ins) throw new HttpError(409, `Limite de ${LIMITE_DISCIPLINAS} disciplinas atingido. Exclua uma para cadastrar outra.`);
  const id = ins.id;

  try {
    await env.DB.batch(d.avaliacoes.map((a) => inserirAvaliacao(env, id, a)));
  } catch (e) {
    // Compensação: sem avaliações a disciplina não é válida; desfaz a inserção.
    await env.DB.prepare("DELETE FROM disciplinas WHERE id = ? AND user_id = ?").bind(id, userId).run();
    throw e;
  }
  return obterDisciplina(env, userId, id);
}

function inserirAvaliacao(env, disciplinaId, a) {
  return env.DB.prepare(
    "INSERT INTO avaliacoes (disciplina_id, nome, tipo, peso, nota, ordem) VALUES (?, ?, ?, ?, ?, ?)"
  ).bind(disciplinaId, a.nome, a.tipo, a.peso, a.nota, a.ordem);
}

/**
 * Atualiza regras e substitui a lista de avaliações (mantendo as que vierem com id).
 * As notas de avaliações existentes NÃO são alteradas aqui — só pelo PATCH — para que
 * uma aba desatualizada editando a fórmula não sobrescreva notas lançadas depois.
 */
export async function atualizarDisciplina(env, userId, id, d) {
  const atual = await obterDisciplina(env, userId, id); // 404 se não for do usuário
  const notaAtual = new Map(atual.avaliacoes.map((a) => [a.id, a.nota]));
  for (const a of d.avaliacoes) {
    if (a.id !== null && !notaAtual.has(a.id)) throw new HttpError(400, "Avaliação não pertence a esta disciplina.");
    const nota = a.id !== null ? notaAtual.get(a.id) : a.nota;
    if (nota !== null && nota > d.nota_maxima) {
      throw new HttpError(400, `A nota já lançada em "${a.nome}" passa da nova nota máxima.`);
    }
  }
  const manter = new Set(d.avaliacoes.filter((a) => a.id !== null).map((a) => a.id));

  const stmts = [
    env.DB.prepare(
      `UPDATE disciplinas SET nome = ?, semestre = ?, nota_maxima = ?, media_aprovacao = ?, media_minima_exame = ?,
              media_final_exame = ?, atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`
    ).bind(d.nome, d.semestre, d.nota_maxima, d.media_aprovacao, d.media_minima_exame, d.media_final_exame, id, userId),
  ];
  for (const a of atual.avaliacoes) {
    if (!manter.has(a.id)) stmts.push(env.DB.prepare("DELETE FROM avaliacoes WHERE id = ? AND disciplina_id = ?").bind(a.id, id));
  }
  for (const a of d.avaliacoes) {
    stmts.push(a.id === null
      ? inserirAvaliacao(env, id, a)
      : env.DB.prepare(
          `UPDATE avaliacoes SET nome = ?, tipo = ?, peso = ?, ordem = ?, atualizado_em = CURRENT_TIMESTAMP
            WHERE id = ? AND disciplina_id = ?`
        ).bind(a.nome, a.tipo, a.peso, a.ordem, a.id, id));
  }
  await env.DB.batch(stmts); // batch do D1 é transacional
  return obterDisciplina(env, userId, id);
}

export async function excluirDisciplina(env, userId, id) {
  await obterDisciplina(env, userId, id);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM avaliacoes WHERE disciplina_id = ?").bind(id),
    env.DB.prepare("DELETE FROM disciplinas WHERE id = ? AND user_id = ?").bind(id, userId),
  ]);
}

/** Lançamento rápido de nota: confere dono e nota máxima da disciplina. */
export async function buscarAvaliacaoDoUsuario(env, userId, avaliacaoId) {
  const row = await env.DB.prepare(
    `SELECT a.id, a.disciplina_id, d.nota_maxima
       FROM avaliacoes a JOIN disciplinas d ON d.id = a.disciplina_id
      WHERE a.id = ? AND d.user_id = ?`
  ).bind(avaliacaoId, userId).first();
  if (!row) throw new HttpError(404, "Avaliação não encontrada.");
  return row;
}

export async function salvarNota(env, userId, avaliacaoId, disciplinaId, nota) {
  // Filtros redundantes de propósito (defesa em profundidade): mesmo que o chamador erre,
  // a escrita só atinge linhas do próprio usuário.
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE avaliacoes SET nota = ?, atualizado_em = CURRENT_TIMESTAMP
        WHERE id = ? AND disciplina_id = (SELECT id FROM disciplinas WHERE id = ? AND user_id = ?)`
    ).bind(nota, avaliacaoId, disciplinaId, userId),
    env.DB.prepare("UPDATE disciplinas SET atualizado_em = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?").bind(disciplinaId, userId),
  ]);
}

/* ---------- Conta (LGPD) ---------- */

/** Dados cadastrais do usuário, como gravados a partir do Discord. */
export async function obterUsuario(env, userId) {
  const u = await env.DB.prepare(
    "SELECT user_id, username, avatar_url, criado_em FROM usuarios WHERE user_id = ?"
  ).bind(userId).first();
  if (!u) throw new HttpError(404, "Usuário não encontrado.");
  return u;
}

/** Portabilidade (LGPD art. 18, V): tudo o que o sistema guarda sobre o aluno. */
export async function exportarDados(env, userId) {
  const [usuario, disciplinas] = await Promise.all([obterUsuario(env, userId), listarDisciplinas(env, userId)]);
  return { exportado_em: new Date().toISOString(), usuario, disciplinas };
}

/**
 * Eliminação (LGPD art. 18, VI): apaga avaliações, disciplinas, sessões e o usuário
 * numa única transação (batch do D1). Não depende do ON DELETE CASCADE — cada tabela
 * é limpa explicitamente, na ordem filha → pai.
 */
export async function excluirConta(env, userId) {
  const r = await env.DB.batch([
    env.DB.prepare("DELETE FROM avaliacoes WHERE disciplina_id IN (SELECT id FROM disciplinas WHERE user_id = ?)").bind(userId),
    env.DB.prepare("DELETE FROM disciplinas WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM sessoes WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM usuarios WHERE user_id = ?").bind(userId),
  ]);
  const [avaliacoes, disciplinas, sessoes, usuarios] = r.map((x) => x.meta?.changes ?? 0);
  return { avaliacoes, disciplinas, sessoes, usuarios };
}
