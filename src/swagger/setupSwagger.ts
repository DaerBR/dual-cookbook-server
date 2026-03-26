import type { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import type { SwaggerDefinition } from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { getOpenApiDefinition } from './openapiSpec';

export const setupSwagger = (app: Express): void => {
  const definition = getOpenApiDefinition();
  const spec = swaggerJsdoc({
    definition: definition as SwaggerDefinition,
    apis: [],
  });

  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(spec, { explorer: true }));
  app.get('/api/docs.json', (_req, res) => {
    res.json(spec);
  });
};
