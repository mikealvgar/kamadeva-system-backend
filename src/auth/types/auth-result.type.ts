import type { AuthUser } from './auth-user.type.js';

export type TokenPair = { accessToken: string; refreshToken: string };
export type AuthResult = TokenPair & { user: AuthUser };
