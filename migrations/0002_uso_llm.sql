-- Cuántas veces se llamó al respaldo con IA cada día (UTC), para no pasar el cupo gratis de Groq (src/llm.ts, D24).
CREATE TABLE IF NOT EXISTS uso_llm (
  dia TEXT PRIMARY KEY,
  llamadas INTEGER NOT NULL
);
