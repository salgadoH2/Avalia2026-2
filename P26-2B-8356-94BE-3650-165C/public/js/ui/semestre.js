/**
 * semestre.js — Visão geral do semestre (painel inicial) e onboarding da tela vazia.
 */
import { resumoSemestre, TIPOS, TIPO_LABEL } from "../calc.js";
import { el, fmt, fmt2, icone, ICONES, anel, ilustracao } from "./dom.js";
import { seloSituacao, proximoPasso, plural, TOM_SITUACAO, ICONE_TOM } from "./situacao.js";

/** Fórmula sugerida para quem está começando (soma 100). */
export const MODELO_PADRAO = [
  { nome: "Prova 1", tipo: "prova", peso: 35 },
  { nome: "Prova 2", tipo: "prova", peso: 35 },
  { nome: "Trabalho", tipo: "trabalho", peso: 20 },
  { nome: "Listas de exercícios", tipo: "lista", peso: 10 },
];

/** Barra horizontal de distribuição dos pesos por tipo + legenda. */
export function barraDistribuicao(avaliacoes) {
  const total = avaliacoes.reduce((s, a) => s + a.peso, 0) || 1;
  const porTipo = {};
  for (const a of avaliacoes) porTipo[a.tipo] = (porTipo[a.tipo] || 0) + a.peso;
  const tipos = TIPOS.filter((t) => porTipo[t] > 0);
  return [
    el("div", { class: "distribuicao", role: "img", "aria-label": tipos.map((t) => `${TIPO_LABEL[t]} ${fmt((porTipo[t] / total) * 100, 1)}%`).join(", ") },
      tipos.map((t) => el("span", { class: `seg-tipo-${t}`, style: `width:${(porTipo[t] / total) * 100}%` }))),
    el("div", { class: "distribuicao-legenda", "aria-hidden": "true" },
      tipos.map((t) => el("span", {}, el("span", { class: `ponto ponto-tipo-${t}` }), ` ${TIPO_LABEL[t]} ${fmt((porTipo[t] / total) * 100, 1)}%`))),
  ];
}

/** Tela vazia: boas-vindas, passos e um modelo de fórmula pronto para usar. */
export function renderOnboarding(area, { usuario, aoUsarModelo, aoComecarVazio }) {
  const primeiroNome = (usuario?.username || "").split(/[\s._-]/)[0];
  area.replaceChildren(
    el("section", { class: "cartao boas-vindas", "aria-labelledby": "titulo-pagina" },
      el("div", { class: "boas-vindas-texto" },
        el("p", { class: "sobretitulo" }, "Primeiros passos"),
        el("h1", { id: "titulo-pagina", tabindex: "-1" }, primeiroNome ? `Olá, ${primeiroNome}! Vamos montar sua grade.` : "Vamos montar sua grade."),
        el("p", { class: "texto-2" }, "Em três passos você descobre quanto precisa tirar em cada disciplina — e o cálculo é refeito a cada nota digitada.")
      ),
      el("div", { class: "boas-vindas-arte" }, ilustracao("tpl-ilustracao-vazio")),
      el("ol", { class: "passos" },
        el("li", {}, el("strong", {}, "Cadastre a disciplina"), el("span", {}, "com a fórmula da média: provas, trabalhos e listas com seus pesos.")),
        el("li", {}, el("strong", {}, "Lance as notas"), el("span", {}, "conforme saírem. Elas são salvas automaticamente.")),
        el("li", {}, el("strong", {}, "Veja a nota mínima"), el("span", {}, "no que falta para aprovação direta, exame ou para não reprovar — e simule cenários com “E se…?”."))
      )
    ),
    el("section", { class: "cartao modelo", "aria-labelledby": "titulo-modelo" },
      el("div", { class: "modelo-cabecalho" },
        el("span", { class: "icone-caixa", "aria-hidden": "true" }, icone(ICONES.livro, 20)),
        el("div", {},
          el("h2", { id: "titulo-modelo" }, "Modelo de fórmula sugerido"),
          el("p", { class: "texto-2" }, "Um formato comum em Engenharia de Software. Você pode ajustar nomes e pesos antes de salvar."))
      ),
      el("table", { class: "tabela-modelo" },
        el("caption", { class: "sr-only" }, "Avaliações do modelo sugerido"),
        el("thead", {}, el("tr", {}, el("th", { scope: "col" }, "Avaliação"), el("th", { scope: "col" }, "Tipo"), el("th", { scope: "col", class: "num" }, "Peso"))),
        el("tbody", {}, MODELO_PADRAO.map((a) => el("tr", {},
          el("td", {}, a.nome),
          el("td", {}, el("span", { class: `tipo tipo-${a.tipo}` }, a.tipo)),
          el("td", { class: "num" }, `${fmt(a.peso)}%`))))
      ),
      barraDistribuicao(MODELO_PADRAO),
      el("p", { class: "texto-2 pequeno" }, "Regras padrão: nota máxima 10, aprovação direta com média ≥ 7, exame com média ≥ 4 e média pós-exame ≥ 5."),
      el("div", { class: "botoes" },
        el("button", { type: "button", class: "btn btn-primario", onclick: aoUsarModelo }, icone(ICONES.mais), "Usar este modelo"),
        el("button", { type: "button", class: "btn btn-secundario", onclick: aoComecarVazio }, "Começar em branco")
      )
    )
  );
}

/** Indicador com anel de progresso: rótulo, valor grande e legenda. */
function kpiAnel(rotulo, valor, dica, pct, iconeCentro, classe) {
  return el("div", { class: `kpi kpi-anel ${classe}` },
    anel(pct, icone(iconeCentro, 20), "anel-kpi"),
    el("div", { class: "kpi-texto" },
      el("dt", {}, rotulo),
      el("dd", {}, el("span", { class: "kpi-valor" }, valor), el("span", { class: "kpi-dica" }, dica))
    )
  );
}

const SITUACOES_KPI = [
  ["aprovados", "Aprovados", "ok"],
  ["emAndamento", "Em andamento", "info"],
  ["emExame", "Em exame", "alerta"],
  ["reprovados", "Reprovados", "perigo"],
  ["semFormula", "Sem fórmula", "neutro"],
];

function kpiSituacoes(s) {
  const itens = SITUACOES_KPI.filter(([k]) => k !== "semFormula" || s[k] > 0);
  const total = s.total || 1;
  return el("div", { class: "kpi kpi-situacoes" },
    el("dt", {}, "Situação das disciplinas"),
    el("dd", {},
      el("span", { class: "kpi-valor" }, String(s.total), el("span", { class: "kpi-unidade" }, s.total === 1 ? " disciplina" : " disciplinas")),
      el("span", { class: "barra-empilhada", role: "img",
        "aria-label": itens.map(([k, r]) => `${r}: ${s[k]}`).join(", ") },
        itens.filter(([k]) => s[k] > 0).map(([k, , tom]) => el("span", { class: `seg-${tom}`, style: `width:${(s[k] / total) * 100}%` }))),
      el("ul", { class: "legenda-situacoes" },
        itens.map(([k, r, tom]) => el("li", { class: `leg-${tom}` },
          el("span", { class: "leg-icone", "aria-hidden": "true" }, icone(ICONE_TOM[tom], 14)),
          el("span", { class: "leg-rotulo" }, r),
          el("strong", {}, String(s[k])))))
    )
  );
}

function cartaoDisciplina(d, aoAbrir) {
  const r = d.resumo;
  const media = r.mediaFinal ?? r.mediaParcial;
  const tom = TOM_SITUACAO[r.situacao] || "neutro";
  const max = Number(d.nota_maxima);
  return el("li", {},
    el("a", { class: `cartao-disciplina tom-${tom}`, href: `#/disciplina/${d.id}`, onclick: (e) => { e.preventDefault(); aoAbrir(d.id); } },
      el("span", { class: "cd-topo" },
        seloSituacao(r.situacao),
        max !== 10 ? el("span", { class: "cd-escala" }, `Escala 0–${fmt(max)}`) : null),
      el("span", { class: "cd-nome" }, d.nome),
      el("span", { class: "cd-meio" },
        el("span", { class: "cd-media" },
          el("span", { class: "cd-media-valor" }, media === null ? "—" : fmt2(media)),
          el("span", { class: "cd-media-rotulo" }, r.mediaFinal !== null ? "média final" : media === null ? "sem notas ainda" : "média parcial")),
        el("span", { class: "cd-avaliado", role: "img", "aria-label": `${fmt(r.percentualAvaliado, 0)}% do peso já avaliado` },
          anel(r.percentualAvaliado, `${fmt(r.percentualAvaliado, 0)}%`, "anel-cartao"),
          el("span", { class: "cd-progresso-rotulo", "aria-hidden": "true" }, "avaliado"))),
      el("span", { class: "cd-dica" }, icone(ICONES.setaDireita, 16), el("span", {}, proximoPasso(r, d)))
    )
  );
}

/**
 * Painel "Visão geral do semestre".
 * @param {HTMLElement} area
 * @param {object} o  { disciplinas (todas), semestre, usuario, aoTrocarSemestre, aoAbrir, aoNova }
 */
export function renderVisaoGeral(area, { disciplinas, semestre, usuario, aoTrocarSemestre, aoAbrir, aoNova }) {
  const semestres = [...new Set(disciplinas.map((d) => d.semestre))];
  const doSemestre = disciplinas.filter((d) => d.semestre === semestre);
  const s = resumoSemestre(doSemestre);
  const pct = s.percentualAvaliado ?? 0;
  const primeiroNome = (usuario?.username || "").split(/[\s._-]/)[0];

  let seletor = null;
  if (semestres.length > 1) {
    const select = el("select", { id: "seletor-semestre", class: "seletor", onchange: (e) => aoTrocarSemestre(e.target.value) },
      semestres.map((x) => el("option", { value: x, selected: x === semestre }, x)));
    seletor = el("label", { class: "campo-inline", for: "seletor-semestre" }, icone(ICONES.calendario, 16), el("span", {}, "Semestre"), select);
  }

  const temMedia = s.mediaGeral !== null && s.mediaGeral !== undefined;
  area.replaceChildren(
    el("section", { class: "cabecalho-pagina", "aria-labelledby": "titulo-pagina" },
      el("div", { class: "cabecalho-texto" },
        el("p", { class: "sobretitulo" }, `Semestre ${semestre}`),
        el("h1", { id: "titulo-pagina", tabindex: "-1" }, "Visão geral do semestre"),
        el("p", { class: "texto-2" }, `${primeiroNome ? `Olá, ${primeiroNome}! ` : ""}${plural(s.total, "disciplina cadastrada", "disciplinas cadastradas")}. Clique em uma disciplina para lançar notas.`)
      ),
      el("div", { class: "visao-acoes" }, seletor,
        el("button", { type: "button", class: "btn btn-secundario", onclick: aoNova }, icone(ICONES.mais, 16), "Disciplina"))
    ),
    el("dl", { class: "kpis", "aria-label": `Resumo do semestre ${semestre}` },
      kpiAnel("Média geral", temMedia ? fmt2(s.mediaGeral) : "—", "média das médias (0–10)",
        temMedia ? s.mediaGeral * 10 : 0, ICONES.grafico, "kpi-media"),
      kpiAnel("Peso avaliado", `${fmt(pct, 0)}%`, "do peso já tem nota", pct, ICONES.relogio, "kpi-peso"),
      kpiSituacoes(s)
    ),
    el("section", { class: "secao", "aria-labelledby": "titulo-lista-semestre" },
      el("div", { class: "secao-cabecalho" },
        el("h2", { id: "titulo-lista-semestre", class: "titulo-secao" }, "Disciplinas do semestre"),
        el("span", { class: "contagem" }, String(doSemestre.length))),
      doSemestre.length
        ? el("ul", { class: "grade-disciplinas" }, doSemestre.map((d) => cartaoDisciplina(d, aoAbrir)))
        : el("p", { class: "texto-2" }, "Nenhuma disciplina neste semestre.")
    )
  );
}
