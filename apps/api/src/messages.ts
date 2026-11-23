/** User-facing texts (Spanish). Kept in one place so they can be moved to i18n later. */
export const messages = {
  disclaimer:
    'DrawNine genera proxies solo para uso personal y para probar mazos. No está permitida su venta ni su uso como cartas reales.',
  invalidDecklist: 'La lista de mazo contiene líneas no válidas.',
  emptyDecklist: 'La lista de mazo no contiene cartas.',
  tooManyCards: (count: number, max: number) =>
    `La lista tiene ${count} cartas para imprimir; el máximo es ${max}.`,
  cardsNotFound: 'Algunas cartas no se encontraron en Scryfall.',
  invalidLayout:
    'Las opciones de separación y sangrado no caben en una hoja A4.',
  invalidArtArchive: 'El archivo .zip de ilustraciones no es válido.',
  artArchiveTooLarge:
    'El archivo .zip de ilustraciones supera los límites permitidos.',
  scryfallUnavailable:
    'No se pudo contactar con Scryfall. Inténtalo más tarde.',
} as const;
