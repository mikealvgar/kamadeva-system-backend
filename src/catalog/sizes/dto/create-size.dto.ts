import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateSizeDto {
  @ApiProperty({
    example: 'M',
    maxLength: 20,
    description: 'Se guarda sin espacios laterales y en mayúsculas',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  name: string;

  @ApiPropertyOptional({ example: 20, default: 0, minimum: 0, maximum: 10000 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(10000)
  sortOrder?: number;
}
