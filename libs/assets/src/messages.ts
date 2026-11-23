import type { ArtWarningCode } from './types.js';

/** Default (Spanish) messages. Apps may translate by code. */
export const ART_WARNING_MESSAGES: Record<ArtWarningCode, string> = {
  'unsafe-path': 'Ruta no permitida en el .zip; se ignora.',
  symlink: 'Los enlaces simbólicos no están permitidos; se ignora.',
  encrypted: 'Archivo cifrado; se ignora.',
  'corrupt-entry':
    'Archivo dañado o con un formato de compresión no soportado; se ignora.',
  'not-an-image': 'No es una imagen válida; se ignora.',
  'low-resolution':
    'Resolución baja (se recomienda al menos 744×1039 px); puede verse pixelada al imprimir.',
  'duplicate-name':
    'Hay varias imágenes para la misma carta; se usa la última.',
};
