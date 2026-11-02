# Especificación de Servicios Backend - Kamadeva System

Este documento recopila la lista completa y actualizada de **servicios, módulos, endpoints y contratos públicos de campos en español** del backend de Kamadeva System (Punto de Venta e Inventario Retail Multiplataforma).

---

## 1. Resumen Arquitectónico

- **Base URL local:** `http://localhost:3000/api`
- **Prefijo HTTP global:** `/api`
- **Documentación Swagger / OpenAPI:** `http://localhost:3000/api/docs`
- **Autenticación:** Bearer Token JWT en el encabezado HTTP `Authorization: Bearer <tokenAcceso>`.
- **Formato de Comunicación:** JSON (`Content-Type: application/json`).
- **Formato de Fechas:** ISO-8601 UTC (`YYYY-MM-DDTHH:mm:ss.sssZ`).
- **Capa de Adaptación de Contrato en Español:**
  - El backend cuenta con middleware e interceptor (`src/common/validation/spanish-api-contract.ts`) que exponen y consumen las claves públicas de parámetros, query params y bodies enteramente en **español** (`nombre`, `correo`, `contrasena`, `tokenAcceso`, `tokenRenovacion`, `existencias`, `precioVenta`, `precioCompra`, etc.).
  - Las respuestas serializan las propiedades traducidas al español de forma transparente.
- **Estrategia Transaccional y de Concurrencia:**
  - **Punto de Venta (`/api/ventas`):** Exige cabecera obligatoria `Idempotency-Key` (UUID v4) para garantizar cobros e impactos de inventario exactamente una sola vez. Ejecuta transacciones serializables en PostgreSQL bloqueando registros de existencias.
  - **Inventario Derivado (Event Sourcing / Kardex):** No existe un campo de stock modificable por un `UPDATE` directo. El balance de existencias de un producto se deriva estrictamente de la sumatoria de movimientos (`InventoryMovement.quantityChange`: `PURCHASE_IN`, `SALE_OUT`, `RETURN_IN`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`).
  - **Cortes de Caja en Cadena (`/api/cortes-caja`):** Arquitectura inmutable encadenada (`corteAnteriorId` único). El fondo dejado en caja (`fondoDejado`) al sellar un corte pasa automáticamente como el fondo inicial (`fondoInicial`) del siguiente corte.
  - **Control de Acceso Basado en Roles (RBAC):** Roles `ADMIN` y `VENDEDOR`. El primer usuario registrado adquiere automáticamente el rol `ADMIN`.

---

## 2. Mapa Rápido de Microservicios y Módulos

```mermaid
graph TD
    GW[API Gateway / NestJS App Router /api] --> AUTH[Autenticación /api/autenticacion]
    GW --> USERS[Usuarios y Roles /api/usuarios | /api/roles]
    GW --> BIZ[Configuración del Negocio /api/configuracion-negocio]
    GW --> CAT_CAT[Catálogo: Categorías /api/catalogo/categorias]
    GW --> CAT_SIZ[Catálogo: Tallas /api/catalogo/tallas]
    GW --> PROD[Productos e Importación /api/productos | /api/productos/importacion]
    GW --> INV[Inventario y Kardex /api/inventario/movimientos | /api/productos/:id/movimientos]
    GW --> CUST[Clientes /api/clientes]
    GW --> PROV[Proveedores /api/proveedores]
    GW --> PURCH[Compras Recibidas /api/compras]
    GW --> SORD[Pedidos a Proveedores /api/pedidos-proveedores]
    GW --> SALES[Punto de Venta /api/ventas]
    GW --> QUOTE[Cotizaciones /api/cotizaciones]
    GW --> EXP[Gastos y Categorías /api/gastos | /api/categorias-gastos]
    GW --> CASH[Cortes de Caja /api/cortes-caja]
    GW --> DASH[Tablero y Analítica /api/tablero]
```

---

## 3. Catálogo Detallado por Módulo y Servicio

---

### MÓDULO 1: Autenticación (`/api/autenticacion`)
Gestiona el registro inicial, inicio de sesión seguro mediante JWT, rotación atómica de refresh tokens hasheados y cierre de sesión idempotente.

#### Endpoints
1. **`POST /api/autenticacion/registro`**
   - **Permiso:** Público.
   - **Lógica:** El primer usuario del sistema se crea como `ADMIN`; los siguientes como `VENDEDOR`.
   - **Body:**
     ```json
     {
       "nombre": "Carlos López",
       "correo": "carlos@kamadeva.com",
       "contrasena": "Password123!"
     }
     ```
   - **Respuesta (201):**
     ```json
     {
       "tokenAcceso": "eyJhbGciOi...",
       "tokenRenovacion": "d8b3e2a1-...",
       "usuario": {
         "id": "c1f7b020-0000-4000-a000-000000000001",
         "nombre": "Carlos López",
         "correo": "carlos@kamadeva.com",
         "roles": ["ADMIN"],
         "activo": true,
         "fechaCreacion": "2026-10-30T10:00:00.000Z"
       }
     }
     ```
2. **`POST /api/autenticacion/login`**
   - **Permiso:** Público.
   - **Body:** `{ "correo": string, "contrasena": string }`
   - **Respuesta (200):** Misma estructura de sesión `{ tokenAcceso, tokenRenovacion, usuario }`.
3. **`POST /api/autenticacion/refresh`**
   - **Permiso:** Público.
   - **Body:** `{ "tokenRenovacion": string }`
   - **Respuesta (200):** `{ "tokenAcceso": string, "tokenRenovacion": string }`
4. **`POST /api/autenticacion/logout`**
   - **Permiso:** Público (idempotente).
   - **Body:** `{ "tokenRenovacion": string }`
   - **Respuesta (204):** Sin contenido.

---

### MÓDULO 2: Administración de Usuarios y Roles (`/api/usuarios` y `/api/roles`)
Gestión del personal de tienda, consulta y asignación de roles.

#### Endpoints de Usuarios (`/api/usuarios`)
- **Guard:** `JwtAuthGuard`, `RolesGuard` (Requiere rol `ADMIN`).
1. **`GET /api/usuarios`**
   - **Query Parameters:** `pagina` (int), `limite` (int), `busqueda` (string), `incluirInactivos` (boolean), `rol` ('ADMIN'|'VENDEDOR').
   - **Respuesta (200):**
     ```json
     {
       "datos": [
         {
           "id": "c1f7b020-0000-4000-a000-000000000001",
           "nombre": "Carlos López",
           "correo": "carlos@kamadeva.com",
           "roles": ["ADMIN"],
           "activo": true,
           "fechaCreacion": "2026-10-30T10:00:00.000Z",
           "fechaActualizacion": "2026-10-30T10:00:00.000Z"
         }
       ],
       "total": 1,
       "pagina": 1,
       "limite": 20
     }
     ```
2. **`GET /api/usuarios/:usuarioId/roles`** -> Retorna roles del usuario `{ "roles": ["ADMIN"] }`.
3. **`PUT /api/usuarios/:usuarioId/roles`** -> Body: `{ "roles": ["ADMIN", "VENDEDOR"] }`. Protege contra eliminación del último administrador.
4. **`DELETE /api/usuarios/:usuarioId/roles/:nombreRol`** -> Remueve un rol específico (204).
5. **`DELETE /api/usuarios/:usuarioId`** -> Elimina usuario y revoca sesiones (204).

#### Endpoints de Roles (`/api/roles`)
- **`GET /api/roles`** -> Retorna `[{ "id": "uuid", "nombre": "ADMIN", "descripcion": "Administrador del sistema", "activo": true }]`.

---

### MÓDULO 3: Configuración del Negocio (`/api/configuracion-negocio`)
Datos fiscales, comerciales y leyenda de pie de ticket impreso. Registro único (`key = 'default'`).

#### Endpoints
- **Guard:** `JwtAuthGuard`, `RolesGuard` (`ADMIN` y `VENDEDOR` para lectura, solo `ADMIN` para actualización).
1. **`GET /api/configuracion-negocio`**
   - **Respuesta (200):**
     ```json
     {
       "nombre": "Kamadeva Boutique & Streetwear",
       "direccion": "Av. Insurgentes Sur #450 Int. 2B",
       "colonia": "Roma Sur",
       "municipio": "Cuauhtémoc",
       "estado": "Ciudad de México",
       "telefono": "55-1234-5678",
       "rfc": "KAM210315ABC",
       "mensajePie": "¡GRACIAS POR SU COMPRA! SÍGUENOS EN @KAMADEVA_MX",
       "fechaActualizacion": "2026-10-30T10:00:00.000Z"
     }
     ```
2. **`PUT /api/configuracion-negocio`**
   - **Body:** Los 8 campos comerciales y fiscales (`nombre`, `direccion`, `colonia`, `municipio`, `estado`, `telefono`, `rfc`, `mensajePie`).
   - **Respuesta (200):** Configuración actualizada.

---

### MÓDULO 4: Catálogo de Categorías (`/api/catalogo/categorias`)
Clasificación de productos con generación y validación de `slug` único.

#### Endpoints
- **Guard:** `JwtAuthGuard`, `RolesGuard` (`ADMIN` o `VENDEDOR` lectura; solo `ADMIN` escritura).
1. **`GET /api/catalogo/categorias`**
   - **Query Parameters:** `incluirInactivos=true|false`.
   - **Respuesta (200):**
     ```json
     [
       {
         "id": "cat-uuid-001",
         "nombre": "PLAYERAS",
         "slug": "playeras",
         "descripcion": "Playeras oversize y streetwear",
         "activo": true,
         "fechaCreacion": "2026-10-30T10:00:00.000Z",
         "fechaActualizacion": "2026-10-30T10:00:00.000Z"
       }
     ]
     ```
2. **`POST /api/catalogo/categorias`** -> Body: `{ "nombre": string, "descripcion"?: string, "activo"?: boolean, "slug"?: string }`.
3. **`GET /api/catalogo/categorias/:id`** -> Retorna el detalle de la categoría.
4. **`PATCH /api/catalogo/categorias/:id`** -> Actualización parcial.
5. **`DELETE /api/catalogo/categorias/:id`** -> Eliminación física (falla con 409 si tiene productos asociados).

---

### MÓDULO 5: Catálogo de Tallas (`/api/catalogo/tallas`)
Tallas normalizadas ordenables mediante índice `orden` (`sortOrder`).

#### Endpoints
- **Guard:** `JwtAuthGuard`, `RolesGuard` (`ADMIN` o `VENDEDOR` lectura; solo `ADMIN` escritura).
1. **`GET /api/catalogo/tallas`**
   - **Query Parameters:** `incluirInactivos=true|false`.
   - **Respuesta (200):**
     ```json
     [
       {
         "id": "size-uuid-001",
         "nombre": "CH",
         "orden": 1,
         "activo": true,
         "fechaCreacion": "2026-10-30T10:00:00.000Z",
         "fechaActualizacion": "2026-10-30T10:00:00.000Z"
       }
     ]
     ```
2. **`POST /api/catalogo/tallas`** -> Body: `{ "nombre": string, "orden"?: number, "activo"?: boolean }`.
3. **`GET /api/catalogo/tallas/:id`** -> Retorna la talla solicitada.
4. **`PATCH /api/catalogo/tallas/:id`** -> Actualización de datos u orden.
5. **`DELETE /api/catalogo/tallas/:id`** -> Falla con 409 si está asignada a productos, cotizaciones o ventas.

---

### MÓDULO 6: Catálogo de Productos e Importación (`/api/productos`)
Control de artículos, código de barras, fotos en Cloudinary e ingesta masiva desde archivos `.xlsx`.

#### Endpoints
- **Guard:** `JwtAuthGuard`, `RolesGuard` (`ADMIN` o `VENDEDOR` lectura; solo `ADMIN` escritura).
1. **`GET /api/productos`**
   - **Query Parameters:** `busqueda` (código de barras o nombre), `categoriaId` (UUID), `productosBajoMinimo=true|false`, `incluirInactivos=true|false`.
   - **Respuesta (200):**
     ```json
     [
       {
         "id": "prod-uuid-001",
         "articulo": "Playera Kamadeva Acid Wash",
         "descripcion": "Corte oversize 100% algodón",
         "codigoBarras": "7501234567890",
         "marca": "Kamadeva",
         "tallas": [
           { "id": "size-uuid-001", "nombre": "CH", "orden": 1 },
           { "id": "size-uuid-002", "nombre": "M", "orden": 2 }
         ],
         "precioCompra": "250.00",
         "precioVenta": "599.00",
         "existencias": "15.000",
         "existenciaMinima": "5.000",
         "urlImagen": "https://res.cloudinary.com/.../prod.jpg",
         "activo": true,
         "categoria": {
           "id": "cat-uuid-001",
           "nombre": "PLAYERAS",
           "slug": "playeras"
         },
         "fechaCreacion": "2026-10-30T10:00:00.000Z",
         "fechaActualizacion": "2026-10-30T10:00:00.000Z"
       }
     ]
     ```
2. **`POST /api/productos`**
   - **Body:**
     ```json
     {
       "codigoBarras": "7501234567890",
       "articulo": "Playera Kamadeva Acid Wash",
       "descripcion": "Corte oversize 100% algodón",
       "marca": "Kamadeva",
       "precioVenta": 599.00,
       "precioCompra": 250.00,
       "existencias": 15,
       "existenciaMinima": 5,
       "categoriaId": "cat-uuid-001",
       "tallaIds": ["size-uuid-001", "size-uuid-002"]
     }
     ```
   - **Lógica:** Si se provee `existencias > 0`, crea atómicamente un movimiento de inventario inicial (`ADJUSTMENT_IN`).
3. **`GET /api/productos/:id`** -> Detalle del producto.
4. **`PATCH /api/productos/:id`** -> Actualización de datos. Si se modifica `existencias`, calcula la diferencia y genera `ADJUSTMENT_IN` o `ADJUSTMENT_OUT`.
5. **`DELETE /api/productos/:id`** -> Borrado lógico o físico (falla con 409 si tiene ventas, compras o cotizaciones).
6. **`POST /api/productos/:id/image`**
   - **Content-Type:** `multipart/form-data`.
   - **Campo:** `file` (JPEG, PNG o WebP hasta 5 MB).
   - **Lógica:** Sube la fotografía a Cloudinary y persiste la URL optimizada en `urlImagen`.
7. **`POST /api/productos/importacion`**
   - **Content-Type:** `multipart/form-data`.
   - **Campos:** `file` (archivo `.xlsx` hasta 5 MB), `vistaPrevia` (`'true'|'false'`), `mapaCategorias` (JSON string opcional).
   - **Respuesta (200):** Reporte de importación `{ totalRenglones, categoriasCreadas, productos, sinCategoria }`.

---

### MÓDULO 7: Inventario y Auditoría Kardex (`/api/inventario/movimientos` y `/api/productos/:id/movimientos`)
Auditoría cronológica inmutable de existencias físicas derivadas.

#### Endpoints
- **Guard:** `JwtAuthGuard`, `RolesGuard` (`ADMIN` o `VENDEDOR` lectura; solo `ADMIN` creación manual).
1. **`GET /api/inventario/movimientos`**
   - **Query Parameters:** `productoId` (UUID), `tipo` (`PURCHASE_IN`|`SALE_OUT`|`RETURN_IN`|`ADJUSTMENT_IN`|`ADJUSTMENT_OUT`), `fechaInicio` (ISO), `fechaFin` (ISO).
   - **Respuesta (200):**
     ```json
     [
       {
         "id": "mov-uuid-001",
         "tipo": "SALE_OUT",
         "cambioExistencias": "-2.000",
         "costoUnitario": "250.00",
         "tipoReferencia": "SaleItem",
         "referenciaId": "sale-item-uuid-001",
         "notas": null,
         "fechaCreacion": "2026-10-30T12:00:00.000Z"
       }
     ]
     ```
2. **`GET /api/productos/:id/movimientos`** -> Historial Kardex filtrado específicamente para un producto.
3. **`POST /api/productos/:productoId/movimientos`**
   - **Body:**
     ```json
     {
       "tipo": "ADJUSTMENT_IN",
       "cantidad": 5,
       "costoUnitario": 250.00,
       "notas": "Ajuste por conteo físico en tienda"
     }
     ```

---

### MÓDULO 8: Directorio de Clientes (`/api/clientes`)
Registro de clientes para emisión de cotizaciones y tickets personalizados.

#### Endpoints
- **Guard:** `JwtAuthGuard`, `RolesGuard` (`ADMIN` o `VENDEDOR` lectura; solo `ADMIN` escritura).
1. **`GET /api/clientes`**
   - **Query Parameters:** `busqueda` (nombre o correo), `incluirInactivos` (boolean).
   - **Respuesta (200):**
     ```json
     [
       {
         "id": "cust-uuid-001",
         "nombre": "Ana Pérez",
         "telefono": "5512345678",
         "correo": "ana@ejemplo.com",
         "activo": true,
         "fechaCreacion": "2026-10-30T10:00:00.000Z",
         "fechaActualizacion": "2026-10-30T10:00:00.000Z"
       }
     ]
     ```
2. **`POST /api/clientes`** -> Body: `{ "nombre": string, "telefono"?: string, "correo"?: string, "activo"?: boolean }`.
3. **`GET /api/clientes/:id`** -> Detalle del cliente.
4. **`PATCH /api/clientes/:id`** -> Actualización de datos.
5. **`DELETE /api/clientes/:id`** -> Falla con 409 si es cliente predeterminado o tiene ventas/cotizaciones.

---

### MÓDULO 9: Directorio de Proveedores (`/api/proveedores`)
Gestión de contactos comerciales mayoristas y fabricantes.

#### Endpoints
- **Guard:** `JwtAuthGuard`, `RolesGuard` (`ADMIN` o `VENDEDOR` lectura; solo `ADMIN` escritura).
1. **`GET /api/proveedores`**
   - **Query Parameters:** `busqueda`, `incluirInactivos`.
   - **Respuesta (200):**
     ```json
     [
       {
         "id": "prov-uuid-001",
         "nombre": "Textiles del Norte SA de CV",
         "telefono": "8181234567",
         "correo": "ventas@textilesnorte.com",
         "nombreContacto": "Lic. Roberto Garza",
         "direccion": "Parque Industrial Monterrey",
         "activo": true,
         "fechaCreacion": "2026-10-30T10:00:00.000Z",
         "fechaActualizacion": "2026-10-30T10:00:00.000Z"
       }
     ]
     ```
2. **`POST /api/proveedores`** -> Body: `{ "nombre": string, "telefono"?: string, "correo"?: string, "nombreContacto"?: string, "direccion"?: string, "activo"?: boolean }`.
3. **`GET /api/proveedores/:id`** -> Consulta por ID.
4. **`PATCH /api/proveedores/:id`** -> Modificación de datos.
5. **`DELETE /api/proveedores/:id`** -> Eliminación lógica/física.

---

### MÓDULO 10: Compras Recibidas (`/api/compras`)
Registro de mercancía recibida de proveedores con impacto inmediato en el inventario.

#### Endpoints
- **Guard:** `JwtAuthGuard`, `RolesGuard` (`ADMIN` o `VENDEDOR` lectura; solo `ADMIN` creación).
1. **`POST /api/compras`**
   - **Body:**
     ```json
     {
       "proveedorId": "prov-uuid-001",
       "fechaRecepcion": "2026-10-30T11:00:00.000Z",
       "folioProveedor": "FAC-2026-981",
       "notas": "Recepción de pedido semanal",
       "productos": [
         {
           "productoId": "prod-uuid-001",
           "cantidad": 20
         }
       ]
     }
     ```
   - **Lógica Transaccional:** Genera el registro de compra, copia los costos vigentes del producto, calcula subtotales y crea movimientos atómicos de tipo `PURCHASE_IN` en el Kardex.
2. **`GET /api/compras`**
   - **Query Parameters:** `pagina`, `limite`, `proveedorId`, `fechaInicio`, `fechaFin`.
   - **Respuesta (200):** `{ "datos": [...], "pagina": 1, "limite": 20, "total": 1 }`.
3. **`GET /api/compras/:id`** -> Retorna el detalle completo con desglose de productos y proveedor.

---

### MÓDULO 11: Pedidos a Proveedores (`/api/pedidos-proveedores`)
Pedidos prepagados u órdenes de compra con soporte para recepciones parciales o totales.

#### Endpoints
- **Guard:** `JwtAuthGuard`, `RolesGuard` (`ADMIN` o `VENDEDOR` lectura; solo `ADMIN` creación/recepción/cancelación).
1. **`POST /api/pedidos-proveedores`**
   - **Body:** `{ "proveedorId": string, "fechaEsperada"?: string, "folioProveedor"?: string, "notas"?: string, "productos": [{ "productoId": string, "cantidad": number }] }`
   - **Estado Inicial:** `ORDERED`.
2. **`GET /api/pedidos-proveedores`**
   - **Query Parameters:** `pagina`, `limite`, `proveedorId`, `estado` ('ORDERED'|'PARTIALLY_RECEIVED'|'RECEIVED'|'CANCELLED'), `fechaInicio`, `fechaFin`.
3. **`GET /api/pedidos-proveedores/:id`** -> Consulta de pedido y balance de recepciones.
4. **`POST /api/pedidos-proveedores/:id/recepciones`**
   - **Body:**
     ```json
     {
       "fechaRecepcion": "2026-10-30T15:00:00.000Z",
       "folioProveedor": "REM-4451",
       "notas": "Primera entrega parcial",
       "productos": [
         {
           "pedidoProductoId": "order-item-uuid-001",
           "cantidad": 10
         }
       ]
     }
     ```
   - **Lógica:** Genera un registro de compra (`Purchase`), movimientos `PURCHASE_IN`, y actualiza el pedido a `PARTIALLY_RECEIVED` o `RECEIVED`.
5. **`POST /api/pedidos-proveedores/:id/cancelar`** -> Cancela el pedido si no tiene recepciones.

---

### MÓDULO 12: Punto de Venta y Transacciones (`/api/ventas`)
Cobro en mostrador, folios secuenciales correlativos (`FolioCounter`), transacciones atómicas con bloqueo de stock, cancelaciones y devoluciones parciales.

#### Endpoints
- **Guard:** `JwtAuthGuard`, `RolesGuard` (`ADMIN` y `VENDEDOR`).
1. **`POST /api/ventas`** (Checkout Principal)
   - **Cabecera Obligatoria:** `Idempotency-Key: <UUID-v4>`
   - **Body:**
     ```json
     {
       "clienteId": "cust-uuid-001",
       "notas": "Venta mostrador",
       "productos": [
         {
           "productoId": "prod-uuid-001",
           "tallaId": "size-uuid-002",
           "cantidad": 2,
           "descuento": 0,
           "impuesto": 0
         }
       ],
       "pago": {
         "metodo": "CASH",
         "monto": 1198.00
       }
     }
     ```
   - **Lógica Backend:** Transacción serializable -> Bloquea filas de productos (`SELECT FOR UPDATE`) -> Valida existencias -> Registra movimientos Kardex `SALE_OUT` -> Snapshot de costo unitario en `SaleItem` -> Incrementa `FolioCounter` -> Registra venta y pago `COMPLETED` -> Commit.
   - **Respuesta (201):**
     ```json
     {
       "id": "sale-uuid-001",
       "folio": "V-001045",
       "estado": "COMPLETED",
       "subtotal": "1198.00",
       "descuento": "0.00",
       "impuesto": "0.00",
       "total": "1198.00",
       "cliente": { "id": "cust-uuid-001", "nombre": "Ana Pérez" },
       "productos": [
         {
           "id": "item-uuid-001",
           "producto": { "id": "prod-uuid-001", "articulo": "Playera Kamadeva Acid Wash", "codigoBarras": "7501234567890" },
           "talla": { "id": "size-uuid-002", "nombre": "M" },
           "cantidad": "2.000",
           "precioUnitario": "599.00",
           "total": "1198.00"
         }
       ],
       "pagos": [
         {
           "id": "pay-uuid-001",
           "metodo": "CASH",
           "monto": "1198.00",
           "estado": "PAID",
           "fechaPago": "2026-10-30T12:00:00.000Z"
         }
       ],
       "fechaCreacion": "2026-10-30T12:00:00.000Z"
     }
     ```
2. **`GET /api/ventas`**
   - **Query Parameters:** `pagina`, `limite`, `fechaInicio`, `fechaFin`, `estado`, `clienteId`, `usuarioId`.
   - **Respuesta (200):** `{ "datos": [...], "pagina": 1, "limite": 20, "total": 1 }`.
3. **`GET /api/ventas/:id`** -> Venta con desglose para reimpresión de tickets.
4. **`POST /api/ventas/:id/cancelar`**
   - **Body:** `{ "motivo": "Cancelación por error de captura" }`
   - **Lógica:** Devuelve todas las unidades al inventario con `RETURN_IN` y marca el pago como reembolsado (`REFUNDED`).
5. **`POST /api/ventas/:id/devolucion`**
   - **Body:**
     ```json
     {
       "motivo": "Talla incorrecta",
       "productos": [
         {
           "renglonId": "item-uuid-001",
           "cantidad": 1,
           "motivo": "Cambio de talla"
         }
       ]
     }
     ```
   - **Lógica:** Devuelve existencias físicas de las piezas devueltas (`RETURN_IN`) y registra un movimiento de reembolso parcial en pagos.

---

### MÓDULO 13: Cotizaciones y Presupuestos (`/api/cotizaciones`)
Presupuestos con ciclo de vida completo (`DRAFT` -> `SENT` -> `ACCEPTED` / `EXPIRED` / `CONVERTED`), sin descontar inventario hasta su cobro formal.

#### Endpoints
- **Guard:** `JwtAuthGuard`, `RolesGuard` (`ADMIN` y `VENDEDOR`).
1. **`POST /api/cotizaciones`**
   - **Body:**
     ```json
     {
       "clienteId": "cust-uuid-001",
       "fechaVencimiento": "2026-11-15T23:59:59.000Z",
       "notas": "Cotización de mayoreo",
       "productos": [
         {
           "productoId": "prod-uuid-001",
           "tallaId": "size-uuid-002",
           "cantidad": 10,
           "descuento": 100.00
         }
       ]
     }
     ```
2. **`GET /api/cotizaciones`** -> Query: `clienteId`, `estado`, `fechaInicio`, `fechaFin`.
3. **`GET /api/cotizaciones/:id`** -> Detalle de la cotización.
4. **`PATCH /api/cotizaciones/:id`** -> Modifica artículos, cantidades o vencimiento.
5. **`POST /api/cotizaciones/:id/enviar`** -> Cambia estado a `SENT`.
6. **`POST /api/cotizaciones/:id/pagar`** (Conversión a Venta)
   - **Body:** `{ "metodo": "CASH", "monto": 5890.00 }`
   - **Lógica:** Valida vigencia y stock actual -> Descuenta existencias -> Genera venta con folio consecutivo -> Marca cotización como `CONVERTED`.
7. **`DELETE /api/cotizaciones/:id`** -> Cancela o elimina la cotización.

---

### MÓDULO 14: Gastos Operativos y Categorías de Gastos (`/api/gastos` y `/api/categorias-gastos`)
Egresos de caja chica, insumos y catálogo de conceptos de gasto.

#### Endpoints de Categorías de Gastos (`/api/categorias-gastos`)
1. **`GET /api/categorias-gastos`** -> Query `incluirInactivos=true|false`.
2. **`POST /api/categorias-gastos`** -> Body: `{ "nombre": string, "activo"?: boolean }`.
3. **`GET /api/categorias-gastos/:id`**
4. **`PATCH /api/categorias-gastos/:id`**
5. **`DELETE /api/categorias-gastos/:id`**

#### Endpoints de Gastos (`/api/gastos`)
1. **`POST /api/gastos`**
   - **Body:**
     ```json
     {
       "concepto": "Artículos de limpieza y bolsas",
       "monto": 355.50,
       "categoriaId": "exp-cat-uuid-001",
       "descontarDeCaja": true,
       "fechaGasto": "2026-10-30T14:00:00.000Z",
       "notas": "Compra en tienda local"
     }
     ```
2. **`GET /api/gastos`**
   - **Query Parameters:** `pagina`, `limite`, `categoriaId`, `cortePendiente=true|false`, `fechaInicio`, `fechaFin`.
   - **Respuesta (200):**
     ```json
     {
       "datos": [
         {
           "id": "exp-uuid-001",
           "concepto": "Artículos de limpieza y bolsas",
           "monto": "355.50",
           "descontarDeCaja": true,
           "fechaGasto": "2026-10-30T14:00:00.000Z",
           "categoria": { "id": "exp-cat-uuid-001", "nombre": "LIMPIEZA" },
           "creadoPor": { "id": "user-uuid-001", "nombre": "Carlos López" },
           "corteCajaId": null,
           "fechaCreacion": "2026-10-30T14:00:00.000Z"
         }
       ],
       "total": 1,
       "pagina": 1,
       "limite": 20,
       "montoTotal": "355.50"
     }
     ```
3. **`GET /api/gastos/:id`** -> Consulta por ID.
4. **`DELETE /api/gastos/:id`** -> Falla si ya fue liquidado en un corte de caja (`corteCajaId != null`).

---

### MÓDULO 15: Arqueo y Cortes de Caja en Cadena (`/api/cortes-caja`)
Cortes de turno inmutables encadenados con desglose físico de denominaciones y ajustes.

#### Invariante Financiera de Cuadre
$$\text{Efectivo Esperado} = \text{Fondo Inicial} + \text{Ventas en Efectivo} - \text{Reembolsos en Efectivo} - \text{Gastos Descontados de Caja} + \text{Ajustes Entrada} - \text{Ajustes Salida}$$
$$\text{Diferencia} = \text{Efectivo Contado} - \text{Efectivo Esperado}$$
$$\text{Efectivo Retirado} = \text{Efectivo Contado} - \text{Fondo Dejado}$$

#### Endpoints
- **Guard:** `JwtAuthGuard`, `RolesGuard` (`ADMIN` y `VENDEDOR`).
1. **`GET /api/cortes-caja/resumen-actual`**
   - **Propósito:** Prellena la pantalla de corte del vendedor con las operaciones acumuladas sin escribir en base de datos.
   - **Respuesta (200):**
     ```json
     {
       "corteAnteriorId": "closure-uuid-prev",
       "inicioPeriodo": "2026-10-30T08:00:00.000Z",
       "fechaGeneracion": "2026-10-30T20:00:00.000Z",
       "fondoInicial": "500.00",
       "ventas": {
         "cantidad": 15,
         "efectivo": "4500.00",
         "tarjeta": "1200.00",
         "transferencia": "0.00",
         "otros": "0.00",
         "total": "5700.00"
       },
       "reembolsos": {
         "efectivo": "100.00",
         "total": "100.00"
       },
       "gastos": {
         "cantidad": 2,
         "efectivo": "355.00",
         "total": "455.00"
       },
       "efectivoEsperado": "4545.00"
     }
     ```
2. **`POST /api/cortes-caja`**
   - **Body:**
     ```json
     {
       "corteAnteriorId": "closure-uuid-prev",
       "denominaciones": {
         "1000": 1,
         "500": 4,
         "200": 5,
         "100": 10,
         "50": 8,
         "20": 5,
         "10": 4,
         "5": 1,
         "0.5": 0
       },
       "fondoDejado": 500.00,
       "ajustes": [
         {
           "tipo": "WITHDRAWAL",
           "monto": 50.00,
           "descripcion": "Pago extraordinario de flete"
         }
       ],
       "notas": "Corte de turno vespertino sin discrepancias"
     }
     ```
   - **Lógica Transaccional:** Valida que `corteAnteriorId` corresponda exactamente al último corte sellado (evita colisiones concurrentes) -> Calcula sumatoria de denominaciones (`efectivoContado`) -> Calcula diferencia -> Asocia todos los pagos, reembolsos y gastos del turno con `corteCajaId` -> Persiste el corte inmutable.
   - **Respuesta (201):** Corte de caja completo con `efectivoRetirado`, `diferencia` y estado inmutable.
3. **`GET /api/cortes-caja`**
   - **Query Parameters:** `pagina`, `limite`, `fechaInicio`, `fechaFin`.
4. **`GET /api/cortes-caja/:id`** -> Retorna el detalle con desglose de denominaciones y ajustes.

---

### MÓDULO 16: Tablero y Analítica (`/api/tablero`)
Métricas del día local del negocio, productos más vendidos y curvas históricas de venta.

#### Endpoints
- **Guard:** `JwtAuthGuard`, `RolesGuard` (`ADMIN` y `VENDEDOR`).
1. **`GET /api/tablero/resumen`**
   - **Lógica:** Cómputo del día comercial en la zona horaria del negocio (`America/Mexico_City`). Los vendedores reciben `utilidadEstimadaHoy: null`; los administradores reciben el desglose completo.
   - **Respuesta (200):**
     ```json
     {
       "fecha": "2026-10-30",
       "timezone": "America/Mexico_City",
       "ventasHoy": {
         "total": "14250.00",
         "cantidad": 38,
         "ticketPromedio": "375.00",
         "porMetodo": {
           "CASH": "9800.00",
           "CARD": "4450.00",
           "TRANSFER": "0.00",
           "OTHER": "0.00"
         }
       },
       "inventario": {
         "productosActivos": 342,
         "productosBajoMinimo": 6
       },
       "gastosHoy": {
         "total": "650.00",
         "desdeCaja": "350.00"
       },
       "utilidadEstimadaHoy": {
         "ventasNetas": "12284.48",
         "costoMercancia": "6354.48",
         "gastos": "650.00",
         "utilidad": "5280.00",
         "costoIncompleto": false
       }
     }
     ```
2. **`GET /api/tablero/productos-mas-vendidos`**
   - **Query Parameters:** `fechaInicio` (ISO), `fechaFin` (ISO), `limite` (1 a 50, default 10), `ordenarPor` ('unidades'|'ingresos').
   - **Respuesta (200):**
     ```json
     {
       "fechaInicio": "2026-10-01T00:00:00.000Z",
       "fechaFin": "2026-10-30T23:59:59.000Z",
       "ordenarPor": "unidades",
       "datos": [
         {
           "producto": {
             "id": "prod-uuid-001",
             "codigoBarras": "7501234567890",
             "nombre": "Playera Kamadeva Acid Wash"
           },
           "unidades": "48.000",
           "ingresos": "28752.00",
           "cantidadVentas": 32
         }
       ]
     }
     ```
3. **`GET /api/tablero/historial-ventas`**
   - **Query Parameters:** `periodo` ('week'|'month', default 'week').
   - **Respuesta (200):**
     ```json
     {
       "periodo": "week",
       "timezone": "America/Mexico_City",
       "dias": [
         {
           "fecha": "2026-10-25",
           "ventasTotales": "3450.00",
           "cantidadVentas": 11,
           "gastosTotales": "120.00"
         }
       ]
     }
     ```

---

## 4. Códigos de Respuesta HTTP Estandarizados

| Código | Significado | Escenario en Kamadeva System |
| :---: | :--- | :--- |
| **`200 OK`** | Operación exitosa | Búsquedas, consultas de resumen, actualizaciones y anulaciones. |
| **`201 Created`** | Recurso creado exitosamente | Alta de producto, venta checkout completada, corte sellado, compra registrada. |
| **`204 No Content`** | Éxito sin cuerpo de respuesta | Cierre de sesión (`logout`), eliminación de producto o usuario sin dependencias. |
| **`400 Bad Request`** | Parámetros o DTO inválidos | Falta de campos obligatorios, cantidades menores a 0, formatos de UUID o JSON inválidos. |
| **`401 Unauthorized`** | No autenticado | Token ausente, firma inválida, refresh token vencido o revocado. |
| **`403 Forbidden`** | Sin autorización | Rol `VENDEDOR` intentando ejecutar endpoints administrativos (`ADMIN`). |
| **`404 Not Found`** | Recurso no encontrado | ID de producto, venta, cliente, proveedor o categoría inexistente. |
| **`409 Conflict`** | Conflicto de negocio / concurrencia | Código de barras duplicado, corte desfasado (`corteAnteriorId`), stock insuficiente, registro con dependencias activas. |
| **`500 Internal Error`** | Error no controlado | Falla inesperada en la base de datos o excepción de servidor no manejada. |
