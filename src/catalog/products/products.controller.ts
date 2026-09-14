import type {} from 'multer';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { CreateProductDto } from './dto/create-product.dto.js';
import { UpdateProductDto } from './dto/update-product.dto.js';
import { ListProductsDto } from './dto/list-products.dto.js';
import { ProductDto } from './dto/product.dto.js';
import { InventoryMovementDto } from './dto/inventory-movement.dto.js';
import { ProductsService } from './products.service.js';
import { ProductImageSizeFilter } from './product-image-size.filter.js';

const imageLimit = 5 * 1024 * 1024;
const imageTypes = /^image\/(jpeg|png|webp)$/;

@ApiTags('catalog/products')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({
  description: 'Datos, query, UUID o archivo inválidos',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('catalog/products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Post()
  @Roles('ADMIN')
  @ApiCreatedResponse({ type: ProductDto })
  @ApiNotFoundResponse({ description: 'Categoría inexistente' })
  @ApiConflictResponse({ description: 'El SKU o código de barras ya existe' })
  create(@Body() dto: CreateProductDto): Promise<ProductDto> {
    return this.products.create(dto);
  }

  @Get()
  @Roles('ADMIN', 'VENDEDOR')
  @ApiOkResponse({ type: [ProductDto] })
  findAll(@Query() query: ListProductsDto): Promise<ProductDto[]> {
    return this.products.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'VENDEDOR')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ProductDto })
  @ApiNotFoundResponse({ description: 'Producto inexistente' })
  findById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<ProductDto> {
    return this.products.findById(id);
  }

  @Get(':id/movements')
  @Roles('ADMIN', 'VENDEDOR')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: [InventoryMovementDto] })
  @ApiNotFoundResponse({ description: 'Producto inexistente' })
  movements(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<InventoryMovementDto[]> {
    return this.products.movements(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ProductDto })
  @ApiNotFoundResponse({ description: 'Producto o categoría inexistente' })
  @ApiConflictResponse({ description: 'El SKU o código de barras ya existe' })
  update(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ProductDto> {
    return this.products.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Producto eliminado' })
  @ApiNotFoundResponse({ description: 'Producto inexistente' })
  @ApiConflictResponse({ description: 'El producto tiene registros asociados' })
  delete(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    return this.products.delete(id);
  }

  @Post(':id/image')
  @HttpCode(200)
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'JPEG, PNG o WebP; hasta 5 MB',
        },
      },
    },
  })
  @ApiOkResponse({ type: ProductDto })
  @ApiNotFoundResponse({ description: 'Producto inexistente' })
  @ApiBadGatewayResponse({ description: 'No se pudo subir la imagen' })
  @UseFilters(ProductImageSizeFilter)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: imageLimit + 1, files: 1, fields: 0 },
      fileFilter: (_request, file, callback) => {
        if (!imageTypes.test(file.mimetype))
          return callback(
            new BadRequestException('Formato de imagen inválido'),
            false,
          );
        callback(null, true);
      },
    }),
  )
  uploadImage(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          // MaxFileSizeValidator is exclusive; this accepts exactly 5 MiB.
          new MaxFileSizeValidator({ maxSize: imageLimit + 1 }),
          new FileTypeValidator({
            fileType: imageTypes,
            overrideMimeType: true,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
  ): Promise<ProductDto> {
    return this.products.uploadImage(id, file.buffer, file.mimetype);
  }
}
