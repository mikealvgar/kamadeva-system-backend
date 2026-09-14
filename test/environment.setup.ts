import { inject } from 'vitest';

process.env.DATABASE_URL = inject('databaseUrl');
process.env.JWT_ACCESS_SECRET = 'test-only-access-secret-not-for-deployment';
process.env.JWT_REFRESH_SECRET = 'test-only-refresh-secret-not-for-deployment';
process.env.JWT_ACCESS_EXPIRES_IN = '15m';
process.env.JWT_REFRESH_EXPIRES_IN = '7d';
process.env.BCRYPT_ROUNDS = '4';
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
process.env.CLOUDINARY_API_KEY = 'test-key';
process.env.CLOUDINARY_API_SECRET = 'test-secret';
