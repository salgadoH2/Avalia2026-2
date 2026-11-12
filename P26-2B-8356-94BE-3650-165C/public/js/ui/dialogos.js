/**
 * dialogos.js — <dialog> nativo com foco gerenciado e confirmação forte.
 */
import { $ } from "./dom.js";

/**
 * Abre um <dialog> modal, coloca o foco em `foco` e, ao fechar,
 * devolve o foco para o elemento que estava ativo antes (ou `retorno`).
 */
export function abrirDialogo(dlg, foco, retorno) {
  const anterior = retorno || document.activeElement;
  dlg.addEventListener("close", () => {
    const alvo = typeof anterior?.focus === "function" && anterior.isConnected ? anterior : null;
    if (alvo) alvo.focus({ preventScroll: true });
  }, { once: true });
  dlg.showModal();
  if (foco) foco.focus();
}

/**
 * Confirmação em <dialog>. Resolve true se confirmada.
 * @param {object} o
 * @param {string} o.titulo
 * @param {(string|Node)[]} o.mensagem  parágrafos (texto ou nós)
 * @param {string} o.rotulo  texto do botão de confirmação
 * @param {boolean} [o.perigo=true]
 * @param {string} [o.exigir]  palavra que precisa ser digitada para liberar o botão
 * @param {() => Promise<void>} [o.acao]  executada com o diálogo aberto; erro aparece no próprio diálogo
 */
export function confirmar({ titulo, mensagem = [], rotulo, perigo = true, exigir = null, acao = null }) {
  const dlg = $("#dlg-confirmar");
  const form = $("#form-confirmar");
  const campo = $("#confirmar-campo");
  const input = $("#confirmar-input");
  const ok = $("#confirmar-ok");
  const erro = $("#confirmar-erro");
  const texto = $("#confirmar-texto");

  $("#confirmar-titulo").textContent = titulo;
  texto.replaceChildren(...[].concat(mensagem).map((m) => {
    if (typeof m !== "string") return m;
    const p = document.createElement("p");
    p.textContent = m;
    return p;
  }));
  campo.hidden = !exigir;
  $("#confirmar-palavra").textContent = exigir || "";
  input.value = "";
  input.setAttribute("aria-invalid", "false");
  erro.hidden = true;
  ok.textContent = rotulo;
  ok.className = `btn ${perigo ? "btn-perigo-cheio" : "btn-primario"}`;
  // O botão fica habilitado: com Enter ou clique, a palavra errada mostra um erro em vez de não fazer nada.
  ok.disabled = false;

  return new Promise((resolve) => {
    let confirmado = false;
    let ocupado = false;

    const liberar = () => {
      if (input.getAttribute("aria-invalid") === "true" && input.value.trim() === exigir) {
        input.setAttribute("aria-invalid", "false");
        erro.hidden = true;
      }
    };
    const aoCancelarNativo = (e) => { if (ocupado) e.preventDefault(); };
    const fechar = () => { if (!ocupado) dlg.close(); };
    const aoEnviar = async (e) => {
      e.preventDefault();
      if (ocupado) return;
      if (exigir && input.value.trim() !== exigir) {
        input.setAttribute("aria-invalid", "true");
        erro.textContent = `Para confirmar, digite ${exigir} exatamente assim, em maiúsculas.`;
        erro.hidden = false;
        input.focus();
        return;
      }
      if (acao) {
        ocupado = true;
        ok.disabled = true;
        ok.textContent = "Aguarde…";
        dlg.setAttribute("aria-busy", "true");
        try {
          await acao();
        } catch (err) {
          erro.textContent = err.message || "Não foi possível concluir.";
          erro.hidden = false;
          ok.textContent = rotulo;
          ok.disabled = false;
          ocupado = false;
          dlg.removeAttribute("aria-busy");
          return;
        }
        ocupado = false;
        dlg.removeAttribute("aria-busy");
      }
      confirmado = true;
      dlg.close();
    };
    const cancelar = [...dlg.querySelectorAll("[data-cancelar]")];

    input.addEventListener("input", liberar);
    form.addEventListener("submit", aoEnviar);
    dlg.addEventListener("cancel", aoCancelarNativo);
    cancelar.forEach((b) => b.addEventListener("click", fechar));
    dlg.addEventListener("close", () => {
      input.removeEventListener("input", liberar);
      form.removeEventListener("submit", aoEnviar);
      dlg.removeEventListener("cancel", aoCancelarNativo);
      cancelar.forEach((b) => b.removeEventListener("click", fechar));
      ok.textContent = rotulo;
      resolve(confirmado);
    }, { once: true });

    // Ação destrutiva: o foco começa na opção segura (ou no campo de confirmação).
    abrirDialogo(dlg, exigir ? input : cancelar[cancelar.length - 1]);
  });
}
