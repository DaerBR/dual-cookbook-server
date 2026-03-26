import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

/**
 * Full recipe document stored in MongoDB.
 */
export interface IRecipe extends Document {
  name: string;
  category: Types.ObjectId;
  description?: string;
  /** Plain text or HTML (e.g. from a rich text editor on the FE). */
  ingredients: string;
  instructions: string;
  notes?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Short shape returned in paginated recipe lists (table view).
 */
export interface IRecipeTableRow {
  _id: Types.ObjectId;
  name: string;
  category: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const recipeSchema = new Schema<IRecipe>(
  {
    name: { type: String, required: true, trim: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    description: { type: String, trim: true },
    ingredients: { type: String, default: '' },
    instructions: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'users', required: true },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

recipeSchema.index({ category: 1, createdAt: -1 });

recipeSchema.pre('save', function setUpdatedAt(this: IRecipe) {
  this.updatedAt = new Date();
});

export const Recipe: Model<IRecipe> =
  mongoose.models.Recipe ?? mongoose.model<IRecipe>('Recipe', recipeSchema);
