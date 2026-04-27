import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';
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
export interface Recipe extends Document {
  name: string;
  category: Types.ObjectId;
  description?: string;
  /** Ordered ingredients; writes replace the whole array (new subdocument ids each time). */
  ingredients: RecipeIngredient[];
  sourceUrl?: string;
  /** Ordered steps; writes replace the whole array (new subdocument ids each time). */
  steps: RecipeStep[];
  recipeImage?: RecipeImage;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Short shape returned in paginated recipe lists (table view).
 */
export interface RecipeTableRow {
  id: string;
  name: string;
  category: Types.ObjectId;
  createdAt: Date;
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

const recipeSchema = new Schema<Recipe>({
  name: { type: String, required: true, trim: true },
  category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  description: { type: String, trim: true },
  ingredients: {
    type: [recipeIngredientSchema],
    required: true,
    validate: {
      validator(value: unknown[]) {
        return Array.isArray(value) && value.length >= 1;
      },
      message: 'At least one ingredient is required',
    },
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

recipeSchema.index({ category: 1, createdAt: -1 });

recipeSchema.pre('save', function setUpdatedAt(this: Recipe) {
  this.updatedAt = new Date();
});

export const Recipe: Model<Recipe> = mongoose.models.Recipe ?? mongoose.model<Recipe>('Recipe', recipeSchema);
