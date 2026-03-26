import type { Request, Response } from 'express';
import { Recipe } from '../models/Recipe';
import { Category } from '../models/Category';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { isValidObjectId } from '../utils/mongo';
import { coerceOptionalNumber, escapeRegex, parseIngredientsField } from './utils';

export const createRecipe = async (req: Request, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const name = body.name;
  const categoryId = body.category;
  const instructions = body.instructions;

  if (typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  if (typeof categoryId !== 'string' || !isValidObjectId(categoryId)) {
    res.status(400).json({ error: 'category must be a valid id' });
    return;
  }
  if (typeof instructions !== 'string' || !instructions.trim()) {
    res.status(400).json({ error: 'instructions is required' });
    return;
  }

  const categoryExists = await Category.exists({ _id: categoryId });
  if (!categoryExists) {
    res.status(400).json({ error: 'Category does not exist' });
    return;
  }

  const ingredientsResult = parseIngredientsField(body.ingredients, { required: false });
  if (!ingredientsResult.ok) {
    res.status(400).json({ error: ingredientsResult.error });
    return;
  }

  const doc = await Recipe.create({
    name: name.trim(),
    category: categoryId,
    description: typeof body.description === 'string' ? body.description.trim() : undefined,
    ingredients: ingredientsResult.value,
    instructions: instructions.trim(),
    servings: coerceOptionalNumber(body.servings),
    notes: typeof body.notes === 'string' ? body.notes.trim() : undefined,
    createdBy: req.user.id,
  });

  res.status(201).json(doc);
};

export const updateRecipe = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(400).json({ error: 'Invalid recipe id' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const update: Record<string, unknown> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      res.status(400).json({ error: 'name must be a non-empty string' });
      return;
    }
    update.name = body.name.trim();
  }
  if (body.category !== undefined) {
    if (typeof body.category !== 'string' || !isValidObjectId(body.category)) {
      res.status(400).json({ error: 'category must be a valid id' });
      return;
    }
    const categoryExists = await Category.exists({ _id: body.category });
    if (!categoryExists) {
      res.status(400).json({ error: 'Category does not exist' });
      return;
    }
    update.category = body.category;
  }
  if (body.description !== undefined) {
    update.description = typeof body.description === 'string' ? body.description.trim() : '';
  }
  if (body.instructions !== undefined) {
    if (typeof body.instructions !== 'string' || !body.instructions.trim()) {
      res.status(400).json({ error: 'instructions must be a non-empty string' });
      return;
    }
    update.instructions = body.instructions.trim();
  }
  if (body.ingredients !== undefined) {
    const ingredientsResult = parseIngredientsField(body.ingredients, { required: true });
    if (!ingredientsResult.ok) {
      res.status(400).json({ error: ingredientsResult.error });
      return;
    }
    update.ingredients = ingredientsResult.value;
  }
  if (body.servings !== undefined) {
    update.servings = coerceOptionalNumber(body.servings);
  }

  if (body.notes !== undefined) {
    update.notes = typeof body.notes === 'string' ? body.notes.trim() : '';
  }

  if (Object.keys(update).length === 0) {
    res.status(400).json({ error: 'No valid fields to update' });
    return;
  }

  update.updatedAt = new Date();

  const doc = await Recipe.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
  if (!doc) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }
  res.json(doc);
};

export const deleteRecipe = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(400).json({ error: 'Invalid recipe id' });
    return;
  }
  const result = await Recipe.findByIdAndDelete(id);
  if (!result) {
    res.status(404).json({ error: 'Recipe not found' });
    return;
  }
  res.status(204).send();
};

export const getRecipeById = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(400).json({ error: 'Invalid recipe id' });
    return;
  }
  const doc = await Recipe.findById(id).populate('category', 'name').populate('createdBy', 'displayName email');
  if (!doc) {
    res.status(404).json({ error: 'Recipe not found' });
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
      res.status(400).json({ error: 'category filter must be a valid ObjectId' });
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
