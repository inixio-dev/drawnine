# CLAUDE.md

Guide for working in this repository. Read it before making changes.

## What this project is

**DrawNine** is a Magic: The Gathering proxy generator **for deck playtesting**. Given a decklist (and optionally a `.zip` with custom art), it produces a printable A4 PDF with cards at real size (63×88 mm), laid out in a 3×3 grid with cut marks.

It is not a product for selling or counterfeiting cards. Every user-facing text (CLI help, API responses, README) must make clear that it is for personal use and playtesting only.

## Architecture

NestJS monorepo (`nest-cli.json` with `"monorepo": true`) with two apps and several libs. **All logic lives in `libs/`; apps are thin layers.**

```
apps/
  api/                 REST API (controllers, DTOs, file uploads)
  cli/                 CLI built with nest-commander
libs/
  decklist-parser/     Decklist parsing. Plain TypeScript, no Nest
  pdf-renderer/        PDF layout with pdf-lib. Plain TypeScript, no Nest
  scryfall-client/     Scryfall API client (batching, rate limiting, caching)
  assets/              .zip reading, normalization with sharp, name matching
  storage/             StorageService interface + implementations (disk, S3)
  core/                ProxyService: orchestrates parser → cards → assets → PDF
```

Every app and lib follows the same layout, with tests in a `test/` folder next to `src/`:

```
libs/decklist-parser/
  src/
  test/
  tsconfig.lib.json
```

### Allowed dependencies between modules

- `apps/*` → `core` (and `storage` to pick the implementation). Nothing else.
- `core` → all other libs.
- `decklist-parser` and `pdf-renderer` → **no** project libs and no `@nestjs/*`. They must be usable in the browser later (Angular).
- `scryfall-client`, `assets`, `storage` → may use `@nestjs/common` to expose modules, but their logic must not depend on Nest.
- Never import from `apps/` inside `libs/`.

Always use the `tsconfig.json` path aliases (`@app/core`, `@app/decklist-parser`…), never relative paths between libs.

## Commands

```bash
npm install

# Development
npm run start:dev api              # API in watch mode
npm run start:dev cli -- build ./examples/deck.txt -o out.pdf

# Build
npx nest build api
npx nest build cli

# Quality
npm run lint
npm run format
npm test                           # all tests (vitest run)
npm run test:watch                 # vitest in watch mode
npm run test:e2e                   # API e2e tests
npx vitest run libs/decklist-parser   # tests for a single lib
```

Before considering a task done, `npm run lint && npm test` must pass.

## Domain rules

### Decklists

Formats supported by `decklist-parser`:

- Plain text: `4 Lightning Bolt`
- Arena / MTGO: `4 Lightning Bolt (M10) 146`
- Sections: `Deck`, `Sideboard`, `Commander`, `Companion` (a blank line also works as a sideboard separator)
- Foil markers (`*F*`) are ignored

The parser returns valid lines **and** per-line errors (line number + reason). It never throws on a malformed line.

### Scryfall

- Use `POST /cards/collection` in batches of at most **75** identifiers.
- Respect the rate limit: at most ~10 requests/second, with backoff on 429.
- Send custom `User-Agent` and `Accept` headers, as Scryfall requires.
- Cache metadata and images. Never fetch the same image twice in one run.
- Default image: `png` (745×1040).
- Double-faced cards (`card_faces`): print both faces as separate cards unless told otherwise.

Tests **never call the real Scryfall API**: use fixtures in `libs/scryfall-client/test/fixtures/`.

### Custom art (.zip)

- Match by normalized file name: lowercase, accents stripped, `//` and `_` treated as equivalent, extension removed.
- Custom art takes precedence over Scryfall. Cards without custom art fall back to Scryfall.
- Normalize to a 63:88 aspect ratio (`cover` by default) and to PNG/JPG with `sharp`.
- Emit a warning (not an error) if resolution is below ~744×1039 px.

**Zip security (mandatory):**

- Limits on compressed size, uncompressed size and number of entries (configurable). The compressed-size limit can be disabled (`ART_ZIP_MAX_COMPRESSED_BYTES=0`); the uncompressed and entry limits are always enforced.
- Ignore paths containing `..`, absolute paths and symlinks (zip slip).
- Process in memory; never extract to disk.
- Validate each file is a real image by opening it with `sharp`, not by its extension.

### PDF

- Units: work in **millimetres** in the logic and convert to points (`1 mm = 72 / 25.4 pt`) only when drawing.
- Card: 63×88 mm. A4: 210×297 mm. Centred 3×3 grid.
- Options: gap between cards (0–10 mm), cut marks, bleed.
- Layout logic (positions) is a pure, testable function, separate from the pdf-lib drawing code.

## Code conventions

- Strict TypeScript. No `any`; use `unknown` and narrow.
- Pure functions wherever possible; side effects (network, disk) at the edges.
- Domain errors as custom classes in each lib (`DecklistParseError`, `ScryfallRateLimitError`…). Apps translate them into HTTP responses or CLI exit codes.
- API input validation with `class-validator` in DTOs.
- Configuration via `@nestjs/config`, with environment variables documented in `.env.example`. No secrets in code.
- Code, types, comments and commits in English. README and CLI texts in English (the CLI translates lib messages by their codes); other user-facing texts (API, PDF) in Spanish for now. All i18n-ready.
- Conventional Commits (`feat(parser): …`, `fix(pdf-renderer): …`).

## Tests

- Vitest, not Jest. Don't add Jest or `@types/jest`; import `describe`, `it`, `expect` and `vi` from `vitest`.
- Tests live in each app's and lib's `test/` folder, at the same level as `src/`, mirroring the `src/` structure (`src/layout/grid.ts` → `test/layout/grid.spec.ts`). Never put tests inside `src/`.
- Unit tests: `*.spec.ts`. API e2e tests: `apps/api/test/**/*.e2e-spec.ts`.
- Vitest uses `unplugin-swc` so Nest decorators and `emitDecoratorMetadata` work. Keep it in `vitest.config.ts`.
- Use `vi.fn()` / `vi.spyOn()` for mocks and `Test.createTestingModule` from `@nestjs/testing` for Nest modules.
- `decklist-parser` and the `pdf-renderer` layout must have high coverage: they are the core.
- For PDFs, test positions and page count, not file bytes.
- Cases that must always be covered: double-faced cards, names with `//`, quantities > 9, invalid lines, zips with malicious paths.

## API (apps/api)

- `POST /decks/parse` → returns the parsed decklist and errors.
- `POST /proxies` → `multipart/form-data` with `decklist` (text), `art` (optional zip) and options; streams the PDF back (`application/pdf`).
- Generation is synchronous for now. When queues are added (BullMQ), the worker will call `ProxyService` with no changes to `core`.

## CLI (apps/cli)

```bash
drawnine build <decklist> [--art <zip>] [-o <output.pdf>] [--gap <mm>] [--no-cut-marks] [--bleed <mm>] [--single-face] [--lang <code>]
drawnine parse <decklist>       # prints the parser result and errors
```

- Scryfall cache in `~/.cache/drawnine/`.
- Exit codes: `0` OK, `1` usage error, `2` decklist has errors, `3` network/Scryfall error.
- Progress goes to stderr; stdout is only for useful output.

## Don'ts

- Don't put business logic in controllers or commands.
- Don't add Nest dependencies to `decklist-parser` or `pdf-renderer`.
- Don't call Scryfall in tests.
- Don't use Jest or put tests inside `src/`.
- Don't commit card images or generated PDFs (they are in `.gitignore`).
- Don't add heavy dependencies (Puppeteer, etc.) without justification.