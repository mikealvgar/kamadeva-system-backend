import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { RoleDto } from './dto/role.dto.js';
import { RolesService } from './roles.service.js';

@ApiTags('roles')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({
  description:
    'Requiere ADMIN activo; se recargan roles en cada petición aunque el claim JWT esté desactualizado',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @ApiOkResponse({ type: RoleDto, isArray: true })
  findAll() {
    return this.roles.findAll();
  }
}
