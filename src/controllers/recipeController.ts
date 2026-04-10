import type { Request, Response } from 'express';
import { Recipe } from '../models/Recipe';
import { Category } from '../models/Category';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { isValidObjectId } from '../utils/mongo';
import { escapeRegex, parseIngredientsField, parseRecipeImageUpload } from './utils';
import { destroyImageByPublicId, uploadRecipeImage } from '../services/cloudinaryRecipeImage';
import { jsonError } from '../utils/jsonError';

export const createRecipe = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    jsonError(res, 401, 'Unauthorized');
    return;
  }

  const body = req.body as Record<string, unknown>;
  const name = body.name;
  const categoryId = body.category;
  const instructions = body.instructions;

  if (typeof name !== 'string' || !name.trim()) {
    jsonError(res, 400, 'name is required');
    return;
  }
  if (typeof categoryId !== 'string' || !isValidObjectId(categoryId)) {
    jsonError(res, 400, 'category must be a valid id');
    return;
  }
  if (typeof instructions !== 'string' || !instructions.trim()) {
    jsonError(res, 400, 'instructions is required');
    return;
  }

  const categoryExists = await Category.exists({ _id: categoryId });
  if (!categoryExists) {
    jsonError(res, 400, 'Category does not exist');
    return;
  }

  const ingredientsResult = parseIngredientsField(body.ingredients, { required: false });
  if (!ingredientsResult.ok) {
    jsonError(res, 400, ingredientsResult.error);
    return;
  }

  const doc = await Recipe.create({
    name: name.trim(),
    category: categoryId,
    description: typeof body.description === 'string' ? body.description.trim() : undefined,
    ingredients: ingredientsResult.value,
    instructions: instructions.trim(),
    notes: typeof body.notes === 'string' ? body.notes.trim() : undefined,
    createdBy: req.user.id,
  });

  const rawRecipeImage = body.recipeImage;
  if (rawRecipeImage !== undefined && rawRecipeImage !== null) {
    const imageParsed = parseRecipeImageUpload(rawRecipeImage);
    if (!imageParsed.ok) {
      await Recipe.findByIdAndDelete(doc._id);
      jsonError(res, 400, imageParsed.error);
      return;
    }
    try {
      const uploaded = await uploadRecipeImage(String(doc._id), imageParsed.data.dataUri);
      doc.recipeImage = { publicId: uploaded.publicId, secureUrl: uploaded.secureUrl };
      await doc.save();
    } catch (err) {
      console.error(err);
      await Recipe.findByIdAndDelete(doc._id);
      jsonError(res, 502, 'Image upload failed');
      return;
    }
  }

  res.status(201).json(doc);
};

export const updateRecipe = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    jsonError(res, 400, 'Invalid recipe id');
    return;
  }

  const existing = await Recipe.findById(id);
  if (!existing) {
    jsonError(res, 404, 'Recipe not found');
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
  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || !isValidObjectId(body.category)) {
      jsonError(res, 400, 'category must be a valid id');
      return;
    }
    const categoryExists = await Category.exists({ _id: body.category });
    if (!categoryExists) {
      jsonError(res, 400, 'Category does not exist');
      return;
    }
    $set.category = body.category;
  }
  if (body.description !== undefined) {
    $set.description = typeof body.description === 'string' ? body.description.trim() : '';
  }
  if (body.instructions !== undefined) {
    if (typeof body.instructions !== 'string' || !body.instructions.trim()) {
      jsonError(res, 400, 'instructions must be a non-empty string');
      return;
    }
    $set.instructions = body.instructions.trim();
  }
  if (body.ingredients !== undefined) {
    const ingredientsResult = parseIngredientsField(body.ingredients, { required: true });
    if (!ingredientsResult.ok) {
      jsonError(res, 400, ingredientsResult.error);
      return;
    }
    $set.ingredients = ingredientsResult.value;
  }
  if (body.notes !== undefined) {
    $set.notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  }

  if (body.recipeImage !== undefined) {
    if (body.recipeImage === null) {
      if (existing.recipeImage?.publicId) {
        previousImagePublicId = existing.recipeImage.publicId;
      }
      $unset.recipeImage = '';
    } else {
      previousImagePublicId = existing.recipeImage?.publicId;
      const imageParsed = parseRecipeImageUpload(body.recipeImage);
      if (!imageParsed.ok) {
        jsonError(res, 400, imageParsed.error);
        return;
      }
      try {
        const uploaded = await uploadRecipeImage(id, imageParsed.data.dataUri);
        orphanNewImagePublicId = uploaded.publicId;
        $set.recipeImage = { publicId: uploaded.publicId, secureUrl: uploaded.secureUrl };
      } catch (err) {
        console.error(err);
        jsonError(res, 502, 'Image upload failed');
        return;
      }
    }
  }

  if (Object.keys($set).length === 0 && Object.keys($unset).length === 0) {
    jsonError(res, 400, 'No valid fields to update');
    return;
  }

  $set.updatedAt = new Date();

  const mongoUpdate: Record<string, unknown> = { $set: $set };
  if (Object.keys($unset).length > 0) {
    mongoUpdate.$unset = $unset;
  }

  const doc = await Recipe.findByIdAndUpdate(id, mongoUpdate, { new: true, runValidators: true });
  if (!doc) {
    if (orphanNewImagePublicId) {
      void destroyImageByPublicId(orphanNewImagePublicId);
    }
    jsonError(res, 404, 'Recipe not found');
    return;
  }

  if (previousImagePublicId) {
    void destroyImageByPublicId(previousImagePublicId);
  }

  res.json(doc);
};

export const deleteRecipe = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    jsonError(res, 400, 'Invalid recipe id');
    return;
  }
  const existing = await Recipe.findById(id).lean();
  if (!existing) {
    jsonError(res, 404, 'Recipe not found');
    return;
  }
  await Recipe.findByIdAndDelete(id);
  const imagePublicId = existing.recipeImage?.publicId;
  if (imagePublicId) {
    void destroyImageByPublicId(imagePublicId);
  }
  res.status(204).send();
};

export const getRecipeById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    jsonError(res, 400, 'Invalid recipe id');
    return;
  }
  const doc = await Recipe.findById(id).populate('category', 'name').populate('createdBy', 'displayName email');
  if (!doc) {
    jsonError(res, 404, 'Recipe not found');
    return;
  }
  res.json(doc);
};

export const listRecipesTable = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, skip } = parsePagination(req.query);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const categoryFilter = typeof req.query.category === 'string' ? req.query.category.trim() : '';

  const filter: Record<string, unknown> = {};
  if (search) {
    filter.name = { $regex: escapeRegex(search), $options: 'i' };
  }
  if (categoryFilter) {
    if (!isValidObjectId(categoryFilter)) {
      jsonError(res, 400, 'category filter must be a valid ObjectId');
      return;
    }
    filter.category = categoryFilter;
  }

  const [total, rows] = await Promise.all([
    Recipe.countDocuments(filter),
    Recipe.find(filter)
      .select('_id name category createdAt updatedAt')
      .populate('category', 'name')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  res.json({
    data: rows,
    pagination: buildPaginationMeta(page, limit, total),
  });
};
