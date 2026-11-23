import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProxyService } from '@app/core';
import { ParseCommand } from '../../src/commands/parse.command.js';
import { ExitCode } from '../../src/exit-codes.js';

describe('ParseCommand', () => {
  let dir: string;
  let command: ParseCommand;
  const proxyService = { parse: vi.fn() };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'drawnine-cli-'));
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const moduleRef = await Test.createTestingModule({
      providers: [
        ParseCommand,
        { provide: ProxyService, useValue: proxyService },
      ],
    }).compile();
    command = moduleRef.get(ParseCommand);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  it('exits with 2 when the decklist has errors', async () => {
    const path = join(dir, 'deck.txt');
    await writeFile(path, 'bad line');
    proxyService.parse.mockReturnValue({
      entries: [],
      errors: [{ line: 1, content: 'bad line', reason: 'x' }],
    });

    await command.run([path]);

    expect(process.exitCode).toBe(ExitCode.InvalidDecklist);
  });

  it('exits with 1 when the file does not exist', async () => {
    await command.run([join(dir, 'missing.txt')]);
    expect(process.exitCode).toBe(ExitCode.Usage);
  });
});
