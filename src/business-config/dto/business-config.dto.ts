import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PHONE_PATTERN } from '../../common/validation/patterns.js';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/** Persona moral (3 letters) or física (4 letters) + YYMMDD + homoclave. */
export const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;

export class UpdateBusinessConfigDto {
  @ApiProperty({ example: 'Kamadeva Boutique & Streetwear', maxLength: 150 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  nombre: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Kamadeva Sex Shop',
    maxLength: 200,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  razonSocial?: string | null;

  @ApiProperty({ example: 'Av. Insurgentes Sur #450 Int. 2B', maxLength: 255 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  direccion: string;

  @ApiProperty({ example: 'Roma Sur', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  colonia: string;

  @ApiProperty({ example: 'Cuauhtémoc', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  municipio: string;

  @ApiProperty({ example: 'Ciudad de México', maxLength: 100 })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  estado: string;

  @ApiProperty({
    example: '55-1234-5678',
    maxLength: 50,
    description: 'Dígitos y separadores (espacio + - ( ) .); mínimo 7 dígitos',
  })
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  @Matches(PHONE_PATTERN, { message: 'Teléfono inválido' })
  telefono: string;

  @ApiProperty({
    example: 'KAM210315ABC',
    description:
      'RFC de 12 (moral) o 13 (física) caracteres; se guarda en mayúsculas',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @Matches(RFC_PATTERN, { message: 'RFC inválido' })
  rfc: string;

  @ApiProperty({
    example: '¡GRACIAS POR SU COMPRA! SÍGUENOS EN @KAMADEVA_MX',
    maxLength: 500,
    description: 'Pie del ticket; admite saltos de línea',
  })
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  mensajePie: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'Gracias por su compra',
    maxLength: 500,
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  mensajeTicket?: string | null;

  @ApiPropertyOptional({ example: 'MXN', default: 'MXN', maxLength: 10 })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  moneda?: string;

  @ApiPropertyOptional({
    example: 0,
    default: 0,
    minimum: 0,
    maximum: 100,
    multipleOf: 0.01,
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  impuestoPorcentaje?: number;
}

export class BusinessConfigDto extends UpdateBusinessConfigDto {
  @ApiProperty({ format: 'date-time' })
  updatedAt: string;
}
