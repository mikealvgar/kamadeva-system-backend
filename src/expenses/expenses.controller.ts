import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
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
import type { AuthUser } from '../auth/types/auth-user.type.js';
import { CreateExpenseDto } from './dto/create-expense.dto.js';
import { ExpenseDto, ExpensePageDto } from './dto/expense.dto.js';
import { ListExpensesDto } from './dto/list-expenses.dto.js';
import { ExpensesService } from './expenses.service.js';

@ApiTags('expenses')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({ description: 'Body, query o UUID inválidos' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Post()
  @Roles('ADMIN', 'VENDEDOR')
  @ApiCreatedResponse({ type: ExpenseDto })
  create(
    @Body() dto: CreateExpenseDto,
    @Req() req: { user: AuthUser },
  ): Promise<ExpenseDto> {
    return this.expenses.create(dto, req.user.id);
  }

  @Get()
  @Roles('ADMIN', 'VENDEDOR')
  @ApiOkResponse({ type: ExpensePageDto })
  findAll(@Query() query: ListExpensesDto): Promise<ExpensePageDto> {
    return this.expenses.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'VENDEDOR')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ExpenseDto })
  @ApiNotFoundResponse({ description: 'Gasto inexistente' })
  findById(@Param('id', new ParseUUIDPipe()) id: string): Promise<ExpenseDto> {
    return this.expenses.findById(id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Gasto eliminado' })
  @ApiNotFoundResponse({ description: 'Gasto inexistente' })
  delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.expenses.delete(id);
  }
}
