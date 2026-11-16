import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, ValidateIf } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';

export class ListProvidersDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Buscar en nombre, contacto, correo o teléfono, sin distinguir mayúsculas',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(150)
  search?: string;

  @ApiPropertyOptional({ enum: ['true', 'false'], default: 'false' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  includeInactive?: 'true' | 'false';
}
