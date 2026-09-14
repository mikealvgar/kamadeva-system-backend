/** Durations accept integer seconds or an explicit s/m/h/d suffix. */
export function durationSeconds(value: unknown, key: string): number {
  const match = String(value ?? '')
    .trim()
    .match(/^(\d+)\s*(s|m|h|d)?$/i);
  const units: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
  const seconds = match
    ? Number(match[1]) * units[(match[2] ?? 's').toLowerCase()]
    : 0;
  if (!Number.isSafeInteger(seconds) || seconds <= 0 || seconds > 315360000) {
    throw new Error(
      `${key} debe ser una duración positiva: segundos o sufijo s/m/h/d (máximo 10 años)`,
    );
  }
  return seconds;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const validated = { ...config };
  for (const key of [
    'DATABASE_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'JWT_ACCESS_EXPIRES_IN',
    'JWT_REFRESH_EXPIRES_IN',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
  ]) {
    if (typeof config[key] !== 'string' || !config[key].trim()) {
      throw new Error(`${key} es obligatorio`);
    }
  }
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(config.DATABASE_URL as string);
  } catch {
    throw new Error('DATABASE_URL debe ser una URL PostgreSQL válida');
  }
  if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol)) {
    throw new Error('DATABASE_URL debe ser una URL PostgreSQL válida');
  }
  if (config.JWT_ACCESS_SECRET === config.JWT_REFRESH_SECRET) {
    throw new Error('Los secretos de access y refresh deben ser distintos');
  }
  for (const key of ['JWT_ACCESS_EXPIRES_IN', 'JWT_REFRESH_EXPIRES_IN']) {
    validated[key] = durationSeconds(config[key], key);
  }
  const rounds =
    config.BCRYPT_ROUNDS === undefined ? 12 : Number(config.BCRYPT_ROUNDS);
  if (!Number.isInteger(rounds) || rounds < 4 || rounds > 31) {
    throw new Error('BCRYPT_ROUNDS debe ser un entero entre 4 y 31');
  }
  validated.BCRYPT_ROUNDS = rounds;
  return validated;
}
