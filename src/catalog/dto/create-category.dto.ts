import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { SLUG_PATTERN } from '../slugify.js';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Anillos', maxLength: 100 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'anillos', pattern: SLUG_PATTERN.source })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @Matches(SLUG_PATTERN)
  slug?: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 500,
    example: 'Joyería de anillos',
  })
  @ValidateIf(
    (_object, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @MaxLength(500)
  description?: string | null;
}
