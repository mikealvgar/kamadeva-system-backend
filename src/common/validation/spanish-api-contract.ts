import type { Request, Response, NextFunction } from 'express';
import { CallHandler, Injectable, NestInterceptor } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { map, type Observable } from 'rxjs';

const publicNames: Record<string, string> = {
  name: 'nombre',
  email: 'correo',
  password: 'contrasena',
  accessToken: 'tokenAcceso',
  refreshToken: 'tokenRenovacion',
  user: 'usuario',
  description: 'descripcion',
  isActive: 'activo',
  isDefault: 'esPredeterminado',
  createdAt: 'fechaCreacion',
  updatedAt: 'fechaActualizacion',
  startDate: 'fechaInicio',
  endDate: 'fechaFin',
  page: 'pagina',
  pageSize: 'limite',
  search: 'busqueda',
  includeInactive: 'incluirInactivos',
  productId: 'productoId',
  categoryId: 'categoriaId',
  sizeId: 'tallaId',
  saleItemId: 'renglonId',
  customerId: 'clienteId',
  providerId: 'proveedorId',
  userId: 'usuarioId',
  quantity: 'cantidad',
  unitCost: 'costoUnitario',
  discount: 'descuento',
  tax: 'impuesto',
  items: 'productos',
  notes: 'notas',
  expiresAt: 'fechaVencimiento',
  method: 'metodo',
  amount: 'monto',
  payment: 'pago',
  payments: 'pagos',
  paidAt: 'fechaPago',
  status: 'estado',
  createdById: 'creadoPorId',
  createdBy: 'creadoPor',
  cancelledAt: 'fechaCancelacion',
  cancelledBy: 'canceladoPor',
  reason: 'motivo',
  quoteId: 'cotizacionId',
  paymentMethod: 'metodoPago',
  barcode: 'codigoBarras',
  price: 'precioVenta',
  cost: 'precioCompra',
  stock: 'existencias',
  minStock: 'existenciaMinima',
  imageUrl: 'urlImagen',
  category: 'categoria',
  lowStock: 'productosBajoMinimo',
  netSales: 'ventasNetas',
  costOfGoods: 'costoMercancia',
  costIncomplete: 'costoIncompleto',
  estimatedProfitToday: 'utilidadEstimadaHoy',
  limit: 'limite',
  sortBy: 'ordenarPor',
  units: 'unidades',
  revenue: 'ingresos',
  salesCount: 'cantidadVentas',
  period: 'periodo',
  type: 'tipo',
  referenceType: 'tipoReferencia',
  referenceId: 'referenciaId',
  quantityChange: 'cambioExistencias',
  balanceAfter: 'existenciasDespues',
  concept: 'concepto',
  deductFromCash: 'descontarDeCaja',
  spentAt: 'fechaGasto',
  totalAmount: 'montoTotal',
  pendingClosure: 'cortePendiente',
  cashClosureId: 'corteCajaId',
  data: 'datos',
  totalRows: 'totalRenglones',
  categoriesCreated: 'categoriasCreadas',
  withoutCategory: 'sinCategoria',
  dryRun: 'vistaPrevia',
  categoryMap: 'mapaCategorias',
  roleName: 'nombreRol',
  sortOrder: 'orden',
  contactName: 'nombreContacto',
  receivedAt: 'fechaRecepcion',
  supplierFolio: 'folioProveedor',
  productName: 'nombreProducto',
  lineSubtotal: 'subtotalRenglon',
  floatLeft: 'fondoDejado',
  expectedCash: 'efectivoEsperado',
  cashWithdrawn: 'efectivoRetirado',
  previousClosureId: 'corteAnteriorId',
  periodStart: 'inicioPeriodo',
  denominations: 'denominaciones',
  difference: 'diferencia',
  adjustments: 'ajustes',
  activeProducts: 'productosActivos',
  adjustmentsIn: 'ajustesEntrada',
  adjustmentsOut: 'ajustesSalida',
  averageTicket: 'ticketPromedio',
  byMethod: 'porMetodo',
  canPay: 'puedePagar',
  cancelReason: 'motivoCancelacion',
  closedAt: 'fechaCierre',
  closedBy: 'cerradoPor',
  countedCash: 'efectivoContado',
  expensesToday: 'gastosHoy',
  expensesTotal: 'gastosTotales',
  fromCash: 'desdeCaja',
  generatedAt: 'fechaGeneracion',
  openingFloat: 'fondoInicial',
  salesToday: 'ventasHoy',
  salesTotal: 'ventasTotales',
  customer: 'cliente',
  product: 'producto',
  size: 'talla',
  unitPrice: 'precioUnitario',
};

const publicToInternal = Object.fromEntries(
  Object.entries(publicNames).map(([internal, external]) => [
    external,
    internal,
  ]),
);

function mapKeys(value: unknown, names: Record<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => mapKeys(item, names));
  if (!value || typeof value !== 'object' || value instanceof Date)
    return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      names[key] ?? key,
      mapKeys(child, names),
    ]),
  );
}

function inputNames(path: string): Record<string, string> {
  if (path.startsWith('/api/autenticacion/')) return publicToInternal;
  if (
    path.startsWith('/api/compras') ||
    path.startsWith('/api/configuracion-negocio') ||
    path.startsWith('/api/usuarios') ||
    path.startsWith('/api/roles') ||
    path.startsWith('/api/pedidos-proveedores')
  )
    return {};
  if (
    path.startsWith('/api/catalogo/categorias') ||
    path.startsWith('/api/categorias')
  )
    return {
      ...publicToInternal,
      nombre: 'name',
      descripcion: 'description',
      activo: 'isActive',
      alias: 'slug',
    };
  if (
    path.startsWith('/api/catalogo/tallas') ||
    path.startsWith('/api/tallas')
  )
    return {
      ...publicToInternal,
      nombre: 'name',
      orden: 'sortOrder',
      activo: 'isActive',
      incluirInactivos: 'includeInactive',
    };
  if (path.startsWith('/api/productos')) {
    if (path.includes('/importacion'))
      return { vistaPrevia: 'dryRun', mapaCategorias: 'categoryMap' };
    return {
      ...publicToInternal,
      categoriaId: 'categoryId',
      existencias: 'stock',
      activo: 'isActive',
      urlImagen: 'imageUrl',
      sinCategoria: 'sinCategoria',
    };
  }
  if (path.startsWith('/api/clientes'))
    return {
      ...publicToInternal,
      nombre: 'name',
      correo: 'email',
      telefono: 'phone',
      activo: 'isActive',
      busqueda: 'search',
      incluirInactivos: 'includeInactive',
    };
  if (path.startsWith('/api/proveedores'))
    return {
      ...publicToInternal,
      nombreContacto: 'contactName',
      telefono: 'phone',
      direccion: 'address',
      correo: 'email',
      activo: 'isActive',
      busqueda: 'search',
      incluirInactivos: 'includeInactive',
    };
  return publicToInternal;
}

export function spanishApiMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  const path = request.path;
  const names = inputNames(path);
  request.body = mapKeys(request.body, names);
  const url = new URL(request.url, 'http://localhost');
  for (const [external, internal] of Object.entries(names)) {
    if (url.searchParams.has(external)) {
      const values = url.searchParams.getAll(external);
      url.searchParams.delete(external);
      for (const value of values) url.searchParams.append(internal, value);
    }
  }
  request.url = `${url.pathname}${url.search}`;
  next();
}

@Injectable()
export class SpanishApiResponseInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next
      .handle()
      .pipe(map((value: unknown) => mapKeys(value, publicNames)));
  }
}

export function translateOpenApiSchemas(document: object): void {
  const openApi = document as {
    components?: { schemas?: Record<string, unknown> };
    paths?: Record<string, Record<string, unknown>>;
  };
  const components = openApi.components;
  for (const value of Object.values(components?.schemas ?? {})) {
    if (!value || typeof value !== 'object') continue;
    const schema = value as {
      properties?: Record<string, unknown>;
      required?: string[];
    };
    if (schema.properties) {
      schema.properties = Object.fromEntries(
        Object.entries(schema.properties).map(([key, property]) => [
          publicNames[key] ?? key,
          property,
        ]),
      );
    }
    if (schema.required)
      schema.required = schema.required.map((key) => publicNames[key] ?? key);
  }
  for (const path of Object.values(openApi.paths ?? {})) {
    for (const operation of Object.values(path)) {
      if (!operation || typeof operation !== 'object') continue;
      const parameters = (operation as { parameters?: unknown[] }).parameters;
      if (!parameters) continue;
      for (const parameter of parameters) {
        if (!parameter || typeof parameter !== 'object') continue;
        const item = parameter as { name?: string };
        if (item.name) item.name = publicNames[item.name] ?? item.name;
      }
    }
  }
}
