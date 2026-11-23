import { readFile, writeFile } from 'node:fs/promises';
import { Command, CommandRunner, Option } from 'nest-commander';
import {
  ArtArchiveError,
  ArtArchiveLimitError,
  CardsNotFoundError,
  EmptyDecklistError,
  InvalidDecklistError,
  isScryfallLanguage,
  LayoutError,
  MAX_GAP_MM,
  type ProxyProgress,
  ProxyService,
  type ProxyWarning,
  ScryfallError,
  type ScryfallLanguage,
  TooManyCardsError,
} from '@drawnine/core';
import { ExitCode } from '../exit-codes.js';
import { lineErrorReason, messages, warningMessage } from '../messages.js';

export interface BuildCommandOptions {
  art?: string;
  output: string;
  gap?: number;
  cutMarks: boolean;
  bleed?: number;
  singleFace?: boolean;
  lang?: ScryfallLanguage;
}

class FileAccessError extends Error {}

@Command({
  name: 'build',
  arguments: '<decklist>',
  description: messages.buildDescription,
})
export class BuildCommand extends CommandRunner {
  constructor(private readonly proxyService: ProxyService) {
    super();
  }

  async run(
    [decklistPath = '']: string[],
    options: BuildCommandOptions,
  ): Promise<void> {
    log(messages.disclaimer);
    log(messages.credits);
    try {
      const decklist = await readText(decklistPath);
      const art = options.art ? await readBytes(options.art) : undefined;
      const result = await this.proxyService.generate({
        decklist,
        art,
        options: {
          cutMarks: options.cutMarks ?? true,
          printBothFaces: !options.singleFace,
          ...(options.gap !== undefined && { gapMm: options.gap }),
          ...(options.bleed !== undefined && { bleedMm: options.bleed }),
          ...(options.lang !== undefined && { lang: options.lang }),
        },
        onProgress: logProgress,
      });
      for (const warning of result.warnings)
        log(messages.warning(describeWarning(warning)));
      await writeFile(options.output, result.pdf).catch((error: unknown) => {
        throw new FileAccessError(messages.cannotWrite(options.output), {
          cause: error,
        });
      });
      log(messages.written(options.output, result.pageCount, result.cardCount));
      process.exitCode = ExitCode.Ok;
    } catch (error) {
      process.exitCode = reportError(error);
    }
  }

  @Option({ flags: '--art <zip>', description: messages.artOption })
  parseArt(value: string): string {
    return value;
  }

  @Option({
    flags: '-o, --output <output.pdf>',
    description: messages.outputOption,
    defaultValue: 'proxies.pdf',
  })
  parseOutput(value: string): string {
    return value;
  }

  @Option({ flags: '--gap <mm>', description: messages.gapOption })
  parseGap(value: string): number {
    return parseMm('--gap', value, 0, MAX_GAP_MM);
  }

  @Option({ flags: '--no-cut-marks', description: messages.noCutMarksOption })
  parseCutMarks(): boolean {
    return false;
  }

  @Option({ flags: '--bleed <mm>', description: messages.bleedOption })
  parseBleed(value: string): number {
    return parseMm('--bleed', value, 0, 5);
  }

  @Option({ flags: '--single-face', description: messages.singleFaceOption })
  parseSingleFace(): boolean {
    return true;
  }

  @Option({ flags: '--lang <code>', description: messages.langOption })
  parseLang(value: string): ScryfallLanguage {
    const lang = value.trim().toLowerCase();
    if (!isScryfallLanguage(lang)) {
      throw new Error(messages.invalidLang(value));
    }
    return lang;
  }
}

function log(line: string): void {
  process.stderr.write(`${line}\n`);
}

function logProgress(progress: ProxyProgress): void {
  switch (progress.stage) {
    case 'reading-art':
      return log(messages.readingArt);
    case 'resolving-cards':
      if (progress.total > 0) log(messages.resolvingCards(progress.total));
      return;
    case 'localizing-cards':
      if (progress.total > 0) log(messages.localizingCards(progress.total));
      return;
    case 'downloading-images':
      if (progress.total > 0 && progress.done === progress.total) {
        log(messages.downloadingImages(progress.done, progress.total));
      }
      return;
    case 'rendering':
      return log(messages.rendering(progress.cards));
  }
}

function describeWarning(warning: ProxyWarning): string {
  const subject = warning.card ?? warning.file;
  const text = warningMessage(warning.code, warning.message);
  return subject ? `${subject}: ${text}` : text;
}

function parseMm(
  flag: string,
  value: string,
  min: number,
  max: number,
): number {
  const mm = Number(value);
  if (value.trim() === '' || !Number.isFinite(mm) || mm < min || mm > max) {
    throw new Error(messages.invalidNumber(flag, value));
  }
  return mm;
}

async function readText(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    throw new FileAccessError(messages.cannotRead(path), { cause: error });
  }
}

async function readBytes(path: string): Promise<Uint8Array> {
  try {
    return new Uint8Array(await readFile(path));
  } catch (error) {
    throw new FileAccessError(messages.cannotRead(path), { cause: error });
  }
}

export function reportError(error: unknown): ExitCode {
  if (error instanceof InvalidDecklistError) {
    log(messages.invalidDecklist(error.errors.length));
    for (const e of error.errors)
      log(messages.lineError(e.line, lineErrorReason(e), e.content));
    return ExitCode.InvalidDecklist;
  }
  if (error instanceof EmptyDecklistError) {
    log(messages.emptyDecklist);
    return ExitCode.InvalidDecklist;
  }
  if (error instanceof TooManyCardsError) {
    log(messages.tooManyCards(error.count, error.max));
    return ExitCode.InvalidDecklist;
  }
  if (error instanceof CardsNotFoundError) {
    log(messages.cardsNotFound(error.names));
    return ExitCode.InvalidDecklist;
  }
  if (error instanceof ScryfallError) {
    log(messages.network);
    return ExitCode.Network;
  }
  if (error instanceof LayoutError) {
    log(messages.invalidLayout);
    return ExitCode.Usage;
  }
  if (error instanceof ArtArchiveLimitError) {
    log(messages.zipTooLarge);
    return ExitCode.Usage;
  }
  if (error instanceof ArtArchiveError) {
    log(messages.invalidZip);
    return ExitCode.Usage;
  }
  if (error instanceof FileAccessError) {
    log(error.message);
    return ExitCode.Usage;
  }
  log(error instanceof Error ? error.message : String(error));
  return ExitCode.Usage;
}
