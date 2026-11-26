# Seguridad

## Cómo avisar de una vulnerabilidad
Si encuentras una falla de seguridad, avísala en privado: en la pestaña **Security** de este repositorio, usa **Report a vulnerability**. No abras un issue público con los detalles.

Si esa opción no aparece, abre un issue sin detalles técnicos que diga solo que quieres reportar algo de seguridad, y te responderemos para seguir por un canal privado.

Incluye, si puedes: qué parte afecta (el bot, la app pública o la administración), cómo reproducirla y qué podría hacer alguien con ella. **No incluyas datos de clientes reales** ni pruebes contra los datos de otras personas: usa los datos ficticios de `scripts/datos-de-prueba.sql`.

## Qué cubre
- El código de este repositorio en la rama `main`, que es lo que está publicado.
- Los tres Workers: el bot de WhatsApp, la portada con la app del repartidor y la administración (detrás de Cloudflare Access).

No cubre los servicios de terceros que usa el proyecto (Meta, Cloudflare, Google, Groq, Telegram): sus fallas se reportan a cada uno.

## Lo que ya está pensado
Las medidas de seguridad, lo que se revisó y los riesgos que siguen abiertos están documentados en `docs/DECISIONES.md` y en la sección 12 de `docs/PROMPT_PROYECTO.md`.
