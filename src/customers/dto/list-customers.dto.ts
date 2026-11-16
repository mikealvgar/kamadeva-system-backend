import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListCustomersDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Buscar en nombre, correo o teléfono, sin distinguir mayúsculas',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], default: 'false' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  includeInactive?: 'true' | 'false';
}
