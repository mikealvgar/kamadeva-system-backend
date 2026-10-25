import { randomUUID } from 'node:crypto';

export class Folio {
  private readonly value: string;

  constructor(value: string) {
    const trimmed = value.trim();
    if (!/^(COT|VEN)-\d{8}-[A-Z0-9]{6}$/.test(trimmed)) {
      throw new Error(`Formato de folio inválido: ${value}`);
    }
    this.value = trimmed;
  }

  static generate(prefix: 'COT' | 'VEN', date = new Date()): Folio {
    const datePart = date.toISOString().slice(0, 10).replaceAll('-', '');
    const randomPart = randomUUID().replaceAll('-', '').slice(0, 6).toUpperCase();
    return new Folio(`${prefix}-${datePart}-${randomPart}`);
  }

  get prefix(): 'COT' | 'VEN' {
    return this.value.slice(0, 3) as 'COT' | 'VEN';
  }

  equals(other: Folio): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
