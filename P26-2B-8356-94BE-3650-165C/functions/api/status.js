/** GET /api/status — diagnóstico: D1 vinculado e Discord OAuth2 configurado. */
import { CHAVE, json } from "../../lib/http.js";

export async function onRequestGet({ env }) {
  let d1 = false;
  if (env.DB) {
    try {
      await env.DB.prepare("SELECT COUNT(*) AS n FROM disciplinas").first();
      d1 = true;
    } catch {
      d1 = false; // binding existe, mas migração não aplicada
    }
  }
  return json({
    ok: true,
    chave: CHAVE,
    projeto: "Simulador de Médias e Notas Mínimas",
    d1Conectado: d1,
    discordConfigurado: Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET),
    horario: new Date().toISOString(),
  });
}
