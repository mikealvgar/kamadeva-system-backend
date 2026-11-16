export interface PrismaPaginationOptions {
  page?: number;
  size?: number;
  sortBy?: string;
  direction?: 'ASC' | 'DESC' | 'asc' | 'desc';
}

export interface ResolveOrderByOptions {
  sortBy?: string;
  direction?: 'ASC' | 'DESC' | 'asc' | 'desc';
  allowedFields: Record<string, string>;
  defaultOrderBy: Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[];
}

export function calculateSkipTake(query?: { page?: number; size?: number }): {
  skip: number;
  take: number;
} {
  const page = Math.max(1, Number(query?.page) || 1);
  const size = Math.max(1, Number(query?.size) || 10);
  return {
    skip: (page - 1) * size,
    take: size,
  };
}

export function resolvePrismaOrderBy(
  options: ResolveOrderByOptions,
): Record<string, 'asc' | 'desc'> | Record<string, 'asc' | 'desc'>[] {
  const { sortBy, direction, allowedFields, defaultOrderBy } = options;

  if (!sortBy) {
    return defaultOrderBy;
  }

  const targetField = allowedFields[sortBy] ?? allowedFields[sortBy.toLowerCase()];
  if (!targetField) {
    return defaultOrderBy;
  }

  const dir: 'asc' | 'desc' =
    direction?.toLowerCase() === 'desc' ? 'desc' : 'asc';

  return { [targetField]: dir };
}
