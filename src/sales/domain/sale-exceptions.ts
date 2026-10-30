import { DomainException } from '../../common/domain/domain-exception.js';

export class SaleNotFoundException extends DomainException {
  constructor(message = 'Venta inexistente') {
    super(message);
  }
}

export class InsufficientStockException extends DomainException {
  constructor(message = 'Sin inventario suficiente') {
    super(message);
  }
}

export class SaleNotCancellableException extends DomainException {
  constructor(message = 'La venta no admite cancelación') {
    super(message);
  }
}

export class SaleCustomerNotFoundException extends DomainException {
  constructor(message = 'Cliente inexistente') {
    super(message);
  }
}

export class SaleProductNotFoundException extends DomainException {
  constructor(message = 'Producto inexistente') {
    super(message);
  }
}

export class InactiveProductException extends DomainException {
  constructor(message = 'Producto inactivo') {
    super(message);
  }
}

export class SaleSizeSelectionException extends DomainException {
  constructor(message = 'Talla inválida para el producto') {
    super(message);
  }
}

export class SalePaymentMismatchException extends DomainException {
  constructor(message = 'El importe debe coincidir con el total de la venta') {
    super(message);
  }
}

export class IdempotencyKeyReuseException extends DomainException {
  constructor(
    message = 'La llave de idempotencia ya se usó con otra solicitud',
  ) {
    super(message);
  }
}

/** A concurrent request inserted the same idempotency key first. */
export class IdempotencyKeyRaceException extends DomainException {
  constructor(message = 'Solicitud idempotente en curso') {
    super(message);
  }
}
