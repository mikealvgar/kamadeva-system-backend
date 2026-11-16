import type {} from 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  MaxFileSizeValidator,
  ParseFilePipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { BackupService } from './backup.service.js';
import { RestoreBackupResultDto } from './backup.types.js';
import { RestoreBackupDto } from './dto/restore-backup.dto.js';

const BACKUP_MAX_BYTES = 20 * 1024 * 1024;
const GZIP_MIME = 'application/gzip';

@ApiTags('respaldo')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({ description: 'Archivo o parámetros de respaldo inválidos' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('respaldo')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  @Get('exportar')
  @ApiProduces(GZIP_MIME)
  @ApiOkResponse({
    description: 'Archivo de respaldo completo comprimido (.json.gz)',
    schema: { type: 'string', format: 'binary' },
  })
  async export(): Promise<StreamableFile> {
    const { buffer, filename } = await this.backup.exportBackup();
    return new StreamableFile(buffer, {
      type: GZIP_MIME,
      disposition: `attachment; filename="${filename}"`,
      length: buffer.length,
    });
  }

  @Post('restaurar')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        vistaPrevia: { type: 'string', enum: ['true', 'false'] },
        confirmarReemplazo: { type: 'string', enum: ['true', 'false'] },
      },
    },
  })
  @ApiOkResponse({ type: RestoreBackupResultDto })
  @UseInterceptors(FileInterceptor('file'))
  restore(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: BACKUP_MAX_BYTES })],
        exceptionFactory: () =>
          new BadRequestException(
            'Archivo requerido y debe pesar como máximo 20 MiB',
          ),
      }),
    )
    file: Express.Multer.File,
    @Body() dto: RestoreBackupDto,
  ): Promise<RestoreBackupResultDto> {
    return this.backup.restoreBackup(file.buffer, dto);
  }
}
