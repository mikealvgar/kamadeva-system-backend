# Estado de Servicios del Backend — Kamadeva System

> **Última verificación:** 2026-11-15 (basado en los controladores activos en `src/`, `prisma/schema.prisma`, `TASK.md` y `PROGRESS.md`).  
> **Prefijo HTTP global:** `/api`  
> **Documentación interactiva (Swagger):** `/api/docs`

---

## 1. Servicios listos para usar (100% implementados)

Actualmente el backend cuenta con **16 módulos funcionales activos**, un endpoint raíz de salud y un servicio automático de mantenimiento, todos cubiertos por pruebas unitarias y E2E.

### 1.1 Salud / Raíz (`AppController`)
- `GET /api` — Verificación básica de estado del servidor.

### 1.2 Autenticación (`/api/autenticacion`)
- `POST /api/autenticacion/registro` — Registro de usuarios (el primero es `ADMIN`, los siguientes `VENDEDOR`). Soporta `{ correo, contrasena }` o `{ email, password }`.
- `POST /api/autenticacion/login` — Inicio de sesión con JWT (`tokenAcceso`, `tokenRenovacion`, `hasAdmin`, `seccionesPermitidas`).
- `POST /api/autenticacion/refresh` — Rotación atómica de refresh token.
- `POST /api/autenticacion/logout` — Cierre de sesión idempotente (revoca el refresh token).

### 1.3 Usuarios y Roles (`/api/usuarios`, `/api/roles`)
- `GET /api/usuarios` — Listado paginado con búsqueda, filtro por rol e inactivos (`ADMIN`).
- `GET /api/usuarios/:usuarioId` — Detalle de usuario (`ADMIN`).
- `PATCH /api/usuarios/:usuarioId` — Actualización parcial, cambio de contraseña, rol y activación/desactivación con protección del último `ADMIN` (`ADMIN`).
- `GET /api/usuarios/:usuarioId/roles` — Consulta de roles del usuario (`ADMIN`).
- `PUT /api/usuarios/:usuarioId/roles` — Reemplazo de roles del usuario (`ADMIN`).
- `DELETE /api/usuarios/:usuarioId/roles/:nombreRol` — Remoción de un rol (`ADMIN`).
- `DELETE /api/usuarios/:usuarioId` — Eliminación de usuario sin historial bloqueante (`ADMIN`).
- `GET /api/roles` — Catálogo de roles disponibles (`ADMIN`, `VENDEDOR`).

### 1.4 Configuración del Negocio (`/api/configuracion-negocio`)
- `GET /api/configuracion-negocio` — Consulta de datos comerciales, fiscales (RFC) y pie de ticket (`ADMIN`, `VENDEDOR`).
- `PUT /api/configuracion-negocio` — Creación/reemplazo atómico de la configuración (`ADMIN`).

### 1.5 Catálogo: Categorías (`/api/catalogo/categorias`)
- `POST /api/catalogo/categorias` — Alta con normalización a mayúsculas (`ADMIN`).
- `GET /api/catalogo/categorias` — Listado paginado con filtros (`ADMIN`, `VENDEDOR`).
- `GET /api/catalogo/categorias/:id` — Detalle de categoría (`ADMIN`, `VENDEDOR`).
- `PATCH /api/catalogo/categorias/:id` — Edición parcial (`ADMIN`).
- `DELETE /api/catalogo/categorias/:id` — Eliminación con protección si tiene productos (`ADMIN`).

### 1.6 Catálogo: Marcas (`/api/catalogo/marcas`)
- `POST /api/catalogo/marcas` — Alta de marca (`ADMIN`).
- `GET /api/catalogo/marcas` — Listado paginado (`ADMIN`, `VENDEDOR`).
- `GET /api/catalogo/marcas/:id` — Detalle de marca (`ADMIN`, `VENDEDOR`).
- `PATCH /api/catalogo/marcas/:id` — Edición parcial (`ADMIN`).
- `DELETE /api/catalogo/marcas/:id` — Eliminación con protección si tiene productos (`ADMIN`).

### 1.7 Catálogo: Tallas (`/api/catalogo/tallas`)
- `POST /api/catalogo/tallas` — Alta de talla (`ADMIN`).
- `GET /api/catalogo/tallas` — Listado paginado (`ADMIN`, `VENDEDOR`).
- `GET /api/catalogo/tallas/:id` — Detalle de talla (`ADMIN`, `VENDEDOR`).
- `PATCH /api/catalogo/tallas/:id` — Edición parcial (`ADMIN`).
- `DELETE /api/catalogo/tallas/:id` — Eliminación (`ADMIN`).

### 1.8 Catálogo: Productos e Importación (`/api/productos`)
- `POST /api/productos` — Alta de producto con código de barras único y stock inicial opcional auditado en Kardex (`ADMIN`).
- `GET /api/productos` — Listado paginado con búsqueda por nombre/código de barras, filtro por categoría, `sinCategoria` y stock bajo (`ADMIN`, `VENDEDOR`).
- `GET /api/productos/:id` — Detalle de producto con existencias calculadas (`ADMIN`, `VENDEDOR`).
- `GET /api/productos/:id/movimientos` — Historial Kardex paginado del producto (`ADMIN`, `VENDEDOR`).
- `PATCH /api/productos/:id` — Edición parcial; cambios en `existencias` generan `ADJUSTMENT_IN` / `ADJUSTMENT_OUT` (`ADMIN`).
- `DELETE /api/productos/:id` — Eliminación con protección ante historial asociado (`ADMIN`).
- `POST /api/productos/:id/image` — Carga de imagen a Cloudinary (`ADMIN`).
- `POST /api/productos/importacion` — Importación masiva desde Excel (`.xlsx`) con soporte de `dryRun` y `categoryMap` (`ADMIN`).
- `GET /api/productos/exportacion` — Exportación del catálogo de productos y existencias Kardex a Excel (`.xlsx`) con filtros (`ADMIN`).

### 1.9 Inventario y Kardex (`/api/inventario`, `/api/productos/:productoId/movimientos`)
- `POST /api/productos/:productoId/movimientos` — Registro manual de entradas, salidas y ajustes (`PURCHASE_IN`, `RETURN_IN`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`) (`ADMIN`).
- `GET /api/inventario/movimientos` — Consulta global paginada y filtrable de movimientos de inventario (`ADMIN`, `VENDEDOR`).

### 1.10 Clientes (`/api/clientes`)
- `POST /api/clientes` — Alta de cliente (`ADMIN`).
- `GET /api/clientes` — Listado paginado con búsqueda y filtro de inactivos (`ADMIN`, `VENDEDOR`).
- `GET /api/clientes/:id` — Detalle de cliente (`ADMIN`, `VENDEDOR`).
- `PATCH /api/clientes/:id` — Edición parcial (`ADMIN`).
- `DELETE /api/clientes/:id` — Eliminación con protección al cliente default y clientes con historial (`ADMIN`).

### 1.11 Proveedores (`/api/proveedores`)
- `POST /api/proveedores` — Alta de proveedor con unicidad sin distinguir mayúsculas (`ADMIN`).
- `GET /api/proveedores` — Listado paginado con búsqueda (`ADMIN`, `VENDEDOR`).
- `GET /api/proveedores/:id` — Detalle de proveedor (`ADMIN`, `VENDEDOR`).
- `PATCH /api/proveedores/:id` — Edición parcial (`ADMIN`).
- `DELETE /api/proveedores/:id` — Eliminación con protección si tiene compras (`ADMIN`).

### 1.12 Compras a Proveedores (`/api/compras`)
- `POST /api/compras` — Registro de compra recibida completa; fotografía `precioCompra` como `costoUnitario` e inserta movimientos `PURCHASE_IN` en transacción serializable (`ADMIN`).
- `GET /api/compras` — Listado paginado con filtros por proveedor y rango de fechas (`ADMIN`, `VENDEDOR`).
- `GET /api/compras/:id` — Detalle de compra y sus renglones (`ADMIN`, `VENDEDOR`).

### 1.13 Punto de Venta / Ventas (`/api/ventas`)
- `POST /api/ventas` — Cobro de venta directa con cabecera obligatoria `Idempotency-Key` (UUID v4), folio consecutivo automático, descuento de stock (`SALE_OUT`) y método de pago (`ADMIN`, `VENDEDOR`).
- `GET /api/ventas` — Listado paginado con filtros por fecha, estado, vendedor, cliente, método y folio (`ADMIN`, `VENDEDOR`).
- `GET /api/ventas/:id` — Detalle completo de venta para consulta/reimpresión de ticket (`ADMIN`, `VENDEDOR`).
- `POST /api/ventas/:id/cancelar` — Cancelación atómica de venta con reintegro de stock (`RETURN_IN`) y reembolso en caja (`ADMIN`, `VENDEDOR`).
- `POST /api/ventas/:id/devolucion` — Devolución parcial o total de artículos con reintegro de stock (`RETURN_IN`) y ajuste en caja (`ADMIN`, `VENDEDOR`).

### 1.14 Cotizaciones (`/api/cotizaciones`)
- `POST /api/cotizaciones` — Creación de cotización con folio consecutivo (`ADMIN`, `VENDEDOR`).
- `GET /api/cotizaciones` — Listado paginado con filtros (`ADMIN`, `VENDEDOR`).
- `GET /api/cotizaciones/:id` — Detalle de cotización (`ADMIN`, `VENDEDOR`).
- `PATCH /api/cotizaciones/:id` — Edición de cotización en borrador/abierta (`ADMIN`, `VENDEDOR`).
- `POST /api/cotizaciones/:id/enviar` — Cambio de estado a enviada (`ADMIN`, `VENDEDOR`).
- `POST /api/cotizaciones/:id/pagar` — Conversión atómica de cotización a venta oficial con descuento de inventario (`ADMIN`, `VENDEDOR`).
- `DELETE /api/cotizaciones/:id` — Eliminación de cotización (`ADMIN`, `VENDEDOR`).

### 1.15 Gastos Operativos y Categorías de Gastos (`/api/gastos`, `/api/categorias-gastos`)
- `POST /api/categorias-gastos` — Alta de categoría de gasto (`ADMIN`).
- `GET /api/categorias-gastos` — Listado paginado (`ADMIN`, `VENDEDOR`).
- `GET /api/categorias-gastos/:id` — Detalle de categoría (`ADMIN`, `VENDEDOR`).
- `PATCH /api/categorias-gastos/:id` — Edición parcial (`ADMIN`).
- `DELETE /api/categorias-gastos/:id` — Eliminación con protección si está en uso (`ADMIN`).
- `POST /api/gastos` — Registro de egreso operativo (`ADMIN`, `VENDEDOR`).
- `GET /api/gastos` — Listado paginado con filtros (fecha, categoría, autor, `deductFromCash`, `pendingClosure`, `cashClosureId`) (`ADMIN`, `VENDEDOR`).
- `GET /api/gastos/:id` — Detalle de gasto (`ADMIN`, `VENDEDOR`).
- `DELETE /api/gastos/:id` — Eliminación de gasto no incluido en corte de caja (`ADMIN`).

### 1.16 Arqueo y Cortes de Caja (`/api/cortes-caja`)
- `GET /api/cortes-caja/resumen-actual` — Cálculo en tiempo real de ventas por método, reembolsos, gastos y efectivo esperado pendiente de corte (`ADMIN`, `VENDEDOR`).
- `POST /api/cortes-caja` — Cierre inmutable encadenado (`previousClosureId`) con conteo de denominaciones MXN, ajustes y fondo dejado (`ADMIN`, `VENDEDOR`).
- `GET /api/cortes-caja` — Listado paginado de cortes (`ADMIN`, `VENDEDOR`).
- `GET /api/cortes-caja/:id` — Detalle completo del corte (`ADMIN`, `VENDEDOR`).

### 1.17 Tablero y Analítica (`/api/tablero`)
- `GET /api/tablero/resumen` — KPIs del día (ventas por método, ticket promedio, stock bajo, gastos y utilidad estimada solo para `ADMIN`).
- `GET /api/tablero/productos-mas-vendidos` — Ranking por unidades o ingreso (`ADMIN`, `VENDEDOR`).
- `GET /api/tablero/historial-ventas` — Serie temporal semanal o mensual (`ADMIN`, `VENDEDOR`).

### 1.18 Respaldo y Restauración (`/api/respaldo`)
- `GET /api/respaldo/exportar` — Descarga respaldo completo comprimido (`.json.gz`) de las 20 entidades persistentes del negocio (`ADMIN`).
- `POST /api/respaldo/restaurar` — Valida (`vistaPrevia=true`) o restaura atómicamente (`confirmarReemplazo=true`) un respaldo `.json.gz` / `.json` con resincronización de secuencias (`ADMIN`).

### 1.19 Servicios Internos / Transversales
- **Limpieza automática (`CleanupService`):** Tarea programada (`@nestjs/schedule`) para depurar `IdempotencyKey` y `RefreshToken` expirados.
- **Adaptación y errores en español:** `SpanishApiContract` + `SpanishHttpExceptionFilter` para validación y respuestas consistentes en español.
- **Paginación estándar global:** Implementada en los 15 módulos con listados.

---

## 2. Servicios que faltan (eliminados o fuera de alcance)

De acuerdo con `TASK.md`, `PROGRESS.md` y la revisión de `src/`, **no hay módulos incompletos ni tareas pendientes en el alcance activo**. Sin embargo, existen servicios que fueron **retirados por simplificación** o que permanecen **fuera de alcance**:

### 2.1 Servicio eliminado en la simplificación de modelos
- **Pedidos a Proveedores (`/api/pedidos-proveedores`)** (`SupplierOrder` / `SupplierOrderItem`):
  - **Estado:** Eliminado intencionalmente en el hito de simplificación (`TASK.md`), aunque aún figura mencionado en documentos antiguos (`AGENTS.md`, `README.md`, `references/SERVICIOS_BACKEND.md` y `references/SERVICIOS_Y_CAMPOS.md`).
  - **Endpoints que ya no existen:**
    - `POST /api/pedidos-proveedores`
    - `GET /api/pedidos-proveedores`
    - `GET /api/pedidos-proveedores/:id`
    - `POST /api/pedidos-proveedores/:id/recepciones` (recepciones parciales)
    - `POST /api/pedidos-proveedores/:id/cancelar`
  - **Reemplazo actual:** Flujo directo de compras recibidas mediante `/api/compras`.

### 2.2 Funcionalidades no implementadas / fuera de alcance actual
1. **Cuentas por pagar y devoluciones a proveedores:** No existe registro de pagos parciales, crédito o saldos pendientes con proveedores ni devoluciones de compras.
2. **Actualización masiva y exportación:** La importación desde Excel (`/api/productos/importacion`) solo crea productos nuevos; falta actualización masiva de precios/stock existentes y exportación de catálogo o reportes a Excel/PDF.
3. **Pagos mixtos por venta:** Tras eliminar la tabla `Payment`, cada venta registra un único `metodoPago` (no soporta dividir una misma venta entre efectivo y tarjeta).
4. **Inventario desglosado por talla:** El modelo `ProductSize` fue eliminado; las existencias se controlan por producto en el Kardex y no por talla individual.
5. **Cortes de caja por cajero o turnos paralelos:** El corte es único y secuencial para toda la tienda; no soporta múltiples cajas/turnos simultáneos ni edición/borrado de cortes ya sellados.
6. **Facturación electrónica (CFDI):** Solo se almacenan datos fiscales básicos en `/api/configuracion-negocio` para encabezados de tickets.
