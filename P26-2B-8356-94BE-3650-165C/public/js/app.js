/**
 * app.js — Interface em JavaScript puro (Vanilla JS, manipulação direta do DOM).
 * As médias são recalculadas no cliente a cada tecla; as notas são salvas no D1 em segundo plano.
 * Módulos de apoio em ./ui/ (DOM seguro, API, diálogos, menu da conta, visão geral do semestre).
 */
import { resumoDisciplina, simular, TIPOS, TIPO_LABEL } from "./calc.js";
import { $, $$, el, fmt, fmt2, lerNumero, toast, anunciar, icone, ICONES, telaEstreita, movimentoReduzido } from "./ui/dom.js";
import { api, definirAoExpirar } from "./ui/api.js";
import { abrirDialogo, confirmar } from "./ui/dialogos.js";
import { preencherConta, iniciarMenuConta } from "./ui/conta.js";
import { renderVisaoGeral, renderOnboarding, MODELO_PADRAO } from "./ui/semestre.js";
import { textoSituacao, TOM_SITUACAO, noRestante } from "./ui/situacao.js";

const TITULO_APP = "Simulador de Médias";

// ---------- Estado ----------
const estado = {
  usuario: null,
  disciplinas: [],
  carregado: false,
  selecionadaId: null, // null = visão geral do semestre
  semestreVisao: null,
  simulacao: null, // { disciplinaId, notas: { [avaliacaoId]: number|null } } — nunca é salvo
  pendentes: new Map(), // avaliacaoId -> { timer, enviar }
};

const disciplinaAtual = () => estado.disciplinas.find((d) => d.id === estado.selecionadaId) || null;
const notaTexto = (n) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
const temNota = (a) => a.nota !== null && a.nota !== undefined;

function semestreAtual() {
  const d = new Date();
  return `${d.getFullYear()}.${d.getMonth() < 6 ? 1 : 2}`;
}

let timerAnuncio;
function anunciarDepois(msg) {
  clearTimeout(timerAnuncio);
  timerAnuncio = setTimeout(() => anunciar(msg), 700);
}

// ---------- Telas ----------
const TELAS = ["tela-carregando", "tela-erro", "tela-login", "tela-app"];

function mostrarTela(id) {
  for (const t of TELAS) $(`#${t}`).hidden = t !== id;
  $("#perfil").hidden = id !== "tela-app";
  $("#pular").hidden = id !== "tela-app";
}

function limparEstado() {
  for (const p of estado.pendentes.values()) clearTimeout(p.timer);
  estado.pendentes.clear();
  Object.assign(estado, { usuario: null, disciplinas: [], carregado: false, selecionadaId: null, semestreVisao: null, simulacao: null });
  $("#lista-disciplinas").replaceChildren();
  $("#detalhe").replaceChildren();
}

function mostrarLogin(aviso, tipo = "erro") {
  limparEstado();
  mostrarTela("tela-login");
  if (location.hash) history.replaceState(null, "", location.pathname);
  document.title = `Entrar · ${TITULO_APP}`;
  const p = $("#login-aviso");
  p.hidden = !aviso;
  p.className = `aviso aviso-${tipo}`;
  p.textContent = aviso || "";
  if (aviso) $("#login-titulo").focus();
}

function mostrarErro(msg, tentar) {
  mostrarTela("tela-erro");
  document.title = `Erro · ${TITULO_APP}`;
  $("#erro-mensagem").textContent = msg;
  $("#btn-tentar").onclick = tentar;
  $("#erro-titulo").focus();
}

// ---------- Rotas (#/visao-geral e #/disciplina/:id) ----------
function lerRota() {
  const m = /^#\/disciplina\/(\d+)$/.exec(location.hash);
  return m ? Number(m[1]) : null;
}

function irPara(id) {
  const alvo = id === null ? "#/visao-geral" : `#/disciplina/${id}`;
  if (location.hash === alvo) aplicarRota(true);
  else location.hash = alvo; // dispara hashchange -> aplicarRota(true)
}

function aplicarRota(focar) {
  if (!estado.carregado) return;
  let id = lerRota();
  if (id !== null && !estado.disciplinas.some((d) => d.id === id)) {
    id = null;
    history.replaceState(null, "", "#/visao-geral");
  }
  if (estado.simulacao && estado.simulacao.disciplinaId !== id) {
    estado.simulacao = null;
    toast("Simulação descartada.");
  }
  estado.selecionadaId = id;
  const d = disciplinaAtual();
  if (d) estado.semestreVisao = d.semestre;
  marcarItemAtual();
  renderDetalhe();
  if (focar) focarTitulo();
}

window.addEventListener("hashchange", () => {
  if (location.hash.startsWith("#/")) aplicarRota(true);
});

function focarTitulo() {
  const titulo = $("#titulo-pagina");
  if (!titulo) return;
  titulo.focus({ preventScroll: true });
  const topo = $("#detalhe").getBoundingClientRect().top;
  if (topo < 0 || topo > window.innerHeight * 0.5 || telaEstreita()) {
    $("#detalhe").scrollIntoView({ block: "start", behavior: movimentoReduzido() ? "auto" : "smooth" });
  }
}

// ---------- Lista lateral ----------
function renderLista() {
  const nav = $("#lista-disciplinas");
  const filhos = [
    el("a", { class: "item-disciplina item-visao", href: "#/visao-geral", dataset: { id: "visao" } },
      el("span", { class: "item-nome" }, icone(ICONES.grade, 16), estado.disciplinas.length ? "Visão geral" : "Primeiros passos")),
  ];
  if (!estado.disciplinas.length) {
    filhos.push(el("p", { class: "vazio-lista" }, "Nenhuma disciplina ainda."));
  }
  const semestres = [...new Set(estado.disciplinas.map((d) => d.semestre))];
  semestres.forEach((s, i) => {
    const idGrupo = `grupo-semestre-${i}`; // id seguro: o texto do semestre pode ter espaços
    filhos.push(
      el("h3", { class: "grupo-semestre", id: idGrupo }, `Semestre ${s}`),
      el("ul", { class: "lista-itens", "aria-labelledby": idGrupo },
        estado.disciplinas.filter((d) => d.semestre === s).map((d) => el("li", {}, itemLista(d))))
    );
  });
  nav.replaceChildren(...filhos);
  marcarItemAtual();
}

function itemLista(d) {
  const r = d.resumo;
  const media = r.mediaFinal ?? r.mediaParcial;
  return el("a", { class: "item-disciplina", href: `#/disciplina/${d.id}`, dataset: { id: d.id },
      "aria-current": d.id === estado.selecionadaId ? "page" : null },
    el("span", { class: "item-nome" }, d.nome),
    el("span", { class: "item-media" },
      media === null ? "—" : fmt2(media),
      el("span", { class: `ponto ponto-${TOM_SITUACAO[r.situacao] || "neutro"}`, title: textoSituacao(r.situacao), "aria-hidden": "true" }),
      el("span", { class: "sr-only" }, `, ${textoSituacao(r.situacao)}`)
    )
  );
}

function marcarItemAtual() {
  for (const a of $$("#lista-disciplinas .item-disciplina")) {
    const atual = a.dataset.id === "visao" ? estado.selecionadaId === null : Number(a.dataset.id) === estado.selecionadaId;
    if (atual) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

function atualizarItemLista(d) {
  const antigo = $(`.item-disciplina[data-id="${d.id}"]`);
  if (antigo) antigo.replaceWith(itemLista(d));
}

// ---------- Carregamento ----------
function renderEsqueleto() {
  const linha = () => el("div", { class: "esqueleto esqueleto-linha", "aria-hidden": "true" });
  $("#lista-disciplinas").replaceChildren(linha(), linha(), linha(), linha());
  const det = $("#detalhe");
  det.setAttribute("aria-busy", "true");
  det.replaceChildren(
    el("p", { class: "sr-only", role: "status" }, "Carregando suas disciplinas…"),
    el("div", { class: "cartao esqueleto esqueleto-topo", "aria-hidden": "true" }),
    el("div", { class: "contadores", "aria-hidden": "true" },
      [1, 2, 3, 4].map(() => el("div", { class: "contador esqueleto esqueleto-bloco" }))),
    el("div", { class: "cartao esqueleto esqueleto-grande", "aria-hidden": "true" })
  );
}

function renderErroCarregamento(msg) {
  $("#lista-disciplinas").replaceChildren(el("p", { class: "vazio-lista" }, "Lista indisponível."));
  const det = $("#detalhe");
  det.removeAttribute("aria-busy");
  const botao = el("button", { type: "button", class: "btn btn-primario", onclick: carregarDisciplinas },
    icone(ICONES.recarregar, 18), "Tentar novamente");
  det.replaceChildren(
    el("section", { class: "cartao estado-erro", role: "alert" },
      el("span", { class: "estado-erro-icone", "aria-hidden": "true" }, icone(ICONES.alerta, 28)),
      el("h1", { id: "titulo-pagina", tabindex: "-1" }, "Não foi possível carregar suas disciplinas"),
      el("p", {}, msg),
      botao
    )
  );
  document.title = `Erro · ${TITULO_APP}`;
  botao.focus();
}

async function carregarDisciplinas() {
  estado.carregado = false;
  renderEsqueleto();
  try {
    const r = await api("/api/disciplinas");
    estado.disciplinas = r.disciplinas;
    for (const d of estado.disciplinas) d.resumo = resumoDisciplina(d); // mesma regra do servidor
    ordenar();
    estado.carregado = true;
    $("#detalhe").removeAttribute("aria-busy");
    renderLista();
    aplicarRota(false);
  } catch (e) {
    if (e.status !== 401) renderErroCarregamento(e.message);
  }
}

// ---------- Painel principal ----------
function renderDetalhe() {
  const area = $("#detalhe");
  const d = disciplinaAtual();
  const sim = d && estado.simulacao?.disciplinaId === d.id ? estado.simulacao : null;
  area.classList.toggle("modo-simulacao", Boolean(sim));

  if (!d) {
    if (!estado.disciplinas.length) {
      renderOnboarding(area, {
        usuario: estado.usuario,
        aoUsarModelo: () => abrirEditor(null, MODELO_PADRAO),
        aoComecarVazio: () => abrirEditor(null, [{ nome: "", tipo: "prova", peso: undefined }]),
      });
      document.title = `Primeiros passos · ${TITULO_APP}`;
      return;
    }
    const semestres = new Set(estado.disciplinas.map((x) => x.semestre));
    if (!semestres.has(estado.semestreVisao)) estado.semestreVisao = estado.disciplinas[0].semestre;
    renderVisaoGeral(area, {
      disciplinas: estado.disciplinas,
      semestre: estado.semestreVisao,
      aoTrocarSemestre: (s) => {
        estado.semestreVisao = s;
        renderDetalhe();
        $("#seletor-semestre")?.focus();
      },
      aoAbrir: (id) => irPara(id),
      aoNova: () => abrirEditor(null),
    });
    document.title = `Visão geral ${estado.semestreVisao} · ${TITULO_APP}`;
    return;
  }

  const resumo = sim ? simular(d, sim.notas) : d.resumo;
  area.replaceChildren(...[
    el("p", { class: "so-impressao cabecalho-boletim" },
      el("strong", {}, "Boletim da disciplina"),
      ` · ${estado.usuario?.username ?? ""} (ID Discord ${estado.usuario?.user_id ?? ""}) · emitido em `,
      el("span", { class: "data-emissao" }, new Date().toLocaleString("pt-BR"))),
    cartaoTopo(d, sim),
    sim ? faixaSimulacao(d) : null,
    el("div", { id: "area-resumo", class: "area-resumo" }),
    tabelaNotas(d, sim),
    el("div", { id: "area-tipos", class: "cartao" })
  ].filter(Boolean));
  atualizarResumo(d, resumo);
  document.title = `${sim ? "Simulação · " : ""}${d.nome} · ${TITULO_APP}`;
}

function cartaoTopo(d, sim) {
  const semRestantes = d.resumo.restantes === 0;
  return el("div", { class: "cartao" },
    el("div", { class: "detalhe-topo" },
      el("div", { class: "detalhe-titulo" },
        el("a", { class: "voltar", href: "#/visao-geral" }, "← Visão geral"),
        el("h1", { id: "titulo-pagina", tabindex: "-1" }, d.nome),
        el("ul", { class: "regras", "aria-label": "Regras da disciplina" },
          el("li", { class: "chip" }, `Semestre ${d.semestre}`),
          el("li", { class: "chip" }, `Nota máx. ${fmt(d.nota_maxima)}`),
          el("li", { class: "chip" }, `Aprovação direta ≥ ${fmt(d.media_aprovacao)}`),
          el("li", { class: "chip" }, `Exame se ≥ ${fmt(d.media_minima_exame)}`),
          el("li", { class: "chip" }, `Pós-exame ≥ ${fmt(d.media_final_exame)}`)
        )
      ),
      el("div", { class: "acoes" },
        el("button", {
          id: "btn-simular", type: "button",
          class: `btn btn-pequeno ${sim ? "btn-simulacao-ativo" : "btn-simulacao"}`,
          "aria-pressed": sim ? "true" : "false",
          disabled: semRestantes && !sim,
          title: semRestantes ? "Todas as avaliações já têm nota" : "Testar notas hipotéticas sem salvar",
          onclick: () => (sim ? sairSimulacao() : entrarSimulacao(d)),
        }, icone(ICONES.frasco, 16), "E se…?"),
        el("button", { type: "button", class: "btn btn-secundario btn-pequeno", onclick: () => window.print() },
          icone(ICONES.impressora, 16), "Imprimir"),
        sim ? null : el("button", { type: "button", class: "btn btn-secundario btn-pequeno", onclick: () => abrirEditor(d) },
          icone(ICONES.lapis, 16), "Editar fórmula"),
        sim ? null : el("button", { type: "button", class: "btn btn-perigo btn-pequeno", onclick: () => excluir(d) },
          icone(ICONES.lixeira, 16), "Excluir")
      )
    )
  );
}

// ---------- Modo simulação ("E se…?") ----------
function faixaSimulacao(d) {
  return el("section", { class: "faixa-simulacao", "aria-labelledby": "titulo-simulacao" },
    el("div", { class: "fs-texto" },
      el("h2", { id: "titulo-simulacao" }, "Simulação — não salvo"),
      el("p", {}, "Digite notas hipotéticas nas avaliações sem nota. Nada é enviado ao servidor; suas notas reais continuam como estão.")
    ),
    el("div", { class: "fs-acoes" },
      el("button", { id: "btn-preencher", type: "button", class: "btn btn-secundario btn-pequeno", onclick: () => preencherMinima(d) }, "Preencher com a mínima"),
      el("button", { id: "btn-limpar-sim", type: "button", class: "btn btn-secundario btn-pequeno", onclick: () => limparSimulacao() }, "Limpar"),
      el("button", { type: "button", class: "btn btn-pequeno btn-sair-sim", onclick: () => sairSimulacao() }, icone(ICONES.fechar, 16), "Sair e descartar")
    )
  );
}

/** Mantém o botão "E se…?" coerente com as notas enquanto o aluno digita (sem redesenhar a tela). */
function atualizarBotaoSimular(d) {
  const b = $("#btn-simular");
  if (!b || estado.simulacao) return;
  const semRestantes = d.resumo.restantes === 0;
  b.disabled = semRestantes;
  b.title = semRestantes ? "Todas as avaliações já têm nota" : "Testar notas hipotéticas sem salvar";
}

function entrarSimulacao(d) {
  if (d.resumo.restantes === 0) return;
  estado.simulacao = { disciplinaId: d.id, notas: {} };
  renderDetalhe();
  anunciar("Modo simulação ativado. As notas digitadas não serão salvas.");
  $("#detalhe .entrada-nota")?.focus();
}

function sairSimulacao() {
  estado.simulacao = null;
  renderDetalhe();
  anunciar("Simulação encerrada. As notas hipotéticas foram descartadas.");
  const b = $("#btn-simular");
  (b && !b.disabled ? b : $("#titulo-pagina"))?.focus();
}

function limparSimulacao() {
  if (!estado.simulacao) return;
  estado.simulacao.notas = {};
  renderDetalhe();
  $("#detalhe .entrada-nota")?.focus();
}

function preencherMinima(d) {
  const r = d.resumo.aprovacao;
  if (!r || r.status === "garantido") {
    toast("A aprovação direta já está garantida — qualquer nota serve.");
    return;
  }
  const nota = r.status === "possivel" ? r.nota : Number(d.nota_maxima);
  if (r.status === "impossivel") toast("Aprovação direta é impossível; simulando nota máxima no que falta.");
  const notas = {};
  for (const a of d.avaliacoes) if (!temNota(a)) notas[a.id] = nota;
  estado.simulacao.notas = notas;
  renderDetalhe();
  $("#btn-preencher")?.focus();
}

function aoDigitarSimulada(d, a, input, status) {
  const v = lerNumero(input.value);
  const valido = v === null || (Number.isFinite(v) && v >= 0 && v <= d.nota_maxima);
  input.classList.toggle("invalida", !valido);
  input.setAttribute("aria-invalid", valido ? "false" : "true");
  if (!valido) {
    status.textContent = `0 a ${fmt(d.nota_maxima)}`;
    status.classList.add("erro-salvar");
    return;
  }
  status.classList.remove("erro-salvar");
  const notas = estado.simulacao.notas;
  if (v === null) delete notas[a.id];
  else notas[a.id] = Math.round(v * 100) / 100;
  status.textContent = v === null ? "" : "simulada";
  atualizarResumo(d, simular(d, notas));
}

// ---------- Tabela de notas ----------
function tabelaNotas(d, sim) {
  const tbody = el("tbody");
  const pesoTotal = d.avaliacoes.reduce((s, a) => s + Number(a.peso), 0) || 1;
  for (const a of d.avaliacoes) {
    const status = el("span", { class: "estado-salvo", "aria-live": sim ? null : "polite" });
    let celulaNota;
    if (sim && temNota(a)) {
      celulaNota = el("span", { class: "nota-fixa", title: "Nota lançada (não muda na simulação)" }, fmt2(a.nota));
      status.textContent = "lançada";
    } else {
      const input = el("input", {
        class: `entrada-nota${sim ? " simulada" : ""}`,
        type: "text",
        inputmode: "decimal",
        autocomplete: "off",
        value: sim ? notaTexto(sim.notas[a.id]) : notaTexto(a.nota),
        "aria-label": sim ? `Nota hipotética de ${a.nome}` : `Nota de ${a.nome}`,
        dataset: { avaliacao: a.id },
      });
      if (sim) {
        if (sim.notas[a.id] !== undefined) status.textContent = "simulada";
        input.addEventListener("input", () => aoDigitarSimulada(d, a, input, status));
      } else {
        input.addEventListener("input", () => aoDigitarNota(d, a, input, status));
        input.addEventListener("blur", () => salvarAgora(a, input));
      }
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          const todos = $$("#detalhe .entrada-nota");
          (todos[todos.indexOf(input) + 1] || input).focus();
        }
      });
      celulaNota = input;
    }
    tbody.append(el("tr", {},
      el("th", { scope: "row", class: "col-nome" },
        el("span", { class: `marcador-tipo ponto`, style: `background:var(--cor-${a.tipo})`, "aria-hidden": "true" }),
        a.nome),
      el("td", { class: "col-tipo" }, el("span", { class: `tipo tipo-${a.tipo}` }, a.tipo)),
      el("td", { class: "num col-peso" }, `${fmt(a.peso)} (${fmt((a.peso / pesoTotal) * 100, 1)}%)`),
      el("td", { class: "num" }, celulaNota),
      el("td", { class: "col-status" }, status)
    ));
  }
  return el("section", { class: "cartao", "aria-labelledby": "titulo-notas" },
    el("h2", { id: "titulo-notas", class: "titulo-secao" }, sim ? "Notas (simulação)" : "Notas obtidas"),
    el("div", { class: "rolagem-tabela" },
      el("table", { class: "tabela-notas" },
        el("caption", { class: "sr-only" }, `Avaliações de ${d.nome}`),
        el("thead", {}, el("tr", {},
          el("th", { scope: "col" }, "Avaliação"), el("th", { scope: "col", class: "col-tipo" }, "Tipo"),
          el("th", { scope: "col", class: "num col-peso" }, "Peso"),
          el("th", { scope: "col", class: "num" }, "Nota"), el("th", { scope: "col", class: "col-status" }, el("span", { class: "sr-only" }, "Situação do salvamento"))
        )),
        tbody
      )
    ),
    el("p", { class: "legenda" }, sim
      ? "As notas lançadas ficam fixas. Nos campos vazios aparece a nota mínima que ainda falta para a aprovação direta."
      : "Deixe em branco o que ainda não foi feito. Nos campos vazios aparece a nota mínima para aprovação direta. Use vírgula ou ponto: 7,5. Enter vai para a próxima nota.")
  );
}

function aoDigitarNota(d, a, input, status) {
  const v = lerNumero(input.value);
  const valido = v === null || (Number.isFinite(v) && v >= 0 && v <= d.nota_maxima);
  input.classList.toggle("invalida", !valido);
  input.setAttribute("aria-invalid", valido ? "false" : "true");
  if (!valido) {
    status.textContent = `0 a ${fmt(d.nota_maxima)}`;
    status.classList.add("erro-salvar");
    const p = estado.pendentes.get(a.id);
    if (p) { clearTimeout(p.timer); estado.pendentes.delete(a.id); }
    return;
  }
  a.nota = v === null ? null : Math.round(v * 100) / 100;
  d.resumo = resumoDisciplina(d); // cálculo instantâneo no cliente
  atualizarResumo(d, d.resumo);
  atualizarItemLista(d);
  atualizarBotaoSimular(d);

  status.classList.remove("erro-salvar");
  status.removeAttribute("title");
  status.textContent = "…";
  const anterior = estado.pendentes.get(a.id);
  if (anterior) clearTimeout(anterior.timer);
  const enviar = () => enviarNota(d, a, status);
  estado.pendentes.set(a.id, { timer: setTimeout(enviar, 700), enviar });
}

function salvarAgora(a, input) {
  const p = estado.pendentes.get(a.id);
  if (!p || input.classList.contains("invalida")) return;
  clearTimeout(p.timer);
  p.enviar();
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
    if (e.status !== 401) toast(`Não foi possível salvar a nota: ${e.message}`, "erro");
  }
}

async function salvarPendentes() {
  const lista = [...estado.pendentes.values()];
  lista.forEach((p) => clearTimeout(p.timer));
  await Promise.allSettled(lista.map((p) => p.enviar()));
}

// ---------- Resumo (faixa, métricas e metas) ----------
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

function textoFaixa(d, r) {
  const max = d.nota_maxima;
  const nasRestantes = noRestante(r.restantes);
  switch (r.situacao) {
    case "aprovado":
      return ["ok", "🎉", r.mediaFinal !== null ? "Aprovação direta!" : "Aprovação direta garantida",
        r.mediaFinal !== null
          ? `Média final ${fmt2(r.mediaFinal)} — mínimo para aprovação direta: ${fmt(d.media_aprovacao)}.`
          : `Mesmo tirando zero ${nasRestantes}, sua média fica em pelo menos ${fmt2(r.pontosGarantidos)}.`];
    case "em_andamento":
      return ["info", "🎯", `Precisa de ${fmt2(r.aprovacao.nota)} de média no que falta`,
        `Tirando pelo menos ${fmt2(r.aprovacao.nota)} ${nasRestantes} você passa direto, sem exame. ` +
        (r.evitarReprovacao.status === "garantido"
          ? "Reprovação direta já está descartada."
          : `Abaixo de ${fmt2(r.evitarReprovacao.nota)} você reprova sem direito a exame.`)];
    case "exame_inevitavel":
      return ["alerta", "⚠️", "Aprovação direta não é mais possível",
        `Mesmo tirando ${fmt(max)} em tudo, a média máxima é ${fmt2(r.mediaMaxima)}. ` +
        (r.evitarReprovacao.status === "garantido"
          ? "O exame final já está garantido."
          : `Tire pelo menos ${fmt2(r.evitarReprovacao.nota)} ${nasRestantes} para ter direito ao exame.`)];
    case "exame":
      return ["alerta", "📝", "Exame final",
        r.exame.status === "impossivel"
          ? `Média ${fmt2(r.mediaFinal)}: seria preciso ${fmt2(r.exame.nota)} no exame, acima da nota máxima.`
          : `Média ${fmt2(r.mediaFinal)}. Você precisa de ${fmt2(r.exame.nota)} no exame para chegar a ${fmt(d.media_final_exame)}.`];
    case "reprovado":
      return ["perigo", "✗", "Reprovação direta",
        r.mediaFinal !== null
          ? `Média final ${fmt2(r.mediaFinal)}, abaixo de ${fmt(d.media_minima_exame)} (mínimo para exame).`
          : `Mesmo com ${fmt(max)} no que falta, a média máxima é ${fmt2(r.mediaMaxima)}.`];
    default:
      return ["info", "ℹ️", "Sem avaliações", "Edite a fórmula para cadastrar avaliações."];
  }
}

function atualizarResumo(d, r) {
  const area = $("#area-resumo");
  if (!area) return;
  const sim = estado.simulacao?.disciplinaId === d.id;
  const max = d.nota_maxima;
  const [tom, emoji, titulo, texto] = textoFaixa(d, r);

  const metricas = el("div", { class: "metricas" },
    metrica("Média parcial", r.mediaParcial === null ? "—" : fmt2(r.mediaParcial), "só das avaliações já feitas"),
    metrica("Pontos garantidos", fmt2(r.pontosGarantidos), "na média final, se zerar o resto"),
    metrica("Média máxima possível", fmt2(r.mediaMaxima), `tirando ${fmt(max)} no que falta`),
    el("div", { class: "metrica" },
      el("div", { class: "metrica-rotulo" }, "Peso já avaliado"),
      el("div", { class: "metrica-valor" }, `${fmt(r.percentualAvaliado, 0)}%`),
      el("div", { class: "barra", "aria-hidden": "true" }, el("span", { style: `width:${r.percentualAvaliado}%` }))
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

  area.replaceChildren(...[
    sim ? el("p", { class: "rotulo-sim" }, icone(ICONES.frasco, 14), "Resultado simulado") : null,
    el("div", { class: `faixa faixa-${tom}` },
      el("span", { class: "faixa-icone", "aria-hidden": "true" }, emoji),
      el("div", {}, el("h2", {}, titulo), el("p", {}, texto))
    ),
    metricas,
    r.restantes > 0 || r.exame ? metas : null
  ].filter(Boolean));
  anunciarDepois(`${sim ? "Simulação: " : ""}${titulo}. ${texto}`);

  // Placeholders nos campos vazios = nota mínima para aprovação direta
  const ph = r.aprovacao?.status === "possivel" ? `mín. ${fmt2(r.aprovacao.nota)}`
    : r.aprovacao?.status === "garantido" ? "garantido" : "—";
  for (const input of $$("#detalhe .entrada-nota")) input.placeholder = ph;

  renderTipos(d, r);
}

function descricaoMeta(m, r, alvo) {
  if (!m) return "";
  const nasRestantes = noRestante(r.restantes);
  if (r.restantes === 0) {
    return m.status === "garantido" ? `Média final ≥ ${fmt(alvo)}` : `Média final abaixo de ${fmt(alvo)}`;
  }
  if (m.status === "garantido") return `Já garantido: média ≥ ${fmt(alvo)} mesmo zerando o resto.`;
  if (m.status === "impossivel") return `Inalcançável: exigiria ${fmt2(m.nota)} ${r.restantes === 1 ? "na avaliação restante" : `em cada uma das ${r.restantes} avaliações restantes`}.`;
  return `Média mínima ${nasRestantes} para fechar com ${fmt(alvo)}.`;
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

function renderTipos(d, r) {
  const area = $("#area-tipos");
  if (!area) return;
  const linhas = TIPOS.filter((t) => r.porTipo[t]?.qtd > 0).map((t) => {
    const pt = r.porTipo[t];
    const pct = pt.media === null ? 0 : (pt.media / d.nota_maxima) * 100;
    return el("div", { class: "tipo-linha" },
      el("span", {}, el("span", { class: `tipo tipo-${t}` }, TIPO_LABEL[t])),
      el("div", { class: "barra", role: "img", "aria-label": `${TIPO_LABEL[t]}: média ${pt.media === null ? "sem notas" : fmt2(pt.media)}` },
        el("span", { style: `width:${pct}%;background:var(--cor-${t})` })),
      el("span", { class: "num" }, `${pt.media === null ? "—" : fmt2(pt.media)} · ${fmt(pt.percentual, 0)}% da média`)
    );
  });
  area.replaceChildren(el("h2", { class: "titulo-secao" }, "Desempenho por tipo"), el("div", { class: "tipos" }, linhas));
}

// ---------- Excluir disciplina ----------
async function excluir(d) {
  const ok = await confirmar({
    titulo: "Excluir disciplina",
    mensagem: [`Excluir “${d.nome}” e todas as notas dela? Essa ação não pode ser desfeita.`],
    rotulo: "Excluir disciplina",
    acao: () => api(`/api/disciplinas/${d.id}`, { method: "DELETE" }),
  });
  if (!ok) return;
  estado.disciplinas = estado.disciplinas.filter((x) => x.id !== d.id);
  renderLista();
  irPara(null);
  toast("Disciplina excluída.", "ok");
}

// ---------- Editor de disciplina (fórmula) ----------
const editor = $("#editor");
const form = $("#form-disciplina");
let editando = null;

function abrirEditor(d, modelo = MODELO_PADRAO) {
  editando = d;
  $("#editor-titulo").textContent = d ? `Editar ${d.nome}` : "Nova disciplina";
  form.nome.value = d?.nome ?? "";
  form.semestre.value = d?.semestre ?? (estado.semestreVisao || estado.disciplinas[0]?.semestre || semestreAtual());
  for (const c of ["nota_maxima", "media_aprovacao", "media_minima_exame", "media_final_exame"]) {
    form[c].value = d ? notaTexto(d[c]) : form[c].defaultValue;
  }
  const lista = $("#editor-avaliacoes");
  lista.replaceChildren();
  for (const a of d ? d.avaliacoes : modelo) lista.append(linhaAvaliacao(a));
  $("#editor-erro").hidden = true;
  atualizarDistribuicao();
  abrirDialogo(editor, form.nome);
}

function linhaAvaliacao(a = {}) {
  const sel = el("select", { "aria-label": "Tipo", name: "tipo" },
    TIPOS.map((t) => el("option", { value: t, selected: a.tipo === t }, t[0].toUpperCase() + t.slice(1))));
  return el("div", { class: "linha-avaliacao", dataset: { id: a.id ?? "" } },
    el("input", { class: "nome-av", name: "nome-av", value: a.nome ?? "", maxlength: "60", placeholder: "Nome", "aria-label": "Nome da avaliação", autocomplete: "off" }),
    sel,
    el("input", { name: "peso", inputmode: "decimal", value: a.peso !== undefined ? notaTexto(a.peso) : "", placeholder: "Peso", "aria-label": "Peso", autocomplete: "off" }),
    el("span", { class: "percentual" }, "—"),
    el("button", { type: "button", class: "btn-remover", "aria-label": "Remover avaliação", title: "Remover",
      onclick: (e) => {
        const linha = e.currentTarget.closest(".linha-avaliacao");
        const vizinha = linha.nextElementSibling || linha.previousElementSibling;
        linha.remove();
        atualizarDistribuicao();
        ($(".btn-remover", vizinha || document.createElement("div")) || $("[data-add]")).focus();
      } }, "×")
  );
}

function lerLinhas() {
  return $$("#editor-avaliacoes .linha-avaliacao").map((linha) => ({
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
    el("span", {}, el("span", { class: "ponto", style: `background:var(--cor-${t})` }),
      ` ${TIPO_LABEL[t]} ${fmt((porTipo[t] / total) * 100, 1)}%`)));
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
  botao.textContent = "Salvando…";
  try {
    const r = editando
      ? await api(`/api/disciplinas/${editando.id}`, { method: "PUT", body: dados })
      : await api("/api/disciplinas", { method: "POST", body: dados });
    const nova = r.disciplina;
    nova.resumo = resumoDisciplina(nova);
    const i = estado.disciplinas.findIndex((x) => x.id === nova.id);
    if (i >= 0) estado.disciplinas[i] = nova;
    else estado.disciplinas.push(nova);
    ordenar();
    editor.close();
    renderLista();
    irPara(nova.id);
    toast(editando ? "Fórmula atualizada." : "Disciplina cadastrada.", "ok");
  } catch (err) {
    erroEditor(err.message);
  } finally {
    botao.disabled = false;
    botao.textContent = "Salvar";
  }
});

$("#editor-avaliacoes").addEventListener("input", atualizarDistribuicao);
$("#editor-avaliacoes").addEventListener("change", atualizarDistribuicao);
for (const b of $$("[data-add]")) {
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
for (const b of $$("[data-fechar]")) b.addEventListener("click", () => editor.close());

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
  mostrarTela("tela-carregando");
  document.title = TITULO_APP;
  const params = new URLSearchParams(location.search);
  const erroLogin = params.get("erro_login");
  if (erroLogin) history.replaceState(null, "", location.pathname + location.hash);

  let me;
  try {
    me = await api("/api/me", { ignorar401: true });
  } catch (e) {
    mostrarErro(`Não foi possível conectar ao servidor: ${e.message}`, iniciar);
    return;
  }
  if (!me.usuario) {
    mostrarLogin(erroLogin ? ERROS_LOGIN[erroLogin] || `Falha no login (${erroLogin}).`
      : me.loginDisponivel ? null : "Login com Discord ainda não configurado no servidor.");
    return;
  }
  estado.usuario = me.usuario;
  preencherConta(me.usuario);
  mostrarTela("tela-app");
  await carregarDisciplinas();
}

definirAoExpirar((msg) => mostrarLogin(msg));

iniciarMenuConta({
  aoSair: async () => {
    await salvarPendentes();
    try { await api("/api/auth/logout", { method: "POST", ignorar401: true }); } catch {}
    mostrarLogin("Você saiu da sua conta.", "ok");
  },
  aoContaExcluida: () => mostrarLogin("Sua conta e todos os seus dados foram excluídos.", "ok"),
});

$("#btn-nova").addEventListener("click", () => abrirEditor(null));
$("#pular").addEventListener("click", (e) => {
  e.preventDefault();
  const alvo = $("#titulo-pagina") || $("#detalhe");
  alvo.focus({ preventScroll: true });
  alvo.scrollIntoView({ block: "start" });
});
window.addEventListener("beforeunload", (e) => {
  if (estado.pendentes.size) e.preventDefault();
});
// O boletim impresso leva a data/hora do momento da impressão.
window.addEventListener("beforeprint", () => {
  for (const s of $$(".data-emissao")) s.textContent = new Date().toLocaleString("pt-BR");
});

iniciar();
