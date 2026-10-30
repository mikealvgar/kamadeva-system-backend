import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, ValidateIf } from 'class-validator';
import { CreateProviderDto } from './create-provider.dto.js';

export class UpdateProviderDto extends PartialType(CreateProviderDto, {
  skipNullProperties: false,
}) {
  @ApiPropertyOptional({ example: false })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;
}
