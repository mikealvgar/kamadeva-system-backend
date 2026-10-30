export type FolioSeries = 'C' | 'V';

// Random folios issued before the gapless counters; still valid when read back.
const LEGACY_FOLIO = /^(COT|VEN)-\d{8}-[A-Z0-9]{6}$/;
const SEQUENTIAL_FOLIO = /^[CV]-\d{6,}$/;

export class Folio {
  private readonly value: string;

  constructor(value: string) {
    const trimmed = value.trim();
    if (!SEQUENTIAL_FOLIO.test(trimmed) && !LEGACY_FOLIO.test(trimmed)) {
      throw new Error(`Formato de folio inválido: ${value}`);
    }
    this.value = trimmed;
  }

  /** `C-000045` for quotes, `V-000123` for sales; grows past six digits. */
  static fromSequence(series: FolioSeries, value: number): Folio {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error(`Consecutivo de folio inválido: ${value}`);
    }
    return new Folio(`${series}-${String(value).padStart(6, '0')}`);
  }

  get series(): FolioSeries {
    return this.value.startsWith('C') ? 'C' : 'V';
  }

  equals(other: Folio): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
