/**
 * calc.js — Motor de cálculo da média (módulo ES puro, sem dependências).
 * Usado no navegador (cálculo instantâneo) e nas Cloudflare Pages Functions
 * (o servidor devolve o mesmo resumo, garantindo a mesma regra dos dois lados).
 *
 * Fórmula: média ponderada  M = Σ(peso_i × nota_i) / Σ(peso_i)
 * Nota mínima uniforme x nas avaliações restantes para atingir a meta A:
 *   (K + R·x) / W ≥ A   ⇒   x = (A·W − K) / R
 *   K = Σ peso×nota das avaliações já feitas, R = Σ pesos restantes, W = Σ de todos os pesos
 */

export const TIPOS = ["prova", "trabalho", "lista"];
export const TIPO_LABEL = { prova: "Provas", trabalho: "Trabalhos", lista: "Listas" };

const EPS = 1e-9;

/** Arredonda para cima em 2 casas (uma nota "mínima" nunca pode ser arredondada para baixo). */
export function ceil2(v) {
  return Math.ceil(v * 100 - EPS) / 100;
}

export function round2(v) {
  return Math.round(v * 100) / 100;
}

function temNota(a) {
  return a.nota !== null && a.nota !== undefined && a.nota !== "" && Number.isFinite(Number(a.nota));
}

/**
 * Nota mínima necessária (igual em todas as avaliações restantes) para atingir `meta`.
 * status: "garantido" (já atingido, mesmo com zero no resto), "possivel", "impossivel".
 */
export function notaNecessaria({ K, R, W }, meta, notaMaxima) {
  const alvo = meta * W - K;
  if (alvo <= EPS) return { status: "garantido", nota: 0 };
  if (R <= EPS) return { status: "impossivel", nota: null };
  const x = alvo / R;
  if (x > notaMaxima + EPS) return { status: "impossivel", nota: ceil2(x) };
  return { status: "possivel", nota: Math.min(ceil2(x), notaMaxima) };
}

/** Classifica uma média final segundo as regras da disciplina. */
export function situacao(media, d) {
  if (media + EPS >= d.media_aprovacao) return "aprovado";
  if (media + EPS >= d.media_minima_exame) return "exame";
  return "reprovado";
}

/**
 * Resumo completo de uma disciplina.
 * @param {object} d  { nota_maxima, media_aprovacao, media_minima_exame, media_final_exame, avaliacoes:[{tipo,peso,nota}] }
 */
export function resumoDisciplina(d) {
  const avs = (d.avaliacoes || []).map((a) => ({ ...a, peso: Number(a.peso) }));
  const notaMaxima = Number(d.nota_maxima);
  let W = 0, K = 0, Wf = 0;
  const porTipo = {};
  for (const t of TIPOS) porTipo[t] = { peso: 0, pesoFeito: 0, pontos: 0, qtd: 0, media: null };

  for (const a of avs) {
    W += a.peso;
    const pt = porTipo[a.tipo] || (porTipo[a.tipo] = { peso: 0, pesoFeito: 0, pontos: 0, qtd: 0, media: null });
    pt.peso += a.peso;
    pt.qtd += 1;
    if (temNota(a)) {
      const n = Number(a.nota);
      K += a.peso * n;
      Wf += a.peso;
      pt.pesoFeito += a.peso;
      pt.pontos += a.peso * n;
    }
  }
  for (const t of Object.keys(porTipo)) {
    const pt = porTipo[t];
    pt.media = pt.pesoFeito > 0 ? round2(pt.pontos / pt.pesoFeito) : null;
    pt.percentual = W > 0 ? round2((pt.peso / W) * 100) : 0;
  }

  const R = W - Wf;
  const base = { K, R, W };
  const vazio = W <= 0;

  // Média parcial = média ponderada só das avaliações já feitas
  const mediaParcial = Wf > 0 ? round2(K / Wf) : null;
  // Pontos garantidos = contribuição atual na média final (como se o resto fosse zero)
  const pontosGarantidos = vazio ? 0 : round2(K / W);
  // Média máxima possível = tirando nota máxima em tudo que falta
  const mediaMaxima = vazio ? 0 : round2((K + R * notaMaxima) / W);
  const concluida = !vazio && R <= EPS;
  // A classificação usa a média exata (sem arredondar), igual ao critério da nota mínima;
  // o arredondamento é só para exibição. Ex.: 6,995 continua abaixo de 7.
  const mediaExata = concluida ? K / W : null;
  const mediaFinal = concluida ? round2(mediaExata) : null;

  const aprovacao = vazio ? null : notaNecessaria(base, d.media_aprovacao, notaMaxima);
  const evitarReprovacao = vazio ? null : notaNecessaria(base, d.media_minima_exame, notaMaxima);

  // Se terminar em exame: nota necessária no exame final, assumindo (média + exame) / 2 ≥ media_final_exame
  let exame = null;
  if (concluida && situacao(mediaExata, d) === "exame") {
    const x = 2 * d.media_final_exame - mediaExata;
    exame = x > notaMaxima + EPS
      ? { status: "impossivel", nota: ceil2(x) }
      : { status: "possivel", nota: Math.max(0, ceil2(x)) };
  }

  let situacaoAtual;
  if (vazio) situacaoAtual = "sem_formula";
  else if (concluida) situacaoAtual = situacao(mediaExata, d);
  else if (aprovacao.status === "garantido") situacaoAtual = "aprovado";
  else if (evitarReprovacao.status === "impossivel") situacaoAtual = "reprovado";
  else if (aprovacao.status === "impossivel") situacaoAtual = "exame_inevitavel";
  else situacaoAtual = "em_andamento";

  return {
    pesoTotal: round2(W),
    pesoAvaliado: round2(Wf),
    percentualAvaliado: vazio ? 0 : round2((Wf / W) * 100),
    restantes: avs.filter((a) => !temNota(a)).length,
    mediaParcial,
    pontosGarantidos,
    mediaMaxima,
    mediaFinal,
    aprovacao,
    evitarReprovacao,
    exame,
    situacao: situacaoAtual,
    porTipo,
  };
}
