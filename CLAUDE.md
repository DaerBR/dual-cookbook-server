# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Run with tsx watch (no build step; use during development)
npm run server       # Same entry via nodemon (alternative watcher)
npm run build        # Compile TypeScript → dist/
npm start            # Run compiled dist/index.js (requires build first)

npm run mongo:dump          # Gzipped mongodump → mongo-backups/
npm run migrate:recipe-categories  # One-off migration script
npm run import:recipes      # Import recipes from JSON file
```

No test suite exists yet. Type-check with `npm run build`.

Format with Prettier: `npx prettier --write src/`.

## Architecture

**Entry flow:** `src/index.ts` loads `.env` / `.env.local` → validates env with Zod (`src/config/env.ts`) → connects Mongoose → calls `createApp()` from `src/app.ts` → listens.

**`createApp()`** wires middleware in order: CORS → JSON body parser (10 MB limit for base64 image payloads) → `cookie-session` → Passport → routes → global error handler.

**Auth:** Google OAuth 2.0 via Passport (`src/services/passport.ts`). Login is email-allowlisted — only emails in `ALLOWED_EMAILS` env var (or the two hardcoded family defaults in `src/config/allowedEmails.ts`) can sign in. The OAuth callback sends user data to the opener tab via `window.opener.postMessage` and closes itself (popup flow). Sessions are stored in a signed cookie (`cookie-session`), 30-day max-age. In production, cookies are `SameSite: None; Secure` to support a cross-origin SPA.

**Route protection:** `requireLoginExceptSafeMethods` (`src/middlewares/requireLogin.ts`) allows unauthenticated GET/HEAD/OPTIONS but gates writes on session presence.

**API routes:**
- `/auth/google` → Google OAuth start (accepts `?return_origin=` for popup postMessage target)
- `/auth/google/callback` → OAuth callback, postMessage, self-close
- `/api/current_user` — returns `{ id, displayName, email }` or `null`
- `/api/logout` — clears session
- `/api/recipes` — full CRUD, paginated list with `search`, `categories`, `order`, `recipeAuthor` query params
- `/api/categories` — CRUD for recipe categories
- `/api/docs` — Swagger UI; `/api/docs.json` — OpenAPI spec

**Models (Mongoose):**
- `User` — `googleId`, `displayName`, `email`
- `Category` — name + optional image
- `Recipe` — name, `categories[]` (ObjectId refs, min 1), `steps[]` (min 1), optional `ingredients[]`, `description`, `sourceUrl`, `recipeImage` (Cloudinary `publicId` + `secureUrl`), `createdBy`

**Images:** Uploaded as base64 data-URIs in the request body; `src/services/cloudinaryRecipeImage.ts` uploads to Cloudinary under `dual-cookbook/recipes/<id>/` or `dual-cookbook/categories/<id>/`. Old images are deleted from Cloudinary on replace/delete. The JSON body limit is set to 10 MB to accommodate these payloads.

**Key conventions:**
- All async route handlers are wrapped in `asyncHandler` (`src/utils/asyncHandler.ts`) to forward rejections to Express error handling — never use `try/catch` in route handlers directly.
- Mongoose `toJSON`/`toObject` transforms call `renameMongoIdsForClient` (`src/utils/renameMongoIdsForClient.ts`), which recursively renames `_id` → `id` and strips `__v`. Lean queries bypass schema transforms, so pass lean results through `renameMongoIdsForClient` manually.
- `jsonError(res, status, message)` (`src/utils/jsonError.ts`) is the single place to send error responses.
- `getEnv()` is cached after first parse — call it freely, do not cache the result yourself.

## Environment

Copy `.env.example` to `.env`. Required: `MONGO_URI`, `COOKIE_KEY`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.

For cross-origin SPA: set `CORS_ORIGIN` (comma-separated exact origins) and pass `?return_origin=<origin>` on the `/auth/google` link so the OAuth popup knows which tab to postMessage.

## TypeScript

Strict mode + `noUnusedLocals` + `noUnusedParameters` + `noImplicitReturns`. Module system: `NodeNext`. Target: `ES2022`. Only `src/` is compiled; `scripts/` runs via `tsx` directly and is excluded from `tsconfig.json`.