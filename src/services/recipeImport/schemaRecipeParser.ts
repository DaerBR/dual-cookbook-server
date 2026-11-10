import { load } from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { AnyNode, Element } from 'domhandler';
import { fetchPublicHtml } from './fetchExternal';
import type { ExternalRecipeDraft } from './types';
import { HttpError } from '../../utils/httpError';

/**
 * Generic parser for recipe websites that publish schema.org `Recipe` structured data — what Google requires for
 * recipe rich results, so most recipe sites (WordPress recipe plugins, Cookpad, …) have it.
 * Reads JSON-LD first, then microdata (`itemprop="recipeIngredient"` etc.). Images are deliberately ignored.
 */

const MAX_TITLE_LENGTH = 100;

/** Max nesting walked while looking for the Recipe node in JSON-LD (`@graph`, `mainEntity`, arrays, …). */
const MAX_JSON_LD_DEPTH = 6;

/** Query params that only track the visit — dropped from `sourceUrl`. */
const TRACKING_PARAM_REGEX = /^(?:utm_\w+|fbclid|gclid|yclid|mc_cid|mc_eid|_ga)$/i;

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toArray = (value: JsonValue | undefined): JsonValue[] => {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

/** `@type` may be a string or an array (`["Recipe", "NewsArticle"]`), and sometimes a full IRI. */
const hasType = (node: JsonObject, type: string) =>
  toArray(node['@type']).some((value) => typeof value === 'string' && value.replace(/^.*[/#]/, '') === type);

/**
 * Field values may contain HTML tags and entities (`&#x27;`, `<p>`, `<br>`): converts them to plain text,
 * keeping block/line breaks as `\n` and tidying whitespace within each line.
 */
const htmlToText = (value: string): string => {
  if (!/[<&]/.test(value)) {
    return value.replace(/[^\S\n]+/g, ' ').trim();
  }

  const $ = load(value, null, false);

  $('br').replaceWith('\n');
  $('p, div, li, h1, h2, h3, h4, h5, h6').after('\n');

  return $.root()
    .text()
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const textOf = (value: JsonValue | undefined): string => (typeof value === 'string' ? htmlToText(value) : '');

const nonEmpty = (list: string[]) => list.filter((item) => item.length > 0);

/** "Step 1" / "Крок 2" — a placeholder `name` that carries no content of its own. */
const STEP_LABEL_REGEX = /^(?:step|крок|шаг)\s*\d+\.?$/i;

/**
 * `recipeInstructions` comes in several shapes: one string (often with line breaks), strings, `HowToStep`s,
 * `HowToSection`s grouping steps (`itemListElement`), or an `ItemList` of those. The section name goes on its own line
 * before the section's first step so the grouping isn't lost.
 */
const collectSteps = (value: JsonValue | undefined, depth = 0): string[] => {
  if (depth > MAX_JSON_LD_DEPTH) {
    return [];
  }

  return toArray(value).flatMap((item): string[] => {
    if (typeof item === 'string') {
      /** A lone string usually holds all steps separated by line breaks. */
      return nonEmpty(
        htmlToText(item)
          .split(/\n+/)
          .map((line) => line.trim()),
      );
    }

    if (!isObject(item)) {
      return [];
    }

    if (item.itemListElement !== undefined) {
      const steps = collectSteps(item.itemListElement, depth + 1);
      const sectionName = textOf(item.name);

      if (!sectionName || steps.length === 0 || !hasType(item, 'HowToSection')) {
        return steps;
      }

      return [`${sectionName}\n${steps[0]}`, ...steps.slice(1)];
    }

    const text = textOf(item.text) || textOf(item.description);
    const name = textOf(item.name);

    if (text) {
      return [text];
    }

    return name && !STEP_LABEL_REGEX.test(name) ? [name] : [];
  });
};

const toDraftFields = (recipe: JsonObject): Omit<ExternalRecipeDraft, 'sourceUrl'> => ({
  recipeTitle: textOf(recipe.name).slice(0, MAX_TITLE_LENGTH).trim() || undefined,
  description: textOf(recipe.description) || undefined,
  /** `ingredients` is the pre-2017 name of `recipeIngredient`, still emitted by some older sites. */
  ingredients: nonEmpty(toArray(recipe.recipeIngredient ?? recipe.ingredients).map(textOf)),
  steps: collectSteps(recipe.recipeInstructions),
});

/** Depth-first search for the first object typed `Recipe`, wherever the site nested it. */
const findRecipeNode = (value: JsonValue, depth = 0): JsonObject | null => {
  if (depth > MAX_JSON_LD_DEPTH) {
    return null;
  }

  if (Array.isArray(value)) {
    return value.reduce<JsonObject | null>((found, item) => found ?? findRecipeNode(item, depth + 1), null);
  }

  if (!isObject(value)) {
    return null;
  }

  if (hasType(value, 'Recipe')) {
    return value;
  }

  return Object.values(value).reduce<JsonObject | null>(
    (found, item) => found ?? findRecipeNode(item, depth + 1),
    null,
  );
};

const parseJsonLd = ($: CheerioAPI) =>
  $('script[type="application/ld+json"]')
    .toArray()
    .map((script) => {
      try {
        return findRecipeNode(JSON.parse($(script).text()) as JsonValue);
      } catch {
        /** Some sites ship invalid JSON-LD (trailing commas, raw newlines) — skip that block. */
        return null;
      }
    })
    .find((recipe) => recipe !== null);

/** Microdata values live in `content` (on `<meta>`) or in the element's text. */
const itempropValue = ($: CheerioAPI, el: AnyNode) => htmlToText($(el).attr('content') ?? $(el).html() ?? '');

/**
 * Fallback for sites using microdata instead of JSON-LD. Only properties whose nearest `itemscope` is the recipe
 * itself are read (so e.g. the author's `itemprop="name"` isn't taken for the title), except for instructions,
 * which may be nested `HowToStep` scopes.
 */
const parseMicrodata = ($: CheerioAPI): Omit<ExternalRecipeDraft, 'sourceUrl'> | null => {
  const scope = $('[itemscope][itemtype*="schema.org/Recipe"]').first();

  if (scope.length === 0) {
    return null;
  }

  const ownProps = (name: string) =>
    scope
      .find(`[itemprop~="${name}"]`)
      .toArray()
      .filter((el) => $(el).parent().closest('[itemscope]').is(scope));

  const instructionSteps = scope
    .find('[itemprop~="recipeInstructions"]')
    .toArray()
    .flatMap((el: Element) => {
      const items = $(el).find('li, [itemprop~="text"]').toArray();

      return items.length > 0 ? items.map((item) => itempropValue($, item)) : itempropValue($, el).split(/\n+/);
    });

  const [title] = ownProps('name').map((el) => itempropValue($, el));
  const [description] = ownProps('description').map((el) => itempropValue($, el));

  return {
    recipeTitle: title?.slice(0, MAX_TITLE_LENGTH).trim() || undefined,
    description: description || undefined,
    ingredients: nonEmpty(
      [...ownProps('recipeIngredient'), ...ownProps('ingredients')].map((el) => itempropValue($, el)),
    ),
    steps: nonEmpty(instructionSteps.map((step) => step.trim())),
  };
};

const toSourceUrl = (url: URL) => {
  const clean = new URL(url);

  clean.hash = '';
  [...clean.searchParams.keys()]
    .filter((key) => TRACKING_PARAM_REGEX.test(key))
    .forEach((key) => clean.searchParams.delete(key));

  return clean.href;
};

/** Any https URL — registered last, so dedicated parsers (Instagram, YouTube, …) take precedence. */
export const canParseSchemaRecipe = (url: URL) => url.protocol === 'https:';

export const parseSchemaRecipePage = async (url: URL): Promise<ExternalRecipeDraft> => {
  const { html, url: finalUrl } = await fetchPublicHtml(url);
  const $ = load(html);

  const jsonLdRecipe = parseJsonLd($);
  const fields = jsonLdRecipe ? toDraftFields(jsonLdRecipe) : parseMicrodata($);

  if (!fields || (!fields.ingredients?.length && !fields.steps?.length)) {
    throw new HttpError(
      422,
      'No recipe found on this page. The site has to publish structured recipe data (schema.org Recipe)',
    );
  }

  return {
    ...fields,
    ingredients: fields.ingredients?.length ? fields.ingredients : undefined,
    steps: fields.steps?.length ? fields.steps : undefined,
    sourceUrl: toSourceUrl(finalUrl),
  };
};
