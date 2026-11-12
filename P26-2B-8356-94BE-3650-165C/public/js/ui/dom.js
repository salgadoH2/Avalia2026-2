/**
 * dom.js — utilitários de DOM sem innerHTML (todo texto entra por textContent/append).
 */

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/**
 * Cria um elemento: el("button", { class: "btn", onclick: fn }, "Texto", outroNo).
 * Strings viram nós de texto; "style" usa CSSOM (permitido pela CSP style-src 'self').
 */
export function el(tag, attrs = {}, ...filhos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") n.className = v;
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (k === "style") n.style.cssText = v;
    else if (k === "value") n.value = v;
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const f of filhos.flat(Infinity)) if (f !== null && f !== undefined && f !== false) n.append(f);
  return n;
}

/** Ícone SVG simples a partir de um path (sem innerHTML). */
export function icone(d, tamanho = 18) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", tamanho);
  svg.setAttribute("height", tamanho);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("icone");
  for (const parte of [].concat(d)) {
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", parte);
    svg.append(p);
  }
  return svg;
}

export const ICONES = {
  grade: ["M4 4h7v7H4z", "M13 4h7v7h-7z", "M4 13h7v7H4z", "M13 13h7v7h-7z"],
  frasco: ["M9 3h6", "M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3", "M7.5 15h9"],
  impressora: ["M6 9V3h12v6", "M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2", "M6 14h12v7H6z"],
  lapis: ["M4 20h4L19 9l-4-4L4 16z", "M13.5 6.5l4 4"],
  lixeira: ["M4 7h16", "M10 11v6", "M14 11v6", "M6 7l1 13h10l1-13", "M9 7V4h6v3"],
  baixar: ["M12 4v11", "M7 10l5 5 5-5", "M5 20h14"],
  sair: ["M15 4h4v16h-4", "M10 16l-4-4 4-4", "M6 12h11"],
  seta: ["M6 9l6 6 6-6"],
  mais: ["M12 5v14", "M5 12h14"],
  fechar: ["M6 6l12 12", "M18 6L6 18"],
  alerta: ["M12 3l10 18H2z", "M12 10v5", "M12 18v.01"],
  recarregar: ["M20 11a8 8 0 1 0-2.3 5.7", "M20 4v7h-7"],
};

const numero = (n, min, max) =>
  Number(n).toLocaleString("pt-BR", { minimumFractionDigits: min, maximumFractionDigits: max });

/** Até `casas` casas decimais (sem zeros à direita). */
export const fmt = (n, casas = 2) => (n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : numero(n, 0, casas));
/** Sempre 2 casas decimais. */
export const fmt2 = (n) => (n === null || n === undefined || Number.isNaN(Number(n)) ? "—" : numero(n, 2, 2));

/** "7,5" -> 7.5 · "" -> null · lixo -> NaN */
export function lerNumero(txt) {
  const s = String(txt ?? "").trim().replace(",", ".");
  if (s === "") return null;
  if (!/^-?\d*\.?\d+$/.test(s) && !/^-?\d+\.?$/.test(s)) return NaN;
  return Number(s);
}

/** Notificação curta (role="status" no HTML). tipo: "info" | "erro" | "ok". */
export function toast(msg, tipo = "info") {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.dataset.tipo = tipo;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), tipo === "erro" ? 5000 : 2800);
}

/** Mensagem para leitores de tela (região aria-live visualmente oculta). */
export function anunciar(msg) {
  const r = $("#anuncio");
  if (!r || r.textContent === msg) return;
  r.textContent = msg;
}

export const movimentoReduzido = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
export const telaEstreita = () => window.matchMedia("(max-width: 900px)").matches;
