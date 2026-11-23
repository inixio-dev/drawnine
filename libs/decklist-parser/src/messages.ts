import type { DecklistErrorCode } from './types.js';

/** Default (Spanish) reasons for each error code. Apps may translate by code. */
export const DECKLIST_ERROR_MESSAGES: Record<DecklistErrorCode, string> = {
  'missing-quantity': 'Falta la cantidad (por ejemplo: "4 Lightning Bolt").',
  'invalid-quantity': 'La cantidad debe ser un número entero mayor que 0.',
  'quantity-too-large': 'La cantidad es demasiado grande.',
  'missing-name': 'Falta el nombre de la carta.',
};
