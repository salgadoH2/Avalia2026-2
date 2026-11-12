/**
 * semestre.js — Visão geral do semestre (painel inicial) e onboarding da tela vazia.
 */
import { resumoSemestre, TIPOS, TIPO_LABEL } from "../calc.js";
import { el, fmt, fmt2, icone, ICONES } from "./dom.js";
import { seloSituacao, proximoPasso, plural, TOM_SITUACAO } from "./situacao.js";

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
      tipos.map((t) => el("span", { style: `width:${(porTipo[t] / total) * 100}%;background:var(--cor-${t})` }))),
    el("div", { class: "distribuicao-legenda", "aria-hidden": "true" },
      tipos.map((t) => el("span", {}, el("span", { class: "ponto", style: `background:var(--cor-${t})` }), ` ${TIPO_LABEL[t]} ${fmt((porTipo[t] / total) * 100, 1)}%`))),
  ];
}

/** Tela vazia: boas-vindas, passos e um modelo de fórmula pronto para usar. */
export function renderOnboarding(area, { usuario, aoUsarModelo, aoComecarVazio }) {
  const primeiroNome = (usuario?.username || "").split(/[\s._-]/)[0];
  area.replaceChildren(
    el("section", { class: "cartao boas-vindas", "aria-labelledby": "titulo-pagina" },
      el("p", { class: "sobretitulo" }, "Primeiros passos"),
      el("h1", { id: "titulo-pagina", tabindex: "-1" }, primeiroNome ? `Olá, ${primeiroNome}! Vamos montar sua grade.` : "Vamos montar sua grade."),
      el("p", { class: "texto-2" }, "Em três passos você descobre quanto precisa tirar em cada disciplina — e o cálculo é refeito a cada nota digitada."),
      el("ol", { class: "passos" },
        el("li", {}, el("strong", {}, "Cadastre a disciplina"), el("span", {}, "com a fórmula da média: provas, trabalhos e listas com seus pesos.")),
        el("li", {}, el("strong", {}, "Lance as notas"), el("span", {}, "conforme saírem. Elas são salvas automaticamente.")),
        el("li", {}, el("strong", {}, "Veja a nota mínima"), el("span", {}, "no que falta para aprovação direta, exame ou para não reprovar — e simule cenários com “E se…?”."))
      )
    ),
    el("section", { class: "cartao modelo", "aria-labelledby": "titulo-modelo" },
      el("h2", { id: "titulo-modelo" }, "Modelo de fórmula sugerido"),
      el("p", { class: "texto-2" }, "Um formato comum em Engenharia de Software. Você pode ajustar nomes e pesos antes de salvar."),
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

function contador(rotulo, valor, tom, extra) {
  return el("div", { class: `contador contador-${tom}` },
    el("dt", {}, rotulo),
    el("dd", {}, el("span", { class: "contador-valor" }, valor), extra || null)
  );
}

function cartaoDisciplina(d, aoAbrir) {
  const r = d.resumo;
  const media = r.mediaFinal ?? r.mediaParcial;
  const tom = TOM_SITUACAO[r.situacao] || "neutro";
  return el("li", {},
    el("a", { class: `cartao-disciplina borda-${tom}`, href: `#/disciplina/${d.id}`, onclick: (e) => { e.preventDefault(); aoAbrir(d.id); } },
      el("span", { class: "cd-topo" },
        el("span", { class: "cd-nome" }, d.nome),
        seloSituacao(r.situacao)),
      el("span", { class: "cd-media" },
        el("span", { class: "cd-media-valor" }, media === null ? "—" : fmt2(media)),
        el("span", { class: "cd-media-rotulo" }, r.mediaFinal !== null ? "média final" : media === null ? "sem notas ainda" : "média parcial")),
      el("span", { class: "barra", role: "img", "aria-label": `${fmt(r.percentualAvaliado, 0)}% do peso já avaliado` },
        el("span", { style: `width:${r.percentualAvaliado}%` })),
      el("span", { class: "cd-dica" }, `${fmt(r.percentualAvaliado, 0)}% avaliado · ${proximoPasso(r, d)}`)
    )
  );
}

/**
 * Painel "Visão geral do semestre".
 * @param {HTMLElement} area
 * @param {object} o  { disciplinas (todas), semestre, aoTrocarSemestre, aoAbrir, aoNova }
 */
export function renderVisaoGeral(area, { disciplinas, semestre, aoTrocarSemestre, aoAbrir, aoNova }) {
  const semestres = [...new Set(disciplinas.map((d) => d.semestre))];
  const doSemestre = disciplinas.filter((d) => d.semestre === semestre);
  const s = resumoSemestre(doSemestre);
  const pct = s.percentualAvaliado ?? 0;

  let seletor = null;
  if (semestres.length > 1) {
    const select = el("select", { id: "seletor-semestre", class: "seletor", onchange: (e) => aoTrocarSemestre(e.target.value) },
      semestres.map((x) => el("option", { value: x, selected: x === semestre }, x)));
    seletor = el("label", { class: "campo-inline", for: "seletor-semestre" }, "Semestre", select);
  }

  area.replaceChildren(
    el("section", { class: "cartao visao-topo", "aria-labelledby": "titulo-pagina" },
      el("div", {},
        el("p", { class: "sobretitulo" }, `Semestre ${semestre}`),
        el("h1", { id: "titulo-pagina", tabindex: "-1" }, "Visão geral do semestre"),
        el("p", { class: "texto-2" }, `${plural(s.total, "disciplina cadastrada", "disciplinas cadastradas")}. Clique em uma disciplina para lançar notas.`)
      ),
      el("div", { class: "visao-acoes" }, seletor,
        el("button", { type: "button", class: "btn btn-secundario btn-pequeno", onclick: aoNova }, icone(ICONES.mais, 16), "Disciplina"))
    ),
    el("dl", { class: "contadores", "aria-label": `Resumo do semestre ${semestre}` },
      contador("Disciplinas", String(s.total), "neutro"),
      contador("Aprovados", String(s.aprovados), "ok"),
      contador("Em andamento", String(s.emAndamento), "info"),
      contador("Em exame", String(s.emExame), "alerta"),
      contador("Reprovados", String(s.reprovados), "perigo"),
      contador("Média geral", s.mediaGeral === null || s.mediaGeral === undefined ? "—" : fmt2(s.mediaGeral), "destaque",
        el("span", { class: "contador-dica" }, "média das médias, escala 0–10")),
      contador("Peso avaliado", `${fmt(pct, 0)}%`, "destaque",
        el("span", { class: "barra", "aria-hidden": "true" }, el("span", { style: `width:${Math.max(0, Math.min(100, pct))}%` })))
    ),
    el("section", { class: "cartao", "aria-labelledby": "titulo-lista-semestre" },
      el("h2", { id: "titulo-lista-semestre", class: "titulo-secao" }, "Disciplinas do semestre"),
      doSemestre.length
        ? el("ul", { class: "grade-disciplinas" }, doSemestre.map((d) => cartaoDisciplina(d, aoAbrir)))
        : el("p", { class: "texto-2" }, "Nenhuma disciplina neste semestre.")
    )
  );
}
