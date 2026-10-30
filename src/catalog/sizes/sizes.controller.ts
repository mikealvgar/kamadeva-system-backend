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
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { CreateSizeDto } from './dto/create-size.dto.js';
import { ListSizesDto } from './dto/list-sizes.dto.js';
import { SizeDto } from './dto/size.dto.js';
import { UpdateSizeDto } from './dto/update-size.dto.js';
import { SizesService } from './sizes.service.js';

@ApiTags('catalog/sizes')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({ description: 'Datos, query o UUID inválidos' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('catalog/sizes')
export class SizesController {
  constructor(private readonly sizes: SizesService) {}

  @Post()
  @Roles('ADMIN')
  @ApiCreatedResponse({ type: SizeDto })
  @ApiConflictResponse({ description: 'La talla ya existe' })
  create(@Body() dto: CreateSizeDto): Promise<SizeDto> {
    return this.sizes.create(dto);
  }

  @Get()
  @Roles('ADMIN', 'VENDEDOR')
  @ApiOkResponse({ type: [SizeDto] })
  findAll(@Query() query: ListSizesDto): Promise<SizeDto[]> {
    return this.sizes.findAll(query.includeInactive === 'true');
  }

  @Get(':id')
  @Roles('ADMIN', 'VENDEDOR')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: SizeDto })
  @ApiNotFoundResponse({ description: 'Talla inexistente' })
  findById(@Param('id', new ParseUUIDPipe()) id: string): Promise<SizeDto> {
    return this.sizes.findById(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: SizeDto })
  @ApiNotFoundResponse({ description: 'Talla inexistente' })
  @ApiConflictResponse({ description: 'La talla ya existe' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateSizeDto,
  ): Promise<SizeDto> {
    return this.sizes.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Talla eliminada' })
  @ApiNotFoundResponse({ description: 'Talla inexistente' })
  @ApiConflictResponse({
    description: 'La talla está asignada a productos, cotizaciones o ventas',
  })
  delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.sizes.delete(id);
  }
}
