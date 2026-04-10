import mongoose, { Schema, type Document, type Model, type Types } from 'mongoose';

/** Stored after Cloudinary upload (needed for delete / replace). */
export interface CategoryImage {
  publicId: string;
  secureUrl: string;
}


export interface Category extends Document {
  name: string;
  createdAt: Date;
  categoryImage?: CategoryImage,
}

const categoryImageSchema = new Schema<CategoryImage>(
    {
      publicId: { type: String, required: true },
      secureUrl: { type: String, required: true },
    },
    { _id: false },
);

const categorySchema = new Schema<Category>({
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

export type CategoryId = Types.ObjectId;

export const Category: Model<Category> =
  mongoose.models.Category ?? mongoose.model<Category>('Category', categorySchema);
