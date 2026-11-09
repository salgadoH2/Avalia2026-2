/**
 * app.js — Interface em JavaScript puro (Vanilla JS, manipulação direta do DOM).
 * As médias são recalculadas no cliente a cada tecla; as notas são salvas no D1 em segundo plano.
 */
import { resumoDisciplina, TIPOS, TIPO_LABEL } from "./calc.js";

// ---------- Estado ----------
const estado = {
  usuario: null,
  disciplinas: [],
  selecionadaId: null,
  pendentes: new Map(), // avaliacaoId -> timeout de salvamento
};

// ---------- Utilidades ----------
const $ = (sel, raiz = document) => raiz.querySelector(sel);

/** Cria elementos sem innerHTML (evita XSS com nomes digitados pelo usuário). */
function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (k === "style") n.style.cssText = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) n.append(f);
  return n;
}

const fmt = (n, casas = 2) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas });

const fmt2 = (n) =>
  n === null || n === undefined ? "—" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** "7,5" -> 7.5 · "" -> null · lixo -> NaN */
function lerNumero(txt) {
  const s = String(txt ?? "").trim().replace(",", ".");
  if (s === "") return null;
  if (!/^-?\d*\.?\d+$/.test(s) && !/^-?\d+\.?$/.test(s)) return NaN;
  return Number(s);
}

function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 2800);
}

async function api(caminho, opcoes = {}) {
  const init = { method: opcoes.method || "GET", headers: {}, credentials: "same-origin" };
  if (opcoes.body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opcoes.body);
  }
  const res = await fetch(caminho, init);
  const dados = await res.json().catch(() => ({}));
  if (res.status === 401) {
    mostrarLogin();
    throw new Error(dados.erro || "Sessão expirada. Entre novamente.");
  }
  if (!res.ok || dados.ok === false) throw new Error(dados.erro || `Erro ${res.status}`);
  return dados;
}

function semestreAtual() {
  const d = new Date();
  return `${d.getFullYear()}.${d.getMonth() < 6 ? 1 : 2}`;
}

const COR_SITUACAO = {
  aprovado: "var(--ok)",
  em_andamento: "var(--info)",
  exame_inevitavel: "var(--alerta)",
  exame: "var(--alerta)",
  reprovado: "var(--perigo)",
  sem_formula: "var(--borda)",
};

const disciplinaAtual = () => estado.disciplinas.find((d) => d.id === estado.selecionadaId) || null;

// ---------- Telas ----------
function mostrarLogin(aviso) {
  $("#tela-app").hidden = true;
  $("#perfil").hidden = true;
  $("#tela-login").hidden = false;
  const p = $("#login-aviso");
  p.hidden = !aviso;
  if (aviso) p.textContent = aviso;
}

function mostrarApp() {
  const u = estado.usuario;
  $("#tela-login").hidden = true;
  $("#tela-app").hidden = false;
  $("#perfil").hidden = false;
  $("#perfil-avatar").src = u.avatar_url;
  $("#perfil-avatar").alt = `Avatar de ${u.username}`;
  $("#perfil-nome").textContent = u.username;
  $("#perfil-id").textContent = u.user_id;
}

// ---------- Lista lateral ----------
function renderLista() {
  const nav = $("#lista-disciplinas");
  nav.replaceChildren();
  if (!estado.disciplinas.length) {
    nav.append(el("p", { class: "vazio-lista" }, "Nenhuma disciplina ainda."));
    return;
  }
  let semestre = null;
  for (const d of estado.disciplinas) {
    if (d.semestre !== semestre) {
      semestre = d.semestre;
      nav.append(el("div", { class: "grupo-semestre" }, `Semestre ${semestre}`));
    }
    nav.append(itemLista(d));
  }
}

function itemLista(d) {
  const r = d.resumo;
  const media = r.mediaFinal ?? r.mediaParcial;
  return el("button", {
      type: "button",
      class: "item-disciplina",
      "aria-current": d.id === estado.selecionadaId ? "true" : "false",
      dataset: { id: d.id },
      onclick: () => selecionar(d.id),
    },
    el("span", { class: "item-nome" }, d.nome),
    el("span", { class: "item-media" },
      media === null ? "—" : fmt2(media),
      el("span", { class: "ponto", style: `background:${COR_SITUACAO[r.situacao]}`, title: textoSituacao(r.situacao) })
    )
  );
}

function atualizarItemLista(d) {
  const antigo = $(`.item-disciplina[data-id="${d.id}"]`);
  if (antigo) antigo.replaceWith(itemLista(d));
}

function textoSituacao(s) {
  return {
    aprovado: "Aprovado(a)",
    em_andamento: "Em andamento",
    exame_inevitavel: "Exame inevitável",
    exame: "Exame final",
    reprovado: "Reprovado(a)",
    sem_formula: "Sem fórmula",
  }[s];
}

function selecionar(id) {
  estado.selecionadaId = id;
  try { localStorage.setItem("disciplinaSelecionada", String(id)); } catch {}
  for (const b of document.querySelectorAll(".item-disciplina")) {
    b.setAttribute("aria-current", Number(b.dataset.id) === id ? "true" : "false");
  }
  renderDetalhe();
}

// ---------- Painel de detalhe ----------
function renderDetalhe() {
  const area = $("#detalhe");
  area.replaceChildren();
  const d = disciplinaAtual();

  if (!d) {
    area.append(el("div", { class: "cartao vazio" },
      el("h2", {}, estado.disciplinas.length ? "Escolha uma disciplina" : "Comece pela sua grade"),
      el("p", {}, estado.disciplinas.length
        ? "Selecione uma disciplina na lista para lançar notas."
        : "Cadastre as disciplinas do semestre e defina os pesos de provas, trabalhos e listas."),
      !estado.disciplinas.length && el("button", { class: "btn btn-primario", type: "button", onclick: () => abrirEditor(null) }, "+ Cadastrar disciplina")
    ));
    return;
  }

  area.append(
    el("div", { class: "cartao" },
      el("div", { class: "detalhe-topo" },
        el("div", {},
          el("h1", {}, d.nome),
          el("div", { class: "regras" },
            el("span", { class: "chip" }, `Semestre ${d.semestre}`),
            el("span", { class: "chip" }, `Nota máx. ${fmt(d.nota_maxima)}`),
            el("span", { class: "chip" }, `Aprovação direta ≥ ${fmt(d.media_aprovacao)}`),
            el("span", { class: "chip" }, `Exame se ≥ ${fmt(d.media_minima_exame)}`),
            el("span", { class: "chip" }, `Pós-exame ≥ ${fmt(d.media_final_exame)}`)
          )
        ),
        el("div", { class: "acoes" },
          el("button", { class: "btn btn-secundario btn-pequeno", type: "button", onclick: () => abrirEditor(d) }, "Editar fórmula"),
          el("button", { class: "btn btn-perigo btn-pequeno", type: "button", onclick: () => excluir(d) }, "Excluir")
        )
      )
    ),
    el("div", { id: "area-resumo", class: "detalhe" }),
    tabelaNotas(d),
    el("div", { id: "area-tipos", class: "cartao" })
  );
  atualizarResumo(d);
}

function tabelaNotas(d) {
  const tbody = el("tbody");
  const pesoTotal = d.avaliacoes.reduce((s, a) => s + Number(a.peso), 0);
  for (const a of d.avaliacoes) {
    const input = el("input", {
      class: "entrada-nota",
      type: "text",
      inputmode: "decimal",
      autocomplete: "off",
      value: a.nota === null ? "" : String(a.nota).replace(".", ","),
      "aria-label": `Nota de ${a.nome}`,
      dataset: { avaliacao: a.id },
    });
    const status = el("span", { class: "estado-salvo", "aria-live": "polite" });
    input.addEventListener("input", () => aoDigitarNota(d, a, input, status));
    input.addEventListener("blur", () => salvarAgora(d, a, input, status));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const todos = [...document.querySelectorAll(".entrada-nota")];
        (todos[todos.indexOf(input) + 1] || input).focus();
      }
    });
    tbody.append(el("tr", {},
      el("td", {}, a.nome),
      el("td", {}, el("span", { class: `tipo tipo-${a.tipo}` }, a.tipo)),
      el("td", { class: "num col-peso" }, `${fmt(a.peso)} (${fmt((a.peso / pesoTotal) * 100, 1)}%)`),
      el("td", { class: "num" }, input),
      el("td", {}, status)
    ));
  }
  return el("div", { class: "cartao" },
    el("h3", {}, "Notas obtidas"),
    el("table", { class: "tabela-notas" },
      el("thead", {}, el("tr", {},
        el("th", {}, "Avaliação"), el("th", {}, "Tipo"), el("th", { class: "num col-peso" }, "Peso"),
        el("th", { class: "num" }, "Nota"), el("th", {}, "")
      )),
      tbody
    ),
    el("p", { class: "legenda" },
      "Deixe em branco o que ainda não foi feito. Nos campos vazios aparece a nota mínima para aprovação direta. Use vírgula ou ponto: 7,5."
    )
  );
}

function aoDigitarNota(d, a, input, status) {
  const v = lerNumero(input.value);
  const valido = v === null || (Number.isFinite(v) && v >= 0 && v <= d.nota_maxima);
  input.classList.toggle("invalida", !valido);
  input.setCustomValidity(valido ? "" : `Nota entre 0 e ${fmt(d.nota_maxima)}`);
  if (!valido) {
    status.textContent = `0 a ${fmt(d.nota_maxima)}`;
    status.classList.add("erro-salvar");
    return;
  }
  a.nota = v === null ? null : Math.round(v * 100) / 100;
  d.resumo = resumoDisciplina(d); // cálculo instantâneo no cliente
  atualizarResumo(d);
  atualizarItemLista(d);

  status.classList.remove("erro-salvar");
  status.textContent = "…";
  clearTimeout(estado.pendentes.get(a.id));
  estado.pendentes.set(a.id, setTimeout(() => enviarNota(d, a, status), 700));
}

function salvarAgora(d, a, input, status) {
  if (!estado.pendentes.has(a.id) || input.classList.contains("invalida")) return;
  clearTimeout(estado.pendentes.get(a.id));
  enviarNota(d, a, status);
}

async function enviarNota(d, a, status) {
  estado.pendentes.delete(a.id);
  const nota = a.nota;
  status.textContent = "salvando…";
  try {
    const r = await api(`/api/avaliacoes/${a.id}`, { method: "PATCH", body: { nota } });
    if (a.nota === nota) status.textContent = "✓ salvo";
    // Confere o cálculo do servidor (mesma regra); mantém o que o usuário digitou depois.
    const servidor = r.disciplina.avaliacoes.find((x) => x.id === a.id);
    if (servidor && servidor.nota !== nota && a.nota === nota) a.nota = servidor.nota;
    setTimeout(() => { if (status.textContent === "✓ salvo") status.textContent = ""; }, 2000);
  } catch (e) {
    status.textContent = "erro";
    status.classList.add("erro-salvar");
    status.title = e.message;
    toast(`Não foi possível salvar a nota: ${e.message}`);
  }
}

function classeMeta(r, notaMax) {
  if (!r) return "";
  if (r.status === "possivel" && r.nota > notaMax * 0.85) return "dificil";
  return r.status;
}

function valorMeta(r) {
  if (!r) return "—";
  if (r.status === "garantido") return "✓";
  if (r.status === "impossivel") return "✗";
  return fmt2(r.nota);
}

function atualizarResumo(d) {
  const r = d.resumo;
  const area = $("#area-resumo");
  if (!area) return;
  const max = d.nota_maxima;

  // Faixa de situação
  let faixa;
  const restantes = `${r.restantes} ${r.restantes === 1 ? "avaliação restante" : "avaliações restantes"}`;
  switch (r.situacao) {
    case "aprovado":
      faixa = ["ok", "🎉", r.mediaFinal !== null ? "Aprovação direta!" : "Aprovação direta garantida",
        r.mediaFinal !== null
          ? `Média final ${fmt2(r.mediaFinal)} — acima de ${fmt(d.media_aprovacao)}.`
          : `Mesmo tirando zero nas ${restantes}, sua média fica em pelo menos ${fmt2(r.pontosGarantidos)}.`];
      break;
    case "em_andamento":
      faixa = ["info", "🎯", `Precisa de ${fmt2(r.aprovacao.nota)} de média no que falta`,
        `Tirando pelo menos ${fmt2(r.aprovacao.nota)} nas ${restantes} você passa direto, sem exame. ` +
        (r.evitarReprovacao.status === "garantido"
          ? "Reprovação direta já está descartada."
          : `Abaixo de ${fmt2(r.evitarReprovacao.nota)} você reprova sem direito a exame.`)];
      break;
    case "exame_inevitavel":
      faixa = ["alerta", "⚠️", "Aprovação direta não é mais possível",
        `Mesmo tirando ${fmt(max)} em tudo, a média máxima é ${fmt2(r.mediaMaxima)}. ` +
        (r.evitarReprovacao.status === "garantido"
          ? "O exame final já está garantido."
          : `Tire pelo menos ${fmt2(r.evitarReprovacao.nota)} nas ${restantes} para ter direito ao exame.`)];
      break;
    case "exame":
      faixa = ["alerta", "📝", "Exame final",
        r.exame.status === "impossivel"
          ? `Média ${fmt2(r.mediaFinal)}: seria preciso ${fmt2(r.exame.nota)} no exame, acima da nota máxima.`
          : `Média ${fmt2(r.mediaFinal)}. Você precisa de ${fmt2(r.exame.nota)} no exame para chegar a ${fmt(d.media_final_exame)}.`];
      break;
    case "reprovado":
      faixa = ["perigo", "✗", "Reprovação direta",
        r.mediaFinal !== null
          ? `Média final ${fmt2(r.mediaFinal)}, abaixo de ${fmt(d.media_minima_exame)} (mínimo para exame).`
          : `Mesmo com ${fmt(max)} no que falta, a média máxima é ${fmt2(r.mediaMaxima)}.`];
      break;
    default:
      faixa = ["info", "ℹ️", "Sem avaliações", "Edite a fórmula para cadastrar avaliações."];
  }

  const metricas = el("div", { class: "metricas" },
    metrica("Média parcial", r.mediaParcial === null ? "—" : fmt2(r.mediaParcial), "só das avaliações já feitas"),
    metrica("Pontos garantidos", fmt2(r.pontosGarantidos), "na média final, se zerar o resto"),
    metrica("Média máxima possível", fmt2(r.mediaMaxima), `tirando ${fmt(max)} no que falta`),
    el("div", { class: "metrica" },
      el("div", { class: "metrica-rotulo" }, "Peso já avaliado"),
      el("div", { class: "metrica-valor" }, `${fmt(r.percentualAvaliado, 0)}%`),
      el("div", { class: "barra" }, el("span", { style: `width:${r.percentualAvaliado}%` }))
    )
  );

  const metas = el("div", { class: "metas" },
    meta("Aprovação direta (sem exame)", r.aprovacao, classeMeta(r.aprovacao, max),
      descricaoMeta(r.aprovacao, r, d.media_aprovacao)),
    meta("Evitar reprovação direta (ir ao exame)", r.evitarReprovacao, classeMeta(r.evitarReprovacao, max),
      descricaoMeta(r.evitarReprovacao, r, d.media_minima_exame)),
    r.exame && meta("Nota no exame final", r.exame, classeMeta(r.exame, max),
      `(média ${fmt2(r.mediaFinal)} + exame) ÷ 2 ≥ ${fmt(d.media_final_exame)}`)
  );

  area.replaceChildren(
    el("div", { class: `faixa faixa-${faixa[0]}` },
      el("span", { class: "faixa-icone", "aria-hidden": "true" }, faixa[1]),
      el("div", {}, el("h2", {}, faixa[2]), el("p", {}, faixa[3]))
    ),
    metricas,
    r.restantes > 0 || r.exame ? metas : null
  );

  // Placeholders nos campos vazios = nota mínima para aprovação direta
  for (const input of document.querySelectorAll(".entrada-nota")) {
    const ph = r.aprovacao?.status === "possivel" ? `mín. ${fmt2(r.aprovacao.nota)}`
      : r.aprovacao?.status === "garantido" ? "garantido" : "—";
    input.placeholder = ph;
  }

  renderTipos(d);
}

function descricaoMeta(m, r, alvo) {
  if (!m) return "";
  const qtd = `${r.restantes} ${r.restantes === 1 ? "avaliação restante" : "avaliações restantes"}`;
  if (r.restantes === 0) {
    return m.status === "garantido" ? `Média final ≥ ${fmt(alvo)}` : `Média final abaixo de ${fmt(alvo)}`;
  }
  if (m.status === "garantido") return `Já garantido: média ≥ ${fmt(alvo)} mesmo zerando o resto.`;
  if (m.status === "impossivel") return `Inalcançável: exigiria ${fmt2(m.nota)} em cada uma das ${qtd}.`;
  return `Média mínima nas ${qtd} para fechar com ${fmt(alvo)}.`;
}

function metrica(rotulo, valor, dica) {
  return el("div", { class: "metrica" },
    el("div", { class: "metrica-rotulo" }, rotulo),
    el("div", { class: "metrica-valor" }, valor),
    el("div", { class: "metrica-dica" }, dica)
  );
}

function meta(titulo, m, classe, texto) {
  return el("div", { class: `meta ${classe}` },
    el("div", { class: "meta-titulo" }, titulo),
    el("div", { class: "meta-valor" }, valorMeta(m)),
    el("p", { class: "meta-texto" }, texto)
  );
}

function renderTipos(d) {
  const area = $("#area-tipos");
  if (!area) return;
  const linhas = TIPOS.filter((t) => d.resumo.porTipo[t]?.qtd > 0).map((t) => {
    const pt = d.resumo.porTipo[t];
    const pct = pt.media === null ? 0 : (pt.media / d.nota_maxima) * 100;
    return el("div", { class: "tipo-linha" },
      el("span", {}, el("span", { class: `tipo tipo-${t}` }, TIPO_LABEL[t])),
      el("div", { class: "barra", title: `${fmt(pt.percentual, 1)}% da média` },
        el("span", { style: `width:${pct}%;background:var(--cor-${t})` })),
      el("span", { class: "num" }, `${pt.media === null ? "—" : fmt2(pt.media)} · ${fmt(pt.percentual, 0)}% da média`)
    );
  });
  area.replaceChildren(el("h3", {}, "Desempenho por tipo"), el("div", { class: "tipos" }, linhas));
}

// ---------- Excluir ----------
async function excluir(d) {
  if (!confirm(`Excluir "${d.nome}" e todas as notas dela? Essa ação não pode ser desfeita.`)) return;
  try {
    await api(`/api/disciplinas/${d.id}`, { method: "DELETE" });
    estado.disciplinas = estado.disciplinas.filter((x) => x.id !== d.id);
    estado.selecionadaId = estado.disciplinas[0]?.id ?? null;
    renderLista();
    renderDetalhe();
    toast("Disciplina excluída.");
  } catch (e) {
    toast(e.message);
  }
}

// ---------- Editor de disciplina (fórmula) ----------
const editor = $("#editor");
const form = $("#form-disciplina");
let editando = null;

const MODELO_PADRAO = [
  { nome: "Prova 1", tipo: "prova", peso: 35 },
  { nome: "Prova 2", tipo: "prova", peso: 35 },
  { nome: "Trabalho", tipo: "trabalho", peso: 20 },
  { nome: "Listas de exercícios", tipo: "lista", peso: 10 },
];

function abrirEditor(d) {
  editando = d;
  $("#editor-titulo").textContent = d ? `Editar ${d.nome}` : "Nova disciplina";
  form.nome.value = d?.nome ?? "";
  form.semestre.value = d?.semestre ?? (estado.disciplinas[0]?.semestre || semestreAtual());
  for (const c of ["nota_maxima", "media_aprovacao", "media_minima_exame", "media_final_exame"]) {
    form[c].value = d ? String(d[c]).replace(".", ",") : form[c].defaultValue;
  }
  const lista = $("#editor-avaliacoes");
  lista.replaceChildren();
  for (const a of d ? d.avaliacoes : MODELO_PADRAO) lista.append(linhaAvaliacao(a));
  $("#editor-erro").hidden = true;
  atualizarDistribuicao();
  editor.showModal();
  form.nome.focus();
}

function linhaAvaliacao(a = {}) {
  const sel = el("select", { "aria-label": "Tipo", name: "tipo" },
    TIPOS.map((t) => el("option", { value: t, selected: a.tipo === t }, t[0].toUpperCase() + t.slice(1))));
  return el("div", { class: "linha-avaliacao", dataset: { id: a.id ?? "" } },
    el("input", { class: "nome-av", name: "nome-av", value: a.nome ?? "", maxlength: "60", placeholder: "Nome", "aria-label": "Nome da avaliação" }),
    sel,
    el("input", { name: "peso", inputmode: "decimal", value: a.peso !== undefined ? String(a.peso).replace(".", ",") : "", placeholder: "Peso", "aria-label": "Peso" }),
    el("span", { class: "percentual" }, "—"),
    el("button", { type: "button", class: "btn-remover", "aria-label": "Remover avaliação", title: "Remover",
      onclick: (e) => { e.currentTarget.closest(".linha-avaliacao").remove(); atualizarDistribuicao(); } }, "×")
  );
}

function lerLinhas() {
  return [...document.querySelectorAll("#editor-avaliacoes .linha-avaliacao")].map((linha) => ({
    linha,
    id: linha.dataset.id ? Number(linha.dataset.id) : null,
    nome: $('[name="nome-av"]', linha).value.trim(),
    tipo: $('[name="tipo"]', linha).value,
    peso: lerNumero($('[name="peso"]', linha).value),
  }));
}

function atualizarDistribuicao() {
  const linhas = lerLinhas();
  const total = linhas.reduce((s, l) => s + (Number.isFinite(l.peso) && l.peso > 0 ? l.peso : 0), 0);
  const porTipo = {};
  for (const l of linhas) {
    const p = Number.isFinite(l.peso) && l.peso > 0 ? l.peso : 0;
    porTipo[l.tipo] = (porTipo[l.tipo] || 0) + p;
    $(".percentual", l.linha).textContent = total > 0 && p > 0 ? `${fmt((p / total) * 100, 1)}%` : "—";
  }
  const barra = $("#editor-distribuicao");
  barra.replaceChildren(...TIPOS.filter((t) => porTipo[t] > 0).map((t) =>
    el("span", { style: `width:${(porTipo[t] / total) * 100}%;background:var(--cor-${t})`, title: TIPO_LABEL[t] })));
  let legenda = barra.nextElementSibling;
  if (!legenda?.classList.contains("distribuicao-legenda")) {
    legenda = el("div", { class: "distribuicao-legenda" });
    barra.after(legenda);
  }
  legenda.replaceChildren(...TIPOS.filter((t) => porTipo[t] > 0).map((t) =>
    el("span", {}, el("span", { class: "ponto", style: `background:var(--cor-${t});margin-right:.3rem` }),
      `${TIPO_LABEL[t]} ${fmt((porTipo[t] / total) * 100, 1)}%`)));
}

function erroEditor(msg) {
  const p = $("#editor-erro");
  p.textContent = msg;
  p.hidden = false;
  p.scrollIntoView({ block: "nearest" });
}

function coletarFormulario() {
  const num = (campo, rotulo) => {
    const v = lerNumero(form[campo].value);
    if (v === null || !Number.isFinite(v)) throw new Error(`Preencha "${rotulo}" com um número.`);
    return v;
  };
  const dados = {
    nome: form.nome.value.trim(),
    semestre: form.semestre.value.trim(),
    nota_maxima: num("nota_maxima", "Nota máxima"),
    media_aprovacao: num("media_aprovacao", "Aprovação direta"),
    media_minima_exame: num("media_minima_exame", "Vai para exame"),
    media_final_exame: num("media_final_exame", "Média final pós-exame"),
  };
  if (dados.nome.length < 2) throw new Error("Informe o nome da disciplina.");
  if (dados.semestre.length < 4) throw new Error("Informe o semestre (ex.: 2026.2).");
  if (dados.media_aprovacao > dados.nota_maxima) throw new Error("A média de aprovação não pode passar da nota máxima.");
  if (dados.media_minima_exame > dados.media_aprovacao) throw new Error("A média para exame deve ser menor ou igual à de aprovação direta.");

  const linhas = lerLinhas();
  if (!linhas.length) throw new Error("Adicione pelo menos uma avaliação.");
  const notasAntigas = new Map((editando?.avaliacoes || []).map((a) => [a.id, a.nota]));
  dados.avaliacoes = linhas.map((l, i) => {
    if (!l.nome) throw new Error(`Dê um nome à avaliação ${i + 1}.`);
    if (!Number.isFinite(l.peso) || l.peso <= 0 || l.peso > 100) throw new Error(`O peso de "${l.nome}" deve ser maior que 0 e no máximo 100.`);
    const nota = l.id ? notasAntigas.get(l.id) ?? null : null;
    if (nota !== null && nota > dados.nota_maxima) throw new Error(`A nota já lançada em "${l.nome}" (${fmt(nota)}) passa da nova nota máxima.`);
    return { id: l.id, nome: l.nome, tipo: l.tipo, peso: l.peso, nota };
  });
  return dados;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  let dados;
  try {
    dados = coletarFormulario();
  } catch (err) {
    erroEditor(err.message);
    return;
  }
  const botao = $("#btn-salvar-disciplina");
  botao.disabled = true;
  try {
    const r = editando
      ? await api(`/api/disciplinas/${editando.id}`, { method: "PUT", body: dados })
      : await api("/api/disciplinas", { method: "POST", body: dados });
    const nova = r.disciplina;
    const i = estado.disciplinas.findIndex((x) => x.id === nova.id);
    if (i >= 0) estado.disciplinas[i] = nova;
    else estado.disciplinas.push(nova);
    ordenar();
    editor.close();
    renderLista();
    selecionar(nova.id);
    toast(editando ? "Fórmula atualizada." : "Disciplina cadastrada.");
  } catch (err) {
    erroEditor(err.message);
  } finally {
    botao.disabled = false;
  }
});

$("#editor-avaliacoes").addEventListener("input", atualizarDistribuicao);
$("#editor-avaliacoes").addEventListener("change", atualizarDistribuicao);
for (const b of document.querySelectorAll("[data-add]")) {
  b.addEventListener("click", () => {
    const tipo = b.dataset.add;
    const n = lerLinhas().filter((l) => l.tipo === tipo).length + 1;
    const nomes = { prova: `Prova ${n}`, trabalho: `Trabalho ${n}`, lista: `Lista ${n}` };
    const linha = linhaAvaliacao({ nome: nomes[tipo], tipo, peso: 10 });
    $("#editor-avaliacoes").append(linha);
    atualizarDistribuicao();
    $('[name="nome-av"]', linha).select();
  });
}
for (const b of document.querySelectorAll("[data-fechar]")) b.addEventListener("click", () => editor.close());

function ordenar() {
  estado.disciplinas.sort((a, b) =>
    b.semestre.localeCompare(a.semestre) || a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }));
}

// ---------- Inicialização ----------
const ERROS_LOGIN = {
  access_denied: "Você cancelou a autorização no Discord.",
  state_invalido: "A verificação de segurança do login falhou. Tente novamente.",
  servidor_nao_configurado: "O servidor ainda não está configurado para login com Discord.",
};

async function iniciar() {
  const params = new URLSearchParams(location.search);
  const erroLogin = params.get("erro_login");
  if (erroLogin) history.replaceState(null, "", location.pathname);

  try {
    const me = await api("/api/me");
    if (!me.usuario) {
      mostrarLogin(erroLogin ? ERROS_LOGIN[erroLogin] || `Falha no login (${erroLogin}).`
        : me.loginDisponivel ? null : "Login com Discord ainda não configurado no servidor.");
      return;
    }
    estado.usuario = me.usuario;
    mostrarApp();
    const r = await api("/api/disciplinas");
    estado.disciplinas = r.disciplinas;
    for (const d of estado.disciplinas) d.resumo = resumoDisciplina(d); // mesma regra do servidor
    ordenar();
    let salvo = null;
    try { salvo = Number(localStorage.getItem("disciplinaSelecionada")); } catch {}
    estado.selecionadaId = estado.disciplinas.some((d) => d.id === salvo) ? salvo : estado.disciplinas[0]?.id ?? null;
    renderLista();
    renderDetalhe();
  } catch (e) {
    mostrarLogin(`Não foi possível conectar ao servidor: ${e.message}`);
  }
}

$("#btn-nova").addEventListener("click", () => abrirEditor(null));
$("#btn-sair").addEventListener("click", async () => {
  try { await api("/api/auth/logout", { method: "POST" }); } catch {}
  estado.usuario = null;
  estado.disciplinas = [];
  mostrarLogin();
});
window.addEventListener("beforeunload", (e) => {
  if (estado.pendentes.size) e.preventDefault();
});

iniciar();
