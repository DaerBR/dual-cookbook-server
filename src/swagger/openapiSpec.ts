import { getPublicBaseUrl } from '../config/env';

/**
 * OpenAPI 3 document for Swagger UI. Built with `swagger-jsdoc` in `setupSwagger.ts`.
 */
export const getOpenApiDefinition = (): Record<string, unknown> => {
  return {
    openapi: '3.0.3',
    info: {
      title: 'Dual Cookbook API',
      version: '1.0.0',
      description: [
        'Family cookbook API: Google OAuth, then session cookie `session` for `/api/*` routes.',
        '',
        '**SPA (cross-origin):** Set server `CORS_ORIGIN` to your frontend origin (exact URL, e.g. `http://localhost:5174`). The browser must send cookies: `axios` → `withCredentials: true`, `fetch` → `credentials: "include"`. In production the session cookie uses `SameSite=None; Secure`.',
        '',
        '**OAuth callback:** On success, returns **HTML** (not JSON) that runs in a popup and `postMessage`s `{ type: "GOOGLE_AUTH_SUCCESS", payload }` to `window.opener` (target = first `CORS_ORIGIN` or `*`).',
        '',
        '**Swagger “Try it out”:** Cookie auth only works when the UI is on the **same site** as the API or you paste a `Cookie` header; cross-origin logins from here are limited.',
      ].join('\n'),
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
          summary: 'Google OAuth callback (Google redirects here with ?code=&state=)',
          description:
            'Passport validates the code, establishes the session cookie, then returns **200** `text/html`: a short script that `postMessage`s the user to `opener` and closes the popup. On auth failure, **302** to `/auth/google/failure`.',
          parameters: [
            {
              name: 'code',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'Authorization code (set by Google)',
            },
            {
              name: 'state',
              in: 'query',
              required: false,
              schema: { type: 'string' },
              description: 'OAuth state (set by Passport)',
            },
          ],
          responses: {
            '200': {
              description: 'HTML page: postMessage to opener + window.close()',
              content: {
                'text/html': {
                  schema: { type: 'string' },
                },
              },
            },
            '302': {
              description: 'Redirect to `/auth/google/failure` when Google login fails or user is not allowlisted',
            },
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
          description:
            'Returns JSON `null` if the session cookie is missing or invalid (e.g. cross-origin request without `credentials`). Response includes `Cache-Control: private, no-store`.',
          responses: {
            '200': {
              description: 'User object or JSON `null` when unauthenticated',
              headers: {
                'Cache-Control': {
                  description: 'Always `private, no-store`',
                  schema: { type: 'string', example: 'private, no-store' },
                },
              },
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
            '200': {
              description: 'Session cleared',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { ok: { type: 'boolean', example: true } },
                    required: ['ok'],
                  },
                },
              },
            },
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
            '502': {
              description: 'Cloudinary image upload failed (when `recipeImage` was sent)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorMessage' },
                },
              },
            },
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
            '502': {
              description: 'Cloudinary image upload failed (when `recipeImage` was sent)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorMessage' },
                },
              },
            },
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
            '502': {
              description: 'Cloudinary image upload failed (when `categoryImage` was sent)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorMessage' },
                },
              },
            },
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
                schema: { $ref: '#/components/schemas/CategoryUpdate' },
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
            '502': {
              description: 'Cloudinary image upload failed (when `categoryImage` was sent)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorMessage' },
                },
              },
            },
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
            '409': {
              description: 'Category is still referenced by one or more recipes',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/CategoryInUseError' },
                },
              },
            },
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
          description:
            'Signed session cookie set after successful `/auth/google/callback`. Send it on cross-origin API calls only with browser **credentials** and a matching **CORS** allowlist (`CORS_ORIGIN`). Cookie name is `session`.',
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
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['message'],
              properties: {
                message: { type: 'string' },
              },
            },
          },
        },
        CategoryInUseError: {
          type: 'object',
          required: ['error', 'recipeCount'],
          properties: {
            error: {
              type: 'object',
              required: ['message'],
              properties: {
                message: { type: 'string' },
              },
            },
            recipeCount: { type: 'integer', minimum: 1 },
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
          description: 'Shape returned by `GET /api/current_user` when authenticated (not the OAuth popup payload).',
          properties: {
            id: { type: 'string' },
            displayName: { type: 'string' },
            email: { type: 'string', format: 'email' },
          },
        },
        OAuthPopupUserPayload: {
          type: 'object',
          description:
            'Payload inside `postMessage` from the OAuth callback popup (`GOOGLE_AUTH_SUCCESS`). Includes `createdAt` for convenience on the client.',
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
            id: { type: 'string', description: 'MongoDB document id (hex string)' },
            name: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            categoryImage: {
              description: 'Absent or null when no image is stored.',
              nullable: true,
              allOf: [{ $ref: '#/components/schemas/RecipeImage' }],
            },
          },
        },
        CategoryCreate: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string' },
            categoryImage: {
              description: 'Optional. Omit or null to create without an image.',
              nullable: true,
              allOf: [{ $ref: '#/components/schemas/RecipeImageUpload' }],
            },
          },
        },
        CategoryUpdate: {
          type: 'object',
          description:
            'Partial update; include at least one of `name` or `categoryImage`. Send `categoryImage: null` to remove the stored image (Cloudinary asset is deleted).',
          properties: {
            name: { type: 'string' },
            categoryImage: {
              description: 'Null clears the image; otherwise same upload payload as on create.',
              nullable: true,
              allOf: [{ $ref: '#/components/schemas/RecipeImageUpload' }],
            },
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
        RecipeImage: {
          type: 'object',
          description: 'Cloudinary asset returned as `recipeImage` (recipes) or `categoryImage` (categories).',
          required: ['publicId', 'secureUrl'],
          properties: {
            publicId: { type: 'string', description: 'Cloudinary public_id (for replace/delete)' },
            secureUrl: { type: 'string', format: 'uri', description: 'HTTPS delivery URL' },
          },
        },
        RecipeImageUpload: {
          type: 'object',
          description:
            'Upload payload (`nameWithExtension`, `base64Content`). Used for optional `recipeImage` on recipe create/update and optional `categoryImage` on category create/update. On replace, the previous Cloudinary asset is removed.',
          required: ['nameWithExtension', 'base64Content'],
          properties: {
            nameWithExtension: { type: 'string', example: 'photo.jpg' },
            base64Content: {
              type: 'string',
              description: 'Raw base64 (no data: URL prefix) or full data URI',
            },
          },
        },
        RecipeIngredientInput: {
          type: 'object',
          required: ['text'],
          description:
            'Create/update payload: only `text` (max 255 chars). The server assigns a new subdocument `id` on each save; send the full list on update to replace ingredients.',
          properties: {
            text: { type: 'string', maxLength: 255 },
          },
        },
        RecipeIngredient: {
          type: 'object',
          required: ['id', 'text'],
          description: 'Embedded ingredient as returned by the API (`_id` renamed to `id`).',
          properties: {
            id: { type: 'string', description: 'Subdocument ObjectId (hex)' },
            text: { type: 'string', maxLength: 255 },
          },
        },
        RecipeStepInput: {
          type: 'object',
          required: ['stepDescription'],
          description:
            'Create/update payload: only `stepDescription`. The server assigns a new subdocument `id` on each save; send the full list on update to replace steps.',
          properties: {
            stepDescription: { type: 'string' },
          },
        },
        RecipeStep: {
          type: 'object',
          required: ['id', 'stepDescription'],
          description: 'Embedded step as returned by the API (`_id` renamed to `id`).',
          properties: {
            id: { type: 'string', description: 'Subdocument ObjectId (hex)' },
            stepDescription: { type: 'string' },
          },
        },
        Recipe: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'MongoDB document id (hex string)' },
            name: { type: 'string' },
            category: {
              description: 'Category id string, or populated `{ id, name }`',
              oneOf: [
                { type: 'string' },
                {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                  },
                },
              ],
            },
            description: { type: 'string' },
            ingredients: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/components/schemas/RecipeIngredient' },
              description: 'Ordered ingredients; each item has `id` and `text` in API JSON.',
            },
            steps: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/components/schemas/RecipeStep' },
              description: 'Ordered steps; each item has `id` and `stepDescription` in API JSON.',
            },
            recipeImage: {
              description: 'Absent or null when no image is stored.',
              nullable: true,
              allOf: [{ $ref: '#/components/schemas/RecipeImage' }],
            },
            createdBy: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        RecipeTableRow: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            recipeImage: {
              description: 'Absent or null when no image is stored.',
              nullable: true,
              allOf: [{ $ref: '#/components/schemas/RecipeImage' }],
            },
            category: {
              type: 'object',
              properties: {
                id: { type: 'string' },
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
          required: ['name', 'category', 'ingredients', 'steps'],
          properties: {
            name: { type: 'string' },
            category: { type: 'string', description: 'Category ObjectId' },
            description: { type: 'string' },
            ingredients: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/components/schemas/RecipeIngredientInput' },
            },
            steps: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/components/schemas/RecipeStepInput' },
            },
            recipeImage: {
              description: 'Optional. Omit or null to create without an image.',
              nullable: true,
              allOf: [{ $ref: '#/components/schemas/RecipeImageUpload' }],
            },
          },
        },
        RecipeUpdate: {
          type: 'object',
          description:
            'Partial update; include only fields to change. Send `recipeImage: null` to remove the stored image (Cloudinary asset is deleted).',
          properties: {
            name: { type: 'string' },
            category: { type: 'string' },
            description: { type: 'string' },
            ingredients: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/components/schemas/RecipeIngredientInput' },
            },
            steps: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/components/schemas/RecipeStepInput' },
            },
            recipeImage: {
              description: 'Null clears the image; otherwise same upload payload as on create.',
              nullable: true,
              allOf: [{ $ref: '#/components/schemas/RecipeImageUpload' }],
            },
          },
        },
      },
    },
  };
};
