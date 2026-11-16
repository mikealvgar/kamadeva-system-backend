export const ROLE_NAMES = ['ADMIN', 'VENDEDOR'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export function isRoleName(value: unknown): value is RoleName {
  return value === 'ADMIN' || value === 'VENDEDOR';
}
