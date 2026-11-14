import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { AppConfigService } from './config/app-config.service.js';
import { API_PREFIX, setupApp } from './setup-app.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  setupApp(app);

  const config = app.get(AppConfigService);
  const logger = new Logger('Bootstrap');

  if (config.get('SWAGGER_ENABLED')) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('BrokerDesk API')
        .setDescription('Multi-tenant real estate CRM API')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup(`${API_PREFIX}/docs`, app, document);
    logger.log(`Swagger UI available at /${API_PREFIX}/docs`);
  }

  const port = config.get('PORT');
  await app.listen(port);
  logger.log(`BrokerDesk API listening on port ${port} (${config.get('NODE_ENV')})`);
}

await bootstrap();
