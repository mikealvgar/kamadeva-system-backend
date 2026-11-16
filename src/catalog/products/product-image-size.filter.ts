import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';

/** Multer stops oversized streams before the file pipe runs; keep the public 400 contract. */
@Catch(PayloadTooLargeException)
export class ProductImageSizeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: 'La imagen no debe superar 5 MB',
    });
  }
}
