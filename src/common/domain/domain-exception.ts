/** Base for business-rule failures; presentation mappers translate them to HTTP. */
export class DomainException extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class InvalidAmountException extends DomainException {
  constructor(message = 'Importe fuera de rango') {
    super(message);
  }
}
