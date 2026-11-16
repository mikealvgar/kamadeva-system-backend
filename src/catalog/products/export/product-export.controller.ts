import {
  Controller,
  Get,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../../auth/guards/roles.guard.js';
import { ExportProductsDto } from '../dto/export-products.dto.js';
import { ProductExportService } from './product-export.service.js';

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

@ApiTags('productos')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({ description: 'Filtros de exportación inválidos' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('productos/exportacion')
export class ProductExportController {
  constructor(private readonly exportService: ProductExportService) {}

  @Get()
  @Roles('ADMIN')
  @ApiProduces(XLSX_MIME)
  @ApiOkResponse({
    description: 'Archivo Excel (.xlsx) con el catálogo de productos',
    schema: { type: 'string', format: 'binary' },
  })
  async export(@Query() query: ExportProductsDto): Promise<StreamableFile> {
    const { buffer, filename } = await this.exportService.exportToExcel(query);
    return new StreamableFile(buffer, {
      type: XLSX_MIME,
      disposition: `attachment; filename="${filename}"`,
      length: buffer.length,
    });
  }
}
