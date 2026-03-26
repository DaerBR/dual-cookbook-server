import { Router } from 'express';
import {
  createRecipe,
  updateRecipe,
  deleteRecipe,
  getRecipeById,
  listRecipesTable,
} from '../controllers/recipeController';
import { asyncHandler } from '../utils/asyncHandler';

export const recipeRouter = Router();

recipeRouter.get('/', asyncHandler(listRecipesTable));
recipeRouter.post('/', asyncHandler(createRecipe));
recipeRouter.get('/:id', asyncHandler(getRecipeById));
recipeRouter.put('/:id', asyncHandler(updateRecipe));
recipeRouter.delete('/:id', asyncHandler(deleteRecipe));
