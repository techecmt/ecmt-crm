const COURSE_MATCH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "in",
  "of",
  "to",
  "for",
  "with",
  "on",
  "the",
  "course",
  "courses",
  "program",
  "programme",
  "diploma",
  "advanced",
  "certificate",
  "specialised",
  "specialized",
  "training",
  "fee",
  "fees",
  "cost",
  "price",
  "tuition",
  "payment",
  "installment",
  "installments",
  "how",
  "much",
]);

function normalizeText(value: string | null | undefined) {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

function includesToken(haystack: string, needle: string) {
  if (!needle) return false;
  return haystack.includes(needle);
}

function normalizeToken(token: string) {
  const cleaned = token.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!cleaned) return "";
  if (cleaned.length > 7 && cleaned.endsWith("ing")) return cleaned.slice(0, -3);
  if (cleaned.length > 6 && cleaned.endsWith("ies")) return `${cleaned.slice(0, -3)}y`;
  if (cleaned.length > 5 && cleaned.endsWith("es")) return cleaned.slice(0, -2);
  if (cleaned.length > 4 && cleaned.endsWith("s")) return cleaned.slice(0, -1);
  return cleaned;
}

function meaningfulTokens(value: string | null | undefined) {
  return normalizeText(value)
    .split(" ")
    .map((token) => normalizeToken(token))
    .filter((token) => token.length >= 3 && !COURSE_MATCH_STOP_WORDS.has(token));
}

function normalizePhraseForMatch(value: string | null | undefined) {
  return meaningfulTokens(value).join(" ");
}

function tokensSimilar(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5) return false;
  return a.startsWith(b) || b.startsWith(a);
}

function overlapScore(
  sourceTokens: string[],
  candidateTokens: string[],
  pointsPerToken: number,
  ratioBonus: number,
) {
  if (!sourceTokens.length || !candidateTokens.length) return 0;
  const source = [...new Set(sourceTokens)];
  const candidate = [...new Set(candidateTokens)];
  let overlap = 0;
  for (const token of candidate) {
    if (source.some((value) => tokensSimilar(value, token))) {
      overlap += 1;
    }
  }
  if (!overlap) return 0;
  const ratio = overlap / candidate.length;
  let score = overlap * pointsPerToken;
  if (candidate.length >= 2 && ratio >= 0.95) score += ratioBonus;
  else if (candidate.length >= 2 && ratio >= 0.7) score += Math.round(ratioBonus * 0.65);
  return score;
}

export function scoreCourseMatch(input: {
  text: string;
  leadCourse: string;
  courseName: string;
  aliases: string[] | null;
}) {
  const normalizedCourseName = normalizeText(input.courseName);
  if (!normalizedCourseName) return 0;
  const normalizedCoursePhrase = normalizePhraseForMatch(input.courseName);
  const normalizedTextPhrase = normalizePhraseForMatch(input.text);
  const normalizedLeadPhrase = normalizePhraseForMatch(input.leadCourse);
  const textTokens = meaningfulTokens(input.text);
  const leadTokens = meaningfulTokens(input.leadCourse);
  const courseTokens = meaningfulTokens(input.courseName);

  let score = 0;
  if (includesToken(input.text, normalizedCourseName)) score += 90;
  if (
    normalizedCoursePhrase &&
    includesToken(normalizedTextPhrase, normalizedCoursePhrase)
  ) {
    score += 70;
  }
  score += overlapScore(textTokens, courseTokens, 18, 24);

  if (input.leadCourse && normalizedCoursePhrase) {
    if (normalizedLeadPhrase === normalizedCoursePhrase) score += 140;
    if (includesToken(normalizedLeadPhrase, normalizedCoursePhrase)) score += 50;
    if (includesToken(normalizedCoursePhrase, normalizedLeadPhrase)) score += 50;
    score += overlapScore(leadTokens, courseTokens, 20, 28);
  }

  let aliasBestScore = 0;
  for (const alias of input.aliases ?? []) {
    const normalizedAlias = normalizeText(alias);
    if (!normalizedAlias) continue;

    let aliasScore = 0;
    if (includesToken(input.text, normalizedAlias)) aliasScore += 30;

    const normalizedAliasPhrase = normalizePhraseForMatch(alias);
    if (
      normalizedAliasPhrase &&
      includesToken(normalizedTextPhrase, normalizedAliasPhrase)
    ) {
      aliasScore += 34;
    }
    aliasScore += overlapScore(textTokens, meaningfulTokens(alias), 12, 16);
    aliasBestScore = Math.max(aliasBestScore, aliasScore);
  }

  return score + aliasBestScore;
}

export function looksLikeNamedCourseQuery(text: string) {
  return (
    /\b(?:advanced\s+)?diploma\b\s+(?:in\s+)?[a-z0-9&/(),.' -]{3,}/i.test(text) ||
    /\b(?:certificate|course|program|programme)\s+(?:in|of|for)\s+[a-z0-9&/(),.' -]{3,}/i.test(
      text,
    )
  );
}
