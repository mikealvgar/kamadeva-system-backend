import { ApiProperty } from '@nestjs/swagger';
import { CustomerDto } from '../../customers/dto/customer.dto.js';
import { QuoteStatus, SaleStatus } from '../../generated/prisma/client.js';

export class QuoteProductDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() sku: string;
  @ApiProperty() name: string;
  @ApiProperty({ type: String, nullable: true }) imageUrl: string | null;
}

export class QuoteItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: QuoteProductDto }) product: QuoteProductDto;
  @ApiProperty({ example: '2.500' }) quantity: string;
  @ApiProperty({ example: '1250.50' }) unitPrice: string;
  @ApiProperty({ example: '100.00' }) discount: string;
  @ApiProperty({ example: '320.00' }) tax: string;
  @ApiProperty({ example: '3346.25' }) total: string;
}

export class QuoteDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'COT-20260920-AB12CD' }) folio: string;
  @ApiProperty({ enum: QuoteStatus }) status: QuoteStatus;
  @ApiProperty({ type: CustomerDto }) customer: CustomerDto;
  @ApiProperty({ type: [QuoteItemDto] }) items: QuoteItemDto[];
  @ApiProperty({ example: '300.00' }) subtotal: string;
  @ApiProperty({ example: '0.00' }) discount: string;
  @ApiProperty({ example: '48.00' }) tax: string;
  @ApiProperty({ example: '348.00' }) total: string;
  @ApiProperty({ type: String, nullable: true }) notes: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  expiresAt: string | null;
  @ApiProperty() canPay: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}

export class SaleDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'VEN-20260920-AB12CD' }) folio: string;
  @ApiProperty({ enum: SaleStatus }) status: SaleStatus;
  @ApiProperty({ type: CustomerDto, nullable: true })
  customer: CustomerDto | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true }) quoteId:
    string | null;
  @ApiProperty({ example: '300.00' }) subtotal: string;
  @ApiProperty({ example: '0.00' }) discount: string;
  @ApiProperty({ example: '48.00' }) tax: string;
  @ApiProperty({ example: '348.00' }) total: string;
  @ApiProperty({ type: String, nullable: true }) notes: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}
