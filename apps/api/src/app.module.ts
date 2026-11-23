import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from '@drawnine/core';
import { StorageModule, storageOptionsFromEnv } from '@drawnine/storage';
import { DecksController } from './decks/decks.controller.js';
import { ProxiesController } from './proxies/proxies.controller.js';

@Module({
  imports: [
    // Must come first: it loads .env into process.env.
    ConfigModule.forRoot({ isGlobal: true }),
    StorageModule.forRoot(
      storageOptionsFromEnv(process.env, './.cache/drawnine'),
    ),
    CoreModule,
  ],
  controllers: [DecksController, ProxiesController],
})
export class AppModule {}
