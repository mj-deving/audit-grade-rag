/**
 * Folds German umlauts and eszett onto their ASCII transliteration.
 *
 * The corpus fixture stores Article 50 with correct German umlauts ("müssen", "natürlichen"). A
 * visitor may type either spelling, so folding both the corpus and the query onto one key makes
 * retrieval umlaut-agnostic in both directions: it can only ever merge two spellings of the same
 * word, so it adds matches and removes none. Applied after lowercasing.
 */
export function foldGerman(text: string): string {
  return text
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss");
}
