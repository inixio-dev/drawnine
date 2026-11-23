import type {
  CardFaceImage,
  CardIdentifier,
  ImageVersion,
  ScryfallCard,
} from './types.js';

const IMAGE_FALLBACK: readonly ImageVersion[] = ['png', 'large', 'normal'];

/** Case- and accent-insensitive comparison key. */
export function normalizeForMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Stable key for an identifier (used for dedupe and caching). */
export function identifierKey(id: CardIdentifier): string {
  if ('id' in id) return `id:${id.id.toLowerCase()}`;
  if ('collector_number' in id) {
    return `cn:${id.set.toLowerCase()}:${id.collector_number.toLowerCase()}`;
  }
  if ('set' in id)
    return `ns:${normalizeForMatch(id.name)}:${id.set.toLowerCase()}`;
  return `n:${normalizeForMatch(id.name)}`;
}

/** Whether a returned card answers the given identifier. */
export function matchesIdentifier(
  card: ScryfallCard,
  id: CardIdentifier,
): boolean {
  if ('id' in id) return card.id === id.id;
  if ('collector_number' in id) {
    return (
      card.set.toLowerCase() === id.set.toLowerCase() &&
      card.collector_number.toLowerCase() === id.collector_number.toLowerCase()
    );
  }
  if ('set' in id && card.set.toLowerCase() !== id.set.toLowerCase())
    return false;
  const wanted = normalizeForMatch(id.name);
  const names = [card.name, ...(card.card_faces ?? []).map((f) => f.name)];
  return names.some((name) => normalizeForMatch(name) === wanted);
}

/**
 * Images to print for a card. Double-faced cards (faces with their own images)
 * yield one image per face; split, adventure and flip cards yield one image.
 */
export function getCardImages(
  card: ScryfallCard,
  options: { bothFaces: boolean; version?: ImageVersion } = { bothFaces: true },
): CardFaceImage[] {
  const pick = (uris: ScryfallCard['image_uris']): string | undefined => {
    if (!uris) return undefined;
    const order = [options.version ?? 'png', ...IMAGE_FALLBACK];
    for (const version of order) {
      const url = uris[version];
      if (url) return url;
    }
    return undefined;
  };

  const single = pick(card.image_uris);
  if (single) return [{ faceName: card.name, url: single }];

  const faces = (card.card_faces ?? []).flatMap((face) => {
    const url = pick(face.image_uris);
    return url ? [{ faceName: face.name, url }] : [];
  });
  return options.bothFaces ? faces : faces.slice(0, 1);
}

/** Whether Scryfall has a real scan (not a placeholder) to print for a card. */
export function hasPrintableImage(card: ScryfallCard): boolean {
  if (card.image_status === 'missing' || card.image_status === 'placeholder') {
    return false;
  }
  return getCardImages(card).length > 0;
}

/** Detects PNG/JPEG from magic bytes. */
export function detectImageFormat(
  bytes: Uint8Array,
): 'png' | 'jpg' | undefined {
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  return undefined;
}
