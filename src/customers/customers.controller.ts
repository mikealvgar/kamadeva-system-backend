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
import { CustomersService } from './customers.service.js';
import { CustomerDto } from './dto/customer.dto.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto } from './dto/update-customer.dto.js';
import { ListCustomersDto } from './dto/list-customers.dto.js';

@ApiTags('customers')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({ description: 'Datos, query o UUID inválidos' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  @Roles('ADMIN')
  @ApiCreatedResponse({ type: CustomerDto })
  create(@Body() dto: CreateCustomerDto): Promise<CustomerDto> {
    return this.customers.create(dto);
  }

  @Get()
  @Roles('ADMIN', 'VENDEDOR')
  @ApiOkResponse({ type: [CustomerDto] })
  findAll(@Query() query: ListCustomersDto): Promise<CustomerDto[]> {
    return this.customers.findAll(query);
  }

  @Get(':id')
  @Roles('ADMIN', 'VENDEDOR')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CustomerDto })
  @ApiNotFoundResponse({ description: 'Cliente inexistente' })
  findById(@Param('id', new ParseUUIDPipe()) id: string): Promise<CustomerDto> {
    return this.customers.findById(id);
  }

  @Patch(':id')
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: CustomerDto })
  @ApiNotFoundResponse({ description: 'Cliente inexistente' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateCustomerDto,
  ): Promise<CustomerDto> {
    return this.customers.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('ADMIN')
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Cliente eliminado' })
  @ApiNotFoundResponse({ description: 'Cliente inexistente' })
  @ApiConflictResponse({
    description:
      'El cliente tiene cotizaciones o ventas asociadas, o es el cliente default',
  })
  delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.customers.delete(id);
  }
}
