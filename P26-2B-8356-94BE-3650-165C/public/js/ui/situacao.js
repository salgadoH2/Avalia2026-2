/**
 * situacao.js — textos e cores da situação de uma disciplina (compartilhado entre painéis).
 */
import { el, fmt, fmt2, icone, ICONES } from "./dom.js";

export const ROTULO_SITUACAO = {
  aprovado: "Aprovado(a)",
  em_andamento: "Em andamento",
  exame_inevitavel: "Exame inevitável",
  exame: "Em exame",
  reprovado: "Reprovado(a)",
  sem_formula: "Sem fórmula",
};

/** Classe de cor (ok / info / alerta / perigo / neutro) para cada situação. */
export const TOM_SITUACAO = {
  aprovado: "ok",
  em_andamento: "info",
  exame_inevitavel: "alerta",
  exame: "alerta",
  reprovado: "perigo",
  sem_formula: "neutro",
};

export const textoSituacao = (s) => ROTULO_SITUACAO[s] || "—";

/** Ícone de cada tom (a situação nunca depende só da cor). */
export const ICONE_TOM = {
  ok: ICONES.checkCirculo,
  info: ICONES.relogio,
  alerta: ICONES.alerta,
  perigo: ICONES.xCirculo,
  neutro: ICONES.menos,
};

export function seloSituacao(s) {
  const tom = TOM_SITUACAO[s] || "neutro";
  return el("span", { class: `selo selo-${tom}` }, icone(ICONE_TOM[tom], 14), textoSituacao(s));
}

export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

/** Frase curta com o próximo passo do aluno nesta disciplina. */
export function proximoPasso(r, d) {
  const nasRestantes = noRestante(r.restantes);
  switch (r.situacao) {
    case "aprovado":
      return r.mediaFinal !== null ? `Aprovação direta com média ${fmt2(r.mediaFinal)}.` : "Aprovação direta já garantida.";
    case "em_andamento":
      return `Precisa de ${fmt2(r.aprovacao.nota)} de média ${nasRestantes} para passar direto.`;
    case "exame_inevitavel":
      return r.evitarReprovacao.status === "garantido"
        ? "Aprovação direta impossível; exame final garantido."
        : `Precisa de ${fmt2(r.evitarReprovacao.nota)} ${nasRestantes} para ter direito ao exame.`;
    case "exame":
      return r.exame?.status === "impossivel"
        ? `Seria preciso ${fmt2(r.exame.nota)} no exame (acima da nota máxima).`
        : `Precisa de ${fmt2(r.exame?.nota)} no exame para chegar a ${fmt(d.media_final_exame)}.`;
    case "reprovado":
      return r.mediaFinal !== null ? `Média final ${fmt2(r.mediaFinal)}, abaixo do mínimo para exame.` : "Reprovação direta, mesmo com nota máxima no que falta.";
    default:
      return "Cadastre as avaliações na fórmula.";
  }
}

/** "na avaliação restante" / "nas 3 avaliações restantes" (concordância correta para 1). */
export const noRestante = (n) => (n === 1 ? "na avaliação restante" : `nas ${n} avaliações restantes`);
