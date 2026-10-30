import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength, ValidateIf } from 'class-validator';

const optional = (_object: unknown, value: unknown): boolean =>
  value !== undefined;

/** Multipart text fields sent alongside the file. */
export class ImportProductsDto {
  @ApiPropertyOptional({
    enum: ['true', 'false'],
    default: 'false',
    description: 'true: valida y reporta sin escribir nada',
  })
  @ValidateIf(optional)
  @IsIn(['true', 'false'])
  dryRun?: 'true' | 'false';

  @ApiPropertyOptional({
    description:
      'JSON: categoría del Excel → categoría destino, o null para importar sin categoría. Ej. {"FESTISH":"FETISH","DILDO":null}',
  })
  @ValidateIf(optional)
  @IsString()
  @MaxLength(20000)
  categoryMap?: string;
}

export class ImportSkipDto {
  @ApiProperty({ example: 455 }) row: number;
  @ApiProperty({ type: String, nullable: true }) codigoBarras: string | null;
  @ApiProperty({ type: String, nullable: true }) articulo: string | null;
  @ApiProperty({ example: 'Duplicado en el archivo (renglón 138)' })
  reason: string;
}

export class ImportErrorDto {
  @ApiProperty({ example: 164 }) row: number;
  @ApiProperty({ type: String, nullable: true }) codigoBarras: string | null;
  @ApiProperty({ type: String, nullable: true }) articulo: string | null;
  @ApiProperty({
    example: 'Código compartido por productos distintos (renglones 164, 165)',
  })
  message: string;
}

export class ImportReportDto {
  @ApiProperty() dryRun: boolean;
  @ApiProperty({ example: 672, description: 'Renglones con datos' })
  totalRows: number;
  @ApiProperty({
    example: 610,
    description: 'Productos creados (o que se crearían en dryRun)',
  })
  created: number;
  @ApiProperty({ type: [ImportSkipDto] }) skipped: ImportSkipDto[];
  @ApiProperty({ type: [ImportErrorDto] }) errors: ImportErrorDto[];
  @ApiProperty({ type: [String], example: ['LENCERIA', 'VIBRADOR'] })
  categoriesCreated: string[];
  @ApiProperty({
    example: 172,
    description: 'Productos creados sin categoría',
  })
  withoutCategory: number;
}
