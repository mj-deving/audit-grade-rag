/**
 * Folds German umlauts and eszett onto their ASCII transliteration.
 *
 * The corpus fixture stores Article 50 transliterated ("muessen", "natuerlichen"), so a visitor
 * typing correct German ("müssen") would otherwise share no terms with it and get a refusal. The
 * fold maps both spellings of a word onto one key, so it can only ever merge two spellings of the
 * same word: it adds retrieval matches and removes none. Applied after lowercasing.
 */
export function foldGerman(text: string): string {
  return text
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss");
}
