import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsByteLength,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class LoginDto {
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
  correo?: string;

  @ApiPropertyOptional({
    example: 'Password123!',
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
  })
  @IsOptional()
  @IsString()
  contrasena?: string;
}
