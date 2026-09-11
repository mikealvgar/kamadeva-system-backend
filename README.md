# Kamadeva System Backend

API NestJS 12 + Prisma 7 + PostgreSQL. Implementa registro, login, rotación de refresh tokens y logout con sesiones persistidas.

## Desarrollo local

Requisitos: Node.js 24, npm y Docker con Docker Compose.

```bash
npm ci
cp .env-example .env
docker compose up -d postgres
```

Completar `.env` con dos secretos distintos. Ejecutar `openssl rand -hex 32` una vez para cada secreto y colocar los resultados en `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`. No guardar `.env` en Git.

```bash
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
npm run start:dev
```

`migrate deploy` aplica las migraciones pendientes a la base configurada. No requiere reset. Esta funcionalidad reutiliza la migración inicial; `jti` identifica `RefreshToken.id`, sin añadir columnas.

Compilar y arrancar la versión de producción:

```bash
npm run build
npm run start:prod
```

API: `http://localhost:3000/api`. Swagger: `http://localhost:3000/api/docs`. OpenAPI JSON: `http://localhost:3000/api/docs-json`.

## Variables

| Variable                 | Uso                                                                               |
| ------------------------ | --------------------------------------------------------------------------------- |
| `DATABASE_URL`           | URL PostgreSQL obligatoria.                                                       |
| `JWT_ACCESS_SECRET`      | Secreto obligatorio para JWT de acceso HS256.                                     |
| `JWT_REFRESH_SECRET`     | Secreto obligatorio y diferente para refresh JWT HS256.                           |
| `JWT_ACCESS_EXPIRES_IN`  | Duración positiva; ejemplo `15m` o `900`.                                         |
| `JWT_REFRESH_EXPIRES_IN` | Duración positiva; ejemplo `7d`.                                                  |
| `BCRYPT_ROUNDS`          | Entero 4–31; por defecto 12. El costo crece exponencialmente; las pruebas usan 4. |
| `PORT`                   | Puerto HTTP; por defecto 3000.                                                    |

Duraciones aceptadas: entero en segundos o entero con sufijo `s`, `m`, `h`, `d`, hasta 10 años. La aplicación falla al arrancar si falta configuración obligatoria o si una duración/costo no es válida.

## Contrato HTTP

| Endpoint                  | Entrada JSON                | Éxito                                                         | Errores                                                                            |
| ------------------------- | --------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `POST /api/auth/register` | `name`, `email`, `password` | `201`: `{ user, accessToken, refreshToken }`                  | `400` datos inválidos; `409` correo existente.                                     |
| `POST /api/auth/login`    | `email`, `password`         | `200`: `{ user, accessToken, refreshToken }`                  | `400` datos inválidos; `401` credenciales inválidas o usuario inactivo.            |
| `POST /api/auth/refresh`  | `refreshToken`              | `200`: `{ accessToken, refreshToken }`                        | `400` datos inválidos; `401` token inválido, vencido, revocado o usuario inactivo. |
| `POST /api/auth/logout`   | `refreshToken`              | `204`, sin cuerpo, incluso para token inválido o ya revocado. | `400` si falta el campo o su tipo no es válido.                                    |

Los errores de infraestructura conservan el estado `500`; logout no oculta fallos de persistencia. Los cuerpos inválidos se rechazan mediante `ValidationPipe` antes de ejecutar el contrato de logout.

Usuario público: `{ id, name, email, roles }`. Al registrarse, `roles` es `[]`; no existe rol inicial configurado. Roles inactivos no se incluyen. No se exponen entidades Prisma, `passwordHash` ni `tokenHash`.

Nombre se recorta; correo se recorta y convierte a minúsculas. Contraseña: mínimo 8 caracteres y máximo 72 bytes UTF-8, sin recortar ni truncar. Los campos desconocidos se rechazan con `400`.

```bash
curl -i http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Juan Pérez","email":"juan@kamadeva.com","password":"Password123!"}'

curl -i http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"juan@kamadeva.com","password":"Password123!"}'

curl -i http://localhost:3000/api/auth/refresh \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken recibido>"}'

curl -i http://localhost:3000/api/auth/logout \
  -H 'Content-Type: application/json' \
  -d '{"refreshToken":"<refreshToken vigente>"}'
```

Usar siempre el último refresh token recibido. La rotación consume el anterior una sola vez, incluso con solicitudes concurrentes. Login crea una sesión independiente; logout revoca únicamente la sesión presentada. La revocación no invalida access tokens ya emitidos: siguen vigentes hasta su expiración. `JwtAuthGuard` comprueba además que el usuario siga activo.

Las contraseñas usan bcrypt. Los refresh tokens firmados se almacenan como SHA-256 de los bytes completos; no se usa bcrypt para JWT largos. Cada token contiene `sub`, `jti`, `iat`, `exp`. Access tokens contienen `sub`, `email`, `roles`, `iat`, `exp`. Registro y primera sesión, así como rotación, usan transacciones PostgreSQL.

## Comprobaciones

```bash
npm run build
npm run lint
npm test
npm run test:e2e
npx prisma validate --config prisma7.config.ts
```

Las pruebas unitarias usan dobles y no necesitan PostgreSQL. Las E2E requieren Docker disponible: crean un contenedor temporal `postgres:16` en un puerto aleatorio de loopback, aplican migraciones y prueban HTTP con Prisma real. Nunca usan `DATABASE_URL` de `.env`. Al terminar detienen y eliminan exclusivamente ese contenedor. No se omiten pruebas si Docker falla. Si se interrumpe forzosamente el proceso, revisar los contenedores `kamadeva-auth-test-*` que haya dejado esa ejecución.

E2E cubre validaciones, registro concurrente, credenciales, usuario inactivo, guard JWT, expiración, firma/algoritmo, rotación concurrente, logout, persistencia al reiniciar la aplicación y Swagger. Las pruebas reinician Nest conservando PostgreSQL para verificar que el estado de sesión no depende de memoria local.

Especificación ejecutada: `specs/spec-auth-services.md`. Seguimiento local: `TASK.md` y `PROGRESS.md`.
