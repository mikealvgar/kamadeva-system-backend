import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Response } from 'express';

/** Multer stops oversized uploads before the pipe runs; keep a 400 contract. */
@Catch(PayloadTooLargeException)
export class ImportFileSizeFilter implements ExceptionFilter {
  catch(_exception: PayloadTooLargeException, host: ArgumentsHost): void {
    host.switchToHttp().getResponse<Response>().status(400).json({
      statusCode: 400,
      error: 'Bad Request',
      message: 'El archivo no debe superar 5 MB',
    });
  }
}
