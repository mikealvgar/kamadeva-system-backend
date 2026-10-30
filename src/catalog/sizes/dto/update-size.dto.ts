import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, ValidateIf } from 'class-validator';
import { CreateSizeDto } from './create-size.dto.js';

export class UpdateSizeDto extends PartialType(CreateSizeDto, {
  skipNullProperties: false,
}) {
  @ApiPropertyOptional({ example: true })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
