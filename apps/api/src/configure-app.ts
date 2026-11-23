import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { DomainExceptionFilter } from './common/domain-exception.filter.js';

/** Global pipes and filters, shared by main.ts and e2e tests. */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
}
