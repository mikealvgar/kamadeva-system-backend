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
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { AuthUser } from '../../auth/types/auth-user.type.js';
import { InventoryMovementDto } from '../products/dto/inventory-movement.dto.js';
import { CreateInventoryMovementDto } from './dto/create-inventory-movement.dto.js';
import { ListInventoryMovementsDto } from './dto/list-inventory-movements.dto.js';
import { InventoryMovementsService } from './inventory.service.js';

@ApiTags('inventory')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({ description: 'Body, UUID o query inválidos' })
@ApiNotFoundResponse({ description: 'Producto inexistente' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class InventoryController {
  constructor(private readonly movements: InventoryMovementsService) {}

  @Post('catalog/products/:id/movements')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Crear movimiento manual (ADMIN)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiCreatedResponse({ type: InventoryMovementDto })
  create(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: CreateInventoryMovementDto,
    @Req() req: { user: AuthUser },
  ): Promise<InventoryMovementDto> {
    return this.movements.create(id, dto, req.user.id);
  }

  @Get('inventory/movements')
  @Roles('ADMIN', 'VENDEDOR')
  @ApiOperation({ summary: 'Listar movimientos (ADMIN o VENDEDOR)' })
  @ApiOkResponse({ type: [InventoryMovementDto] })
  findAll(
    @Query() query: ListInventoryMovementsDto,
  ): Promise<InventoryMovementDto[]> {
    return this.movements.findAll(query);
  }
}
