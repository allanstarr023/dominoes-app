export const DEFAULT_CHAT_BLOCK_MINUTES = 5;

const BLOCKED_TERMS = Object.freeze([
  "badword",
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "retard"
]);

const BLOCKED_PATTERNS = BLOCKED_TERMS.map((term) => new RegExp(`(^|\\W)${escapeRegExp(term)}(\\W|$)`, "i"));

export function containsOffensiveLanguage(text) {
  const normalized = normalizeModerationText(text);

  return BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function chatBlockMinutes(input) {
  const minutes = Number(input ?? DEFAULT_CHAT_BLOCK_MINUTES);

  if (!Number.isFinite(minutes)) {
    return DEFAULT_CHAT_BLOCK_MINUTES;
  }

  return Math.max(1, Math.min(240, Math.round(minutes)));
}

function normalizeModerationText(text) {
  return String(text ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll("@", "a")
    .replaceAll("$", "s")
    .replaceAll("0", "o")
    .replaceAll("1", "i")
    .replaceAll("3", "e")
    .replaceAll("4", "a")
    .replaceAll("5", "s")
    .replaceAll("7", "t");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
