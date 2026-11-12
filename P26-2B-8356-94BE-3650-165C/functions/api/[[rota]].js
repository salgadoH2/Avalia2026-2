/**
 * /api/* sem rota correspondente → 404 em JSON.
 * Sem isto, o Pages cairia no fallback de SPA e devolveria o index.html com 200,
 * confundindo clientes da API. Rotas específicas sempre têm prioridade sobre esta.
 */
import { erro } from "../../lib/http.js";

export function onRequest() {
  return erro(404, "Rota da API não encontrada.");
}
