/** Utilitários HTTP compartilhados pelas Pages Functions. */

export const CHAVE = "P26-2B-8356-94BE-3650-165C";

/** Tamanho máximo aceito para corpos JSON (bytes). */
export const LIMITE_CORPO = 20000;

/** Cabeçalhos aplicados a toda resposta da API (dados pessoais nunca vão para cache). */
export const CABECALHOS_API = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CABECALHOS_API, ...headers },
  });
}

export function erro(status, mensagem, detalhes, headers = {}) {
  return json({ ok: false, erro: mensagem, ...(detalhes ? { detalhes } : {}) }, status, headers);
}

export class HttpError extends Error {
  constructor(status, mensagem, detalhes) {
    super(mensagem);
    this.status = status;
    this.detalhes = detalhes;
  }
}

const muitoGrande = () => new HttpError(413, `Corpo da requisição muito grande (máximo de ${LIMITE_CORPO} bytes).`);

/** Lê o corpo como texto sem nunca guardar mais que `limite` bytes na memória. */
async function lerTextoLimitado(request, limite) {
  if (!request.body) return "";
  const leitor = request.body.getReader();
  const partes = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel().catch(() => {});
      throw muitoGrande();
    }
    partes.push(value);
  }
  const bytes = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) {
    bytes.set(p, pos);
    pos += p.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new HttpError(400, "O corpo da requisição não está em UTF-8 válido.");
  }
}

/**
 * Lê o corpo JSON exigindo Content-Type application/json (bloqueia POSTs cross-site simples).
 * Recusa cedo pelo Content-Length (antes de ler qualquer byte) e, para corpos sem esse
 * cabeçalho (chunked), interrompe a leitura assim que o limite é ultrapassado.
 */
export async function lerJson(request) {
  const tipo = (request.headers.get("Content-Type") || "").split(";")[0].trim().toLowerCase();
  if (tipo !== "application/json") {
    throw new HttpError(415, "Envie o corpo como application/json.");
  }
  const cl = request.headers.get("Content-Length");
  if (cl !== null) {
    const n = Number(cl);
    if (!/^\d+$/.test(cl.trim()) || !Number.isSafeInteger(n)) throw new HttpError(400, "Cabeçalho Content-Length inválido.");
    if (n > LIMITE_CORPO) throw muitoGrande();
  }
  const texto = await lerTextoLimitado(request, LIMITE_CORPO);
  if (texto.trim() === "") throw new HttpError(400, "O corpo da requisição está vazio.");
  try {
    return JSON.parse(texto);
  } catch {
    throw new HttpError(400, "JSON inválido.");
  }
}

/** Garante que o corpo é um objeto JSON simples (não array, não null, não número). */
export function exigirObjeto(body, mensagem = "O corpo deve ser um objeto JSON.") {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new HttpError(400, mensagem);
  return body;
}

/**
 * Handler genérico para métodos não suportados: 405 com o cabeçalho Allow.
 * Use como `export const onRequest = metodoNaoPermitido("GET", "POST")` ao lado dos
 * `onRequestGet`/`onRequestPost` — no roteamento do Pages os handlers com método têm prioridade.
 * OPTIONS responde 204 com Allow (sem CORS: a API é só same-origin).
 */
export function metodoNaoPermitido(...metodos) {
  // Toda rota com GET também aceita HEAD (tratado no _middleware: GET sem corpo).
  const comHead = metodos.flatMap((m) => (m === "GET" ? ["GET", "HEAD"] : [m]));
  const allow = [...comHead, "OPTIONS"].join(", ");
  return ({ request }) => {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { Allow: allow, ...CABECALHOS_API } });
    }
    return erro(405, `Método ${request.method} não permitido nesta rota. Use: ${metodos.join(", ")}.`, undefined, { Allow: allow });
  };
}

/** Envolve um handler convertendo HttpError (e falhas inesperadas) em respostas JSON. */
export function rota(handler) {
  return async (context) => {
    try {
      if (!context.env.DB) {
        console.error("Binding DB do D1 ausente.");
        return erro(503, "Serviço temporariamente indisponível.");
      }
      return await handler(context);
    } catch (e) {
      if (e instanceof HttpError) return erro(e.status, e.message, e.detalhes);
      console.error(e);
      return erro(500, "Erro interno no servidor. Tente novamente em instantes.");
    }
  };
}
