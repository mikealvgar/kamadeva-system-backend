import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNumber, Max, Min } from 'class-validator';
import { PaymentMethod } from '../../generated/prisma/client.js';

export class PayQuoteDto {
  @ApiProperty({
    enum: PaymentMethod,
    description: 'Método del pago recibido; registro sin procesamiento externo',
  })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty({
    minimum: 0,
    maximum: 9999999999.99,
    multipleOf: 0.01,
    description:
      'Debe coincidir exactamente con Quote.total; no se admiten pagos parciales ni cambio',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999.99)
  amount: number;
}
