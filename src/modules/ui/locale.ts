export type OperatorLocale = "de-DE";

export function parseOperatorLocale(acceptLanguage: string | null | undefined): OperatorLocale {
  if (acceptLanguage === null || acceptLanguage === undefined || acceptLanguage.trim() === "") {
    return "de-DE";
  }

  const preferences = acceptLanguage
    .split(",")
    .map((part) => parsePreference(part.trim()))
    .filter((part) => part.tag.length > 0)
    .sort((a, b) => b.quality - a.quality);

  const preferred = preferences.find((part) => part.tag === "de" || part.tag.startsWith("de-"));
  return preferred === undefined ? "de-DE" : "de-DE";
}

function parsePreference(part: string): { readonly tag: string; readonly quality: number } {
  const [rawTag = "", ...params] = part.split(";").map((value) => value.trim());
  const qualityParam = params.find((param) => param.startsWith("q="));
  const quality =
    qualityParam === undefined ? 1 : Number.parseFloat(qualityParam.slice("q=".length));
  return {
    tag: rawTag.toLowerCase(),
    quality: Number.isFinite(quality) ? quality : 0,
  };
}
