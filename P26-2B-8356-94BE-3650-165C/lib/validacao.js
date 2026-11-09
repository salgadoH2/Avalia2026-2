/**
 * Regras de negócio e validação no servidor.
 * O cliente também valida, mas só o que passa por aqui é gravado no D1.
 */
import { HttpError } from "./http.js";
import { TIPOS } from "../public/js/calc.js";

export const LIMITE_DISCIPLINAS = 40;
export const LIMITE_AVALIACOES = 30;

function texto(v, campo, min, max) {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  if (s.length < min || s.length > max) {
    throw new HttpError(400, `"${campo}" deve ter entre ${min} e ${max} caracteres.`);
  }
  return s;
}

function numero(v, campo, { min, max, minExclusivo = false }) {
  let n = v;
  if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    n = /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN; // rejeita "", "0x10", "1e3"...
  }
  if (typeof n !== "number" || !Number.isFinite(n)) throw new HttpError(400, `"${campo}" deve ser um número.`);
  n = Math.round(n * 100) / 100; // arredonda ANTES de checar a faixa (0,001 vira 0 e é recusado com 400)
  if (minExclusivo ? n <= min : n < min) throw new HttpError(400, `"${campo}" deve ser ${minExclusivo ? "maior que" : "no mínimo"} ${min}.`);
  if (n > max) throw new HttpError(400, `"${campo}" deve ser no máximo ${max}.`);
  return n;
}

/** Valida uma nota (ou null = avaliação ainda não feita). */
export function validarNota(v, notaMaxima, campo = "nota") {
  if (v === null || v === undefined || v === "") return null;
  return numero(v, campo, { min: 0, max: notaMaxima });
}

/** Valida o cadastro completo de uma disciplina (regras + fórmula de avaliações). */
export function validarDisciplina(body) {
  if (!body || typeof body !== "object") throw new HttpError(400, "Corpo inválido.");

  const nota_maxima = numero(body.nota_maxima ?? 10, "Nota máxima", { min: 0, max: 1000, minExclusivo: true });
  const d = {
    nome: texto(body.nome, "Nome da disciplina", 2, 80),
    semestre: texto(body.semestre, "Semestre", 4, 20),
    nota_maxima,
    media_aprovacao: numero(body.media_aprovacao ?? 7, "Média para aprovação direta", { min: 0, max: nota_maxima, minExclusivo: true }),
    media_minima_exame: numero(body.media_minima_exame ?? 4, "Média mínima para exame", { min: 0, max: nota_maxima }),
    media_final_exame: numero(body.media_final_exame ?? 5, "Média final após exame", { min: 0, max: nota_maxima, minExclusivo: true }),
  };
  if (d.media_minima_exame > d.media_aprovacao) {
    throw new HttpError(400, "A média mínima para exame não pode ser maior que a média de aprovação direta.");
  }

  const lista = body.avaliacoes;
  if (!Array.isArray(lista) || lista.length < 1) throw new HttpError(400, "Cadastre ao menos uma avaliação.");
  if (lista.length > LIMITE_AVALIACOES) throw new HttpError(400, `Máximo de ${LIMITE_AVALIACOES} avaliações por disciplina.`);

  const idsVistos = new Set();
  d.avaliacoes = lista.map((a, i) => {
    const pos = `Avaliação ${i + 1}`;
    if (!a || typeof a !== "object") throw new HttpError(400, `${pos} inválida.`);
    if (!TIPOS.includes(a.tipo)) throw new HttpError(400, `${pos}: tipo deve ser prova, trabalho ou lista.`);
    let id = null;
    if (a.id !== undefined && a.id !== null) {
      id = Number(a.id);
      if (!Number.isInteger(id) || id <= 0 || idsVistos.has(id)) throw new HttpError(400, `${pos}: id inválido.`);
      idsVistos.add(id);
    }
    return {
      id,
      nome: texto(a.nome, `${pos} — nome`, 1, 60),
      tipo: a.tipo,
      peso: numero(a.peso, `${pos} — peso`, { min: 0, max: 100, minExclusivo: true }),
      nota: validarNota(a.nota, nota_maxima, `${pos} — nota`),
      ordem: i,
    };
  });
  return d;
}

export function validarId(v) {
  const id = Number(v);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, "Id inválido.");
  return id;
}
