import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ArtArchiveError,
  CardsNotFoundError,
  EmptyDecklistError,
  InvalidDecklistError,
  LayoutError,
  ProxyService,
  ScryfallError,
  TooManyCardsError,
} from '@drawnine/core';
import { BuildCommand, reportError } from '../../src/commands/build.command.js';
import { ExitCode } from '../../src/exit-codes.js';

describe('BuildCommand', () => {
  let dir: string;
  let deckPath: string;
  let command: BuildCommand;
  let stderr: string[];
  const proxyService = { generate: vi.fn() };

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'drawnine-cli-'));
    deckPath = join(dir, 'deck.txt');
    await writeFile(deckPath, '4 Lightning Bolt');
    stderr = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr.push(String(chunk));
      return true;
    });
    proxyService.generate.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        BuildCommand,
        { provide: ProxyService, useValue: proxyService },
      ],
    }).compile();
    command = moduleRef.get(BuildCommand);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  it('writes the PDF and maps options', async () => {
    const output = join(dir, 'out.pdf');
    proxyService.generate.mockResolvedValue({
      pdf: new Uint8Array([37, 80, 68, 70]),
      pageCount: 1,
      cardCount: 4,
      warnings: [{ code: 'unused-art', message: 'sin uso', file: 'x.png' }],
    });

    await command.run([deckPath], {
      output,
      gap: 2,
      bleed: 1,
      cutMarks: false,
      singleFace: true,
    });

    expect(process.exitCode).toBe(ExitCode.Ok);
    expect(await readFile(output)).toEqual(Buffer.from([37, 80, 68, 70]));
    expect(proxyService.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        decklist: '4 Lightning Bolt',
        art: undefined,
        options: {
          cutMarks: false,
          printBothFaces: false,
          gapMm: 2,
          bleedMm: 1,
        },
      }),
    );
    expect(stderr.join('')).toContain(
      'x.png: This art does not match any card in the decklist.',
    );
  });

  it('passes the language through', async () => {
    proxyService.generate.mockResolvedValue({
      pdf: new Uint8Array(),
      pageCount: 0,
      cardCount: 0,
      warnings: [
        { code: 'language-unavailable', message: 'x', card: 'Island' },
      ],
    });
    await command.run([deckPath], {
      output: join(dir, 'o.pdf'),
      cutMarks: true,
      lang: command.parseLang(' ES '),
    });
    expect(proxyService.generate.mock.calls[0]?.[0].options.lang).toBe('es');
    expect(stderr.join('')).toContain(
      'Island: Not available in the requested language; using English.',
    );
  });

  it('rejects unknown language codes', () => {
    expect(() => command.parseLang('spanish')).toThrow(/--lang/);
  });

  it('reads the art zip', async () => {
    const artPath = join(dir, 'art.zip');
    await writeFile(artPath, Buffer.from([1, 2, 3]));
    proxyService.generate.mockResolvedValue({
      pdf: new Uint8Array(),
      pageCount: 0,
      cardCount: 0,
      warnings: [],
    });
    await command.run([deckPath], {
      output: join(dir, 'o.pdf'),
      cutMarks: true,
      art: artPath,
    });
    expect(proxyService.generate.mock.calls[0]?.[0].art).toEqual(
      new Uint8Array([1, 2, 3]),
    );
  });

  it('exits with 1 when the decklist file is missing', async () => {
    await command.run([join(dir, 'missing.txt')], {
      output: 'x.pdf',
      cutMarks: true,
    });
    expect(process.exitCode).toBe(ExitCode.Usage);
    expect(proxyService.generate).not.toHaveBeenCalled();
  });

  it('exits with 2 and lists the invalid lines', async () => {
    proxyService.generate.mockRejectedValue(
      new InvalidDecklistError([
        {
          line: 3,
          content: 'Bolt',
          code: 'missing-quantity',
          reason: 'Quantity is missing',
        },
      ]),
    );
    await command.run([deckPath], { output: 'x.pdf', cutMarks: true });
    expect(process.exitCode).toBe(ExitCode.InvalidDecklist);
    expect(stderr.join('')).toContain(
      'Line 3: Missing quantity (for example: "4 Lightning Bolt").',
    );
  });

  it('exits with 3 on Scryfall errors', async () => {
    proxyService.generate.mockRejectedValue(new ScryfallError('down'));
    await command.run([deckPath], { output: 'x.pdf', cutMarks: true });
    expect(process.exitCode).toBe(ExitCode.Network);
  });
});

describe('reportError', () => {
  beforeEach(() => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });
  afterEach(() => vi.restoreAllMocks());

  it.each([
    [new InvalidDecklistError([]), ExitCode.InvalidDecklist],
    [new EmptyDecklistError(), ExitCode.InvalidDecklist],
    [new TooManyCardsError(9, 1), ExitCode.InvalidDecklist],
    [new CardsNotFoundError(['X']), ExitCode.InvalidDecklist],
    [new ScryfallError('x'), ExitCode.Network],
    [new LayoutError('x'), ExitCode.Usage],
    [new ArtArchiveError('x'), ExitCode.Usage],
    [new Error('x'), ExitCode.Usage],
  ])('maps %s', (error, code) => {
    expect(reportError(error)).toBe(code);
  });
});
