-- Cuántos mensajes salientes de WhatsApp salieron en cada mes (src/mensajesSalientes.ts, D113): Meta da 1.000 gratis al mes
-- y el bot avisa al llegar a 800. El mes es el de UTC ("2026-11"); si Meta cuenta distinto, solo cambia el borde del mes.
CREATE TABLE IF NOT EXISTS uso_mensajes (
  mes TEXT PRIMARY KEY,
  enviados INTEGER NOT NULL DEFAULT 0
);

-- Llamadas del día a la IA de Cloudflare (Workers AI), el respaldo de Groq (src/llm.ts, D114).
ALTER TABLE uso_llm ADD COLUMN llamadas_cf INTEGER NOT NULL DEFAULT 0;
