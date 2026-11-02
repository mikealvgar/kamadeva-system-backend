import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { BusinessConfigService } from './business-config.service.js';
import {
  BusinessConfigDto,
  UpdateBusinessConfigDto,
} from './dto/business-config.dto.js';

@ApiTags('configuracion-negocio')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('configuracion-negocio')
export class BusinessConfigController {
  constructor(private readonly config: BusinessConfigService) {}

  @Get()
  @Roles('ADMIN', 'VENDEDOR')
  @ApiOkResponse({ type: BusinessConfigDto })
  @ApiNotFoundResponse({
    description: 'Configuración del negocio no registrada',
  })
  get(): Promise<BusinessConfigDto> {
    return this.config.get();
  }

  @Put()
  @Roles('ADMIN')
  @ApiOkResponse({ type: BusinessConfigDto })
  @ApiBadRequestResponse({ description: 'Campos faltantes o inválidos' })
  update(@Body() dto: UpdateBusinessConfigDto): Promise<BusinessConfigDto> {
    return this.config.update(dto);
  }
}
