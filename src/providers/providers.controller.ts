import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
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
import { CreateProviderDto } from './dto/create-provider.dto.js';
import { ListProvidersDto } from './dto/list-providers.dto.js';
import { ProviderDto } from './dto/provider.dto.js';
import { UpdateProviderDto } from './dto/update-provider.dto.js';
import { ProvidersService } from './providers.service.js';

@ApiTags('proveedores')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({ description: 'Datos, query o UUID inválidos' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('proveedores')
export class ProvidersController {
  constructor(private readonly providers: ProvidersService) {}

  @Post()
  @Roles('ADMIN')
  @ApiCreatedResponse({ type: ProviderDto })
  @ApiConflictResponse({ description: 'Ya existe un proveedor con ese nombre' })
  create(@Body() dto: CreateProviderDto): Promise<ProviderDto> {
    return this.providers.create(dto);
  }

  @Get()
  @Roles('ADMIN', 'VENDEDOR')
  @ApiOkResponse({ type: [ProviderDto] })
  findAll(@Query() query: ListProvidersDto): Promise<ProviderDto[]> {
    return this.providers.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'VENDEDOR')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ProviderDto })
  @ApiNotFoundResponse({ description: 'Proveedor inexistente' })
  findById(@Param('id', new ParseUUIDPipe()) id: string): Promise<ProviderDto> {
    return this.providers.findById(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ProviderDto })
  @ApiNotFoundResponse({ description: 'Proveedor inexistente' })
  @ApiConflictResponse({ description: 'Ya existe un proveedor con ese nombre' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateProviderDto,
  ): Promise<ProviderDto> {
    return this.providers.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Proveedor eliminado' })
  @ApiNotFoundResponse({ description: 'Proveedor inexistente' })
  delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.providers.delete(id);
  }
}
