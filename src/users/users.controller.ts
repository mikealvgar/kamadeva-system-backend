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
  Query,
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
import { ListUsersDto } from './dto/list-users.dto.js';
import { UserListPageDto } from './dto/user-list.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('usuarios')
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
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('usuarios')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @ApiOkResponse({ type: UserListPageDto })
  list(@Query() query: ListUsersDto): Promise<UserListPageDto> {
    return this.users.listUsers(query);
  }

  @Get(':usuarioId/roles')
  @ApiParam({ name: 'usuarioId', format: 'uuid' })
  @ApiOkResponse({ type: UserRolesDto })
  get(
    @Param('usuarioId', new ParseUUIDPipe({ version: '4' })) usuarioId: string,
  ) {
    return this.users.getUserRoles(usuarioId);
  }

  @Put(':usuarioId/roles')
  @ApiParam({ name: 'usuarioId', format: 'uuid' })
  @ApiOkResponse({ type: UserRolesDto })
  @ApiUnprocessableEntityResponse({ description: 'Rol inactivo' })
  @ApiConflictResponse({
    description: 'No se puede remover el último administrador',
  })
  set(
    @Param('usuarioId', new ParseUUIDPipe({ version: '4' })) usuarioId: string,
    @Body() dto: SetUserRolesDto,
  ) {
    return this.users.setUserRoles(usuarioId, dto.roles);
  }

  @Delete(':usuarioId/roles/:nombreRol')
  @ApiParam({ name: 'usuarioId', format: 'uuid' })
  @HttpCode(204)
  @ApiParam({ name: 'nombreRol', enum: ROLE_NAMES })
  @ApiNoContentResponse({ description: 'Rol removido o no asignado' })
  @ApiConflictResponse({
    description: 'No se puede remover el último administrador',
  })
  remove(
    @Param('usuarioId', new ParseUUIDPipe({ version: '4' })) usuarioId: string,
    @Param(
      'nombreRol',
      new ParseEnumPipe({ ADMIN: 'ADMIN', VENDEDOR: 'VENDEDOR' }),
    )
    nombreRol: RoleName,
  ) {
    return this.users.removeUserRole(usuarioId, nombreRol);
  }

  @Delete(':usuarioId')
  @ApiParam({ name: 'usuarioId', format: 'uuid' })
  @HttpCode(204)
  @ApiNoContentResponse({
    description: 'Usuario, sesiones y asignaciones eliminados',
  })
  @ApiConflictResponse({
    description:
      'Último administrador o usuario con registros asociados (cotizaciones, ventas, compras o movimientos)',
  })
  deleteUser(
    @Param('usuarioId', new ParseUUIDPipe({ version: '4' })) usuarioId: string,
    @Req() req: { user: { id: string } },
  ) {
    return this.users.deleteUser(usuarioId, req.user.id);
  }
}
