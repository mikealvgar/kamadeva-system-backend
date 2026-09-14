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
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { CategoriesService } from './categories.service.js';
import { CategoryDto } from './dto/category.dto.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';
import { ListCategoriesDto } from './dto/list-categories.dto.js';

@ApiTags('catalog/categories')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({ description: 'Datos, query o UUID inválidos' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('catalog/categories')
export class CategoriesController {
  constructor(private readonly categories: CategoriesService) {}

  @Post()
  @Roles('ADMIN')
  @ApiCreatedResponse({ type: CategoryDto })
  @ApiConflictResponse({ description: 'El slug ya existe' })
  create(@Body() dto: CreateCategoryDto): Promise<CategoryDto> {
    return this.categories.create(dto);
  }

  @Get()
  @Roles('ADMIN', 'VENDEDOR')
  @ApiOkResponse({ type: [CategoryDto] })
  findAll(@Query() query: ListCategoriesDto): Promise<CategoryDto[]> {
    return this.categories.findAll(query.includeInactive === 'true');
  }

  @Get(':id')
  @Roles('ADMIN', 'VENDEDOR')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CategoryDto })
  @ApiNotFoundResponse({ description: 'Categoría inexistente' })
  findById(@Param('id', new ParseUUIDPipe()) id: string): Promise<CategoryDto> {
    return this.categories.findById(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CategoryDto })
  @ApiNotFoundResponse({ description: 'Categoría inexistente' })
  @ApiConflictResponse({ description: 'El slug ya existe' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Categoría eliminada' })
  @ApiNotFoundResponse({ description: 'Categoría inexistente' })
  @ApiConflictResponse({
    description: 'La categoría tiene productos asociados',
  })
  delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.categories.delete(id);
  }
}
