import type {} from 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  ParseFilePipe,
  MaxFileSizeValidator,
  Post,
  Req,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../../auth/guards/roles.guard.js';
import type { AuthUser } from '../../../auth/types/auth-user.type.js';
import { ImportProductsDto, ImportReportDto } from './import-products.dto.js';
import { ImportFileSizeFilter } from './import-file-size.filter.js';
import { ProductImportService } from './product-import.service.js';

const fileLimit = 5 * 1024 * 1024;
const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('productos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('productos/importacion')
export class ProductImportController {
  constructor(private readonly importer: ProductImportService) {}

  @Post()
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: '.xlsx hasta 5 MB; primera hoja, renglón 1 encabezados',
        },
        dryRun: { type: 'string', enum: ['true', 'false'] },
        categoryMap: {
          type: 'string',
          description: 'JSON {"CATEGORIA EXCEL": "DESTINO" | null}',
        },
      },
    },
  })
  @ApiOkResponse({
    type: ImportReportDto,
    description:
      'Crea los productos nuevos; omite los existentes (mismo código y nombre) y reporta los renglones con error',
  })
  @ApiBadRequestResponse({
    description:
      'Archivo ausente, no .xlsx, mayor a 5 MB, sin columnas obligatorias o categoryMap inválido',
  })
  @ApiConflictResponse({
    description: 'Alta simultánea de los mismos códigos; reintentar',
  })
  @UseFilters(ImportFileSizeFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: fileLimit + 1, files: 1, fields: 2 },
      fileFilter: (_request, file, callback) => {
        if (
          file.mimetype !== XLSX_MIME &&
          !file.originalname.toLowerCase().endsWith('.xlsx')
        )
          return callback(
            new BadRequestException('El archivo debe ser .xlsx'),
            false,
          );
        callback(null, true);
      },
    }),
  )
  import(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: fileLimit + 1 })],
      }),
    )
    file: Express.Multer.File,
    @Body() dto: ImportProductsDto,
    @Req() req: { user: AuthUser },
  ): Promise<ImportReportDto> {
    return this.importer.import(file.buffer, {
      dryRun: dto.dryRun === 'true',
      categoryMap: dto.categoryMap,
      actorId: req.user.id,
    });
  }
}
