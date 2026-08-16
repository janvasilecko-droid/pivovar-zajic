export const BUSINESS_TIME_ZONE = 'Europe/Prague';

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
};

function businessParts(value: Date): DateParts {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
  };
}

/** Czech brewery business date, independent of the device's configured zone. */
export function businessDateISO(value: Date = new Date()): string {
  const { year, month, day } = businessParts(value);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Current hour in the brewery time zone (Europe/Prague). */
export function businessHour(value: Date = new Date()): number {
  return businessParts(value).hour;
}
