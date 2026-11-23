import { describe, expect, it } from 'vitest';
import { normalizeCardName } from '@app/assets';

describe('normalizeCardName', () => {
  it('lowercases', () => {
    expect(normalizeCardName('Lightning Bolt')).toBe('lightning bolt');
  });

  it('strips accents', () => {
    expect(normalizeCardName("Lim-Dûl's Vault")).toBe("lim-dul's vault");
    expect(normalizeCardName('Séance')).toBe('seance');
  });

  it('treats `//` and `_` as equivalent', () => {
    const expected = 'fire // ice';
    expect(normalizeCardName('Fire // Ice')).toBe(expected);
    expect(normalizeCardName('Fire//Ice')).toBe(expected);
    expect(normalizeCardName('Fire_Ice.png')).toBe(expected);
    expect(normalizeCardName('Fire _ Ice.png')).toBe(expected);
    expect(normalizeCardName('Fire__Ice.jpg')).toBe(expected);
  });

  it('removes the file extension', () => {
    expect(normalizeCardName('Lightning Bolt.PNG')).toBe('lightning bolt');
    expect(normalizeCardName('Lightning Bolt.jpeg')).toBe('lightning bolt');
  });

  it('normalizes curly apostrophes and extra whitespace', () => {
    expect(normalizeCardName('  Urza’s   Saga.png ')).toBe("urza's saga");
  });

  it('matches a decklist name with its file name', () => {
    expect(normalizeCardName('Delver of Secrets // Insectile Aberration')).toBe(
      normalizeCardName('delver of secrets_insectile aberration.png'),
    );
  });
});
