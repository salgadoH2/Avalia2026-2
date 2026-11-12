/**
 * conta.js — menu da conta sob o avatar: baixar dados (JSON), sair e excluir conta.
 * Padrão "disclosure": botão com aria-expanded + lista de ações; setas, Home/End e Esc.
 */
import { $, $$, el, toast } from "./dom.js";
import { api, baixarArquivo } from "./api.js";
import { confirmar } from "./dialogos.js";

export function preencherConta(u) {
  const avatar = $("#perfil-avatar");
  const inicial = $("#perfil-inicial");
  const semFoto = () => { avatar.hidden = true; inicial.hidden = false; };
  inicial.textContent = (u.username || "?").trim().charAt(0).toUpperCase();
  avatar.alt = "";
  avatar.hidden = false;
  inicial.hidden = true;
  if (u.avatar_url) {
    avatar.addEventListener("error", semFoto, { once: true });
    avatar.src = u.avatar_url;
  } else {
    avatar.removeAttribute("src");
    semFoto();
  }
  $("#perfil-nome").textContent = u.username;
  $("#menu-nome").textContent = u.username;
  $("#menu-id").textContent = u.user_id;
  $("#btn-conta").setAttribute("aria-label", `Conta de ${u.username}`);
}

export function iniciarMenuConta({ aoSair, aoContaExcluida }) {
  const botao = $("#btn-conta");
  const menu = $("#menu-conta");
  const itens = () => $$("button", menu).filter((b) => !b.disabled);

  const abrir = (focarPrimeiro = true) => {
    menu.hidden = false;
    botao.setAttribute("aria-expanded", "true");
    if (focarPrimeiro) itens()[0]?.focus();
  };
  const fechar = (devolverFoco = true) => {
    if (menu.hidden) return;
    menu.hidden = true;
    botao.setAttribute("aria-expanded", "false");
    if (devolverFoco) botao.focus();
  };

  botao.addEventListener("click", () => (menu.hidden ? abrir() : fechar()));
  botao.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); abrir(); }
    if (e.key === "ArrowUp") { e.preventDefault(); abrir(false); itens().at(-1)?.focus(); }
  });
  menu.addEventListener("keydown", (e) => {
    const lista = itens();
    const i = lista.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); fechar(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); lista[(i + 1) % lista.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); lista[(i - 1 + lista.length) % lista.length].focus(); }
    else if (e.key === "Home") { e.preventDefault(); lista[0].focus(); }
    else if (e.key === "End") { e.preventDefault(); lista.at(-1).focus(); }
  });
  // Fecha ao clicar fora ou quando o foco sai do menu (Tab).
  document.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !botao.contains(e.target)) fechar(false);
  });
  menu.addEventListener("focusout", (e) => {
    if (e.relatedTarget && !menu.contains(e.relatedTarget) && e.relatedTarget !== botao) fechar(false);
  });

  $("#acao-baixar").addEventListener("click", async (e) => {
    const b = e.currentTarget;
    b.disabled = true;
    b.setAttribute("aria-busy", "true");
    try {
      const hoje = new Date().toISOString().slice(0, 10);
      const nome = await baixarArquivo("/api/conta/exportar", `simulador-medias-meus-dados-${hoje}.json`);
      toast(`Download iniciado: ${nome}`, "ok");
      fechar();
    } catch (err) {
      toast(`Não foi possível baixar seus dados: ${err.message}`, "erro");
    } finally {
      b.disabled = false;
      b.removeAttribute("aria-busy");
    }
  });

  $("#acao-sair").addEventListener("click", () => {
    fechar(false);
    aoSair();
  });

  $("#acao-excluir").addEventListener("click", async () => {
    fechar(false);
    const ok = await confirmar({
      titulo: "Excluir minha conta",
      mensagem: [
        "Isto apaga permanentemente seu perfil, todas as disciplinas, fórmulas e notas, e encerra todas as suas sessões.",
        el("p", { class: "aviso-forte" }, "Essa ação não pode ser desfeita."),
        "Se quiser guardar uma cópia, cancele e use “Baixar meus dados (JSON)” antes.",
      ],
      rotulo: "Excluir conta definitivamente",
      exigir: "EXCLUIR",
      acao: () => api("/api/conta", { method: "DELETE", body: { confirmar: "EXCLUIR" } }),
    });
    if (ok) aoContaExcluida();
    else botao.focus();
  });

  return { fechar };
}
