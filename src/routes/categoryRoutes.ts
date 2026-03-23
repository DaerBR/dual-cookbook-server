import { Router } from 'express';
import {
  createCategory,
  updateCategory,
  listCategoriesPaginated,
  listAllCategories,
  deleteCategory,
} from '../controllers/categoryController';
import { asyncHandler } from '../utils/asyncHandler';

export const categoryRouter = Router();

categoryRouter.post('/', asyncHandler(createCategory));
categoryRouter.get('/all', asyncHandler(listAllCategories));
categoryRouter.get('/', asyncHandler(listCategoriesPaginated));
categoryRouter.put('/:id', asyncHandler(updateCategory));
categoryRouter.delete('/:id', asyncHandler(deleteCategory));
