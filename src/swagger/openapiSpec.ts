import { getPublicBaseUrl } from '../config/env';

/**
 * OpenAPI 3 document for Swagger UI. Built with `swagger-jsdoc` in `setupSwagger.ts`.
 */
export function getOpenApiDefinition(): Record<string, unknown> {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Dual Cookbook API',
      version: '1.0.0',
      description:
        'Family cookbook API. Authenticate via Google OAuth (`/auth/google`), then call protected routes with the session cookie.',
    },
    servers: [{ url: getPublicBaseUrl() }],
    tags: [
      { name: 'Auth' },
      { name: 'Recipes' },
      { name: 'Categories' },
      { name: 'Health' },
    ],
    paths: {
      '/health': {
        get: {
          tags: ['Health'],
          summary: 'Health check',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { status: { type: 'string', example: 'ok' } },
                  },
                },
              },
            },
          },
        },
      },
      '/auth/google': {
        get: {
          tags: ['Auth'],
          summary: 'Start Google OAuth',
          responses: {
            '302': { description: 'Redirect to Google' },
          },
        },
      },
      '/auth/google/callback': {
        get: {
          tags: ['Auth'],
          summary: 'Google OAuth callback',
          responses: {
            '302': { description: 'Redirect to app root on success' },
          },
        },
      },
      '/auth/google/failure': {
        get: {
          tags: ['Auth'],
          summary: 'OAuth failure (e.g. email not whitelisted)',
          responses: {
            '403': {
              description: 'Forbidden',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorMessage' },
                },
              },
            },
          },
        },
      },
      '/api/current_user': {
        get: {
          tags: ['Auth'],
          summary: 'Current session user',
          responses: {
            '200': {
              description: 'User or null if not logged in',
              content: {
                'application/json': {
                  schema: {
                    oneOf: [{ $ref: '#/components/schemas/UserPublic' }, { type: 'null' }],
                  },
                },
              },
            },
          },
        },
      },
      '/api/logout': {
        get: {
          tags: ['Auth'],
          summary: 'Log out (clears session)',
          responses: {
            '302': { description: 'Redirect to app root' },
          },
        },
      },
      '/api/recipes': {
        get: {
          tags: ['Recipes'],
          summary: 'List recipes (table rows, paginated)',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
            {
              name: 'category',
              in: 'query',
              description: 'Filter by category ObjectId',
              schema: { type: 'string' },
            },
            {
              name: 'search',
              in: 'query',
              description: 'Case-insensitive partial match on recipe name',
              schema: { type: 'string' },
            },
          ],
          security: [{ cookieAuth: [] }],
          responses: {
            '200': {
              description: 'Paginated recipe table rows',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/RecipeTablePage' },
                },
              },
            },
            '401': { description: 'Not authenticated' },
          },
        },
        post: {
          tags: ['Recipes'],
          summary: 'Create recipe',
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RecipeCreate' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Recipe' },
                },
              },
            },
            '400': { description: 'Validation error' },
            '401': { description: 'Not authenticated' },
          },
        },
      },
      '/api/recipes/{id}': {
        get: {
          tags: ['Recipes'],
          summary: 'Get recipe by id',
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/IdPath' }],
          responses: {
            '200': {
              description: 'Recipe',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Recipe' },
                },
              },
            },
            '400': { description: 'Invalid id' },
            '401': { description: 'Not authenticated' },
            '404': { description: 'Not found' },
          },
        },
        put: {
          tags: ['Recipes'],
          summary: 'Update recipe',
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/IdPath' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/RecipeUpdate' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Recipe' },
                },
              },
            },
            '400': { description: 'Validation error' },
            '401': { description: 'Not authenticated' },
            '404': { description: 'Not found' },
          },
        },
        delete: {
          tags: ['Recipes'],
          summary: 'Delete recipe',
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/IdPath' }],
          responses: {
            '204': { description: 'Deleted' },
            '400': { description: 'Invalid id' },
            '401': { description: 'Not authenticated' },
            '404': { description: 'Not found' },
          },
        },
      },
      '/api/categories': {
        get: {
          tags: ['Categories'],
          summary: 'List categories (paginated)',
          parameters: [
            { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
            {
              name: 'search',
              in: 'query',
              description: 'Case-insensitive partial match on category name',
              schema: { type: 'string' },
            },
          ],
          security: [{ cookieAuth: [] }],
          responses: {
            '200': {
              description: 'Paginated categories',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CategoryPage' },
                },
              },
            },
            '401': { description: 'Not authenticated' },
          },
        },
        post: {
          tags: ['Categories'],
          summary: 'Create category',
          security: [{ cookieAuth: [] }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CategoryCreate' },
              },
            },
          },
          responses: {
            '201': {
              description: 'Created',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Category' },
                },
              },
            },
            '400': { description: 'Validation error' },
            '401': { description: 'Not authenticated' },
            '409': { description: 'Duplicate name' },
          },
        },
      },
      '/api/categories/all': {
        get: {
          tags: ['Categories'],
          summary: 'List all categories (no pagination)',
          security: [{ cookieAuth: [] }],
          responses: {
            '200': {
              description: 'All categories',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/Category' },
                  },
                },
              },
            },
            '401': { description: 'Not authenticated' },
          },
        },
      },
      '/api/categories/{id}': {
        put: {
          tags: ['Categories'],
          summary: 'Update category',
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/IdPath' }],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/CategoryCreate' },
              },
            },
          },
          responses: {
            '200': {
              description: 'Updated',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/Category' },
                },
              },
            },
            '400': { description: 'Validation error' },
            '401': { description: 'Not authenticated' },
            '404': { description: 'Not found' },
            '409': { description: 'Duplicate name' },
          },
        },
        delete: {
          tags: ['Categories'],
          summary: 'Delete category (only if unused by recipes)',
          security: [{ cookieAuth: [] }],
          parameters: [{ $ref: '#/components/parameters/IdPath' }],
          responses: {
            '204': { description: 'Deleted' },
            '400': { description: 'Invalid id' },
            '401': { description: 'Not authenticated' },
            '404': { description: 'Not found' },
            '409': { description: 'Category still referenced by recipes' },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'session',
          description: 'Session cookie set after Google OAuth login.',
        },
      },
      parameters: {
        IdPath: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      },
      schemas: {
        ErrorMessage: {
          type: 'object',
          properties: {
            error: { type: 'string' },
          },
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            limit: { type: 'integer' },
            total: { type: 'integer' },
            totalPages: { type: 'integer' },
          },
        },
        UserPublic: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            displayName: { type: 'string' },
            email: { type: 'string', format: 'email' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Category: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        CategoryCreate: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
          },
        },
        CategoryPage: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/Category' },
            },
            pagination: { $ref: '#/components/schemas/Pagination' },
          },
        },
        IngredientLine: {
          type: 'object',
          properties: {
            item: { type: 'string' },
            quantity: { type: 'string' },
          },
        },
        Recipe: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            category: { type: 'string', description: 'Category ObjectId or populated object' },
            description: { type: 'string' },
            ingredients: {
              type: 'array',
              items: { $ref: '#/components/schemas/IngredientLine' },
            },
            instructions: { type: 'string' },
            prepTimeMinutes: { type: 'integer' },
            cookTimeMinutes: { type: 'integer' },
            servings: { type: 'integer' },
            notes: { type: 'string' },
            createdBy: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        RecipeTableRow: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string' },
            category: {
              type: 'object',
              properties: {
                _id: { type: 'string' },
                name: { type: 'string' },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        RecipeTablePage: {
          type: 'object',
          properties: {
            data: {
              type: 'array',
              items: { $ref: '#/components/schemas/RecipeTableRow' },
            },
            pagination: { $ref: '#/components/schemas/Pagination' },
          },
        },
        RecipeCreate: {
          type: 'object',
          required: ['name', 'category', 'instructions'],
          properties: {
            name: { type: 'string' },
            category: { type: 'string', description: 'Category ObjectId' },
            description: { type: 'string' },
            ingredients: {
              type: 'array',
              items: { $ref: '#/components/schemas/IngredientLine' },
            },
            instructions: { type: 'string' },
            prepTimeMinutes: { type: 'integer' },
            cookTimeMinutes: { type: 'integer' },
            servings: { type: 'integer' },
            notes: { type: 'string' },
          },
        },
        RecipeUpdate: {
          type: 'object',
          description: 'Partial update; include only fields to change.',
          properties: {
            name: { type: 'string' },
            category: { type: 'string' },
            description: { type: 'string' },
            ingredients: {
              type: 'array',
              items: { $ref: '#/components/schemas/IngredientLine' },
            },
            instructions: { type: 'string' },
            prepTimeMinutes: { type: 'integer' },
            cookTimeMinutes: { type: 'integer' },
            servings: { type: 'integer' },
            notes: { type: 'string' },
          },
        },
      },
    },
  };
}
