import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    // Necesario para verificar firmas HMAC de Meta webhooks
    rawBody: true,
  });

  // Validación global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // elimina propiedades no declaradas en el DTO
      forbidNonWhitelisted: true, // lanza error si hay propiedades extra
      transform: true, // convierte tipos automáticamente
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // CORS — en desarrollo permitir todo, en producción restringir
  app.enableCors({
    origin: true, // permite cualquier origen en desarrollo
    credentials: true,
  });

  // Swagger — solo en desarrollo y staging
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('VSPRO API')
      .setDescription('API del SaaS de pedidos omnicanal para PYMEs')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
    logger.log('Swagger disponible en /docs');
  }

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  logger.log(`API corriendo en puerto ${port} [${process.env.NODE_ENV}]`);
}

bootstrap();
