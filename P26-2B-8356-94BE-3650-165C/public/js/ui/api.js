/**
 * api.js — chamadas à API (mesma origem, cookie de sessão HttpOnly).
 */

let aoExpirar = () => {};

/** Define o que fazer quando a API responde 401 (sessão expirada). */
export function definirAoExpirar(fn) {
  aoExpirar = fn;
}

export class ErroApi extends Error {
  constructor(mensagem, status = 0) {
    super(mensagem);
    this.status = status;
  }
}

async function requisitar(caminho, opcoes = {}) {
  const init = { method: opcoes.method || "GET", headers: {}, credentials: "same-origin" };
  if (opcoes.body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(opcoes.body);
  }
  try {
    return await fetch(caminho, init);
  } catch {
    throw new ErroApi("Sem conexão com o servidor. Verifique sua internet.", 0);
  }
}

export async function api(caminho, opcoes = {}) {
  const res = await requisitar(caminho, opcoes);
  const dados = await res.json().catch(() => ({}));
  if (res.status === 401 && !opcoes.ignorar401) {
    aoExpirar("Sua sessão expirou. Entre novamente.");
    throw new ErroApi(dados.erro || "Sessão expirada. Entre novamente.", 401);
  }
  if (!res.ok || dados.ok === false) throw new ErroApi(dados.erro || `Erro ${res.status} no servidor.`, res.status);
  return dados;
}

/** Baixa um arquivo da API sem sair da página (respeita o nome do Content-Disposition). */
export async function baixarArquivo(caminho, nomePadrao) {
  const res = await requisitar(caminho);
  if (res.status === 401) {
    aoExpirar("Sua sessão expirou. Entre novamente.");
    throw new ErroApi("Sessão expirada.", 401);
  }
  if (!res.ok) {
    const dados = await res.json().catch(() => ({}));
    throw new ErroApi(dados.erro || `Erro ${res.status} ao gerar o arquivo.`, res.status);
  }
  const disp = res.headers.get("Content-Disposition") || "";
  const m = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disp);
  let nome = nomePadrao;
  if (m) {
    try { nome = decodeURIComponent(m[1] || m[2]); } catch { nome = m[2] || nomePadrao; }
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome.replace(/[\\/:*?"<>|]/g, "_");
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return nome;
}
