import { readFile } from 'node:fs/promises';
import { Command, CommandRunner } from 'nest-commander';
import { ProxyService } from '@drawnine/core';
import { ExitCode } from '../exit-codes.js';
import { lineErrorReason, messages } from '../messages.js';

@Command({
  name: 'parse',
  arguments: '<decklist>',
  description: messages.parseDescription,
})
export class ParseCommand extends CommandRunner {
  constructor(private readonly proxyService: ProxyService) {
    super();
  }

  async run([decklistPath = '']: string[]): Promise<void> {
    let decklist: string;
    try {
      decklist = await readFile(decklistPath, 'utf8');
    } catch {
      process.stderr.write(`${messages.cannotRead(decklistPath)}\n`);
      process.exitCode = ExitCode.Usage;
      return;
    }
    const result = this.proxyService.parse(decklist);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.errors.length > 0) {
      process.stderr.write(
        `${messages.invalidDecklist(result.errors.length)}\n`,
      );
      for (const e of result.errors) {
        process.stderr.write(
          `${messages.lineError(e.line, lineErrorReason(e), e.content)}\n`,
        );
      }
    }
    process.exitCode =
      result.errors.length > 0 ? ExitCode.InvalidDecklist : ExitCode.Ok;
  }
}
