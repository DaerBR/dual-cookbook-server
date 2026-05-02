import type { Request, Response } from 'express';
import { Recipe } from '../models/Recipe';
import { Category } from '../models/Category';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { isValidObjectId } from '../utils/mongo';
import {
  escapeRegex,
  parseRecipeCategories,
  parseRecipeIngredients,
  parseRecipeSteps,
  parseRecipeImageUpload,
} from './utils';
import { destroyImageByPublicId, uploadRecipeImage } from '../services/cloudinaryRecipeImage';
import { jsonError } from '../utils/jsonError';
import { renameMongoIdsForClient } from '../utils/renameMongoIdsForClient';

export const createRecipe = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    jsonError(res, 401, 'Unauthorized');
    return;
  }

  const body = req.body as Record<string, unknown>;
  const name = body.name;
  if (typeof name !== 'string' || !name.trim()) {
    jsonError(res, 400, 'name is required');
    return;
  }

  const categoriesResult = parseRecipeCategories(body.categories);
  if (!categoriesResult.ok) {
    jsonError(res, 400, categoriesResult.error);
    return;
  }
  const categoryIds = categoriesResult.value;
  const foundCount = await Category.countDocuments({ _id: { $in: categoryIds } });
  if (foundCount !== categoryIds.length) {
    jsonError(res, 400, 'One or more categories do not exist');
    return;
  }

  const ingredientsResult = parseRecipeIngredients(body.ingredients);
  if (!ingredientsResult.ok) {
    jsonError(res, 400, ingredientsResult.error);
    return;
  }
  const stepsResult = parseRecipeSteps(body.steps);
  if (!stepsResult.ok) {
    jsonError(res, 400, stepsResult.error);
    return;
  }

  const sourceUrlRaw = body.sourceUrl;
  const sourceUrl =
    typeof sourceUrlRaw === 'string' && sourceUrlRaw.trim() ? sourceUrlRaw.trim() : undefined;

  const doc = await Recipe.create({
    name: name.trim(),
    categories: categoryIds,
    description: typeof body.description === 'string' ? body.description.trim() : undefined,
    ...(ingredientsResult.value !== undefined ? { ingredients: ingredientsResult.value } : {}),
    steps: stepsResult.value,
    createdBy: req.user.id,
    ...(sourceUrl !== undefined ? { sourceUrl } : {}),
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
  if (body.categories !== undefined) {
    const categoriesResult = parseRecipeCategories(body.categories);
    if (!categoriesResult.ok) {
      jsonError(res, 400, categoriesResult.error);
      return;
    }
    const categoryIds = categoriesResult.value;
    const foundCount = await Category.countDocuments({ _id: { $in: categoryIds } });
    if (foundCount !== categoryIds.length) {
      jsonError(res, 400, 'One or more categories do not exist');
      return;
    }
    $set.categories = categoryIds;
  }
  if (body.description !== undefined) {
    $set.description = typeof body.description === 'string' ? body.description.trim() : '';
  }
  if (body.sourceUrl !== undefined) {
    if (body.sourceUrl === null) {
      $unset.sourceUrl = '';
    } else if (typeof body.sourceUrl === 'string') {
      const trimmed = body.sourceUrl.trim();
      if (trimmed === '') {
        $unset.sourceUrl = '';
      } else {
        $set.sourceUrl = trimmed;
      }
    } else {
      jsonError(res, 400, 'sourceUrl must be a string or null');
      return;
    }
  }
  if (body.steps !== undefined) {
    const stepsResult = parseRecipeSteps(body.steps);
    if (!stepsResult.ok) {
      jsonError(res, 400, stepsResult.error);
      return;
    }
    $set.steps = stepsResult.value;
  }
  if (body.ingredients !== undefined) {
    if (body.ingredients === null) {
      $unset.ingredients = '';
    } else {
      const ingredientsResult = parseRecipeIngredients(body.ingredients);
      if (!ingredientsResult.ok) {
        jsonError(res, 400, ingredientsResult.error);
        return;
      }
      if (ingredientsResult.value !== undefined) {
        $set.ingredients = ingredientsResult.value;
      }
    }
  }


  if (body.recipeImage !== undefined && body.recipeImage !== null) {
    if (body.recipeImage === false) {
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
  const doc = await Recipe.findById(id)
    .populate('categories', 'name')
    .populate('createdBy', 'displayName email');
  if (!doc) {
    jsonError(res, 404, 'Recipe not found');
    return;
  }
  res.json(doc);
};

export const listRecipesTable = async (req: Request, res: Response): Promise<void> => {
  const { page, limit, skip } = parsePagination(req.query);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const categoriesQueryRaw = req.query.categories;
  const categoryIdsFromQuery =
    typeof categoriesQueryRaw === 'string' && categoriesQueryRaw.trim()
      ? [...new Set(categoriesQueryRaw.split(',').map((s) => s.trim()).filter(Boolean))]
      : [];

  const orderRaw =
    typeof req.query.order === 'string' ? req.query.order.trim().toLowerCase() : '';
  let updatedAtSort: 1 | -1 = -1;
  if (orderRaw === '' || orderRaw === 'desc') {
    updatedAtSort = -1;
  } else if (orderRaw === 'asc') {
    updatedAtSort = 1;
  } else {
    jsonError(res, 400, 'order must be asc or desc');
    return;
  }

  const recipeAuthorRaw =
    typeof req.query.recipeAuthor === 'string' ? req.query.recipeAuthor.trim() : '';

  const filter: Record<string, unknown> = {};
  if (search) {
    filter.name = { $regex: escapeRegex(search), $options: 'i' };
  }
  if (categoryIdsFromQuery.length > 0) {
    for (const cid of categoryIdsFromQuery) {
      if (!isValidObjectId(cid)) {
        jsonError(res, 400, 'categories query must be comma-separated valid ObjectIds');
        return;
      }
    }
    filter.categories = { $in: categoryIdsFromQuery };
  }
  if (recipeAuthorRaw) {
    if (!isValidObjectId(recipeAuthorRaw)) {
      jsonError(res, 400, 'recipeAuthor must be a valid user id');
      return;
    }
    filter.createdBy = recipeAuthorRaw;
  }

  const [total, rows] = await Promise.all([
    Recipe.countDocuments(filter),
    Recipe.find(filter)
      .select('_id name categories description recipeImage createdAt updatedAt')
      .populate('categories', 'name')
      .sort({ updatedAt: updatedAtSort })
      .skip(skip)
      .limit(limit)
      .lean(),
  ]);

  res.json({
    data: renameMongoIdsForClient(rows),
    pagination: buildPaginationMeta(page, limit, total),
  });
};
