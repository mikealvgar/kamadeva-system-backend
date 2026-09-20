# Kamadeva System Backend

API NestJS 12 + Prisma 7 + PostgreSQL. Implementa registro, login, rotación de refresh tokens y logout con sesiones persistidas.

## Desarrollo local

Requisitos: Node.js 24, npm y Docker con Docker Compose.

```bash
npm ci
cp .env-example .env
docker compose up -d postgres
```

Completar `.env` con dos secretos JWT distintos y las tres variables de Cloudinary indicadas abajo. Ejecutar `openssl rand -hex 32` una vez para cada secreto y colocar los resultados en `JWT_ACCESS_SECRET` y `JWT_REFRESH_SECRET`. No guardar `.env` en Git.

```bash
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
npm run start:dev
```

`migrate deploy` aplica las migraciones pendientes a la base configurada. No requiere reset. La migración inicial `20260913065414_catalog_categories` crea el esquema completo existente, incluida la unicidad de categorías y la referencia restrictiva desde productos. `20260913065500_seed_catalog_required_roles` siembra los dos roles de forma idempotente; `jti` identifica `RefreshToken.id`, sin añadir columnas.

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

Usuario público: `{ id, name, email, roles }`. El primer usuario registrado recibe `roles: ["ADMIN"]`; los siguientes reciben `["VENDEDOR"]`. Roles inactivos no se incluyen. No se exponen entidades Prisma, `passwordHash` ni `tokenHash`.

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

## Roles y autorización

| Rol        | Acceso                                            |
| ---------- | ------------------------------------------------- |
| `ADMIN`    | Gestión de roles y acceso a rutas de VENDEDOR.    |
| `VENDEDOR` | Rutas que admiten VENDEDOR; sin gestión de roles. |

El conjunto es cerrado, con mayúsculas exactas. No hay creación dinámica de roles. Un usuario puede tener ambos roles. `@Roles()` usa OR y ADMIN también satisface VENDEDOR. Sin metadata, `@UseGuards(JwtAuthGuard, RolesGuard)` solo exige autenticación.

| Endpoint (requiere ADMIN)                   | Resultado                                                                                                               |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /api/roles`                            | Los dos roles ordenados por nombre: `{ id, name, description, isActive }`.                                              |
| `GET /api/users/:userId/roles`              | `{ userId, roles }`, solo roles activos.                                                                                |
| `PUT /api/users/:userId/roles`              | Reemplaza todos los roles con `{ "roles": ["ADMIN"] }`, `["VENDEDOR"]` o ambos; devuelve `{ userId, roles }`.           |
| `DELETE /api/users/:userId/roles/:roleName` | `204`, incluso si el rol no estaba asignado.                                                                            |
| `DELETE /api/users/:userId`                 | `204`. Elimina usuario, sesiones y asignaciones. Solo si no tiene cotizaciones, ventas, pagos ni movimientos asociados. |

Sin token válido o usuario inactivo: `401`; sin ADMIN: `403`; usuario inexistente: `404`. UUID v4 inválido, roles desconocidos, vacíos o duplicados: `400`. Borrarse a sí mismo: `400` con `No puedes eliminar tu propio usuario`. Asignar un rol inactivo: `422`. Remover el último ADMIN activo: `409` con `No se puede remover el último administrador`; eliminarlo o eliminar un usuario con registros asociados: `409`. Repetir un PUT válido es idempotente.

El registro cuenta usuarios dentro de una transacción PostgreSQL `Serializable` que crea usuario, asignación y sesión. Los cambios de roles comprueban usuario, roles y último administrador en el mismo nivel de aislamiento. Los conflictos `P2034` reintentan la operación completa hasta cuatro veces con una nueva instantánea: dos primeros registros concurrentes terminan con un ADMIN y un VENDEDOR; dos degradaciones concurrentes no pueden eliminar al último administrador. Errores restantes conservan `500`; email duplicado produce `409`.

Cambiar roles no modifica ni revoca access tokens emitidos: siguen válidos hasta `exp`, con su claim anterior. Login o refresh genera un claim actualizado. Sin embargo, `JwtStrategy` recarga roles desde DB en cada petición, así que los permisos cambian inmediatamente. No se revocan refresh tokens por cambios de rol. Roles inactivos se filtran; su activación se administra directamente en DB.

No hay bootstrap por correo: solo el primer registro recibe ADMIN automáticamente; usuarios preexistentes no reciben roles retroactivamente.

Especificaciones implementadas disponibles en este checkout: `specs/spec-auth-services.md`, `specs/spec-catalog.md` y `specs/spec-catalog-products.md`. La gestión de roles también está implementada y cubierta por pruebas.

## Catálogo: categorías

Todos los endpoints requieren un access token Bearer y un usuario activo. `ADMIN` puede escribir; `ADMIN` y `VENDEDOR` pueden leer. Sin token válido o con usuario inactivo: `401`; sin rol permitido: `403`.

| Endpoint                             | Entrada                                                   | Resultado                                                                            |
| ------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `POST /api/catalog/categories`       | `name`, opcionales `slug` y `description`                 | `201`: `CategoryDto`; slug duplicado: `409`.                                         |
| `GET /api/catalog/categories`        | Query opcional `includeInactive=true` o `false`           | `200`: `CategoryDto[]`, ordenado por nombre; por defecto solo activas.               |
| `GET /api/catalog/categories/:id`    | UUID                                                      | `200`: `CategoryDto`, incluidas inactivas; inexistente: `404`.                       |
| `PATCH /api/catalog/categories/:id`  | Al menos uno de `name`, `slug`, `description`, `isActive` | `200`: `CategoryDto`; inexistente: `404`; slug duplicado: `409`.                     |
| `DELETE /api/catalog/categories/:id` | UUID                                                      | `204` sin cuerpo; con productos asociados: `409`; inexistente o ya eliminada: `404`. |

`CategoryDto`: `{ id, name, slug, description, isActive }`. Nombre obligatorio al crear, recortado, no vacío y máximo 100 caracteres. Slug explícito debe cumplir `^[a-z0-9]+(-[a-z0-9]+)*$`; si se omite, se genera del nombre en minúsculas, sin acentos y con separadores convertidos a guiones. Renombrar sin enviar slug lo regenera. Un nombre que no permita generar un slug válido produce `400`; puede acompañarse de un slug explícito válido.

Descripción opcional de máximo 500 caracteres; se recorta y un valor vacío o `null` se guarda como `null`. `name`, `slug` e `isActive` no aceptan `null`. UUID, campos o query inválidos, campos desconocidos y PATCH vacío producen `400`. La base protege el slug único y el borrado con productos, también ante concurrencia.

```bash
curl -i http://localhost:3000/api/catalog/categories \
  -H 'Authorization: Bearer <accessToken ADMIN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Anillos","description":"Joyería de anillos"}'

curl -i 'http://localhost:3000/api/catalog/categories?includeInactive=true' \
  -H 'Authorization: Bearer <accessToken>'

curl -i -X PATCH http://localhost:3000/api/catalog/categories/<id> \
  -H 'Authorization: Bearer <accessToken ADMIN>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Anillos de boda","isActive":false}'
```

`test/catalog.e2e-spec.ts` cubre CRUD, normalización, validación, duplicados concurrentes, referencias, permisos y Swagger. Las suites E2E se ejecutan secuencialmente porque comparten la base temporal y autenticación verifica el primer registro. Catálogo crea y limpia sus propios datos. El CRUD de productos se documenta a continuación.

## Catálogo: productos

Todos los endpoints exigen JWT y usuario activo. `ADMIN` escribe; `ADMIN` y `VENDEDOR` leen. Sin token válido o usuario inactivo: `401`; sin rol permitido: `403`.

| Endpoint                                  | Entrada                                                                                                                     | Resultado                                                                                              |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `POST /api/catalog/products`              | `sku`, `articulo`, `precioVenta`, `categoryId`; opcionales `descripcion`, `codigoBarras`, `marca`, `tallas`, `precioCompra` | `201`: `ProductDto`; categoría inexistente: `404`; SKU/código duplicado: `409`.                        |
| `GET /api/catalog/products`               | Query `categoryId`, `includeInactive` (`true` o `false`), `search`                                                          | `200`: `ProductDto[]` por artículo ascendente; por defecto solo activos.                               |
| `GET /api/catalog/products/:id`           | UUID v4                                                                                                                     | `200`: `ProductDto`, incluso inactivo; inexistente: `404`.                                             |
| `GET /api/catalog/products/:id/movements` | UUID v4                                                                                                                     | `200`: movimientos por fecha descendente; producto inexistente: `404`.                                 |
| `PATCH /api/catalog/products/:id`         | Al menos un campo de creación o `isActive`                                                                                  | `200`: `ProductDto`; producto/categoría inexistente: `404`; duplicados: `409`.                         |
| `DELETE /api/catalog/products/:id`        | UUID v4                                                                                                                     | `204` sin cuerpo; referencias en cotizaciones, ventas o movimientos: `409`; inexistente: `404`.        |
| `POST /api/catalog/products/:id/image`    | Multipart, un campo `file`                                                                                                  | `200`: `ProductDto`; archivo inválido: `400`; producto inexistente: `404`; fallo del proveedor: `502`. |

Respuesta pública: `{ id, sku, articulo, descripcion, codigoBarras, marca, tallas, precioCompra, precioVenta, stock, imageUrl, isActive, categoria, createdAt, updatedAt }`. `categoria` incluye únicamente `{ id, name, slug }`. Se conservan los nombres internos de Prisma; el servicio mapea los campos públicos.

SKU se recorta y pasa a mayúsculas (máximo 64); artículo se recorta y no puede quedar vacío (máximo 200). Descripción admite hasta 500 caracteres; código de barras 64 y marca 100. Los textos opcionales se recortan y un valor vacío o `null` elimina el valor. El código de barras es único cuando existe. Tallas se recortan, deben ser strings no vacíos y no pueden repetirse después del recorte. Una lista vacía se persiste como `[]` y se devuelve como `null`; `null` no se acepta como entrada para `tallas`.

Precios entran como números JSON de hasta 10 enteros y 2 decimales. Venta debe ser positiva; compra puede ser cero, omitirse o ponerse a `null`. Ambos salen como strings con dos decimales. UUID, tipos, precisión, campos desconocidos y PATCH vacío producen `400`. `stock` e `imageUrl` no se aceptan en los cuerpos de creación o actualización.

`stock` se deriva de `SUM(InventoryMovement.quantityChange)` y se devuelve con tres decimales, incluso negativo; no existe una columna de stock. Los productos sin movimientos devuelven `"0.000"`. El listado usa una sola agregación para todos los productos devueltos. `search` busca en artículo, SKU o código de barras sin distinguir mayúsculas. Inactivar un producto no altera sus movimientos ni su existencia.

Los movimientos exponen `{ id, type, quantityChange, unitCost, referenceType, referenceId, notes, createdAt }`. El alta manual y la consulta global se describen en Inventario.

### Cloudinary

Estas variables son obligatorias al arrancar y van exclusivamente en `.env` o en el gestor de secretos del despliegue:

| Variable                | Valor esperado                                 |
| ----------------------- | ---------------------------------------------- |
| `CLOUDINARY_CLOUD_NAME` | Nombre del entorno de productos de Cloudinary. |
| `CLOUDINARY_API_KEY`    | API key de ese entorno.                        |
| `CLOUDINARY_API_SECRET` | API secret correspondiente.                    |

Se acepta una imagen JPEG, PNG o WebP de hasta 5 MiB (5 × 1024 × 1024 bytes). Multer limita el multipart en memoria y la validación comprueba la firma del archivo además del MIME declarado. El SDK sube a `kamadeva/products` con `public_id = product-{id}`, `overwrite=true` e `invalidate=true`; se persiste únicamente `secure_url`. La siguiente carga reemplaza la imagen. Si el proveedor falla, se responde `502` y no se modifica la URL persistida. Eliminar un producto no elimina su imagen remota en este hito. Referencias: [subidas de Cloudinary](https://cloudinary.com/documentation/image_upload_api_reference) y [validación de archivos de Nest](https://docs.nestjs.com/techniques/file-upload).

La migración `20260913222113_product_extended_fields` agrega solo `brand`, `tallas` (con default `[]`) e `imageUrl`. Aplicar las migraciones pendientes en el entorno correspondiente:

```bash
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
```

```bash
curl -i http://localhost:3000/api/catalog/products \
  -H 'Authorization: Bearer <accessToken ADMIN>' \
  -H 'Content-Type: application/json' \
  -d '{"sku":"AN-R-001","articulo":"Anillo de plata","categoryId":"<uuid categoría>","precioCompra":780.25,"precioVenta":1250.50,"marca":"Kamadeva","tallas":["7","8"]}'

curl -i 'http://localhost:3000/api/catalog/products?search=anillo&includeInactive=true' \
  -H 'Authorization: Bearer <accessToken>'

curl -i http://localhost:3000/api/catalog/products/<id>/image \
  -H 'Authorization: Bearer <accessToken ADMIN>' \
  -F 'file=@/ruta/anillo.png'
```

Las pruebas unitarias sustituyen Prisma y el SDK. `test/catalog-products.e2e-spec.ts` usa PostgreSQL real temporal y sustituye `PRODUCT_IMAGES`: ninguna prueba llama a Cloudinary real. La suite mantiene un servidor HTTP durante su ejecución y limpia sus propios datos.

## Inventario

| Endpoint | Permiso | Contrato |
| --- | --- | --- |
| `POST /api/catalog/products/:id/movements` | ADMIN | `201`: movimiento manual; producto inexistente `404`. |
| `GET /api/inventory/movements` | ADMIN o VENDEDOR | `200`: lista por `createdAt` descendente, sin paginación. Filtros opcionales `productId` (UUID v4), `type`, `startDate` y `endDate` (ISO 8601, inclusivos). Producto filtrado inexistente: `404`. |

Ambos requieren token válido y usuario activo (`401`); permisos insuficientes producen `403`. UUID, cuerpo o query inválidos producen `400`. Una lista sin coincidencias devuelve `[]`.

`quantity` es un número positivo con hasta 11 enteros y 3 decimales (máximo `99999999999.999`), compatible con `Decimal(14,3)`. El servidor deriva `quantityChange`: positivo para `PURCHASE_IN`, `RETURN_IN` y `ADJUSTMENT_IN`; negativo para `ADJUSTMENT_OUT`. `SALE_OUT` está reservado para ventas y se rechaza en el alta manual. No se impide que un ajuste deje stock negativo.

`unitCost` es opcional, no negativo, hasta 10 enteros y 2 decimales; omitido se guarda como `null`. `notes` es opcional, se recorta y admite hasta 500 caracteres; vacío u omitido se guarda como `null`. Los opcionales aceptan omisión, pero no `null` explícito. La respuesta reutiliza `InventoryMovementDto`, con cantidad y costo como strings de tres y dos decimales. Las referencias quedan en `null`; `createdById` procede del usuario autenticado y no se expone ni se acepta en el cuerpo.

```bash
curl -i 'http://localhost:3000/api/catalog/products/<uuid>/movements' \
  -H 'Authorization: Bearer <accessToken ADMIN>' \
  -H 'Content-Type: application/json' \
  -d '{"type":"PURCHASE_IN","quantity":10,"unitCost":780.25,"notes":"Compra a proveedor"}'

curl -i 'http://localhost:3000/api/inventory/movements?type=PURCHASE_IN&startDate=2026-09-01T00:00:00Z' \
  -H 'Authorization: Bearer <accessToken>'
```

Cada alta se refleja en el stock derivado del listado y detalle de productos. Los movimientos no se editan ni borran; se corrigen creando un ajuste nuevo. No se requiere migración. `test/inventory.e2e-spec.ts` comprueba el contrato con PostgreSQL temporal aislado.
