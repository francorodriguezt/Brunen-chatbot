// Solo lo que usan las ayudas de prueba de los módulos integrados de Node (el proyecto no instala @types/node).

declare module 'node:sqlite' {
  export class StatementSync {
    run(...valores: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
    all(...valores: unknown[]): unknown[];
  }
  export class DatabaseSync {
    constructor(ruta: string);
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}

declare module 'node:fs' {
  export function readFileSync(ruta: string, codificacion: 'utf8'): string;
  export function readdirSync(ruta: string): string[];
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
