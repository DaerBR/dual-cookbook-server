# Dual Cookbook Server

REST API for a small family cookbook app: recipes, categories, and Google sign-in.

## Stack

- **Runtime:** Node.js
- **Framework:** Express 5
- **Language:** TypeScript (compiled to `dist/`)
- **Database:** MongoDB (Atlas) with **Mongoose**
- **Auth:** **Passport** + **Google OAuth 2.0**, session via **cookie-session**
- **Config:** **dotenv** (`.env` then `.env.local`), validated with **Zod**
- **API docs:** **Swagger UI** + **swagger-jsdoc** (OpenAPI spec in code)
- **CORS:** **cors** (optional `CORS_ORIGIN` for the future React app)

## Scripts

| Command | Description |
|--------|-------------|
| `npm run dev` | Run `src/index.ts` with **tsx** and watch mode (no `dist` build). |
| `npm run server` | Same entry with **nodemon** + **tsx** (restart on file changes). |
| `npm run build` | Compile TypeScript to **`dist/`** (`tsc`). |
| `npm start` | Run the compiled app: **`node dist/index.js`** (run **`build`** first). |

## Project layout

```
src/
  index.ts              # Entry: env, MongoDB connect, listen
  app.ts                # Express app, middleware, route mounting
  config/               # Env loading, Zod schema, allowed Google emails
  controllers/          # Recipe & category HTTP handlers
  middlewares/          # e.g. requireLogin
  models/               # Mongoose models (User, Category, Recipe)
  routes/               # Routers wired in app.ts
  services/             # Passport / Google strategy
  swagger/              # OpenAPI spec + Swagger UI setup
  types/                # TypeScript augmentations (e.g. Express.User)
  utils/                # asyncHandler, pagination, helpers
```

## Environment

Copy **`.env.example`** to **`.env`** and/or **`.env.local`** (local overrides the base file). Required variables are validated at startup; see the example file for descriptions.

## API overview

Interactive documentation and schemas live at:

- **Swagger UI:** `GET /api/docs`
- **OpenAPI JSON:** `GET /api/docs.json`

In short: **Google OAuth** under `/auth/google` and **`/api/current_user`**, **`/api/logout`**; protected **recipes** and **categories** CRUD under **`/api/recipes`** and **`/api/categories`** (session cookie after login). **`GET /health`** for a simple health check.

For request/response shapes and query parameters, use Swagger.

## Author

Gennadii Guliakov
