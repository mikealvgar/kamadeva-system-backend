/**
 * A line item must name one of the product's active sizes when the product
 * has any, and must not name a size otherwise.
 */
export function isValidSizeSelection(
  sizeId: string | null | undefined,
  activeSizeIds: ReadonlySet<string> | undefined,
): boolean {
  const hasSizes = activeSizeIds !== undefined && activeSizeIds.size > 0;
  if (!hasSizes) return sizeId === undefined || sizeId === null;
  return typeof sizeId === 'string' && activeSizeIds.has(sizeId);
}
