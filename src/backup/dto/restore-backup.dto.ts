import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, ValidateIf } from 'class-validator';

export class RestoreBackupDto {
  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'true: solo valida el respaldo sin modificar la base de datos',
    default: 'false',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  vistaPrevia?: 'true' | 'false';

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description:
      'Obligatorio en true cuando vistaPrevia es false para confirmar el reemplazo total de datos',
    default: 'false',
  })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(['true', 'false'])
  confirmarReemplazo?: 'true' | 'false';
}
