# Kamadeva System Backend

API REST para Punto de Venta e Inventario Retail Multiplataforma construida con **NestJS 12**, **TypeScript 6 (ESM)**, **Prisma ORM 7** y **PostgreSQL**.

- **Prefijo HTTP global:** `/api`
- **Documentación Swagger:** `/api/docs` (JSON OpenAPI en `/api/docs-json`)
- **Catálogo de servicios disponibles:** [ESTADO_SERVICIOS.md](file:///Users/mike/Documents/kamadeva-system-backend/ESTADO_SERVICIOS.md)

---

## 1. Desarrollo local

**Requisitos:** Node.js 24, `npm` y Docker Desktop (con Docker Compose).

```bash
npm ci
cp .env-example .env
docker compose up -d postgres
```

Edita `.env` y completa las variables obligatorias (genera dos secretos distintos con `openssl rand -hex 32` para `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`, además de tus credenciales de Cloudinary). Nunca confirmes `.env` en Git.

Aplica migraciones, genera el cliente Prisma y levanta el servidor en modo desarrollo:

```bash
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
npm run start:dev
```

- API local: `http://localhost:3000/api`
- Swagger UI: `http://localhost:3000/api/docs`

> El primer usuario registrado en `POST /api/autenticacion/registro` recibe automáticamente el rol `ADMIN`; los posteriores reciben `VENDEDOR`.

---

## 2. Variables de entorno

| Variable | Obligatoria | Descripción |
| :--- | :---: | :--- |
| `DATABASE_URL` | Sí | Cadena de conexión PostgreSQL. |
| `JWT_ACCESS_SECRET` | Sí | Secreto HS256 para access tokens (`openssl rand -hex 32`). |
| `JWT_REFRESH_SECRET` | Sí | Secreto HS256 distinto al anterior para refresh tokens. |
| `JWT_ACCESS_EXPIRES_IN` | No | Expiración del access token (ej. `15m`, `900`). |
| `JWT_REFRESH_EXPIRES_IN` | No | Expiración del refresh token (ej. `7d`). |
| `BCRYPT_ROUNDS` | No | Costo bcrypt (`4`–`31`, por defecto `12`). |
| `PORT` | No | Puerto HTTP (por defecto `3000`). |
| `BUSINESS_TIMEZONE` | No | Zona horaria IANA (por defecto `America/Mexico_City`). |
| `CORS_ORIGIN` | No | Orígenes permitidos separados por coma (vacío = permite cualquiera). |
| `CLOUDINARY_CLOUD_NAME` | Sí | Cloud name de Cloudinary para imágenes de productos. |
| `CLOUDINARY_API_KEY` | Sí | API key de Cloudinary. |
| `CLOUDINARY_API_SECRET` | Sí | API secret de Cloudinary. |

---

## 3. Comprobaciones de calidad y pruebas

Con Docker activo (las pruebas E2E levantan automáticamente un PostgreSQL 16 temporal):

```bash
npx prisma validate --config prisma7.config.ts
npm run build
npm run lint
npm test
npm run test:e2e
```

---

## 4. Despliegue en Railway

1. Crea un proyecto en **Railway** desde el repositorio de GitHub y agrega un servicio **PostgreSQL** (`+ New` → `Database` → `Add PostgreSQL`).
2. En **Variables** del servicio backend, configura las variables de la sección anterior usando `${{Postgres.DATABASE_URL}}` para `DATABASE_URL`.
3. En **Settings → Build & Deploy**:
   - **Build Command:** `npm run build`
   - **Start Command:**
     ```bash
     npx prisma migrate deploy --config prisma7.config.ts && npm run start:prod
     ```
   - **Healthcheck Path:** `/api`
4. Genera el dominio público en **Settings → Networking → Generate Domain**.
