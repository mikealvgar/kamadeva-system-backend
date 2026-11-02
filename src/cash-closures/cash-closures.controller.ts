import {
  Body,
  Controller,
  Get,
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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
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
import { CashClosuresService } from './cash-closures.service.js';
import {
  CashClosureDto,
  CashClosurePageDto,
  CashClosureSummaryDto,
} from './dto/cash-closure.dto.js';
import { CreateCashClosureDto } from './dto/create-cash-closure.dto.js';
import { ListCashClosuresDto } from './dto/list-cash-closures.dto.js';

@ApiTags('cortes-caja')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({ description: 'Body, query o UUID inválidos' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'VENDEDOR')
@Controller('cortes-caja')
export class CashClosuresController {
  constructor(private readonly closures: CashClosuresService) {}

  @Get('resumen-actual')
  @ApiOkResponse({
    type: CashClosureSummaryDto,
    description: 'Lo pendiente desde el último corte; no escribe nada',
  })
  summary(): Promise<CashClosureSummaryDto> {
    return this.closures.summary();
  }

  @Post()
  @ApiCreatedResponse({ type: CashClosureDto })
  @ApiConflictResponse({
    description:
      'previousClosureId ya no es el último corte (otro corte registrado o resumen desactualizado)',
  })
  close(
    @Body() dto: CreateCashClosureDto,
    @Req() req: { user: AuthUser },
  ): Promise<CashClosureDto> {
    return this.closures.close(dto, req.user.id);
  }

  @Get()
  @ApiOkResponse({ type: CashClosurePageDto })
  findAll(@Query() query: ListCashClosuresDto): Promise<CashClosurePageDto> {
    return this.closures.findAll(query);
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CashClosureDto })
  @ApiNotFoundResponse({ description: 'Corte de caja inexistente' })
  findById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<CashClosureDto> {
    return this.closures.findById(id);
  }
}
