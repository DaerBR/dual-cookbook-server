# Architecture guide

A walkthrough of how this API is built, aimed at a frontend/React developer who is newer to
Node.js backends. It follows a request from the moment it hits the server to the moment a
response goes out. For endpoint-by-endpoint request/response shapes, use Swagger (`/api/docs`)
instead — this doc is about how the pieces fit together, not a full API reference.

## The stack, in frontend terms

| Piece | What it does | Rough FE analogy |
|---|---|---|
| **Express** | HTTP server + router | A router (React Router) but for HTTP requests, plus it owns the actual server process |
| **Mongoose** | ODM for MongoDB — schemas, validation, queries | A TS interface *and* a Zod schema for a table, but it's also your query builder |
| **Passport** | Pluggable auth "strategies" (here: Google OAuth 2.0) | A pre-built auth SDK integration, like NextAuth's Google provider |
| **cookie-session** | Stores the whole session inside a signed cookie | No server-side session store — the cookie *is* the database row |
| **Zod** | Validates `process.env` once at boot | The same Zod you'd use for form validation, applied to env vars instead |
| **Cloudinary** | Image hosting for recipe/category photos | Uploading to S3/Cloudinary from a Next.js API route |
| **tsx** | Runs TypeScript directly, no build step, for dev | Comparable to a dev server not needing a production build |

There's no separate routing layer like Next.js file-based routes — Express *is* the framework.
Routes are registered directly on the `app` object.

## Boot sequence

`src/index.ts` → `src/app.ts`:

1. `loadEnv` reads `.env` / `.env.local`.
2. `getEnv()` (`src/config/env.ts`) parses `process.env` through a Zod schema and **caches** the
   result — call it anywhere in the codebase, it's free after the first call.
3. `mongoose.connect(...)` opens one persistent DB connection, reused by every request (no
   connection-per-request).
4. `createApp()` builds the Express app and wires middleware.
5. `app.listen(port)`.

## The middleware pipeline

Express middleware is a chain of `(req, res, next) => void` functions — each one runs, then
calls `next()` to hand off to the next one. Similar in spirit to a chain of HOCs wrapping a
component, except it's sequential rather than nested rendering. Order matters, and in
`src/app.ts` it is:

```
cors → express.json() → cookie-session → passport.initialize/session → routes → error handler
```

- **CORS** — the allowed origins come from the `CORS_ORIGIN` env var
  (`src/config/corsOrigins.ts`); if unset, any origin is reflected. `credentials: true` requires
  an explicit origin, not `*`.
- **`express.json({ limit: '10mb' })`** — raises the default 100kb body limit because recipe and
  category images are sent as base64 data URIs inside the JSON body (no multipart upload).
- **cookie-session** — unlike `express-session`, there is no server-side store (Redis, Mongo).
  The session object is serialized, signed with the `COOKIE_KEY` secret, and shipped entirely
  inside the cookie. 30-day max-age. In production it's `SameSite: None; Secure` because the SPA
  and API live on different origins.
- **passport.initialize/session** — reads that cookie session and populates `req.user` on every
  request when a valid session exists.

## Auth flow (Google OAuth popup)

This is the part most different from typical frontend auth patterns
(`src/services/passport.ts`, `src/routes/authRoutes.ts`):

1. The frontend opens a **popup** to `GET /auth/google?return_origin=<frontend origin>`.
2. The server validates `return_origin` against the CORS allowlist and stashes it in the OAuth
   `state` param, then redirects to Google.
3. Google redirects back to `GET /auth/google/callback`.
4. Passport's Google strategy callback looks up the user by `googleId`, or by `email` if it's a
   returning user signing in with a new Google account, or creates a new `User` — but **only if
   the email passes the allowlist check** (`src/config/allowedEmails.ts`). This is a private
   family app, not open signup; the allowlist comes from the `ALLOWED_EMAILS` env var, with a
   small hardcoded fallback list in that file for local/default use.
5. On success, the callback route doesn't redirect — it returns a tiny HTML page that runs
   `window.opener.postMessage(...)` then `window.close()`. The opener tab (the SPA) listens for
   that `message` event to learn login succeeded, then the popup closes itself.
6. `passport.serializeUser` / `deserializeUser` control what's stored in the session cookie —
   just the Mongo user `id`, rehydrated from the DB on each request.

`GET /api/current_user` and `GET /api/logout` are the two endpoints the frontend actually
calls/polls day-to-day.

## Route protection

`requireLoginExceptSafeMethods` (`src/middlewares/requireLogin.ts`) is mounted in front of both
`/api/recipes` and `/api/categories`:

```ts
app.use('/api/recipes', requireLoginExceptSafeMethods, recipeRouter);
```

GET/HEAD/OPTIONS pass through unauthenticated (anyone can browse recipes); POST/PUT/DELETE
require `req.user` to exist, else a 401. This is why the site is read-only-public but
edit-only-by-family.

## Data models

Three Mongoose models, all under `src/models/`:

- **User** — `googleId`, `displayName`, `email` (all unique/required).
- **Category** — `name` (unique), optional `categoryImage: { publicId, secureUrl }`.
- **Recipe** — the biggest one:
  - `name`, `categories: ObjectId[]` (custom validator requires at least 1).
  - `steps: [{ stepDescription }]` (required, at least 1 — custom validator).
  - `ingredients?: [{ text }]` (optional).
  - `description?`, `sourceUrl?`.
  - `recipeImage?: { publicId, secureUrl }`.
  - `createdBy: ObjectId ref User`.
  - Compound index on `{ categories: 1, createdAt: -1 }` for the filtered/sorted list queries.

Every schema registers a `toJSON`/`toObject` transform calling `renameMongoIdsForClient`
(`src/utils/renameMongoIdsForClient.ts`) — Mongo's `_id` → `id`, strips `__v`, recursively, so
the frontend never has to deal with `_id`.

**Gotcha worth remembering:** `.lean()` queries skip Mongoose document machinery entirely
(that's the performance win), which means they also skip this transform. That's why controllers
call `renameMongoIdsForClient(rows)` manually after a `.lean()` query (see the paginated list
endpoints in `recipeController.ts` / `categoryController.ts`).

## API surface

| Route | Methods | Notes |
|---|---|---|
| `/health` | GET | Plain liveness check, no auth |
| `/auth/google`, `/auth/google/callback` | GET | OAuth popup flow |
| `/api/current_user` | GET | `{id, displayName, email}` or `null` |
| `/api/logout` | GET | Clears session |
| `/api/recipes` | GET (public), POST/PUT/DELETE (auth) | Paginated list supports `search`, `categories` (comma-separated ids), `order` (asc/desc by `updatedAt`), `recipeAuthor` |
| `/api/recipes/:id` | GET/PUT/DELETE | GET populates `categories` and `createdBy` |
| `/api/categories` | GET (public), POST/PUT/DELETE (auth) | `/all` (unpaginated, for dropdowns) vs `/` (paginated + searchable) |
| `/api/docs`, `/api/docs.json` | GET | Swagger UI / raw OpenAPI spec |

Controllers live in `src/controllers/`, one per resource, doing manual validation (no Zod on
request bodies — hand-rolled type/shape checks in `controllers/utils.ts`) then talking to
Mongoose directly. There's no separate service layer — controller functions *are* the business
logic.

## Recurring conventions

- **`asyncHandler`** (`src/utils/asyncHandler.ts`) — every route handler is async and gets
  wrapped in this so a thrown/rejected promise reaches Express's error handler instead of
  crashing the process. You'll never see `try/catch` in a route handler; errors just propagate
  and the global handler in `app.ts` maps `err.status` (401/403/404/413) to the right response,
  else 500.
- **`jsonError(res, status, message)`** (`src/utils/jsonError.ts`) — the one place error JSON
  gets shaped, keeping error responses consistent across all controllers.
- **Image lifecycle** — uploads happen *after* the Mongo doc is created/updated, and if the
  Cloudinary call fails, the code rolls back (deletes the doc it just created). On replace, the
  *old* Cloudinary image is deleted only after the new one is confirmed saved, to avoid orphaning
  images if the DB write fails midway. See `services/cloudinaryRecipeImage.ts` and the
  `previousImagePublicId` / `orphanNewImagePublicId` handling in both controllers.
- **Category delete guard** — a category still referenced by any recipe cannot be deleted;
  the endpoint returns 409 with the count instead (`categoryController.ts`).

## Dev workflow

- `npm run dev` — `tsx watch`, no build step, instant restart on save.
- `npm run build` doubles as the type-check (`tsc`, strict mode, plus `noUnusedLocals`,
  `noUnusedParameters`, `noImplicitReturns`) — there's no separate `tsc --noEmit` script.
- `scripts/` (migration, import, mongo dump) run via `tsx` directly and are *excluded* from
  `tsconfig.json` — they're one-off tools, not part of the compiled app.
- No test suite yet.

## A note on what's safe to document here

This file describes mechanisms (middleware order, auth flow, schema shapes, conventions), not
secrets. It deliberately does **not** include actual env values, the hardcoded allowlisted email
addresses in `src/config/allowedEmails.ts`, or anything from `.env`. Knowing *how* the
OAuth-popup-postMessage flow works doesn't let anyone bypass it — the actual security boundary is
the email allowlist plus the `COOKIE_KEY` secret, neither of which lives here.
