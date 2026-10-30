import { Prisma } from '../generated/prisma/client.js';

/** MXN bills and coins accepted in a cash count, highest first. */
export const DENOMINATIONS = [
  '1000',
  '500',
  '200',
  '100',
  '50',
  '20',
  '10',
  '5',
  '2',
  '1',
  '0.5',
] as const;
export type Denomination = (typeof DENOMINATIONS)[number];
export type DenominationCount = Record<Denomination, number>;

const MAX_PIECES = 100_000;

/** Invalid cashier input; the service maps it to 400. */
export class CashClosureInputError extends Error {}

export interface CashCount {
  denominations: DenominationCount;
  counted: Prisma.Decimal;
}

/** Validate a denomination → pieces map; missing keys count as zero. */
export function countCash(input: Record<string, unknown>): CashCount {
  const allowed = new Set<string>(DENOMINATIONS);
  for (const key of Object.keys(input)) {
    if (!allowed.has(key))
      throw new CashClosureInputError(`Denominación no permitida: ${key}`);
  }
  let counted = new Prisma.Decimal(0);
  const denominations = {} as DenominationCount;
  for (const key of DENOMINATIONS) {
    const pieces = input[key] ?? 0;
    if (
      typeof pieces !== 'number' ||
      !Number.isInteger(pieces) ||
      pieces < 0 ||
      pieces > MAX_PIECES
    )
      throw new CashClosureInputError(
        `Cantidad inválida para la denominación ${key}`,
      );
    denominations[key] = pieces;
    counted = counted.plus(new Prisma.Decimal(key).times(pieces));
  }
  return { denominations, counted };
}

export interface CashFlows {
  openingFloat: Prisma.Decimal;
  cashSales: Prisma.Decimal;
  cashRefunds: Prisma.Decimal;
  cashExpenses: Prisma.Decimal;
  adjustmentsIn: Prisma.Decimal;
  adjustmentsOut: Prisma.Decimal;
}

/** expected = float + cash sales − cash refunds − cash expenses + in − out */
export function expectedCash(flows: CashFlows): Prisma.Decimal {
  return flows.openingFloat
    .plus(flows.cashSales)
    .minus(flows.cashRefunds)
    .minus(flows.cashExpenses)
    .plus(flows.adjustmentsIn)
    .minus(flows.adjustmentsOut);
}

export function sum(values: Prisma.Decimal[]): Prisma.Decimal {
  return values.reduce(
    (total, value) => total.plus(value),
    new Prisma.Decimal(0),
  );
}
