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

/** Tidies spaces within each line and collapses the blank lines that removed content leaves behind */
const tidyWhitespace = (text: string) =>
  text
    .split('\n')
    .map((line) => line.replace(/[^\S\n]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** Removes emoji, keeping line breaks */
export const stripEmoji = (text: string) =>
  tidyWhitespace(
    text
      .replaceAll(KEYCAP_TEN, '10\u20E3')
      .replace(
        LINE_START_KEYCAPS_REGEX,
        (_, indent: string, keycaps: string) => `${indent}${keycaps.replace(/\D/g, '')}.`,
      )
      .replace(KEYCAP_REGEX, '$1')
      .replace(EMOJI_REGEX, ''),
  );

/** `#` + a word starting with a letter (so "C#", "#1", "page#anchor" don't count); `\p{M}` keeps decomposed letters */
const HASHTAG = '#[\\p{L}_][\\p{L}\\p{M}\\p{N}_]*';
/** A run of hashtags ending a line ("…2 часа #суп #простыеблюда", or a hashtag-only line) — removed entirely */
const TRAILING_HASHTAGS_REGEX = new RegExp(`(?:(?:^|[^\\S\\n]+)${HASHTAG})+[^\\S\\n]*$`, 'gmu');
/** A hashtag inside a sentence ("Готуємо #борщ сьогодні") — only the `#` goes, the word stays */
const INLINE_HASHTAG_MARK_REGEX = /(?<=^|\s)#(?=[\p{L}_])/gmu;

export const stripHashtags = (text: string) =>
  tidyWhitespace(text.replace(TRAILING_HASHTAGS_REGEX, '').replace(INLINE_HASHTAG_MARK_REGEX, ''));

/**
 * Emoji first, so a hashtag glued to one ("🔥#борщ") becomes a normal hashtag, and one followed by a flag
 * ("#greekcuisine🇬🇷") still ends the line once the flag is gone.
 */
export const cleanText = (text: string) => stripHashtags(stripEmoji(text));

const cleanList = (list: string[] | undefined) => {
  const cleaned = list?.map(cleanText).filter(Boolean);

  return cleaned?.length ? cleaned : undefined;
};

/** Imported drafts never carry emoji or hashtags; fields left empty by the cleanup are dropped */
export const cleanDraft = (draft: ExternalRecipeDraft): ExternalRecipeDraft => ({
  ...draft,
  recipeTitle: draft.recipeTitle ? cleanText(draft.recipeTitle) || undefined : undefined,
  description: draft.description ? cleanText(draft.description) || undefined : undefined,
  ingredients: cleanList(draft.ingredients),
  steps: cleanList(draft.steps),
});
