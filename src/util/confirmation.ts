/** Default affirmative answers (English + Spanish + common emojis). */
export const DEFAULT_YES = [
  'yes',
  'y',
  'yeah',
  'yep',
  'yup',
  'sure',
  'ok',
  'okay',
  'confirm',
  'confirmed',
  'correct',
  'sí',
  'si',
  's',
  'vale',
  'claro',
  'correcto',
  'confirmar',
  'dale',
  '👍',
  '✅',
];

/** Default negative answers (English + Spanish + common emojis). */
export const DEFAULT_NO = [
  'no',
  'n',
  'nope',
  'nah',
  'cancel',
  'cancelar',
  'incorrect',
  'incorrecto',
  'stop',
  '👎',
  '❌',
];

function normalize(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[.!?¡¿]+$/g, '');
}

/**
 * Interprets a reply as affirmative (`true`), negative (`false`) or unrecognized
 * (`undefined`), matching against the accepted answer lists.
 */
export function parseConfirmation(
  text: string,
  options: { yes?: string[]; no?: string[] } = {},
): boolean | undefined {
  const answer = normalize(text);
  if ((options.yes ?? DEFAULT_YES).map(normalize).includes(answer)) return true;
  if ((options.no ?? DEFAULT_NO).map(normalize).includes(answer)) return false;
  return undefined;
}
