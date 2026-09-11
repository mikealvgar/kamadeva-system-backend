import { durationSeconds, validateEnvironment } from './environment.js';

const valid = {
  DATABASE_URL: 'postgresql://test:test@localhost/test',
  JWT_ACCESS_SECRET: 'access',
  JWT_REFRESH_SECRET: 'refresh',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_IN: '7d',
};

describe('Environment validation', () => {
  it('normalizes durations and defaults bcrypt to 12', () => {
    expect(validateEnvironment(valid)).toMatchObject({
      JWT_ACCESS_EXPIRES_IN: 900,
      JWT_REFRESH_EXPIRES_IN: 604800,
      BCRYPT_ROUNDS: 12,
    });
    expect(durationSeconds('60', 'ttl')).toBe(60);
    expect(durationSeconds('2h', 'ttl')).toBe(7200);
  });
  it.each(Object.keys(valid))('rejects missing or blank %s', (key) => {
    expect(() => validateEnvironment({ ...valid, [key]: undefined })).toThrow(
      key,
    );
    expect(() => validateEnvironment({ ...valid, [key]: ' ' })).toThrow(key);
  });
  it.each(['0', '-1', 'infinite', '0.5s', '1ms', '999999999999d'])(
    'rejects invalid lifetime %s',
    (ttl) => {
      expect(() =>
        validateEnvironment({ ...valid, JWT_ACCESS_EXPIRES_IN: ttl }),
      ).toThrow('JWT_ACCESS_EXPIRES_IN');
    },
  );
  it.each(['', '3', '32', '4.5', 'abc'])(
    'rejects invalid bcrypt cost %s',
    (cost) => {
      expect(() =>
        validateEnvironment({ ...valid, BCRYPT_ROUNDS: cost }),
      ).toThrow('BCRYPT_ROUNDS');
    },
  );
  it('rejects a non PostgreSQL URL and identical signing secrets', () => {
    expect(() =>
      validateEnvironment({ ...valid, DATABASE_URL: 'https://localhost' }),
    ).toThrow('DATABASE_URL');
    expect(() =>
      validateEnvironment({ ...valid, JWT_REFRESH_SECRET: 'access' }),
    ).toThrow('secretos');
  });
});
