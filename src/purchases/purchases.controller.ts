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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.type.js';
import { CreatePurchaseDto } from './dto/create-purchase.dto.js';
import { ListPurchasesDto } from './dto/list-purchases.dto.js';
import { PurchaseDto, PurchasePageDto } from './dto/purchase.dto.js';
import { PurchasesService } from './purchases.service.js';

@ApiTags('compras')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({ description: 'Body, UUID o query inválidos' })
@ApiNotFoundResponse({
  description: 'Proveedor, producto o compra inexistente',
})
@ApiConflictResponse({ description: 'Proveedor o producto inactivo' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('compras')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Post()
  @Roles('ADMIN')
  @ApiCreatedResponse({ type: PurchaseDto })
  create(
    @Body() dto: CreatePurchaseDto,
    @Req() req: { user: AuthUser },
  ): Promise<PurchaseDto> {
    return this.purchases.create(dto, req.user.id);
  }

  @Get()
  @Roles('ADMIN', 'VENDEDOR')
  @ApiOkResponse({ type: PurchasePageDto })
  findAll(@Query() query: ListPurchasesDto): Promise<PurchasePageDto> {
    return this.purchases.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'VENDEDOR')
  @ApiOkResponse({ type: PurchaseDto })
  findById(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<PurchaseDto> {
    return this.purchases.findById(id);
  }
}
