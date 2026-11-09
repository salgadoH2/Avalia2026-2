/** Utilitários HTTP compartilhados pelas Pages Functions. */

export const CHAVE = "P26-2B-8356-94BE-3650-165C";

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

export function erro(status, mensagem, detalhes) {
  return json({ ok: false, erro: mensagem, ...(detalhes ? { detalhes } : {}) }, status);
}

export class HttpError extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

/** Lê o corpo JSON exigindo Content-Type application/json (bloqueia POSTs cross-site simples). */
export async function lerJson(request) {
  const ct = request.headers.get("Content-Type") || "";
  if (!ct.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Envie o corpo como application/json.");
  }
  const texto = await request.text();
  if (texto.length > 20000) throw new HttpError(413, "Corpo da requisição muito grande.");
  try {
    return JSON.parse(texto);
  } catch {
    throw new HttpError(400, "JSON inválido.");
  }
}

/** Envolve um handler convertendo HttpError (e falhas inesperadas) em respostas JSON. */
export function rota(handler) {
  return async (context) => {
    try {
      if (!context.env.DB) return erro(503, "Banco D1 não vinculado (binding DB ausente).");
      return await handler(context);
    } catch (e) {
      if (e instanceof HttpError) return erro(e.status, e.message, e.detalhes);
      console.error(e);
      return erro(500, "Erro interno no servidor.");
    }
  };
}
