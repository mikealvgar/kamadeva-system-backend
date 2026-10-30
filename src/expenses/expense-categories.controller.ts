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
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto.js';
import { ExpenseCategoryDto } from './dto/expense-category.dto.js';
import { ListExpenseCategoriesDto } from './dto/list-expense-categories.dto.js';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto.js';
import { ExpenseCategoriesService } from './expense-categories.service.js';

@ApiTags('expense-categories')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({ description: 'Datos, query o UUID inválidos' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly categories: ExpenseCategoriesService) {}

  @Post()
  @Roles('ADMIN')
  @ApiCreatedResponse({ type: ExpenseCategoryDto })
  @ApiConflictResponse({ description: 'La categoría de gasto ya existe' })
  create(@Body() dto: CreateExpenseCategoryDto): Promise<ExpenseCategoryDto> {
    return this.categories.create(dto);
  }

  @Get()
  @Roles('ADMIN', 'VENDEDOR')
  @ApiOkResponse({ type: [ExpenseCategoryDto] })
  findAll(
    @Query() query: ListExpenseCategoriesDto,
  ): Promise<ExpenseCategoryDto[]> {
    return this.categories.findAll(query.includeInactive === 'true');
  }

  @Get(':id')
  @Roles('ADMIN', 'VENDEDOR')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ExpenseCategoryDto })
  @ApiNotFoundResponse({ description: 'Categoría de gasto inexistente' })
  findById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<ExpenseCategoryDto> {
    return this.categories.findById(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ExpenseCategoryDto })
  @ApiNotFoundResponse({ description: 'Categoría de gasto inexistente' })
  @ApiConflictResponse({ description: 'La categoría de gasto ya existe' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateExpenseCategoryDto,
  ): Promise<ExpenseCategoryDto> {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Categoría eliminada' })
  @ApiNotFoundResponse({ description: 'Categoría de gasto inexistente' })
  @ApiConflictResponse({
    description:
      'La categoría tiene gastos asociados; desactivarla en su lugar',
  })
  delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.categories.delete(id);
  }
}
