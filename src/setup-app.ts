import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { SpanishHttpExceptionFilter } from './common/filters/spanish-http-exception.filter.js';
import {
  SpanishApiResponseInterceptor,
  spanishApiMiddleware,
  translateOpenApiSchemas,
} from './common/validation/spanish-api-contract.js';

/** Shared HTTP configuration for the server and E2E tests. */
export function setupApp(app: INestApplication) {
  app.enableCors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Content-Type, Accept, Authorization, Idempotency-Key',
    exposedHeaders: 'Idempotency-Key',
  });
  app.setGlobalPrefix('api');
  app.use(spanishApiMiddleware);
  app.useGlobalFilters(new SpanishHttpExceptionFilter());
  app.useGlobalInterceptors(new SpanishApiResponseInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const config = new DocumentBuilder()
    .setTitle('Kamadeva System Backend')
    .setDescription(
      'API de ventas, inventario, cotizaciones, cobros y autenticación.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  translateOpenApiSchemas(document);
  SwaggerModule.setup('api/docs', app, document);
  return document;
}
