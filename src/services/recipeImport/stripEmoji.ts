import type { ExternalRecipeDraft } from './types';

const KEYCAP_TEN = '\u{1F51F}';
/**
 * Keycap numbers at the start of a line are step numbering: "1️⃣ Нарізати", "10️⃣" / "1️⃣0️⃣" / "🔟" → "1. Нарізати", "10."
 * (🔟 is first rewritten as a "10" keycap so it's handled the same way)
 */
const LINE_START_KEYCAPS_REGEX = /^([^\S\n]*)((?:\d*\d\uFE0F?\u20E3)+)/gmu;
/** Any other keycap ("ТОП 5️⃣") keeps just its digit; # and * keycaps go entirely */
const KEYCAP_REGEX = /(?:(\d)|[#*])?\uFE0F?\u20E3/gu;
/**
 * Pictographs, skin tones, flag letters, subdivision-flag tags, and the invisible variation selector / zero-width
 * joiner that glue emoji sequences together (so 👨🏽‍🍳 or 🇺🇦 leave nothing behind)
 */
const EMOJI_REGEX =
  /[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u{E0020}-\u{E007F}]|\uFE0F|\u200D/gu;

/** Removes emoji, keeping line breaks: tidies spaces within each line and the blank lines emoji-only lines leave */
export const stripEmoji = (text: string) =>
  text
    .replaceAll(KEYCAP_TEN, '10\u20E3')
    .replace(
      LINE_START_KEYCAPS_REGEX,
      (_, indent: string, keycaps: string) => `${indent}${keycaps.replace(/\D/g, '')}.`,
    )
    .replace(KEYCAP_REGEX, '$1')
    .replace(EMOJI_REGEX, '')
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const stripEmojiFromList = (list: string[] | undefined) => {
  const cleaned = list?.map(stripEmoji).filter(Boolean);

  return cleaned?.length ? cleaned : undefined;
};

/** Imported drafts never carry emoji; fields left empty by the cleanup are dropped */
export const stripEmojiFromDraft = (draft: ExternalRecipeDraft): ExternalRecipeDraft => ({
  ...draft,
  recipeTitle: draft.recipeTitle ? stripEmoji(draft.recipeTitle) || undefined : undefined,
  description: draft.description ? stripEmoji(draft.description) || undefined : undefined,
  ingredients: stripEmojiFromList(draft.ingredients),
  steps: stripEmojiFromList(draft.steps),
});
