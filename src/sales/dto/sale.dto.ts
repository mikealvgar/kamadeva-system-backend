import { ApiProperty } from '@nestjs/swagger';
import {
  PaymentMethod,
  PaymentStatus,
  SaleStatus,
} from '../../generated/prisma/client.js';

export class SaleRefDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() name: string;
}

export class SaleProductDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: '7501234567890' }) barcode: string;
  @ApiProperty() name: string;
}

export class SaleItemDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ type: SaleProductDto }) product: SaleProductDto;
  @ApiProperty({ type: SaleRefDto, nullable: true }) size: SaleRefDto | null;
  @ApiProperty({ example: '2.000' }) quantity: string;
  @ApiProperty({ example: '299.00' }) unitPrice: string;
  @ApiProperty({ example: '0.00' }) discount: string;
  @ApiProperty({ example: '0.00' }) tax: string;
  @ApiProperty({ example: '598.00' }) total: string;
}

export class SalePaymentDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: PaymentMethod }) method: PaymentMethod;
  @ApiProperty({ example: '598.00' }) amount: string;
  @ApiProperty({ enum: PaymentStatus }) status: PaymentStatus;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  paidAt: string | null;
}

export class SaleDetailDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({
    example: 'V-000123',
    description: 'Consecutivo; ventas previas conservan VEN-AAAAMMDD-XXXXXX',
  })
  folio: string;
  @ApiProperty({ enum: SaleStatus }) status: SaleStatus;
  @ApiProperty({ type: SaleRefDto, nullable: true })
  customer: SaleRefDto | null;
  @ApiProperty({ type: SaleRefDto, nullable: true })
  createdBy: SaleRefDto | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  quoteId: string | null;
  @ApiProperty({ type: String, nullable: true }) notes: string | null;
  @ApiProperty({ example: '598.00' }) subtotal: string;
  @ApiProperty({ example: '0.00' }) discount: string;
  @ApiProperty({ example: '0.00' }) tax: string;
  @ApiProperty({ example: '598.00' }) total: string;
  @ApiProperty({ type: [SaleItemDto] }) items: SaleItemDto[];
  @ApiProperty({ type: [SalePaymentDto] }) payments: SalePaymentDto[];
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  cancelledAt: string | null;
  @ApiProperty({ type: SaleRefDto, nullable: true })
  cancelledBy: SaleRefDto | null;
  @ApiProperty({ type: String, nullable: true }) cancelReason: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}

export class SaleSummaryDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'V-000123' }) folio: string;
  @ApiProperty({ enum: SaleStatus }) status: SaleStatus;
  @ApiProperty({ example: '598.00' }) total: string;
  @ApiProperty({ enum: PaymentMethod, nullable: true })
  paymentMethod: PaymentMethod | null;
  @ApiProperty({ type: SaleRefDto, nullable: true })
  customer: SaleRefDto | null;
  @ApiProperty({ type: SaleRefDto, nullable: true })
  createdBy: SaleRefDto | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  quoteId: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class SalePageDto {
  @ApiProperty({ type: [SaleSummaryDto] }) data: SaleSummaryDto[];
  @ApiProperty({ example: 1 }) total: number;
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 20 }) pageSize: number;
}
