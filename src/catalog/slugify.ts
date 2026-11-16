export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Shared normalization for catalog names. */
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
