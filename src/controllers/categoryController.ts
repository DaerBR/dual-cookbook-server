import type { Request, Response } from 'express';
import { Category } from '../models/Category';
import { Recipe } from '../models/Recipe';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { isValidObjectId } from '../utils/mongo';
import { destroyImageByPublicId, uploadCategoryImage } from '../services/cloudinaryRecipeImage';
import { escapeRegex, isDuplicateKeyError, parseCategoryImageUpload } from './utils';
import { jsonError } from '../utils/jsonError';
import { renameMongoIdsForClient } from '../utils/renameMongoIdsForClient';

export const createCategory = async (req: Request, res: Response): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const name = body.name;
  if (typeof name !== 'string' || !name.trim()) {
    jsonError(res, 400, 'name is required');
    return;
  }

  let doc;
  try {
    doc = await Category.create({ name: name.trim() });
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) {
      jsonError(res, 409, 'A category with this name already exists');
      return;
    }
    throw err;
  }

  const rawImage = body.categoryImage;
  if (rawImage !== undefined && rawImage !== null) {
    const imageParsed = parseCategoryImageUpload(rawImage);
    if (!imageParsed.ok) {
      await Category.findByIdAndDelete(doc._id);
      jsonError(res, 400, imageParsed.error);
      return;
    }
    try {
      const uploaded = await uploadCategoryImage(String(doc._id), imageParsed.data.dataUri);
      doc.categoryImage = { publicId: uploaded.publicId, secureUrl: uploaded.secureUrl };
      await doc.save();
    } catch (err) {
      console.error(err);
      await Category.findByIdAndDelete(doc._id);
      jsonError(res, 502, 'Image upload failed');
      return;
    }
  }

  res.status(201).json(doc);
};

export const updateCategory = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    jsonError(res, 400, 'Invalid category id');
    return;
  }

  const existing = await Category.findById(id);
  if (!existing) {
    jsonError(res, 404, 'Category not found');
    return;
  }

  const body = req.body as Record<string, unknown>;
  const $set: Record<string, unknown> = {};
  const $unset: Record<string, ''> = {};
  let previousImagePublicId: string | undefined;
  let orphanNewImagePublicId: string | undefined;

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      jsonError(res, 400, 'name must be a non-empty string');
      return;
    }
    $set.name = body.name.trim();
  }

  if (body.categoryImage !== undefined) {
    if (body.categoryImage === null) {
      if (existing.categoryImage?.publicId) {
        previousImagePublicId = existing.categoryImage.publicId;
      }
      $unset.categoryImage = '';
    } else {
      previousImagePublicId = existing.categoryImage?.publicId;
      const imageParsed = parseCategoryImageUpload(body.categoryImage);
      if (!imageParsed.ok) {
        jsonError(res, 400, imageParsed.error);
        return;
      }
      try {
        const uploaded = await uploadCategoryImage(id, imageParsed.data.dataUri);
        orphanNewImagePublicId = uploaded.publicId;
        $set.categoryImage = { publicId: uploaded.publicId, secureUrl: uploaded.secureUrl };
      } catch (err) {
        console.error(err);
        jsonError(res, 502, 'Image upload failed');
        return;
      }
    }
  }

  const mongoUpdate: Record<string, unknown> = {};
  if (Object.keys($set).length > 0) {
    mongoUpdate.$set = $set;
  }
  if (Object.keys($unset).length > 0) {
    mongoUpdate.$unset = $unset;
  }
  if (Object.keys(mongoUpdate).length === 0) {
    jsonError(res, 400, 'No valid fields to update');
    return;
  }

  try {
    const doc = await Category.findByIdAndUpdate(id, mongoUpdate, { new: true, runValidators: true });
    if (!doc) {
      if (orphanNewImagePublicId) {
        void destroyImageByPublicId(orphanNewImagePublicId);
      }
      jsonError(res, 404, 'Category not found');
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
      jsonError(res, 409, 'A category with this name already exists');
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
    data: renameMongoIdsForClient(data),
    pagination: buildPaginationMeta(page, limit, total),
  });
};

export const listAllCategories = async (_req: Request, res: Response): Promise<void> => {
  const data = await Category.find().sort({ name: 1 }).lean();
  res.json(renameMongoIdsForClient(data));
};

export const deleteCategory = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    jsonError(res, 400, 'Invalid category id');
    return;
  }

  const inUse = await Recipe.countDocuments({ category: id });
  if (inUse > 0) {
    jsonError(res, 409, 'This category is used by one or more recipes and cannot be deleted', {
      recipeCount: inUse,
    });
    return;
  }

  const existing = await Category.findById(id).lean();
  if (!existing) {
    jsonError(res, 404, 'Category not found');
    return;
  }

  await Category.findByIdAndDelete(id);
  const imagePublicId = existing.categoryImage?.publicId;
  if (imagePublicId) {
    void destroyImageByPublicId(imagePublicId);
  }
  res.status(204).send();
};
