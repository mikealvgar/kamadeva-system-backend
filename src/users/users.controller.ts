import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { ROLE_NAMES, type RoleName } from '../roles/role-names.js';
import { SetUserRolesDto } from './dto/set-user-roles.dto.js';
import { UserRolesDto } from './dto/user-roles.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('users')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({
  description:
    'Requiere ADMIN activo; roles recargados por petición. Cambiar roles no revoca tokens; login/refresh actualiza el claim.',
})
@ApiNotFoundResponse({ description: 'Usuario inexistente' })
@ApiBadRequestResponse({
  description: 'UUID v4, roles inválidos o auto-eliminación',
})
@ApiParam({ name: 'userId', format: 'uuid' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':userId/roles')
  @ApiOkResponse({ type: UserRolesDto })
  get(@Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string) {
    return this.users.getUserRoles(userId);
  }

  @Put(':userId/roles')
  @ApiOkResponse({ type: UserRolesDto })
  @ApiUnprocessableEntityResponse({ description: 'Rol inactivo' })
  @ApiConflictResponse({
    description: 'No se puede remover el último administrador',
  })
  set(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() dto: SetUserRolesDto,
  ) {
    return this.users.setUserRoles(userId, dto.roles);
  }

  @Delete(':userId/roles/:roleName')
  @HttpCode(204)
  @ApiParam({ name: 'roleName', enum: ROLE_NAMES })
  @ApiNoContentResponse({ description: 'Rol removido o no asignado' })
  @ApiConflictResponse({
    description: 'No se puede remover el último administrador',
  })
  remove(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Param(
      'roleName',
      new ParseEnumPipe({ ADMIN: 'ADMIN', VENDEDOR: 'VENDEDOR' }),
    )
    roleName: RoleName,
  ) {
    return this.users.removeUserRole(userId, roleName);
  }

  @Delete(':userId')
  @HttpCode(204)
  @ApiNoContentResponse({
    description: 'Usuario, sesiones y asignaciones eliminados',
  })
  @ApiConflictResponse({
    description:
      'Último administrador o usuario con registros asociados (cotizaciones, ventas, pagos o movimientos)',
  })
  deleteUser(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Req() req: { user: { id: string } },
  ) {
    return this.users.deleteUser(userId, req.user.id);
  }
}
