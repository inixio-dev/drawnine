import {
  type DynamicModule,
  type InjectionToken,
  Module,
  type OptionalFactoryDependency,
} from '@nestjs/common';
import { ScryfallClient } from './scryfall-client.js';
import type { ScryfallClientOptions } from './types.js';

export interface ScryfallModuleAsyncOptions {
  imports?: DynamicModule['imports'];
  inject?: (InjectionToken | OptionalFactoryDependency)[];
  useFactory: (
    ...args: never[]
  ) => ScryfallClientOptions | Promise<ScryfallClientOptions>;
}

@Module({})
export class ScryfallModule {
  static forRoot(options: ScryfallClientOptions): DynamicModule {
    return {
      module: ScryfallModule,
      providers: [
        { provide: ScryfallClient, useValue: new ScryfallClient(options) },
      ],
      exports: [ScryfallClient],
    };
  }

  static forRootAsync(options: ScryfallModuleAsyncOptions): DynamicModule {
    return {
      module: ScryfallModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: ScryfallClient,
          inject: options.inject ?? [],
          useFactory: async (...args: never[]) =>
            new ScryfallClient(await options.useFactory(...args)),
        },
      ],
      exports: [ScryfallClient],
    };
  }
}
