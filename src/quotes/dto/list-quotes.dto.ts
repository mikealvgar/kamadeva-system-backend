import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsString, IsUUID, ValidateIf } from 'class-validator';
import { QuoteStatus } from '../../generated/prisma/client.js';

export class ListQuotesDto {
  @ApiPropertyOptional({ enum: QuoteStatus })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsEnum(QuoteStatus)
  status?: QuoteStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsUUID()
  customerId?: string;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsString()
  search?: string;
}
