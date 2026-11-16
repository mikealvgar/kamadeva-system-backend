import { ApiProperty } from '@nestjs/swagger';

export class PaginatedResponseDto<T> {
  @ApiProperty({ description: 'Lista de elementos obtenidos para la página' })
  data!: T[];

  @ApiProperty({ description: 'Página actual devuelta (base 1)', example: 1 })
  current_page!: number;

  @ApiProperty({ description: 'Cantidad total de registros existentes', example: 48 })
  total_items!: number;

  @ApiProperty({ description: 'Cantidad total de páginas calculadas', example: 5 })
  total_pages!: number;

  @ApiProperty({ description: 'Indica si existe una página siguiente', example: true })
  has_next_page!: boolean;

  @ApiProperty({ description: 'Indica si existe una página anterior', example: false })
  has_prev_page!: boolean;
}

export function createPaginatedResponse<T>(params: {
  items: T[];
  totalRecords: number;
  page?: number;
  size?: number;
  extra?: Record<string, unknown>;
}): PaginatedResponseDto<T> & Record<string, unknown> {
  const current_page = Math.max(1, params.page ?? 1);
  const size = Math.max(1, params.size ?? 10);
  const total_items = Math.max(0, params.totalRecords);
  const total_pages = total_items === 0 ? 0 : Math.ceil(total_items / size);
  const has_next_page = total_pages > 0 && current_page < total_pages;
  const has_prev_page = current_page > 1;

  return {
    data: params.items,
    current_page,
    total_items,
    total_pages,
    has_next_page,
    has_prev_page,
    ...params.extra,
  };
}
