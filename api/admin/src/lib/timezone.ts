let configuredTimeZone = '';
let effectiveTimeZone = '';

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    return '';
  }
}

function isValidTimeZone(timeZone?: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function setAdminTimeZone(configured?: string, effective?: string) {
  configuredTimeZone = (configured || '').trim();
  effectiveTimeZone = (effective || '').trim();
}

export function adminTimeZone(): string {
  if (isValidTimeZone(configuredTimeZone)) return configuredTimeZone;
  if (isValidTimeZone(effectiveTimeZone)) return effectiveTimeZone;
  return browserTimeZone() || 'UTC';
}

export function formatWithAdminTimeZone(
  date: Date,
  locale: string,
  options: Intl.DateTimeFormatOptions,
): string {
  const timeZone = adminTimeZone();
  try {
    return date.toLocaleString(locale, { ...options, timeZone });
  } catch {
    return date.toLocaleString(locale, options);
  }
}
