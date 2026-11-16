import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Response } from 'express';

const FIELD_TRANSLATIONS: Record<string, string> = {
  name: 'nombre',
  email: 'correo',
  password: 'contraseña',
  phone: 'teléfono',
  telefono: 'teléfono',
  nombre: 'nombre',
  correo: 'correo',
  contrasena: 'contraseña',
  isActive: 'activo',
  activo: 'activo',
  isDefault: 'esPredeterminado',
  esPredeterminado: 'esPredeterminado',
  startDate: 'fechaInicio',
  fechaInicio: 'fechaInicio',
  endDate: 'fechaFin',
  fechaFin: 'fechaFin',
  sortBy: 'ordenarPor',
  ordenarPor: 'ordenarPor',
  limit: 'límite',
  limite: 'límite',
  page: 'página',
  pagina: 'página',
  search: 'búsqueda',
  busqueda: 'búsqueda',
  items: 'productos',
  productos: 'productos',
  quantity: 'cantidad',
  cantidad: 'cantidad',
  unitPrice: 'precioUnitario',
  precioUnitario: 'precioUnitario',
  unitCost: 'costoUnitario',
  costoUnitario: 'costoUnitario',
  discount: 'descuento',
  descuento: 'descuento',
  tax: 'impuesto',
  impuesto: 'impuesto',
  paymentMethod: 'métodoPago',
  metodoPago: 'métodoPago',
  barcode: 'códigoBarras',
  codigoBarras: 'códigoBarras',
  cost: 'precioCompra',
  precioCompra: 'precioCompra',
  price: 'precioVenta',
  precioVenta: 'precioVenta',
  stock: 'existencias',
  existencias: 'existencias',
  minStock: 'existenciaMínima',
  existenciaMinima: 'existenciaMínima',
  description: 'descripción',
  descripcion: 'descripción',
  notes: 'notas',
  notas: 'notas',
  rolId: 'rolId',
  clienteId: 'clienteId',
  proveedorId: 'proveedorId',
  productoId: 'productoId',
  tallaId: 'tallaId',
  categoriaId: 'categoriaId',
  marcaId: 'marcaId',
  monto: 'monto',
  concepto: 'concepto',
  refreshToken: 'tokenRenovacion',
  tokenRenovacion: 'tokenRenovacion',
  address: 'dirección',
  direccion: 'dirección',
  rfc: 'rfc',
  footerMessage: 'mensajePie',
  mensajePie: 'mensajePie',
  contactName: 'nombreContacto',
  nombreContacto: 'nombreContacto',
};

const ERROR_NAME_TRANSLATIONS: Record<string, string> = {
  'Bad Request': 'Solicitud incorrecta',
  Unauthorized: 'No autorizado',
  Forbidden: 'Acceso denegado',
  'Not Found': 'No encontrado',
  Conflict: 'Conflicto',
  'Unprocessable Entity': 'Entidad no procesable',
  'Payload Too Large': 'Carga útil demasiado grande',
  'Internal Server Error': 'Error interno del servidor',
  'Bad Gateway': 'Puerta de enlace incorrecta',
};

const HTTP_STATUS_SPANISH: Record<number, string> = {
  400: 'Solicitud incorrecta',
  401: 'No autorizado',
  403: 'Acceso denegado',
  404: 'No encontrado',
  409: 'Conflicto',
  413: 'Carga útil demasiado grande',
  422: 'Entidad no procesable',
  500: 'Error interno del servidor',
  502: 'Puerta de enlace incorrecta',
};

export function translateErrorMessage(msg: string): string {
  if (typeof msg !== 'string') return String(msg);

  // 1. forbidNonWhitelisted: property xyz should not exist
  let match = msg.match(/^property (\w+) should not exist$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `La propiedad "${field}" no está permitida`;
  }

  // 2. IsEmail: xyz must be an email
  match = msg.match(/^(\w+) must be an email$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" debe ser un correo electrónico válido`;
  }

  // 3. IsString: xyz must be a string
  match = msg.match(/^(\w+) must be a string$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" debe ser una cadena de texto`;
  }

  // 4. IsNotEmpty: xyz should not be empty / must not be empty
  match = msg.match(/^(\w+) (?:should not|must not) be empty$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" no debe estar vacío`;
  }

  // 5. MinLength: xyz must be longer than or equal to N characters
  match = msg.match(/^(\w+) must be longer than or equal to (\d+) characters$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" debe tener al menos ${match[2]} caracteres`;
  }

  // 6. MaxLength: xyz must be shorter than or equal to N characters
  match = msg.match(/^(\w+) must be shorter than or equal to (\d+) characters$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" no debe superar los ${match[2]} caracteres`;
  }

  // 7. IsByteLength: xyz's byte length must fall into (A, B) range
  match = msg.match(
    /^(\w+)'s byte length must fall into \((\d+), (\d+)\) range$/i,
  );
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El tamaño en bytes de "${field}" debe estar entre ${match[2]} y ${match[3]}`;
  }

  // 8. IsUUID: xyz must be a UUID
  match = msg.match(/^(\w+) must be a UUID$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" debe ser un identificador UUID válido`;
  }

  // 9. IsBoolean: xyz must be a boolean value
  match = msg.match(/^(\w+) must be a boolean value$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" debe ser un valor booleano (verdadero o falso)`;
  }

  // 10. IsNumber / IsNumberString
  match = msg.match(
    /^(\w+) must be a number conforming to the specified constraints$/i,
  );
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" debe ser un número válido`;
  }

  // 11. IsInt: xyz must be an integer number
  match = msg.match(/^(\w+) must be an integer number$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" debe ser un número entero`;
  }

  // 12. IsPositive: xyz must be a positive number
  match = msg.match(/^(\w+) must be a positive number$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" debe ser un número positivo mayor a cero`;
  }

  // 13. Min: xyz must not be less than N
  match = msg.match(/^(\w+) must not be less than (.+)$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" no debe ser menor a ${match[2]}`;
  }

  // 14. Max: xyz must not be greater than N
  match = msg.match(/^(\w+) must not be greater than (.+)$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" no debe ser mayor a ${match[2]}`;
  }

  // 15. IsDateString / IsISO8601
  match = msg.match(/^(\w+) must be a valid ISO 8601 date string$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" debe ser una fecha en formato ISO 8601 válido`;
  }

  // 16. IsEnum: xyz must be one of the following values: ...
  match = msg.match(/^(\w+) must be one of the following values: (.+)$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" debe ser uno de los siguientes valores permitidos: ${match[2]}`;
  }

  // 17. IsArray: xyz must be an array
  match = msg.match(/^(\w+) must be an array$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" debe ser una lista o arreglo`;
  }

  // 18. ArrayMinSize: xyz must contain at least N elements
  match = msg.match(/^(\w+) must contain at least (\d+) elements?$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `El campo "${field}" debe contener al menos ${match[2]} elemento(s)`;
  }

  // 19. each value in xyz must be ...
  match = msg.match(/^each value in (\w+) must be (.+)$/i);
  if (match) {
    const field = FIELD_TRANSLATIONS[match[1]] ?? match[1];
    return `Cada elemento en "${field}" debe ser ${match[2]}`;
  }

  // 20. Mensajes estándar de Guards / Passport / Routing
  if (msg === 'Unauthorized') {
    return 'No autorizado. Se requiere un token de acceso válido.';
  }
  if (msg === 'Forbidden resource') {
    return 'Acceso denegado. No cuentas con los permisos necesarios para realizar esta acción.';
  }
  match = msg.match(/^Cannot (GET|POST|PUT|PATCH|DELETE) (.*)$/i);
  if (match) {
    return `Ruta no encontrada: ${match[1].toUpperCase()} ${match[2]}`;
  }

  return msg;
}

@Catch()
export class SpanishHttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Error interno del servidor';

    let message: string | string[];
    let error: string;

    if (typeof exceptionResponse === 'string') {
      message = translateErrorMessage(exceptionResponse);
      error = HTTP_STATUS_SPANISH[status] ?? 'Error';
    } else if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null
    ) {
      const respObj = exceptionResponse as Record<string, unknown>;
      const rawMessage = respObj.message;

      if (Array.isArray(rawMessage)) {
        message = rawMessage.map((m) => translateErrorMessage(String(m)));
      } else if (typeof rawMessage === 'string') {
        message = translateErrorMessage(rawMessage);
      } else {
        message = HTTP_STATUS_SPANISH[status] ?? 'Error';
      }

      const rawError = typeof respObj.error === 'string' ? respObj.error : '';
      error =
        ERROR_NAME_TRANSLATIONS[rawError] ??
        HTTP_STATUS_SPANISH[status] ??
        rawError;
    } else {
      message = 'Error interno del servidor';
      error = HTTP_STATUS_SPANISH[status] ?? 'Error';
    }

    const body: Record<string, unknown> = {
      statusCode: status,
      message,
    };
    if (error) body.error = error;

    response.status(status).json(body);
  }
}
