-- Quién entra a la aplicación y con qué rol (D51): administradores y repartidores entran con su RUT y una clave de 4
-- dígitos. La clave nunca se guarda: se guarda una huella calculada con un secreto que no está en esta base.

CREATE TABLE IF NOT EXISTS usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rut TEXT NOT NULL UNIQUE,                  -- sin puntos ni guion, con el dígito verificador: "111111111"
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('administrador', 'repartidor')),
  correo TEXT,                               -- solo administradores: el correo con el que pasan por Cloudflare Access
  clave_sal TEXT NOT NULL,
  clave_hash TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  intentos_fallidos INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta INTEGER NOT NULL DEFAULT 0, -- segundos Unix; 0 = sin bloqueo
  bloqueos INTEGER NOT NULL DEFAULT 0,        -- bloqueos seguidos: cada uno dura más que el anterior
  creado_en INTEGER NOT NULL,
  creado_por TEXT NOT NULL DEFAULT '',
  actualizado_en INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_correo ON usuarios (correo) WHERE correo IS NOT NULL;

-- Un dispositivo que ya entró. El token vive solo en la cookie del dispositivo; aquí queda su huella (SHA-256).
CREATE TABLE IF NOT EXISTS sesiones (
  token_hash TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL,
  creada_en INTEGER NOT NULL,
  vence_en INTEGER NOT NULL,
  ultimo_uso INTEGER NOT NULL,
  recordar INTEGER NOT NULL DEFAULT 0,       -- 1 = "recordar este dispositivo": se renueva sola mientras se use
  dispositivo TEXT NOT NULL DEFAULT ''       -- "Android · Chrome": para que el administrador reconozca la sesión
);
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones (usuario_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_vence ON sesiones (vence_en);

-- Intentos fallidos por origen de la conexión, para frenar a quien prueba claves contra muchos RUT.
-- `origen` es una huella de la dirección IP, no la dirección.
CREATE TABLE IF NOT EXISTS intentos_de_ingreso (
  origen TEXT PRIMARY KEY,
  fallos INTEGER NOT NULL,
  desde INTEGER NOT NULL
);
