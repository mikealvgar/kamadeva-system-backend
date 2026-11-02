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
  Req,
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
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.type.js';
import { CreateQuoteDto, UpdateQuoteDto } from './dto/create-quote.dto.js';
import { ListQuotesDto } from './dto/list-quotes.dto.js';
import { PayQuoteDto } from './dto/pay-quote.dto.js';
import { QuoteDto, SaleDto } from './dto/quote.dto.js';
import { QuotesService } from './quotes.service.js';

@ApiTags('cotizaciones')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Token inválido o usuario inactivo' })
@ApiForbiddenResponse({ description: 'Permisos insuficientes' })
@ApiBadRequestResponse({ description: 'Body, UUID o query inválidos' })
@ApiNotFoundResponse({ description: 'Registro inexistente' })
@ApiConflictResponse({
  description: 'Estado inválido, cotización expirada o stock insuficiente',
})
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'VENDEDOR')
@Controller('cotizaciones')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Post()
  @ApiCreatedResponse({ type: QuoteDto })
  create(
    @Body() dto: CreateQuoteDto,
    @Req() req: { user: AuthUser },
  ): Promise<QuoteDto> {
    return this.quotes.create(dto, req.user.id);
  }

  @Get()
  @ApiOkResponse({ type: [QuoteDto] })
  findAll(@Query() query: ListQuotesDto): Promise<QuoteDto[]> {
    return this.quotes.findAll(query);
  }

  @Get(':id')
  @ApiOkResponse({ type: QuoteDto })
  findById(@Param('id', new ParseUUIDPipe()) id: string): Promise<QuoteDto> {
    return this.quotes.findById(id);
  }

  @Patch(':id')
  @ApiOkResponse({ type: QuoteDto })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateQuoteDto,
  ): Promise<QuoteDto> {
    return this.quotes.update(id, dto);
  }

  @Post(':id/enviar')
  @HttpCode(200)
  @ApiOkResponse({ type: QuoteDto })
  send(@Param('id', new ParseUUIDPipe()) id: string): Promise<QuoteDto> {
    return this.quotes.send(id);
  }

  @Post(':id/pagar')
  @HttpCode(200)
  @ApiOkResponse({ type: SaleDto })
  pay(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PayQuoteDto,
    @Req() req: { user: AuthUser },
  ): Promise<SaleDto> {
    return this.quotes.pay(id, dto, req.user.id);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @HttpCode(204)
  @ApiNoContentResponse()
  delete(@Param('id', new ParseUUIDPipe()) id: string): Promise<void> {
    return this.quotes.delete(id);
  }
}
