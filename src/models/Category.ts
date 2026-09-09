import mongoose, { type Document, type Model, Schema, type Types } from 'mongoose';
import { renameMongoIdsForClient } from '../utils/renameMongoIdsForClient';

/** Stored after Cloudinary upload (needed for delete / replace). */
export interface CategoryImage {
  publicId: string;
  secureUrl: string;
}

export interface ICategory extends Document {
  categoryImage?: CategoryImage;
  createdAt: Date;
  name: string;
}

const categoryImageSchema = new Schema<CategoryImage>(
  {
    publicId: { type: String, required: true },
    secureUrl: { type: String, required: true },
  },
  { _id: false },
);

const categorySchema = new Schema<ICategory>({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  categoryImage: { type: categoryImageSchema, required: false },
});

categorySchema.set('toJSON', {
  transform: (_doc, ret) => renameMongoIdsForClient(ret),
});
categorySchema.set('toObject', {
  transform: (_doc, ret) => renameMongoIdsForClient(ret),
});

export type CategoryId = Types.ObjectId;

export const Category: Model<ICategory> =
  mongoose.models.Category ?? mongoose.model<ICategory>('Category', categorySchema);
