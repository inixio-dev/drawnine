import { homedir } from 'node:os';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CoreModule } from '@app/core';
import { StorageModule, storageOptionsFromEnv } from '@app/storage';
import { BuildCommand } from './commands/build.command.js';
import { ParseCommand } from './commands/parse.command.js';
import { HelpFooter } from './help-footer.js';

@Module({
  imports: [
    // Must come first: it loads .env into process.env.
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        // The CLI reads a local file the user chose, so by default the .zip
        // size is unlimited (0); the uncompressed/entry limits still apply.
        () => ({
          ART_ZIP_MAX_COMPRESSED_BYTES:
            process.env.ART_ZIP_MAX_COMPRESSED_BYTES ?? '0',
        }),
      ],
    }),
    StorageModule.forRoot(
      storageOptionsFromEnv(process.env, join(homedir(), '.cache', 'drawnine')),
    ),
    CoreModule,
  ],
  providers: [BuildCommand, ParseCommand, HelpFooter],
})
export class CliModule {}
