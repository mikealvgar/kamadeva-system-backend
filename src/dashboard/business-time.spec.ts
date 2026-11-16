import {
  addDays,
  dayRange,
  localDate,
  monthRange,
  startOfLocalDay,
  weekRange,
} from './business-time.js';

const MX = 'America/Mexico_City'; // UTC−6, no DST since 2022

describe('business time', () => {
  it('uses the local calendar date, not the UTC one', () => {
    // 23:30 in Mexico City is already the next day in UTC.
    const lateEvening = new Date('2026-10-31T05:30:00Z');
    expect(localDate(lateEvening, MX)).toBe('2026-10-30');
    expect(dayRange(lateEvening, MX)).toEqual({
      days: ['2026-10-30'],
      start: new Date('2026-10-30T06:00:00Z'),
      end: new Date('2026-10-31T06:00:00Z'),
    });
  });

  it('builds Monday-to-Sunday weeks', () => {
    // Friday 2026-10-30 local.
    const week = weekRange(new Date('2026-10-30T18:00:00Z'), MX);
    expect(week.days).toEqual([
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ]);
    expect(week.start).toEqual(new Date('2026-10-26T06:00:00Z'));
    expect(week.end).toEqual(new Date('2026-11-02T06:00:00Z'));
    // A Sunday belongs to the week that started six days earlier.
    expect(weekRange(new Date('2026-11-01T20:00:00Z'), MX).days[0]).toBe(
      '2026-10-26',
    );
    // A Monday starts its own week.
    expect(weekRange(new Date('2026-10-26T07:00:00Z'), MX).days[0]).toBe(
      '2026-10-26',
    );
  });

  it('builds whole calendar months, including leap February', () => {
    const october = monthRange(new Date('2026-10-30T18:00:00Z'), MX);
    expect(october.days).toHaveLength(31);
    expect(october.days[0]).toBe('2026-10-01');
    expect(october.end).toEqual(new Date('2026-11-01T06:00:00Z'));
    expect(monthRange(new Date('2028-02-10T18:00:00Z'), MX).days).toHaveLength(
      29,
    );
  });

  it('honors DST transitions when computing local midnight', () => {
    const ny = 'America/New_York';
    // Before and after the 2026-11-01 fall-back change.
    expect(startOfLocalDay('2026-10-31', ny)).toEqual(
      new Date('2026-10-31T04:00:00Z'),
    );
    expect(startOfLocalDay('2026-11-02', ny)).toEqual(
      new Date('2026-11-02T05:00:00Z'),
    );
    // The transition day itself is 25 hours long.
    const day = dayRange(new Date('2026-11-01T12:00:00Z'), ny);
    expect(day.end.getTime() - day.start.getTime()).toBe(25 * 3_600_000);
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});
