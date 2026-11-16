import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsByteLength,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ROLE_NAMES, type RoleName } from '../../roles/role-names.js';

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Juan Pérez', maxLength: 200 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nombre?: string;

  @ApiPropertyOptional({
    example: 'Juan Pérez',
    maxLength: 200,
    required: false,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({
    example: 'juan@kamadeva.com',
    format: 'email',
    maxLength: 254,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  correo?: string;

  @ApiPropertyOptional({
    example: 'juan@kamadeva.com',
    format: 'email',
    maxLength: 254,
    required: false,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @ApiPropertyOptional({
    example: '8112345678',
    maxLength: 30,
    nullable: true,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(30)
  telefono?: string | null;

  @ApiPropertyOptional({
    example: '8112345678',
    maxLength: 30,
    nullable: true,
    required: false,
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || null : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({
    example: 'NuevaContrasena123!',
    minLength: 8,
    maxLength: 72,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @IsByteLength(0, 72)
  contrasena?: string;

  @ApiPropertyOptional({
    example: 'NuevaContrasena123!',
    minLength: 8,
    maxLength: 72,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @IsByteLength(0, 72)
  password?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @ApiPropertyOptional({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @IsOptional()
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    { message: 'rolId debe ser un UUID válido' },
  )
  rolId?: string | null;

  @ApiPropertyOptional({ enum: ROLE_NAMES, required: false })
  @IsOptional()
  @IsIn(ROLE_NAMES)
  rol?: RoleName;
}
