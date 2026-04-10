import type { Request, Response } from 'express';
import { Category } from '../models/Category';
import { Recipe } from '../models/Recipe';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { isValidObjectId } from '../utils/mongo';
import { destroyImageByPublicId, uploadCategoryImage } from '../services/cloudinaryRecipeImage';
import { escapeRegex, isDuplicateKeyError, parseCategoryImageUpload } from './utils';

export const createCategory = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const name = body.name;
  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  let doc;
  try {
    doc = await Category.create({ name: name.trim() });
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) {
      res.status(409).json({ error: 'A category with this name already exists' });
      return;
    }
    throw err;
  }

  if (body.categoryImage !== undefined) {
    const imageParsed = parseCategoryImageUpload(body.categoryImage);
    if (!imageParsed.ok) {
      await Category.findByIdAndDelete(doc._id);
      res.status(400).json({ error: imageParsed.error });
      return;
    }
    try {
      const uploaded = await uploadCategoryImage(String(doc._id), imageParsed.data.dataUri);
      doc.categoryImage = { publicId: uploaded.publicId, secureUrl: uploaded.secureUrl };
      await doc.save();
    } catch (err) {
      console.error(err);
      await Category.findByIdAndDelete(doc._id);
      res.status(502).json({ error: 'Image upload failed' });
      return;
    }
  }

  res.status(201).json(doc);
};

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(400).json({ error: 'Invalid category id' });
    return;
  }

  const existing = await Category.findById(id);
  if (!existing) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = {};
  let previousImagePublicId: string | undefined;
  let orphanNewImagePublicId: string | undefined;

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      res.status(400).json({ error: 'name must be a non-empty string' });
      return;
    }
    update.name = body.name.trim();
  }

  if (body.categoryImage !== undefined) {
    previousImagePublicId = existing.categoryImage?.publicId;
    const imageParsed = parseCategoryImageUpload(body.categoryImage);
    if (!imageParsed.ok) {
      res.status(400).json({ error: imageParsed.error });
      return;
    }
    try {
      const uploaded = await uploadCategoryImage(id, imageParsed.data.dataUri);
      orphanNewImagePublicId = uploaded.publicId;
      update.categoryImage = { publicId: uploaded.publicId, secureUrl: uploaded.secureUrl };
    } catch (err) {
      console.error(err);
      res.status(502).json({ error: 'Image upload failed' });
      return;
    }
  }

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  try {
    const doc = await Category.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
    if (!doc) {
      if (orphanNewImagePublicId) {
        void destroyImageByPublicId(orphanNewImagePublicId);
      }
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    if (previousImagePublicId) {
      void destroyImageByPublicId(previousImagePublicId);
    }
    res.json(doc);
  } catch (err: unknown) {
    if (orphanNewImagePublicId) {
      void destroyImageByPublicId(orphanNewImagePublicId);
    }
    if (isDuplicateKeyError(err)) {
      res.status(409).json({ error: 'A category with this name already exists' });
      return;
    }
    throw err;
  }
};

export const listCategoriesPaginated = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, skip } = parsePagination(req.query);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

  const filter = search
    ? { name: { $regex: escapeRegex(search), $options: 'i' } }
    : {};

  const [total, data] = await Promise.all([
    Category.countDocuments(filter),
    Category.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
  ]);

  res.json({
    data,
    pagination: buildPaginationMeta(page, limit, total),
  });
};

export const listAllCategories = async (_req: Request, res: Response): Promise<void> => {
  const data = await Category.find().sort({ name: 1 }).lean();
  res.json(data);
};

export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(400).json({ error: 'Invalid category id' });
    return;
  }

  const inUse = await Recipe.countDocuments({ category: id });
  if (inUse > 0) {
    res.status(409).json({
      error: 'This category is used by one or more recipes and cannot be deleted',
      recipeCount: inUse,
    });
    return;
  }

  const existing = await Category.findById(id).lean();
  if (!existing) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }

  await Category.findByIdAndDelete(id);
  const imagePublicId = existing.categoryImage?.publicId;
  if (imagePublicId) {
    void destroyImageByPublicId(imagePublicId);
  }
  res.status(204).send();
};
