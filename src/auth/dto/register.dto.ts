import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsByteLength,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class RegisterDto {
  @ApiPropertyOptional({
    example: 'Juan Perez',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(
    ({
      value,
      obj,
    }: {
      value: unknown;
      obj?: Record<string, unknown>;
    }) => {
      const val = value ?? obj?.nombre;
      return typeof val === 'string' ? val.trim() : val;
    },
  )
  name?: string;

  @ApiPropertyOptional({
    example: 'Juan Perez',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @ApiPropertyOptional({
    example: 'juan@kamadeva.com',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(
    ({
      value,
      obj,
    }: {
      value: unknown;
      obj?: Record<string, unknown>;
    }) => {
      const val = value ?? obj?.correo;
      return typeof val === 'string' ? val.trim().toLowerCase() : val;
    },
  )
  email?: string;

  @ApiPropertyOptional({
    example: 'juan@kamadeva.com',
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  correo?: string;

  @ApiPropertyOptional({
    example: 'Password123!',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @IsByteLength(0, 72)
  @Transform(
    ({
      value,
      obj,
    }: {
      value: unknown;
      obj?: Record<string, unknown>;
    }) => {
      return value ?? obj?.contrasena;
    },
  )
  password?: string;

  @ApiPropertyOptional({
    example: 'Password123!',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @IsByteLength(0, 72)
  contrasena?: string;

  @ApiPropertyOptional({
    example: '8112345678',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  telefono?: string;

  @ApiPropertyOptional({
    format: 'uuid',
    required: false,
  })
  @IsOptional()
  @IsUUID()
  rolId?: string;
}
