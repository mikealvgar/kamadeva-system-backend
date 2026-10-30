import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.type.js';
import { DashboardService } from './dashboard.service.js';
import {
  DashboardSummaryDto,
  SalesHistoryDto,
  SalesHistoryQueryDto,
  TopProductsDto,
  TopProductsQueryDto,
} from './dto/dashboard.dto.js';

@ApiTags('dashboard')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({ description: 'Query inválida' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'VENDEDOR')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  @ApiOkResponse({
    type: DashboardSummaryDto,
    description:
      'Día local del negocio; estimatedProfitToday solo para ADMIN (null para VENDEDOR)',
  })
  summary(@Req() req: { user: AuthUser }): Promise<DashboardSummaryDto> {
    return this.dashboard.summary(req.user.roles.includes('ADMIN'));
  }

  @Get('top-products')
  @ApiOkResponse({ type: TopProductsDto })
  topProducts(@Query() query: TopProductsQueryDto): Promise<TopProductsDto> {
    return this.dashboard.topProducts(query);
  }

  @Get('sales-history')
  @ApiOkResponse({ type: SalesHistoryDto })
  salesHistory(@Query() query: SalesHistoryQueryDto): Promise<SalesHistoryDto> {
    return this.dashboard.salesHistory(query.period);
  }
}
