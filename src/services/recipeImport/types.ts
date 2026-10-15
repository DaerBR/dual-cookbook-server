export interface ExternalRecipeDraft {
  description?: string;
  imageUrl?: string;
  ingredients?: string[];
  recipeTitle?: string;
  sourceUrl: string;
  steps?: string[];
}

export interface ExternalRecipeParser {
  name: string;
  canHandle(url: URL): boolean;
  parse(url: URL): Promise<ExternalRecipeDraft>;
}
