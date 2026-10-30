import { DomainException } from '../../../common/domain/domain-exception.js';

export {
  DomainException,
  InvalidAmountException,
} from '../../../common/domain/domain-exception.js';
// Raised by the shared sale registration when paying a quote.
export { InsufficientStockException } from '../../../sales/domain/sale-exceptions.js';

export class QuoteNotFoundException extends DomainException {
  constructor(message = 'Cotización inexistente') {
    super(message);
  }
}

export class CustomerNotFoundException extends DomainException {
  constructor(message = 'Cliente inexistente') {
    super(message);
  }
}

export class ProductNotFoundException extends DomainException {
  constructor(message = 'Producto inexistente') {
    super(message);
  }
}

export class QuoteExpiredException extends DomainException {
  constructor(message = 'La cotización ha expirado') {
    super(message);
  }
}

export class InvalidQuoteStateException extends DomainException {
  constructor(message = 'La cotización no está en borrador') {
    super(message);
  }
}

export class QuoteNotPayableException extends DomainException {
  constructor(message = 'La cotización no admite pago') {
    super(message);
  }
}

export class QuoteAlreadyConvertedException extends DomainException {
  constructor(message = 'La cotización ya fue convertida') {
    super(message);
  }
}


export class PaymentAmountMismatchException extends DomainException {
  constructor(
    message = 'El importe debe coincidir con el total de la cotización',
  ) {
    super(message);
  }
}

export class InvalidFolioException extends DomainException {
  constructor(message = 'No se pudo generar un folio único') {
    super(message);
  }
}

export class InvalidExpirationDateException extends DomainException {
  constructor(message = 'La fecha de expiración debe ser futura') {
    super(message);
  }
}

export class RelatedRecordConflictException extends DomainException {
  constructor(message = 'Conflicto con un registro relacionado') {
    super(message);
  }
}

export class InvalidSizeSelectionException extends DomainException {
  constructor(message = 'Talla inválida para el producto') {
    super(message);
  }
}
