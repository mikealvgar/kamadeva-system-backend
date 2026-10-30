import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.type.js';
import { CancelSaleDto } from './dto/cancel-sale.dto.js';
import { CreateSaleDto } from './dto/create-sale.dto.js';
import { ListSalesDto } from './dto/list-sales.dto.js';
import { SaleDetailDto, SalePageDto } from './dto/sale.dto.js';
import { SalesService } from './sales.service.js';

@ApiTags('sales')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({ description: 'Body, UUID, query o header inválidos' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'VENDEDOR')
@Controller('sales')
export class SalesController {
  constructor(private readonly sales: SalesService) {}

  @Post()
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description:
      'UUID por intento de cobro. Repetirlo con el mismo body devuelve la venta original sin duplicarla',
  })
  @ApiCreatedResponse({
    type: SaleDetailDto,
    description:
      'Venta registrada. Respuesta repetida por idempotencia incluye el header Idempotent-Replayed: true',
  })
  @ApiNotFoundResponse({ description: 'Cliente o producto inexistente' })
  @ApiConflictResponse({
    description:
      'Stock insuficiente, producto inactivo, llave reutilizada con otro body o conflicto de concurrencia',
  })
  async create(
    @Body() dto: CreateSaleDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() req: { user: AuthUser },
    @Res({ passthrough: true }) res: Response,
  ): Promise<SaleDetailDto> {
    const result = await this.sales.create(dto, idempotencyKey, req.user.id);
    if (result.replayed) res.setHeader('Idempotent-Replayed', 'true');
    return result.sale;
  }

  @Get()
  @ApiOkResponse({ type: SalePageDto })
  findAll(@Query() query: ListSalesDto): Promise<SalePageDto> {
    return this.sales.findAll(query);
  }

  @Get(':id')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: SaleDetailDto })
  @ApiNotFoundResponse({ description: 'Venta inexistente' })
  findById(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<SaleDetailDto> {
    return this.sales.findById(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({
    type: SaleDetailDto,
    description:
      'Venta cancelada: stock regresado con RETURN_IN y pago REFUNDED. Repetir devuelve el mismo resultado',
  })
  @ApiNotFoundResponse({ description: 'Venta inexistente' })
  @ApiConflictResponse({ description: 'La venta no admite cancelación' })
  cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelSaleDto,
    @Req() req: { user: AuthUser },
  ): Promise<SaleDetailDto> {
    return this.sales.cancel(id, dto, req.user.id);
  }
}
