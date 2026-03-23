import type { Request, Response } from 'express';
import { Category } from '../models/Category';
import { Recipe } from '../models/Recipe';
import { parsePagination, buildPaginationMeta } from '../utils/pagination';
import { isValidObjectId } from '../utils/mongo';

export async function createCategory(req: Request, res: Response): Promise<void> {
  const { name } = req.body as { name?: string };
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  try {
    const doc = await Category.create({ name: name.trim() });
    res.status(201).json(doc);
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) {
      res.status(409).json({ error: 'A category with this name already exists' });
      return;
    }
    throw err;
  }
}

export async function updateCategory(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  if (!isValidObjectId(id)) {
    res.status(400).json({ error: 'Invalid category id' });
    return;
  }
  const { name } = req.body as { name?: string };
  if (!name || typeof name !== 'string' || !name.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  try {
    const doc = await Category.findByIdAndUpdate(
      id,
      { $set: { name: name.trim() } },
      { new: true, runValidators: true },
    );
    if (!doc) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    res.json(doc);
  } catch (err: unknown) {
    if (isDuplicateKeyError(err)) {
      res.status(409).json({ error: 'A category with this name already exists' });
      return;
    }
    throw err;
  }
}

export async function listCategoriesPaginated(req: Request, res: Response): Promise<void> {
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
}

export async function listAllCategories(_req: Request, res: Response): Promise<void> {
  const data = await Category.find().sort({ name: 1 }).lean();
  res.json(data);
}

export async function deleteCategory(req: Request, res: Response): Promise<void> {
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

  const result = await Category.findByIdAndDelete(id);
  if (!result) {
    res.status(404).json({ error: 'Category not found' });
    return;
  }
  res.status(204).send();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000;
}
