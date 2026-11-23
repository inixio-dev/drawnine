import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ScryfallCard } from '@drawnine/scryfall-client';

type FixtureName = 'lightningBolt' | 'delver' | 'fireIce' | 'lilianaEnTilde';

export const cards = JSON.parse(
  readFileSync(fileURLToPath(new URL('./cards.json', import.meta.url)), 'utf8'),
) as Record<FixtureName, ScryfallCard>;

export function jsonResponse(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
