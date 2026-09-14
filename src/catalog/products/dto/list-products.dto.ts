import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, IsUUID, ValidateIf } from 'class-validator';
import { ListCategoriesDto } from '../../dto/list-categories.dto.js';

export class ListProductsDto extends ListCategoriesDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({
    description:
      'Contiene en artículo, SKU o código de barras; ignora mayúsculas',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  search?: string;
}
