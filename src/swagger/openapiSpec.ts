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
        '**SPA (cross-origin):** Set server `CORS_ORIGIN` to one or more comma-separated exact origins (e.g. `http://localhost:5174,https://app.example.com`). The browser must send cookies: `axios` → `withCredentials: true`, `fetch` → `credentials: "include"`. In production the session cookie uses `SameSite=None; Secure`.',
        '',
        '**OAuth popup:** For `postMessage` to reach the opener, the callback must use that tab\'s exact origin. Prefer `/auth/google?return_origin=<origin>` (must be in `CORS_ORIGIN`). If omitted, the server may infer the origin from the `Referer` when it matches the allowlist; otherwise the first `CORS_ORIGIN` entry is used (so avoid listing localhost first if the hosted app does not pass `return_origin`). If `CORS_ORIGIN` is unset, `*` is used.',
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
          description:
            'Exact frontend origin (must appear in `CORS_ORIGIN`), passed through OAuth `state` so `postMessage` targets the opener. Recommended when multiple origins are allowlisted. If omitted, `Referer` may be used when it matches the allowlist; otherwise the first `CORS_ORIGIN` entry is used.',
          parameters: [
            {
              name: 'return_origin',
              in: 'query',
              required: false,
              schema: { type: 'string', example: 'http://localhost:5174' },
              description: 'Must match an entry in server `CORS_ORIGIN` when set',
            },
          ],
          responses: {
            '302': { description: 'Redirect to Google' },
            '400': {
              description: 'Bad request (e.g. invalid `return_origin`, or `return_origin` without `CORS_ORIGIN`)',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/ErrorMessage' },
                },
              },
            },
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
              description: 'OAuth state: echoed from `return_origin` on `/auth/google` when set',
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
              name: 'categories',
              in: 'query',
              description:
                'Optional. Comma-separated category ObjectIds. Returns recipes that include at least one of the given categories.',
              schema: { type: 'string', example: '507f1f77bcf86cd799439011,507f191e810c19729de860ea' },
            },
            {
              name: 'search',
              in: 'query',
              description: 'Case-insensitive partial match on recipe name',
              schema: { type: 'string' },
            },
            {
              name: 'order',
              in: 'query',
              description:
                'Sort by `updatedAt`: `desc` (default, newest first) or `asc` (oldest first)',
              schema: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
            },
            {
              name: 'recipeAuthor',
              in: 'query',
              description:
                'Filter by creator: MongoDB user ObjectId (`createdBy`). Prefer ids over emails—same hardcoding in the UI, no lookup endpoint required.',
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
            '400': { description: 'Invalid query (e.g. order, categories, recipeAuthor)' },
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
            'Partial update; include at least one of `name` or `categoryImage`. Send `categoryImage: null` to leave the existing image unchanged. Send `categoryImage: false` to remove the stored image (Cloudinary asset is deleted).',
          properties: {
            name: { type: 'string' },
            categoryImage: {
              description:
                '`null`: keep current image unchanged. `false`: remove stored image. Otherwise same upload payload as on create.',
              nullable: true,
              oneOf: [
                { type: 'boolean', enum: [false], description: 'Remove stored category image.' },
                { $ref: '#/components/schemas/RecipeImageUpload' },
              ],
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
        CategoryRef: {
          type: 'object',
          description: 'Populated category (`_id` exposed as `id` in JSON).',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
        },
        Recipe: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'MongoDB document id (hex string)' },
            name: { type: 'string' },
            categories: {
              type: 'array',
              minItems: 1,
              description: 'Category id strings, or populated category objects',
              items: {
                oneOf: [{ type: 'string' }, { $ref: '#/components/schemas/CategoryRef' }],
              },
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
            description: { type: 'string' },
            recipeImage: {
              description: 'Absent or null when no image is stored.',
              nullable: true,
              allOf: [{ $ref: '#/components/schemas/RecipeImage' }],
            },
            categories: {
              type: 'array',
              minItems: 1,
              items: { $ref: '#/components/schemas/CategoryRef' },
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
          required: ['name', 'categories', 'ingredients', 'steps'],
          properties: {
            name: { type: 'string' },
            categories: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', description: 'Category ObjectId' },
            },
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
            'Partial update; include only fields to change. Send `recipeImage: null` to leave the existing image unchanged. Send `recipeImage: false` to remove the stored image (Cloudinary asset is deleted).',
          properties: {
            name: { type: 'string' },
            categories: {
              type: 'array',
              minItems: 1,
              items: { type: 'string', description: 'Category ObjectId' },
            },
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
              description:
                '`null`: keep current image unchanged. `false`: remove stored recipe image. Otherwise same upload payload as on create.',
              nullable: true,
              oneOf: [
                { type: 'boolean', enum: [false], description: 'Remove stored recipe image.' },
                { $ref: '#/components/schemas/RecipeImageUpload' },
              ],
            },
          },
        },
      },
    },
  };
};
