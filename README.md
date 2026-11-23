# DrawNine

[![CI](https://github.com/inixio-dev/drawnine/actions/workflows/ci.yml/badge.svg)](https://github.com/inixio-dev/drawnine/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

Magic: The Gathering proxy generator **for deck playtesting**. Given a decklist (and optionally a `.zip` with your own art), it generates a printable A4 PDF with cards at real size (63×88 mm), laid out in a 3×3 grid with cut marks.

> ⚠️ **For personal use and deck playtesting only.** DrawNine is not meant for selling cards or passing them off as originals.

## Installation

Requires Node.js 22 or later.

```bash
npm install -g drawnine
drawnine build deck.txt -o deck.pdf
```

Or without installing it:

```bash
npx drawnine build deck.txt -o deck.pdf
```

### From source

Requires pnpm.

```bash
git clone https://github.com/inixio-dev/drawnine.git
cd drawnine
pnpm install
cp .env.example .env

# CLI
pnpm start:dev cli -- build ./examples/deck.txt -o out.pdf
pnpm start:dev cli -- parse ./examples/deck.txt

# REST API (only available from source)
pnpm start:dev api
```

## Usage

A decklist is plain text, one card per line. Arena/MTGO exports work as is:

```text
Deck
4 Lightning Bolt
4 Delver of Secrets (ISD) 51
2 Fire // Ice

Sideboard
3 Pyroblast
```

### API

- `POST /decks/parse` — `{ "decklist": "4 Lightning Bolt" }` → parsed decklist and errors.
- `POST /proxies` — `multipart/form-data` with `decklist`, `art` (optional zip), `gap` (mm, 0–10), `bleed` (mm), `cutMarks`, `bothFaces` (`true`/`false`) and `lang` (Scryfall language code such as `es`, `fr`, `ja`; default `en`). Returns the PDF (`application/pdf`); the `X-DrawNine-Pages`, `X-DrawNine-Cards` and `X-DrawNine-Warnings` (URI-encoded JSON) headers give details.

Errors: `400` invalid options or .zip, `413` .zip too large, `422` decklist with errors, empty, too long or with cards not found, `502` Scryfall unavailable.

### CLI

```bash
drawnine --version
drawnine build <decklist> [--art <zip>] [-o <output.pdf>] [--gap <mm>] [--no-cut-marks] [--bleed <mm>] [--single-face] [--lang <code>]
drawnine parse <decklist>
```

Double-faced cards are printed with both faces unless `--single-face` is passed. `--lang <code>` (for example `es`, `fr`, `ja`) uses Scryfall images in that language: the same printing if it exists in that language, otherwise the latest printing in it (unless the decklist line pins a set). Cards never printed in that language fall back to English with a warning. The Scryfall cache is stored in `~/.cache/drawnine/`.

Exit codes: `0` OK, `1` usage error, `2` decklist has errors, `3` network/Scryfall error.

### Custom art (.zip)

Name each image after its card (`Lightning Bolt.png`, `Fire_Ice.jpg`; case and accents don't matter). Custom art takes precedence over Scryfall, is cropped to a 63:88 aspect ratio, and you get a warning if its resolution is below 744×1039 px. For double-faced cards you can provide one image per face, using each face's name.

## Configuration

Environment variables in [.env.example](.env.example): `User-Agent` for Scryfall, cache storage (`disk` or `s3`), .zip limits and maximum number of cards.

## Development

```bash
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) to contribute and [CLAUDE.md](CLAUDE.md) for architecture and conventions.

## Disclaimer

DrawNine is a tool for **personal use and deck playtesting only**. Proxies made with it must not be sold, traded or passed off as genuine Magic: The Gathering cards, and are not legal in sanctioned tournaments.

DrawNine is unofficial Fan Content and is not approved, endorsed or affiliated with Wizards of the Coast. Magic: The Gathering, card names, card images and mana symbols are property of Wizards of the Coast LLC. Card data and images are fetched at run time from [Scryfall](https://scryfall.com) under its [API guidelines](https://scryfall.com/docs/api); DrawNine is not affiliated with Scryfall. This repository contains no card images.

## License

[MIT](LICENSE) © Inixio ([@inixio-dev](https://github.com/inixio-dev))
