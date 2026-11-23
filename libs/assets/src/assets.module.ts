import {
  type DynamicModule,
  type InjectionToken,
  Module,
  type OptionalFactoryDependency,
} from '@nestjs/common';
import {
  ArtArchiveReader,
  type ArtArchiveReaderOptions,
} from './art-archive-reader.js';

export interface AssetsModuleAsyncOptions {
  imports?: DynamicModule['imports'];
  inject?: (InjectionToken | OptionalFactoryDependency)[];
  useFactory: (
    ...args: never[]
  ) => ArtArchiveReaderOptions | Promise<ArtArchiveReaderOptions>;
}

@Module({})
export class AssetsModule {
  static forRoot(options: ArtArchiveReaderOptions = {}): DynamicModule {
    return {
      module: AssetsModule,
      providers: [
        { provide: ArtArchiveReader, useValue: new ArtArchiveReader(options) },
      ],
      exports: [ArtArchiveReader],
    };
  }

  static forRootAsync(options: AssetsModuleAsyncOptions): DynamicModule {
    return {
      module: AssetsModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: ArtArchiveReader,
          inject: options.inject ?? [],
          useFactory: async (...args: never[]) =>
            new ArtArchiveReader(await options.useFactory(...args)),
        },
      ],
      exports: [ArtArchiveReader],
    };
  }
}
