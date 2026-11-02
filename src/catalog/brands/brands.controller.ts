import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import { BrandsService } from './brands.service.js';
import { BrandDto } from './dto/brand.dto.js';
import { CreateBrandDto } from './dto/create-brand.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';
import { ListBrandsDto } from './dto/list-brands.dto.js';

@ApiTags('catalogo/marcas')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({ description: 'Datos, query o UUID inválidos' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('catalogo/marcas')
export class BrandsController {
  constructor(private readonly brands: BrandsService) {}

  @Post()
  @Roles('ADMIN')
  @ApiCreatedResponse({ type: BrandDto })
  @ApiConflictResponse({ description: 'La marca ya existe' })
  create(@Body() dto: CreateBrandDto): Promise<BrandDto> {
    return this.brands.create(dto);
  }

  @Get()
  @Roles('ADMIN', 'VENDEDOR')
  @ApiOkResponse({ type: [BrandDto] })
  findAll(@Query() query: ListBrandsDto): Promise<BrandDto[]> {
    return this.brands.findAll(query.includeInactive === 'true');
  }

  @Get(':id')
  @Roles('ADMIN', 'VENDEDOR')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: BrandDto })
  @ApiNotFoundResponse({ description: 'Marca inexistente' })
  findById(@Param('id', new ParseUUIDPipe()) id: string): Promise<BrandDto> {
    return this.brands.findById(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: BrandDto })
  @ApiNotFoundResponse({ description: 'Marca inexistente' })
  @ApiConflictResponse({ description: 'La marca ya existe' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBrandDto,
  ): Promise<BrandDto> {
    return this.brands.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Marca eliminada' })
  @ApiNotFoundResponse({ description: 'Marca inexistente' })
  @ApiConflictResponse({
    description: 'La marca tiene productos asociados',
  })
  delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.brands.delete(id);
  }
}
