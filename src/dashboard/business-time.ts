/** Calendar date in the business time zone, as YYYY-MM-DD. */
export type LocalDate = string;

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsAt(instant: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const value = (type: string) =>
    Number(parts.find((part) => part.type === type)!.value);
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  };
}

/** Milliseconds the zone is ahead of UTC at a given instant. */
function offsetAt(instant: Date, timeZone: string): number {
  const p = partsAt(instant, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

const pad = (value: number, size = 2) => String(value).padStart(size, '0');

function split(date: LocalDate): [number, number, number] {
  const [year, month, day] = date.split('-').map(Number);
  return [year!, month!, day!];
}

export function localDate(instant: Date, timeZone: string): LocalDate {
  const p = partsAt(instant, timeZone);
  return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}`;
}

/** UTC instant of local midnight starting the given calendar date. */
export function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  const [year, month, day] = split(date);
  const guess = Date.UTC(year, month - 1, day);
  // Re-check once so a DST change between guess and result is honored.
  let result = guess - offsetAt(new Date(guess), timeZone);
  result = guess - offsetAt(new Date(result), timeZone);
  return new Date(result);
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const [year, month, day] = split(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

export interface LocalRange {
  /** Every calendar date in the range, in order. */
  days: LocalDate[];
  /** UTC instant of the first day's midnight (inclusive). */
  start: Date;
  /** UTC instant of the midnight after the last day (exclusive). */
  end: Date;
}

function rangeOf(
  first: LocalDate,
  count: number,
  timeZone: string,
): LocalRange {
  const days = Array.from({ length: count }, (_, index) =>
    addDays(first, index),
  );
  return {
    days,
    start: startOfLocalDay(first, timeZone),
    end: startOfLocalDay(addDays(first, count), timeZone),
  };
}

export function dayRange(now: Date, timeZone: string): LocalRange {
  return rangeOf(localDate(now, timeZone), 1, timeZone);
}

/** Monday through Sunday of the local week containing `now`. */
export function weekRange(now: Date, timeZone: string): LocalRange {
  const today = localDate(now, timeZone);
  const [year, month, day] = split(today);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return rangeOf(addDays(today, -((weekday + 6) % 7)), 7, timeZone);
}

export function monthRange(now: Date, timeZone: string): LocalRange {
  const [year, month] = split(localDate(now, timeZone));
  const length = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return rangeOf(`${pad(year, 4)}-${pad(month)}-01`, length, timeZone);
}
