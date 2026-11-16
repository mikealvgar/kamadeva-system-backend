import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PaginatedResponseDto<T> {
  @ApiProperty({ description: 'Lista de elementos obtenidos para la página' })
  items!: T[];

  @ApiProperty({ description: 'Página actual devuelta (índice base 0)', example: 0 })
  page!: number;

  @ApiProperty({ description: 'Tamaño de página', example: 10 })
  size!: number;

  @ApiProperty({ description: 'Cantidad total de registros existentes', example: 42 })
  totalRecords!: number;

  @ApiProperty({ description: 'Cantidad total de páginas calculadas', example: 5 })
  totalPages!: number;

  @ApiProperty({ description: 'Booleano que indica si ya se llegó a la última página', example: false })
  isLastPage!: boolean;

  @ApiPropertyOptional({ description: 'Alias para items' })
  data?: T[];

  @ApiPropertyOptional({ description: 'Alias para totalRecords' })
  totalElements?: number;

  @ApiPropertyOptional({ description: 'Alias para isLastPage' })
  lastPage?: boolean;

  // Campos de compatibilidad en español
  @ApiPropertyOptional({ description: 'Alias de compatibilidad para items' })
  datos?: T[];

  @ApiPropertyOptional({ description: 'Alias de compatibilidad para totalRecords' })
  total?: number;

  @ApiPropertyOptional({ description: 'Alias de compatibilidad para page' })
  pagina?: number;

  @ApiPropertyOptional({ description: 'Alias de compatibilidad para size' })
  limite?: number;
}

export function createPaginatedResponse<T>(params: {
  items: T[];
  totalRecords: number;
  page?: number;
  size?: number;
  extra?: Record<string, unknown>;
}): PaginatedResponseDto<T> & Record<string, unknown> {
  const page = Math.max(0, params.page ?? 0);
  const size = Math.max(1, params.size ?? 10);
  const totalRecords = Math.max(0, params.totalRecords);
  const totalPages = totalRecords === 0 ? 0 : Math.ceil(totalRecords / size);
  const isLastPage = totalPages === 0 || page >= totalPages - 1;

  return {
    items: params.items,
    data: params.items,
    page,
    size,
    totalRecords,
    totalElements: totalRecords,
    totalPages,
    isLastPage,
    lastPage: isLastPage,
    // Compatibilidad adicional
    datos: params.items,
    total: totalRecords,
    pagina: page,
    limite: size,
    ...params.extra,
  };
}
