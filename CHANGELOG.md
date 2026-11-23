# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.1.0] - 2026-11-23

First public release.

### Added

- `drawnine build` CLI command: turns a decklist into a printable A4 PDF with
  real-size cards (63×88 mm) in a 3×3 grid, with configurable gap, cut marks
  and bleed.
- `drawnine parse` CLI command: prints the parsed decklist and per-line errors.
- Decklist parser for plain text and Arena/MTGO exports, with `Deck`,
  `Sideboard`, `Commander` and `Companion` sections.
- Card data and images from Scryfall, with batching, rate limiting and a local
  cache (`~/.cache/drawnine/`). Disk and S3 cache storage.
- Double-faced cards printed with both faces (`--single-face` to disable).
- Localized card images with `--lang`, falling back to English.
- Custom art from a `.zip`, matched by card name, cropped to 63:88, with
  zip-slip and zip-bomb protection.
- REST API (`POST /decks/parse`, `POST /proxies`), available from source.

[Unreleased]: https://github.com/inixio-dev/drawnine/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/inixio-dev/drawnine/releases/tag/v0.1.0
