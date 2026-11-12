/**
 * calc.js — Motor de cálculo da média (módulo ES puro, sem dependências, sem estado).
 * Usado no navegador (cálculo instantâneo) e nas Cloudflare Pages Functions
 * (o servidor devolve o mesmo resumo, garantindo a mesma regra dos dois lados).
 *
 * ── Notação ────────────────────────────────────────────────────────────────
 *   N  = nota_maxima da disciplina (ex.: 10 ou 100)
 *   W  = Σ peso_i                       (todas as avaliações)
 *   Wf = Σ peso_i  das avaliações feitas (nota ≠ null/undefined/"")
 *   R  = Σ peso_i  das avaliações restantes (somado direto, não W − Wf,
 *        para não acumular erro de ponto flutuante)
 *   K  = Σ peso_i × nota_i das avaliações feitas
 *
 * ── Fórmulas ───────────────────────────────────────────────────────────────
 *   Média ponderada final ........ M  = K / W                 (quando R = 0)
 *   Média parcial ................ Mp = K / Wf                (só o que já foi feito)
 *   Pontos garantidos ............ G  = K / W                 (zerando o restante)
 *   Média máxima possível ........ Mx = (K + R·N) / W         (nota máxima no restante)
 *   Nota mínima uniforme x nas restantes para a meta A:
 *       (K + R·x) / W ≥ A   ⇒   x = (A·W − K) / R
 *       x ≤ 0 → "garantido" · 0 < x ≤ N → "possivel" · x > N (ou R = 0) → "impossivel"
 *   Exame final (média M em exame, meta pós-exame F):
 *       (M + E) / 2 ≥ F   ⇒   E = 2·F − M
 *
 * ── Arredondamento (conservador nos dois sentidos) ─────────────────────────
 *   • Notas mínimas (x, E) sobem: ceil2 — tirar exatamente a nota mostrada basta.
 *   • Médias exibidas (Mp, G, Mx, M, média por tipo, % avaliado) descem: floor2 —
 *     o sistema nunca mostra média maior que a real. Assim a média exibida nunca
 *     contradiz a situação (ex.: 6,9967 aparece 6,99 e "exame", nunca 7,00 e "exame")
 *     e a conta do exame fecha à mão: floor2(M) + ceil2(2F − M) = 2F.
 *   • A classificação usa sempre o valor exato, com tolerância EPS só para
 *     absorver erro de ponto flutuante (6,9999999999999 conta como 7).
 *   • Pesos e participação por tipo usam round2 (meio para cima).
 */

export const TIPOS = ["prova", "trabalho", "lista"];
export const TIPO_LABEL = { prova: "Provas", trabalho: "Trabalhos", lista: "Listas" };

/** Tolerância para erro de ponto flutuante (muito abaixo de 0,01 em qualquer escala usada). */
const EPS = 1e-9;

/** Arredonda para cima em 2 casas (uma nota "mínima" nunca pode ser arredondada para baixo). */
export function ceil2(v) {
  return Math.ceil(v * 100 - EPS) / 100;
}

/** Arredonda para baixo em 2 casas (uma média exibida nunca pode passar da real). */
export function floor2(v) {
  return Math.floor((v + EPS) * 100) / 100;
}

/**
 * Arredonda para o mais próximo em 2 casas (meio para cima).
 * O EPS corrige o caso clássico 1.005 * 100 = 100.49999999999999.
 */
export function round2(v) {
  return Math.round((v + EPS) * 100) / 100;
}

/** Nota zero é nota. Só null/undefined/"" (ou texto em branco) contam como "não feita". */
function temNota(a) {
  const n = a.nota;
  if (typeof n === "number") return Number.isFinite(n);
  if (typeof n === "string") return n.trim() !== "" && Number.isFinite(Number(n));
  return false;
}

/** Peso inválido (NaN, negativo, vazio) vale 0 em vez de contaminar todas as somas. */
function pesoValido(p) {
  const n = Number(p);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Nota mínima necessária (igual em todas as avaliações restantes) para atingir `meta`.
 * @param {{K:number, R:number, W:number}} base
 * @returns {{status:"garantido"|"possivel"|"impossivel", nota:number|null}}
 *   "garantido": já atingido mesmo com zero no resto (nota 0);
 *   "possivel": nota = ceil2(x) ≤ notaMaxima;
 *   "impossivel": nota = ceil2(x) > notaMaxima, ou null se não resta nada (R = 0).
 */
export function notaNecessaria({ K, R, W }, meta, notaMaxima) {
  const alvo = Number(meta) * W - K;
  if (alvo <= EPS) return { status: "garantido", nota: 0 };
  if (R <= EPS) return { status: "impossivel", nota: null };
  const x = alvo / R;
  if (x > notaMaxima + EPS) return { status: "impossivel", nota: ceil2(x) };
  return { status: "possivel", nota: Math.min(ceil2(x), notaMaxima) };
}

/** Classifica uma média final (exata) segundo as regras da disciplina. */
export function situacao(media, d) {
  if (media + EPS >= Number(d.media_aprovacao)) return "aprovado";
  if (media + EPS >= Number(d.media_minima_exame)) return "exame";
  return "reprovado";
}

/**
 * Resumo completo de uma disciplina.
 * @param {object} d  { nota_maxima, media_aprovacao, media_minima_exame, media_final_exame, avaliacoes:[{id,tipo,peso,nota}] }
 */
export function resumoDisciplina(d) {
  d = d || {};
  const avs = (d.avaliacoes || []).map((a) => ({ ...a, peso: pesoValido(a.peso) }));
  const notaMaxima = Number(d.nota_maxima);
  const regras = {
    media_aprovacao: Number(d.media_aprovacao),
    media_minima_exame: Number(d.media_minima_exame),
    media_final_exame: Number(d.media_final_exame),
  };
  let W = 0, K = 0, Wf = 0, R = 0, restantes = 0;
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
    } else {
      R += a.peso;
      restantes += 1;
    }
  }
  for (const t of Object.keys(porTipo)) {
    const pt = porTipo[t];
    pt.media = pt.pesoFeito > 0 ? floor2(pt.pontos / pt.pesoFeito) : null;
    pt.percentual = W > 0 ? round2((pt.peso / W) * 100) : 0;
  }

  const base = { K, R, W };
  const vazio = !(W > 0);

  // Média parcial = média ponderada só das avaliações já feitas
  const mediaParcial = Wf > 0 ? floor2(K / Wf) : null;
  // Pontos garantidos = contribuição atual na média final (como se o resto fosse zero)
  const pontosGarantidos = vazio ? 0 : floor2(K / W);
  // Média máxima possível = tirando nota máxima em tudo que falta
  const mediaMaxima = vazio ? 0 : floor2((K + R * notaMaxima) / W);
  const concluida = !vazio && R <= EPS;
  // A classificação usa a média exata (sem arredondar), igual ao critério da nota mínima;
  // o arredondamento (para baixo) é só para exibição. Ex.: 6,995 continua abaixo de 7.
  const mediaExata = concluida ? K / W : null;
  const mediaFinal = concluida ? floor2(mediaExata) : null;

  const aprovacao = vazio ? null : notaNecessaria(base, regras.media_aprovacao, notaMaxima);
  const evitarReprovacao = vazio ? null : notaNecessaria(base, regras.media_minima_exame, notaMaxima);

  // Se terminar em exame: nota necessária no exame final, assumindo (média + exame) / 2 ≥ media_final_exame
  let exame = null;
  if (concluida && situacao(mediaExata, regras) === "exame") {
    const x = 2 * regras.media_final_exame - mediaExata;
    exame = x > notaMaxima + EPS
      ? { status: "impossivel", nota: ceil2(x) }
      : { status: "possivel", nota: Math.min(Math.max(0, ceil2(x)), notaMaxima) };
  }

  let situacaoAtual;
  if (vazio) situacaoAtual = "sem_formula";
  else if (concluida) situacaoAtual = situacao(mediaExata, regras);
  else if (aprovacao.status === "garantido") situacaoAtual = "aprovado";
  else if (evitarReprovacao.status === "impossivel") situacaoAtual = "reprovado";
  else if (aprovacao.status === "impossivel") situacaoAtual = "exame_inevitavel";
  else situacaoAtual = "em_andamento";

  return {
    pesoTotal: round2(W),
    pesoAvaliado: round2(Wf),
    percentualAvaliado: vazio ? 0 : floor2((Wf / W) * 100),
    restantes,
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

/**
 * Simulação "e se eu tirar…": aplica notas hipotéticas por id de avaliação e
 * devolve o resumo, sem alterar `d`.
 * @param {object} d  disciplina (mesmo formato de resumoDisciplina)
 * @param {Object<string, number|null>} notas  { [avaliacaoId]: nota | null } — null "desfaz" a nota;
 *   ids ausentes mantêm a nota original; ids inexistentes são ignorados.
 * @returns o mesmo objeto de resumoDisciplina
 */
export function simular(d, notas) {
  const mapa = notas && typeof notas === "object" ? notas : {};
  const tem = (id) => id !== null && id !== undefined && Object.prototype.hasOwnProperty.call(mapa, id);
  const avaliacoes = ((d && d.avaliacoes) || []).map((a) => (tem(a.id) ? { ...a, nota: mapa[a.id] } : a));
  return resumoDisciplina({ ...(d || {}), avaliacoes });
}

/**
 * Painel do semestre. Recalcula o resumo de cada disciplina (não confia em `d.resumo`).
 * @param {object[]} disciplinas
 * @returns {{ total:number, aprovados:number, emAndamento:number, emExame:number, reprovados:number,
 *             mediaGeral:number|null, percentualAvaliado:number, semFormula:number }}
 *   emExame = "exame" + "exame_inevitavel".
 *   mediaGeral = média simples de (mediaFinal ?? mediaParcial) das disciplinas que têm valor
 *   convertidas para a escala 0–10 (m × 10 ÷ nota_maxima), para que disciplinas 0–10 e 0–100
 *   possam ser somadas (round2; null se nenhuma). percentualAvaliado = média simples (round2; 0 se vazio).
 *   semFormula (campo extra) = disciplinas sem pesos; total = soma de todas as categorias.
 */
export function resumoSemestre(disciplinas) {
  const lista = Array.isArray(disciplinas) ? disciplinas : [];
  const r = { total: lista.length, aprovados: 0, emAndamento: 0, emExame: 0, reprovados: 0,
    mediaGeral: null, percentualAvaliado: 0, semFormula: 0 };
  let somaMedias = 0, qtdMedias = 0, somaPct = 0;
  for (const d of lista) {
    const s = resumoDisciplina(d);
    if (s.situacao === "aprovado") r.aprovados++;
    else if (s.situacao === "em_andamento") r.emAndamento++;
    else if (s.situacao === "exame" || s.situacao === "exame_inevitavel") r.emExame++;
    else if (s.situacao === "reprovado") r.reprovados++;
    else r.semFormula++;
    const m = s.mediaFinal ?? s.mediaParcial;
    const max = Number(d.nota_maxima);
    // Normaliza para a escala 0–10, para poder misturar disciplinas 0–10 e 0–100.
    if (m !== null && m !== undefined && max > 0) { somaMedias += (m * 10) / max; qtdMedias++; }
    somaPct += s.percentualAvaliado;
  }
  if (qtdMedias > 0) r.mediaGeral = round2(somaMedias / qtdMedias);
  if (lista.length > 0) r.percentualAvaliado = round2(somaPct / lista.length);
  return r;
}
