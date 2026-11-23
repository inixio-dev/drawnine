#!/usr/bin/env node
import { CommandFactory } from 'nest-commander';
import { drawnineVersion } from '@app/core';
import { CliModule } from './cli.module.js';

// Logs go to stderr; stdout is reserved for useful output.
await CommandFactory.run(CliModule, {
  cliName: 'drawnine',
  version: drawnineVersion(),
  logger: ['error', 'warn'],
  errorHandler: () => {
    process.exitCode = 1;
  },
});
