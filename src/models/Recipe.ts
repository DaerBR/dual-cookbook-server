import mongoose, { type Document, type Model, Schema, type Types } from 'mongoose';
import { renameMongoIdsForClient } from '../utils/renameMongoIdsForClient';

/** Stored after Cloudinary upload (needed for delete / replace). */
export interface RecipeImage {
  publicId: string;
  secureUrl: string;
}

/** Embedded ingredient line; `_id` is server-generated and serialized as `id` in JSON. */
export interface RecipeIngredient {
  _id: Types.ObjectId;
  /** Ingredient text; at most 255 characters. */
  text: string;
}

/** Embedded step; `_id` is server-generated and serialized as `id` in JSON. */
export interface RecipeStep {
  _id: Types.ObjectId;
  stepDescription: string;
}

/**
 * Full recipe document stored in MongoDB.
 */
export interface IRecipe extends Document {
  /** At least one category id (see schema validation). */
  categories: Types.ObjectId[];
  createdAt: Date;
  createdBy: Types.ObjectId;
  description?: string;
  /** Ordered ingredients; writes replace the whole array (new subdocument ids each time). */
  ingredients?: RecipeIngredient[];
  name: string;
  recipeImage?: RecipeImage;
  sourceUrl?: string;
  /** Ordered steps; writes replace the whole array (new subdocument ids each time). */
  steps: RecipeStep[];
  updatedAt: Date;
}

/**
 * Short shape returned in paginated recipe lists (table view).
 */
export interface RecipeTableRow {
  categories: Types.ObjectId[];
  createdAt: Date;
  id: string;
  name: string;
  updatedAt: Date;
}

const recipeImageSchema = new Schema<RecipeImage>(
  {
    publicId: { type: String, required: true },
    secureUrl: { type: String, required: true },
  },
  { _id: false },
);

const recipeIngredientSchema = new Schema<Pick<RecipeIngredient, 'text'>>(
  {
    text: { type: String, required: true, trim: true, maxlength: 255 },
  },
  { _id: true },
);

const recipeStepSchema = new Schema<Pick<RecipeStep, 'stepDescription'>>(
  {
    stepDescription: { type: String, required: true, trim: true },
  },
  { _id: true },
);

const recipeSchema = new Schema<IRecipe>({
  name: { type: String, required: true, trim: true },
  categories: {
    type: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    required: true,
    validate: {
      validator(value: unknown[]) {
        return Array.isArray(value) && value.length >= 1;
      },
      message: 'At least one category is required',
    },
  },
  description: { type: String, trim: true },
  ingredients: {
    type: [recipeIngredientSchema],
  },
  steps: {
    type: [recipeStepSchema],
    required: true,
    validate: {
      validator(value: unknown[]) {
        return Array.isArray(value) && value.length >= 1;
      },
      message: 'At least one step is required',
    },
  },
  recipeImage: { type: recipeImageSchema, required: false },
  createdBy: { type: Schema.Types.ObjectId, ref: 'users', required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  sourceUrl: { type: String, required: false, trim: true },
});

recipeSchema.set('toJSON', {
  virtuals: true,
  transform: (_doc, ret) => renameMongoIdsForClient(ret),
});
recipeSchema.set('toObject', {
  virtuals: true,
  transform: (_doc, ret) => renameMongoIdsForClient(ret),
});

recipeSchema.index({ categories: 1, createdAt: -1 });

recipeSchema.pre('save', function setUpdatedAt(this: IRecipe) {
  this.updatedAt = new Date();
});

export const Recipe: Model<IRecipe> = mongoose.models.Recipe ?? mongoose.model<IRecipe>('Recipe', recipeSchema);
