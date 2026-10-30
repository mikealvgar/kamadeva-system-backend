import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, ValidateIf } from 'class-validator';
import { CreateExpenseCategoryDto } from './create-expense-category.dto.js';

export class UpdateExpenseCategoryDto extends PartialType(
  CreateExpenseCategoryDto,
  { skipNullProperties: false },
) {
  @ApiPropertyOptional({ example: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
