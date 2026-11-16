import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsNumber, Max, Min } from 'class-validator';
import { PaymentMethod } from '../../generated/prisma/client.js';

const spanishPaymentMethods: Record<string, PaymentMethod> = {
  EFECTIVO: PaymentMethod.CASH,
  TARJETA: PaymentMethod.CARD,
  TRANSFERENCIA: PaymentMethod.TRANSFER,
  OTRO: PaymentMethod.OTHER,
};

export class PayQuoteDto {
  @ApiProperty({
    enum: ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'OTRO', ...Object.values(PaymentMethod)],
    example: 'EFECTIVO',
    description: 'Método del pago recibido (EFECTIVO, TARJETA, TRANSFERENCIA, OTRO o enum PaymentMethod)',
  })
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const normalized = value.trim().toUpperCase();
    return spanishPaymentMethods[normalized] ?? normalized;
  })
  @IsEnum(PaymentMethod)
  metodoPago: PaymentMethod;

  @ApiProperty({
    minimum: 0,
    maximum: 9999999999.99,
    multipleOf: 0.01,
    example: 101,
    description:
      'Debe coincidir exactamente con Quote.total; no se admiten pagos parciales ni cambio',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  montoRecibido: number;
}
