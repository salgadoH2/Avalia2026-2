/**
 * Middleware de toda a /api (roda antes de cada rota).
 * 1. Defesa em profundidade contra CSRF: métodos que alteram dados vindos de outra origem
 *    (cabeçalho Origin diferente ou Sec-Fetch-Site: cross-site) são recusados com 403.
 *    A proteção principal continua sendo SameSite=Lax + exigência de application/json.
 * 2. Garante Cache-Control: no-store e nosniff em TODA resposta da API — inclusive
 *    redirecionamentos do OAuth e respostas geradas pela própria plataforma.
 * 3. Qualquer exceção não tratada vira JSON 500 em português (nunca a página de erro padrão).
 */
import { CABECALHOS_API, erro } from "../../lib/http.js";

const SEGUROS = new Set(["GET", "HEAD", "OPTIONS"]);

function origemCruzada(request) {
  if (SEGUROS.has(request.method)) return false;
  if (request.headers.get("Sec-Fetch-Site") === "cross-site") return true;
  const origin = request.headers.get("Origin");
  if (!origin) return false; // clientes fora do navegador (curl, testes) não enviam Origin
  return origin !== new URL(request.url).origin;
}

export async function onRequest({ request, next }) {
  let res;
  const head = request.method === "HEAD";
  try {
    res = origemCruzada(request)
      ? erro(403, "Requisição de outra origem recusada.")
      : await next();
  } catch (e) {
    console.error(e);
    res = erro(500, "Erro interno no servidor. Tente novamente em instantes.");
  }
  // Respostas podem ter cabeçalhos imutáveis; copia para poder ajustar.
  // HEAD = mesma resposta do GET, sem corpo (RFC 9110 §9.3.2). Cada rota GET exporta
  // `onRequestHead = onRequestGet`; aqui só removemos o corpo.
  const saida = new Response(head ? null : res.body, res);
  for (const [k, v] of Object.entries(CABECALHOS_API)) saida.headers.set(k, v);
  return saida;
}
