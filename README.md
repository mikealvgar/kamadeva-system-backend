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

| Variable                 | Uso                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `DATABASE_URL`           | URL PostgreSQL obligatoria.                                                         |
| `JWT_ACCESS_SECRET`      | Secreto obligatorio para JWT de acceso HS256.                                       |
| `JWT_REFRESH_SECRET`     | Secreto obligatorio y diferente para refresh JWT HS256.                             |
| `JWT_ACCESS_EXPIRES_IN`  | Duración positiva; ejemplo `15m` o `900`.                                           |
| `JWT_REFRESH_EXPIRES_IN` | Duración positiva; ejemplo `7d`.                                                    |
| `BCRYPT_ROUNDS`          | Entero 4–31; por defecto 12. El costo crece exponencialmente; las pruebas usan 4.   |
| `PORT`                   | Puerto HTTP; por defecto 3000.                                                      |
| `BUSINESS_TIMEZONE`      | Zona horaria IANA del negocio para el dashboard; por defecto `America/Mexico_City`. |

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

## Catálogo: tallas

Catálogo único de tallas que usan productos, cotizaciones y ventas. El stock sigue siendo por producto, no por talla. `ADMIN` escribe; `ADMIN` y `VENDEDOR` leen. Sin token válido o usuario inactivo: `401`; sin rol permitido: `403`.

| Endpoint                        | Entrada                                         | Resultado                                                                                                            |
| ------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `POST /api/catalog/sizes`       | `name`; opcional `sortOrder` (entero 0–10000)   | `201`: `SizeDto`; nombre duplicado: `409`.                                                                           |
| `GET /api/catalog/sizes`        | Query opcional `includeInactive=true` o `false` | `200`: `SizeDto[]` por `sortOrder` y nombre; por defecto solo activas.                                               |
| `GET /api/catalog/sizes/:id`    | UUID                                            | `200`: `SizeDto`, incluso inactiva; inexistente: `404`.                                                              |
| `PATCH /api/catalog/sizes/:id`  | Al menos uno de `name`, `sortOrder`, `isActive` | `200`: `SizeDto`; inexistente: `404`; nombre duplicado: `409`.                                                       |
| `DELETE /api/catalog/sizes/:id` | UUID                                            | `204`; asignada a productos, renglones de cotización o de venta: `409` (usar `isActive: false`); inexistente: `404`. |

`SizeDto`: `{ id, name, sortOrder, isActive }`. `name` se recorta y pasa a mayúsculas (máximo 20), así que `m` y `M` son la misma talla. Las tallas migradas desde el campo de texto anterior conservan su nombre aunque excedan 20 caracteres.

En cotizaciones, cada renglón acepta `sizeId` opcional: es obligatorio si el producto tiene tallas activas, debe ser una de ellas, y está prohibido si el producto no tiene tallas; si no se cumple: `400`. Los renglones exponen `size: { id, name } | null`, y al pagar la cotización la talla se copia al renglón de venta.

## Catálogo: productos

Todos los endpoints exigen JWT y usuario activo. `ADMIN` escribe; `ADMIN` y `VENDEDOR` leen. Sin token válido o usuario inactivo: `401`; sin rol permitido: `403`.

| Endpoint                                  | Entrada                                                                                                                                        | Resultado                                                                                                                  |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/catalog/products`              | `codigoBarras`, `articulo`, `precioVenta`; opcionales `categoryId`, `descripcion`, `marca`, `tallaIds`, `precioCompra`, `stockMinimo`, `stock` | `201`: `ProductDto`; talla inexistente o inactiva: `400`; categoría inexistente: `404`; código de barras duplicado: `409`. |
| `GET /api/catalog/products`               | Query `categoryId`, `includeInactive` (`true` o `false`), `search`                                                                             | `200`: `ProductDto[]` por artículo ascendente; por defecto solo activos.                                                   |
| `GET /api/catalog/products/:id`           | UUID v4                                                                                                                                        | `200`: `ProductDto`, incluso inactivo; inexistente: `404`.                                                                 |
| `GET /api/catalog/products/:id/movements` | UUID v4                                                                                                                                        | `200`: movimientos por fecha descendente; producto inexistente: `404`.                                                     |
| `PATCH /api/catalog/products/:id`         | Al menos un campo de creación, `stock` o `isActive`                                                                                            | `200`: `ProductDto`; producto/categoría inexistente: `404`; duplicados: `409`.                                             |
| `DELETE /api/catalog/products/:id`        | UUID v4                                                                                                                                        | `204` sin cuerpo; referencias en cotizaciones, ventas o movimientos: `409`; inexistente: `404`.                            |
| `POST /api/catalog/products/:id/image`    | Multipart, un campo `file`                                                                                                                     | `200`: `ProductDto`; archivo inválido: `400`; producto inexistente: `404`; fallo del proveedor: `502`.                     |

Respuesta pública: `{ id, articulo, descripcion, codigoBarras, marca, tallas, precioCompra, precioVenta, stock, stockMinimo, imageUrl, isActive, categoria, createdAt, updatedAt }`. `categoria` incluye únicamente `{ id, name, slug }` o es `null` si el producto no tiene categoría. Se conservan los nombres internos de Prisma; el servicio mapea los campos públicos.

El código de barras es el identificador del producto (ya no existe SKU): obligatorio, único, se recorta y pasa a mayúsculas (máximo 64); no se puede borrar con `null`. Artículo se recorta y no puede quedar vacío (máximo 200). Descripción admite hasta 500 caracteres y marca 100. Los textos opcionales se recortan y un valor vacío o `null` elimina el valor. La categoría es opcional; `categoryId: null` en `PATCH` la quita y `GET` acepta `sinCategoria=true`. `stockMinimo` (opcional, ≥ 0, hasta 3 decimales; `null` lo quita) marca el producto como de stock bajo en el dashboard cuando `stock ≤ stockMinimo`; se devuelve como string con tres decimales o `null`. `tallaIds` es una lista de UUID sin repetidos de tallas activas del catálogo (ver Catálogo: tallas); en `PATCH` reemplaza la lista completa y `[]` la vacía; `null` no se acepta. La respuesta expone `tallas` como `[{ id, name }]` ordenadas por `sortOrder` y nombre; un producto sin tallas devuelve `[]`.

Precios entran como números JSON de hasta 10 enteros y 2 decimales. Venta debe ser positiva; compra puede ser cero, omitirse o ponerse a `null`. Ambos salen como strings con dos decimales. `precioCompra` es el costo de adquisición y se puede editar desde el producto; no modifica `precioVenta`. UUID, tipos, precisión, campos desconocidos y PATCH vacío producen `400`. `imageUrl` no se acepta en los cuerpos de creación o actualización.

`stock` se deriva de `SUM(InventoryMovement.quantityChange)` y se devuelve con tres decimales, incluso negativo; no existe una columna de stock. ADMIN puede enviar `stock` en alta o edición como existencia deseada; el sistema registra la diferencia como movimiento de ajuste y la operación queda auditada. VENDEDOR no puede crear ni editar productos. Los productos sin movimientos devuelven `"0.000"`. El listado usa una sola agregación para todos los productos devueltos. `search` busca en artículo o código de barras sin distinguir mayúsculas. Inactivar un producto no altera sus movimientos ni su existencia.

Los movimientos exponen `{ id, type, quantityChange, unitCost, referenceType, referenceId, notes, createdAt }`. El alta manual y la consulta global se describen en Inventario.

### Importación desde Excel

`POST /api/catalog/products/import` (solo `ADMIN`, `multipart/form-data`) crea los productos de un `.xlsx` que todavía no existen. Campos: `file` (hasta 5 MB; primera hoja; renglón 1 con encabezados), `dryRun` (`true` valida y reporta sin escribir) y `categoryMap` (JSON opcional). Encabezados reconocidos sin importar mayúsculas, acentos ni `*`: `articulo`, `descripcion`, `codigo de barras`, `stock`, `categoria`, `marca`, `precio compra`, `precio venta` (obligatorios: artículo, código, stock, categoría y precio de venta). Hasta 5000 renglones; los vacíos se ignoran.

- **Mismo producto** = mismo código de barras y mismo nombre (sin distinguir mayúsculas ni espacios). Si ya existe en el catálogo se omite; repetido en el archivo, gana el primero. Reimportar el mismo archivo no duplica nada.
- **Código compartido** por productos con nombres distintos (en el archivo o contra el catálogo): esos renglones no se importan y se reportan como error.
- **Normalización:** códigos numéricos de Excel pasan a texto entero (`7.503445E7` → `75034450`); se quita la marca de texto inicial (`´`, `'`) y se guardan en mayúsculas. Las categorías se guardan en mayúsculas y se reutilizan sin distinguir mayúsculas ni acentos; las que falten se crean. Stock > 0 crea un movimiento `ADJUSTMENT_IN` (`referenceType: 'IMPORT'`). Precio de compra vacío deja el costo en `null`.
- **`categoryMap`:** categoría del Excel → categoría destino, o `null` para importar sin categoría. Las llaves se comparan en mayúsculas y sin acentos.
- **Respuesta `200`:** `{ dryRun, totalRows, created, skipped[{ row, codigoBarras, articulo, reason }], errors[{ row, codigoBarras, articulo, message }], categoriesCreated[], withoutCategory }`. Archivo ausente, no `.xlsx`, inválido, mayor a 5 MB, sin columnas obligatorias o `categoryMap` inválido: `400`. Renglones válidos se escriben en una sola transacción.

Mapa acordado para `Inventario-Kamadeva.xlsx` (categorías en inglés sin categoría; FESTISH y ODY quedan cubiertas):

```json
{
  "FETISH": null,
  "FESTISH": null,
  "BODY": null,
  "ODY": null,
  "BABY DOLL": null,
  "DILDO": null,
  "PLUG": null,
  "PLUG ANAL": null,
  "PLUG ANAL VIBRADOR": null,
  "KEGEL": null,
  "BIKINI": null
}
```

Con ese mapa, sobre una base vacía: 672 renglones → 641 creados, 2 omitidos (duplicados en el archivo), 29 con error (27 por código compartido y 2 sin stock), 51 categorías creadas y 172 productos sin categoría.

### Cloudinary

Estas variables son obligatorias al arrancar y van exclusivamente en `.env` o en el gestor de secretos del despliegue:

| Variable                | Valor esperado                                 |
| ----------------------- | ---------------------------------------------- |
| `CLOUDINARY_CLOUD_NAME` | Nombre del entorno de productos de Cloudinary. |
| `CLOUDINARY_API_KEY`    | API key de ese entorno.                        |
| `CLOUDINARY_API_SECRET` | API secret correspondiente.                    |

Se acepta una imagen JPEG, PNG o WebP de hasta 5 MiB (5 × 1024 × 1024 bytes). Multer limita el multipart en memoria y la validación comprueba la firma del archivo además del MIME declarado. El SDK sube a `kamadeva/products` con `public_id = product-{id}`, `overwrite=true` e `invalidate=true`; se persiste únicamente `secure_url`. La siguiente carga reemplaza la imagen. Si el proveedor falla, se responde `502` y no se modifica la URL persistida. Eliminar un producto no elimina su imagen remota en este hito. Referencias: [subidas de Cloudinary](https://cloudinary.com/documentation/image_upload_api_reference) y [validación de archivos de Nest](https://docs.nestjs.com/techniques/file-upload).

La migración `20260913222113_product_extended_fields` agrega `brand`, `tallas` (texto libre) e `imageUrl`. `20261029180000_sales_sizes_folio_counter` copia esas tallas al catálogo y `20261029200000_drop_product_tallas` vuelve a copiarlas y elimina la columna. Aplicar las migraciones pendientes en el entorno correspondiente:

```bash
npx prisma migrate deploy --config prisma7.config.ts
npx prisma generate --config prisma7.config.ts
```

```bash
curl -i http://localhost:3000/api/catalog/products \
  -H 'Authorization: Bearer <accessToken ADMIN>' \
  -H 'Content-Type: application/json' \
  -d '{"codigoBarras":"7501234567890","articulo":"Anillo de plata","categoryId":"<uuid categoría>","precioCompra":780.25,"precioVenta":1250.50,"marca":"Kamadeva"}'

curl -i 'http://localhost:3000/api/catalog/products?search=anillo&includeInactive=true' \
  -H 'Authorization: Bearer <accessToken>'

curl -i http://localhost:3000/api/catalog/products/<id>/image \
  -H 'Authorization: Bearer <accessToken ADMIN>' \
  -F 'file=@/ruta/anillo.png'
```

Las pruebas unitarias sustituyen Prisma y el SDK. `test/catalog-products.e2e-spec.ts` usa PostgreSQL real temporal y sustituye `PRODUCT_IMAGES`: ninguna prueba llama a Cloudinary real. La suite mantiene un servidor HTTP durante su ejecución y limpia sus propios datos.

## Inventario

| Endpoint                                   | Permiso          | Contrato                                                                                                                                                                                          |
| ------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/catalog/products/:id/movements` | ADMIN            | `201`: movimiento manual; producto inexistente `404`.                                                                                                                                             |
| `GET /api/inventory/movements`             | ADMIN o VENDEDOR | `200`: lista por `createdAt` descendente, sin paginación. Filtros opcionales `productId` (UUID v4), `type`, `startDate` y `endDate` (ISO 8601, inclusivos). Producto filtrado inexistente: `404`. |

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

## Compras a proveedores

Registrar una compra significa recibirla completa. `POST` solo permite `ADMIN`; `ADMIN` y `VENDEDOR` pueden consultar el historial y el detalle. La compra, sus renglones y las entradas `PURCHASE_IN` se guardan en una transacción serializable. No se manejan pagos ni saldos pendientes.

| Endpoint                 | Permiso          | Entrada / resultado                                                                                                                                                                                                                                                                       |
| ------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/purchases`    | ADMIN            | Recibe `proveedorId`, `productos[]` (`productoId`, `cantidad`) y opcionalmente `fechaRecepcion`, `folioProveedor`, `notas`. `201`: compra con renglones y total calculado; proveedor/producto inexistente `404`; proveedor/producto inactivo `409`; costo de compra sin configurar `400`. |
| `GET /api/purchases`     | ADMIN o VENDEDOR | Filtros opcionales `proveedorId`, `fechaInicio`, `fechaFin`; paginación `pagina`/`limite`. Devuelve compras más recientes primero.                                                                                                                                                        |
| `GET /api/purchases/:id` | ADMIN o VENDEDOR | `200`: detalle de compra; inexistente `404`.                                                                                                                                                                                                                                              |

Cada renglón fotografía el `precioCompra` actual del producto como `costoUnitario`; el cuerpo de compra no acepta costo ni precio de venta. Subtotales y total se calculan en el servidor con dos decimales. La compra no cambia `precioCompra` ni `precioVenta`; para cambiar el costo hay que editar el producto. Cada entrada conserva la referencia a la compra y al usuario autenticado. Las compras recibidas no se editan ni borran; diferencias de inventario se corrigen con ajustes.

```bash
curl -i http://localhost:3000/api/purchases \
  -H 'Authorization: Bearer <accessToken ADMIN>' \
  -H 'Content-Type: application/json' \
  -d '{"proveedorId":"<uuid proveedor>","folioProveedor":"FAC-1842","productos":[{"productoId":"<uuid producto>","cantidad":10}]}'

curl -i 'http://localhost:3000/api/purchases?proveedorId=<uuid>&pagina=1&limite=20' \
  -H 'Authorization: Bearer <accessToken>'
```

## Ventas

Venta directa de mostrador, historial, detalle y cancelación en `/api/sales`. `ADMIN` y `VENDEDOR` pueden usar todos los endpoints. Sin token válido o con usuario inactivo: `401`; sin rol permitido: `403`. El stock es por producto; la talla es un dato del renglón.

| Endpoint                     | Entrada                                                                                                                                                                        | Resultado                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/sales`            | Header `Idempotency-Key` (UUID). Body: `customerId?`, `notes?`, `items[]` (`productId`, `sizeId?`, `quantity`, `discount?`, `tax?`), `payment` (`method`, `amount`)            | `201`: `SaleDetailDto`. Cliente/producto inexistente: `404`; producto inactivo, stock insuficiente, llave reutilizada con otro body u otro usuario: `409`; talla inválida o importe distinto del total: `400`. |
| `GET /api/sales`             | Query `startDate`, `endDate` (ISO 8601, inclusivos), `status`, `createdById`, `customerId`, `paymentMethod`, `folio` (exacto), `page` (≥1), `pageSize` (1–100, por defecto 20) | `200`: `{ data, total, page, pageSize }`, más recientes primero. Incluye ventas nacidas de cotizaciones. `startDate` posterior a `endDate`: `400`.                                                             |
| `GET /api/sales/:id`         | UUID                                                                                                                                                                           | `200`: `SaleDetailDto`; inexistente: `404`.                                                                                                                                                                    |
| `POST /api/sales/:id/cancel` | `reason` (1–500)                                                                                                                                                               | `200`: `SaleDetailDto` cancelada; repetir devuelve el mismo resultado sin mover stock otra vez. Inexistente: `404`; venta no completada: `409`.                                                                |

- **Precio y totales:** el precio unitario sale de `Product.price`; el cliente nunca lo envía. Total por renglón = precio × cantidad − descuento + impuesto; un descuento mayor que el subtotal del renglón produce `400`. `payment.amount` debe coincidir exactamente con el total (sin pagos parciales ni cambio).
- **Cliente:** si se omite `customerId` se usa el cliente por defecto "Público general".
- **Tallas:** obligatorias si el producto tiene tallas activas y deben ser suyas; prohibidas si no tiene.
- **Efectos:** en una sola transacción serializable se verifica el stock (sumando renglones repetidos del mismo producto), se reserva el folio `V-`, se guardan venta y renglones, un movimiento `SALE_OUT` por renglón y un pago `PAID`.
- **Idempotencia:** la respuesta se guarda en `IdempotencyKey` (scope `sales.create`, vigencia 24 h). Repetir la misma llave con el mismo body y usuario devuelve la venta original con el header `Idempotent-Replayed: true`, sin otra venta ni folio, incluso si las dos solicitudes llegan a la vez. La llave no distingue mayúsculas.
- **Cancelación:** cambia el estado a `CANCELLED`, registra quién, cuándo y por qué, crea un movimiento `RETURN_IN` por renglón (`referenceType: 'SALE_CANCEL'`) y marca los pagos `PAID` como `REFUNDED`. Una venta nacida de una cotización se puede cancelar; la cotización conserva `CONVERTED`. No hay cancelación parcial.

`SaleDetailDto`: `{ id, folio, status, customer, createdBy, quoteId, notes, subtotal, discount, tax, total, items[], payments[], cancelledAt, cancelledBy, cancelReason, createdAt, updatedAt }`; `customer`, `createdBy` y `cancelledBy` son `{ id, name }`; cada renglón incluye `product { id, barcode, name }` y `size { id, name } | null`. Los montos son strings con dos decimales y las cantidades con tres. `test/sales.e2e-spec.ts` cubre el contrato con PostgreSQL temporal.

## Gastos operativos

Registro y consulta de egresos. Cada gasto pertenece a una categoría del catálogo editable y puede marcarse como descontado de la caja física (`deductFromCash`), dato que usará el corte de caja. Sin token válido o con usuario inactivo: `401`; sin rol permitido: `403`.

| Endpoint                             | Permiso          | Entrada / resultado                                                                                                                                                                               |
| ------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/expense-categories`       | ADMIN            | `name` (1–100). `201`: `{ id, name, isActive }`; repetido sin distinguir mayúsculas: `409`.                                                                                                       |
| `GET /api/expense-categories`        | ADMIN o VENDEDOR | Query `includeInactive`. `200` por nombre; por defecto solo activas.                                                                                                                              |
| `GET /api/expense-categories/:id`    | ADMIN o VENDEDOR | `200`; inexistente: `404`.                                                                                                                                                                        |
| `PATCH /api/expense-categories/:id`  | ADMIN            | `name` y/o `isActive`. `200`; repetido: `409`; inexistente: `404`.                                                                                                                                |
| `DELETE /api/expense-categories/:id` | ADMIN            | `204`; con gastos: `409` (desactivarla en su lugar); inexistente: `404`.                                                                                                                          |
| `POST /api/expenses`                 | ADMIN o VENDEDOR | `concept` (1–255), `amount` (> 0, 2 decimales), `categoryId` (activa), opcionales `deductFromCash` (por defecto `false`), `spentAt` (por defecto ahora; no futura), `notes`. `201`: `ExpenseDto`. |
| `GET /api/expenses`                  | ADMIN o VENDEDOR | Query `startDate`, `endDate` (sobre `spentAt`, inclusivos), `categoryId`, `createdById`, `deductFromCash`, `page`, `pageSize`. `200`: `{ data, total, page, pageSize, totalAmount }`.             |
| `GET /api/expenses/:id`              | ADMIN o VENDEDOR | `200`: `ExpenseDto`; inexistente: `404`.                                                                                                                                                          |
| `DELETE /api/expenses/:id`           | ADMIN            | `204`; incluido en un corte de caja: `409`; inexistente: `404`.                                                                                                                                   |

`ExpenseDto`: `{ id, concept, amount, deductFromCash, spentAt, category: { id, name }, createdBy: { id, name }, notes, createdAt, updatedAt }`. El autor es siempre el usuario autenticado. `totalAmount` suma todo el filtro, no solo la página. La lista se ordena por `spentAt` descendente. No hay edición: un error de captura se corrige borrando (ADMIN) y registrando de nuevo. La migración `20261030120000_expenses` crea las categorías iniciales Servicios, Insumos y Otros. Un usuario con gastos registrados, o que canceló ventas, no se puede eliminar (`409`). `test/expenses.e2e-spec.ts` cubre el contrato con PostgreSQL temporal.

## Cortes de caja

Corte de caja de toda la tienda sin abrir turno: cada corte cubre todo lo pendiente desde el corte anterior. El servidor calcula ventas, reembolsos, gastos y lo esperado; el vendedor solo captura el conteo por denominaciones, ajustes (dinero que entró sin registrarse o que se usó para otra cosa) y el fondo que deja. `ADMIN` y `VENDEDOR` usan todos los endpoints; no hay edición ni borrado de cortes.

| Endpoint                                 | Entrada / resultado                                                                                                                                                                                                               |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/cash-closures/current-summary` | Lo pendiente: `previousClosureId`, `periodStart`, `openingFloat`, `sales` por método, `refunds`, `expenses` y `expectedCash` antes de ajustes. No escribe nada.                                                                   |
| `POST /api/cash-closures`                | `previousClosureId` (del resumen; `null` en el primer corte), `denominations`, `adjustments?` (`INCOME`/`WITHDRAWAL`, máx. 50), `floatLeft`, `notes?`. `201`: `CashClosureDto`. Resumen desactualizado o corte simultáneo: `409`. |
| `GET /api/cash-closures`                 | Query `startDate`, `endDate` (sobre `closedAt`), `page`, `pageSize`. `200`: `{ data, total, page, pageSize }`, más recientes primero.                                                                                             |
| `GET /api/cash-closures/:id`             | `200`: `CashClosureDto`; inexistente: `404`.                                                                                                                                                                                      |

```
esperado   = fondo inicial + ventas en efectivo − reembolsos en efectivo − gastos de caja + entradas − salidas
contado    = Σ denominación × piezas      (1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5)
diferencia = contado − esperado           (positivo sobrante, negativo faltante)
retirado   = contado − fondo dejado
```

- **Fondo:** `floatLeft` (≤ contado) se vuelve el `openingFloat` del siguiente corte; el primer corte empieza en `0`.
- **Contar una sola vez:** cada pago, reembolso y gasto queda ligado al corte que lo contó (`Payment.cashClosureId`, `Payment.refundClosureId`, `Expense.cashClosureId`). Un corte toma solo lo que aún no tiene corte; una venta confirmada mientras se ejecuta el corte queda para el siguiente. Una venta cobrada y cancelada en el mismo periodo se compensa; si se cancela después, el reembolso sale en el corte en que se canceló.
- **Gastos:** el corte liga todos los gastos pendientes; `expenses.cash` suma solo los `deductFromCash`. Un gasto ya incluido en un corte no se puede borrar (`409`). `GET /api/expenses` acepta `pendingClosure=true|false` y `cashClosureId`, y `ExpenseDto` expone `cashClosureId`.
- **Historial previo:** pagos y gastos anteriores a esta función quedan pendientes, así que el primer corte los incluye todos.
- Un usuario que hizo cortes no se puede eliminar (`409`).

`test/cash-closures.e2e-spec.ts` cubre el contrato con PostgreSQL temporal, incluida una venta confirmada en otra conexión mientras el corte está en curso.

## Dashboard

Métricas para la pantalla principal. "Hoy", la semana (lunes a domingo) y el mes se calculan en la zona horaria del negocio (`BUSINESS_TIMEZONE`), no en UTC: una venta a las 23:30 hora local cuenta en ese día. Solo cuentan ventas `COMPLETED` (por `createdAt`); los gastos se agrupan por `spentAt`. `ADMIN` y `VENDEDOR` pueden consultar todo; la utilidad estimada solo la recibe `ADMIN`.

| Endpoint                           | Query                                                                                                               | Resultado                                                                                                                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/dashboard/summary`       | —                                                                                                                   | `date`, `timezone`, `salesToday` (`total`, `count`, `averageTicket`, `byMethod`), `inventory` (`activeProducts`, `lowStock`), `expensesToday` (`total`, `fromCash`), `estimatedProfitToday` (`null` para VENDEDOR). |
| `GET /api/dashboard/top-products`  | `startDate`, `endDate` (por defecto inicio del mes local → ahora), `limit` (1–50, 10), `sortBy` (`units`/`revenue`) | `{ startDate, endDate, sortBy, data: [{ product: { id, barcode, name }, units, revenue, salesCount }] }`. `salesCount` cuenta ventas distintas.                                                                     |
| `GET /api/dashboard/sales-history` | `period` (`week`/`month`, por defecto `week`)                                                                       | `{ period, timezone, days: [{ date, salesTotal, salesCount, expensesTotal }] }` con todos los días del periodo, incluidos futuros o sin movimiento.                                                                 |

- **Stock bajo:** productos activos con `stockMinimo` y `stock ≤ stockMinimo`; sin mínimo no se cuentan.
- **Utilidad estimada:** `netSales` (Σ total − impuesto) − `costOfGoods` − gastos del día. El costo sale de `SaleItem.unitCost`, una foto de `Product.cost` al registrar la venta (cambiar el costo después no altera ventas pasadas); ventas anteriores a la foto usan el costo actual. Si algún producto vendido no tiene costo cuenta como 0 y `costIncomplete` es `true`.
- Las consultas comparan fechas con literales UTC explícitos, así que no dependen de la zona horaria de la sesión de PostgreSQL.

`test/dashboard.e2e-spec.ts` cubre el contrato con PostgreSQL temporal, incluidas ventas a ambos lados de la medianoche local.

## Configuración del negocio

Identidad comercial y fiscal impresa en tickets. Existe un solo registro. `ADMIN` y `VENDEDOR` la consultan; solo `ADMIN` la guarda. Sin token válido: `401`; sin rol permitido: `403`.

| Endpoint                   | Permiso          | Entrada / resultado                                                                                                             |
| -------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/business-config` | ADMIN o VENDEDOR | `200`: `{ nombre, direccion, colonia, municipio, estado, telefono, rfc, mensajePie, updatedAt }`; antes de configurarla: `404`. |
| `PUT /api/business-config` | ADMIN            | Los 8 campos obligatorios (reemplazo completo). `200`: misma forma. Faltante, vacío, inválido o campo desconocido: `400`.       |

Reglas (todos se recortan): `nombre` 1–150; `direccion` 1–255; `colonia`, `municipio` y `estado` 1–100; `telefono` hasta 50 con dígitos y separadores (`espacio + - ( ) .`) y al menos 7 dígitos; `rfc` en mayúsculas con formato mexicano de 12 (moral) o 13 (física) caracteres, p. ej. `KAM210315ABC` o `XAXX010101000`; `mensajePie` 1–500 y admite saltos de línea. Las llaves JSON coinciden con el modelo `BusinessConfigModel` de la app; en la base las columnas están en inglés. `PUT` hace un upsert atómico sobre la llave fija, así que guardados simultáneos no crean un segundo registro. `test/business-config.e2e-spec.ts` cubre el contrato.

## Proveedores

Directorio de proveedores. `ADMIN` escribe; `ADMIN` y `VENDEDOR` leen. Sin token válido: `401`; sin rol permitido: `403`.

| Endpoint                    | Entrada / resultado                                                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/providers`       | `nombre`; opcionales `telefono`, `email`, `contacto`, `direccion`. `201`: `ProviderDto`; nombre repetido sin distinguir mayúsculas: `409`. |
| `GET /api/providers`        | Query `search` (nombre, contacto, correo o teléfono) e `includeInactive`. `200` por nombre; por defecto solo activos.                      |
| `GET /api/providers/:id`    | `200`: `ProviderDto`, incluso inactivo; inexistente: `404`.                                                                                |
| `PATCH /api/providers/:id`  | Al menos un campo o `isActive`; `null` borra un opcional. `200`; inexistente: `404`; nombre repetido: `409`.                               |
| `DELETE /api/providers/:id` | `204`; inexistente: `404`.                                                                                                                 |

`ProviderDto`: `{ id, nombre, telefono, email, contacto, direccion, isActive, createdAt, updatedAt }`, con las llaves del modelo `ProviderModel` de la app (columnas en inglés en la base). Reglas (todo se recorta; opcionales vacíos quedan en `null`): `nombre` 1–150; `telefono` hasta 30 con dígitos y separadores y al menos 7 dígitos; `email` válido en minúsculas, hasta 150; `contacto` hasta 100; `direccion` hasta 255. `test/providers.e2e-spec.ts` cubre el contrato.

## Arquitectura Limpia y Modular (Clean Architecture)

Los módulos transaccionales de cotizaciones (`src/quotes/`) y ventas (`src/sales/`) implementan **Modular Clean Architecture (Ports & Adapters)** con cuatro capas concéntricas. Lo compartido vive en `src/common/`: value objects (`Money`, `Quantity`, `Folio`), `DomainException`, y los puertos `UnitOfWorkPort` y `FolioSequencePort` con sus adaptadores Prisma. `QuotesModule` importa `SalesModule`: pagar una cotización usa `RegisterSaleUseCase`, el mismo registro de venta (stock, folio, movimientos y pago) que la venta directa.

1. **`domain/`**: Entidades y agregados puros (`QuoteAggregate`, `QuoteItem`; en ventas, `SaleAggregate` con la regla de cancelación), excepciones de negocio (`QuoteExpiredException`, `InsufficientStockException`) y eventos de dominio (`QuoteConvertedToSaleEvent`). Cero dependencias de NestJS o Prisma.
2. **`application/`**: Casos de uso de responsabilidad única (`CreateQuoteUseCase`, `PayQuoteUseCase`, `SendQuoteUseCase`, `UpdateQuoteUseCase`, `DeleteQuoteUseCase`; en ventas `RegisterSaleUseCase`, `CreateSaleUseCase`, `CancelSaleUseCase`, `GetSaleUseCase`, `ListSalesUseCase`) y puertos límite (`QuoteRepositoryPort`, `EventPublisherPort`; en ventas `SaleRepositoryPort`, `InventoryQueryPort`, `SaleCatalogPort`, `SaleQueryPort`, `IdempotencyStorePort`).
3. **`infrastructure/`**: Adaptadores secundarios que implementan los puertos (`PrismaQuoteRepository`, `PrismaUnitOfWorkAdapter` con traducción de errores de cotización, `NestEventEmitterAdapter`; en ventas `PrismaSaleRepository`, `PrismaInventoryQueryAdapter`, `PrismaSaleCatalogAdapter`, `PrismaSaleQueryAdapter` y `PrismaIdempotencyStore`).
4. **`presentation/`**: `QuotesController` / `SalesController` y DTOs públicos de Swagger que delegan a los casos de uso y traducen errores de dominio mediante `handleDomainError` / `handleSaleError`.

### Folios

Cotizaciones y ventas nuevas reciben un folio consecutivo sin huecos: `C-000045` para cotizaciones y `V-000123` para ventas (seis dígitos con ceros a la izquierda; crece a siete o más al pasar de 999999). El número sale de `folio_counters` (`prefix` `C` o `V`) mediante un incremento atómico dentro de la misma transacción serializable que guarda el registro: si la operación falla, el número no se consume. Los registros anteriores conservan su folio aleatorio (`COT-AAAAMMDD-XXXXXX`, `VEN-AAAAMMDD-XXXXXX`) y siguen siendo válidos.

Una colisión de folio (solo posible si el contador queda por detrás de los datos) responde `409` sin reintentar, porque el reintento reservaría el mismo número. Las transacciones que compiten por el contador se resuelven con los reintentos serializables, que esperan un tiempo aleatorio creciente entre intentos (máximo cinco). Si se agotan, cualquier escritura serializable de la API responde `409` con el mensaje `Conflicto de concurrencia, intente de nuevo` (antes, `500`). Medido sobre PostgreSQL local: 8 altas simultáneas se completan; con 16 simultáneas alrededor de una responde ese `409`.

### Eventos de Dominio y Extensibilidad

El sistema publica eventos de dominio en memoria mediante `@nestjs/event-emitter` (`EventPublisherPort`). Nuevos módulos (por ejemplo, facturación electrónica, envío de WhatsApp o analítica) pueden suscribirse a eventos como `quote.converted-to-sale` sin necesidad de acoplarse ni inyectar servicios del módulo de ventas.
