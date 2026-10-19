import { getEnv } from './env';

const DEFAULT_UNTESTED_CATEGORY_ID = '6ad611a894fba67a15dc861e';

/**
 * Id of the special "Not tested yet" category. Recipes in it are hidden from recipe lists
 * unless the `categories` query explicitly includes this id.
 */
export const getUntestedCategoryId = (): string => getEnv().UNTESTED_CATEGORY_ID ?? DEFAULT_UNTESTED_CATEGORY_ID;
