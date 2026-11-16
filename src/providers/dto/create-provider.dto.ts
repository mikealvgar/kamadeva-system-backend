import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PHONE_PATTERN } from '../../common/validation/patterns.js';

const optionalText = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() || null : value;
const present = (_object: unknown, value: unknown): boolean =>
  value !== undefined && value !== null;

export class CreateProviderDto {
  @ApiProperty({ example: 'Textiles del Norte SA de CV', maxLength: 150 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 30,
    example: '81-1234-5678',
  })
  @Transform(optionalText)
  @ValidateIf(present)
  @IsString()
  @MaxLength(30)
  @Matches(PHONE_PATTERN, { message: 'Teléfono inválido' })
  telefono?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'email',
    maxLength: 150,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || null : value,
  )
  @ValidateIf(present)
  @IsEmail()
  @MaxLength(150)
  correo?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    format: 'email',
    maxLength: 150,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() || null : value,
  )
  @ValidateIf(present)
  @IsEmail()
  @MaxLength(150)
  email?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 100,
    example: 'Laura Gómez',
  })
  @Transform(optionalText)
  @ValidateIf(present)
  @IsString()
  @MaxLength(100)
  nombreContacto?: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    maxLength: 100,
    example: 'Laura Gómez',
  })
  @Transform(optionalText)
  @ValidateIf(present)
  @IsString()
  @MaxLength(100)
  contacto?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 255 })
  @Transform(optionalText)
  @ValidateIf(present)
  @IsString()
  @MaxLength(255)
  direccion?: string | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  activo?: boolean;
}
