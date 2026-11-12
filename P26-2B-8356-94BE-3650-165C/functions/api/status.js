/** GET /api/status — diagnóstico público: D1 vinculado/migrado e Discord OAuth2 configurado. */
import { CHAVE, json, metodoNaoPermitido } from "../../lib/http.js";

export async function onRequestGet({ env }) {
  let d1 = false;
  if (env.DB) {
    try {
      // Só compila se as quatro tabelas existirem; LIMIT 1 evita varrer as tabelas.
      await env.DB.prepare(
        `SELECT (SELECT 1 FROM usuarios LIMIT 1) AS u, (SELECT 1 FROM sessoes LIMIT 1) AS s,
                (SELECT 1 FROM disciplinas LIMIT 1) AS d, (SELECT 1 FROM avaliacoes LIMIT 1) AS a`
      ).first();
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

// HEAD: mesma resposta do GET; o _middleware remove o corpo.
export const onRequestHead = onRequestGet;
export const onRequest = metodoNaoPermitido("GET");
