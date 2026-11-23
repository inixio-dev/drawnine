# Contributing to DrawNine

Thanks for your interest in DrawNine! Bug reports, decklists that don't parse
and pull requests are all welcome.

DrawNine is a playtesting tool. Contributions aimed at making proxies harder to
tell apart from real cards (for example, removing or faking copyright lines) or
at selling them will not be accepted.

## Getting started

Requires Node.js 22+ and pnpm.

```bash
pnpm install
cp .env.example .env
pnpm start:dev cli -- build ./examples/deck.txt -o out.pdf
```

## Before opening a pull request

```bash
pnpm lint
pnpm test
pnpm test:e2e
```

All three must pass; CI runs them on Node 22 and 24.

- Read [CLAUDE.md](CLAUDE.md): it describes the architecture, the allowed
  dependencies between libs and the domain rules.
- Business logic goes in `libs/`, never in controllers or CLI commands.
- Tests use Vitest and live in each project's `test/` folder, mirroring `src/`.
- Tests never call the real Scryfall API: use the fixtures in
  `libs/scryfall-client/test/fixtures/`.
- Don't commit card images or generated PDFs.
- Use [Conventional Commits](https://www.conventionalcommits.org/)
  (`feat(parser): …`, `fix(pdf-renderer): …`).

## Reporting a bug

Include the DrawNine version (`drawnine --version`), the command you ran and,
if relevant, the decklist lines that fail. Please don't attach copyrighted art.
