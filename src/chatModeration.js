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
const LINK_PATTERN = /(?:https?:\/\/|www\.|(?:discord\.gg|t\.me|wa\.me|bit\.ly|tinyurl\.com)\/|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|co|us|tt|biz|info|me|app|dev|gg|tv|ly|shop|site|online|club|xyz|edu|gov)\b)/i;

export function containsOffensiveLanguage(text) {
  const normalized = normalizeModerationText(text);

  return BLOCKED_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function containsLink(text) {
  const normalized = normalizeModerationText(text);
  const compact = normalized.replace(/\s+/g, "");

  return LINK_PATTERN.test(normalized) || LINK_PATTERN.test(compact);
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
