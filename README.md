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
| `npm run mongo:dump` | Download a gzipped backup of the MongoDB database (manual; see [Database backup](#database-backup)). |
| `npm run migrate:recipe-categories` | One-off migration script for recipe categories. |

See [ARCHITECTURE.md](./ARCHITECTURE.md) for a deeper walkthrough of the request lifecycle, auth flow, and data models.

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
  services/             # Passport / Google strategy, Cloudinary, recipeImport/ (external URL parsers)
  swagger/              # OpenAPI spec + Swagger UI setup
  types/                # TypeScript augmentations (e.g. Express.User)
  utils/                # asyncHandler, pagination, helpers
```

## Environment

Copy **`.env.example`** to **`.env`** and/or **`.env.local`** (local overrides the base file). Required variables are validated at startup; see the example file for descriptions.

## Database backup

Manual backups use **`mongodump`** via **`npm run mongo:dump`**. The script reads **`MONGO_URI`** from the same **`.env`** files as the API and writes a timestamped archive under **`mongo-backups/`** (that folder is gitignored).

### Prerequisites

1. **`MONGO_URI`** set in **`.env`** (or **`.env.local`**).
2. **[MongoDB Database Tools](https://www.mongodb.com/try/download/database-tools)** installed so **`mongodump`** is on your **`PATH`**.

   On macOS with Homebrew:

   ```bash
   brew install mongodb-database-tools
   ```

3. Your machine can reach the database (for Atlas: IP allowlist / network access).

### Create a backup

From the project root:

```bash
npm run mongo:dump
```

Example output file: **`mongo-backups/backup-2026-05-26T14-30-00.archive.gz`**.

### Restore (optional)

Use **`mongorestore`** with the same archive. **`--drop`** removes existing collections in the target database before restore—omit it if you only want to merge data.

```bash
mongorestore --gzip --archive=mongo-backups/backup-<timestamp>.archive.gz --drop
```

Replace **`<timestamp>`** with the stamp from your backup filename.

## API overview

Interactive documentation and schemas live at:

- **Swagger UI:** `GET /api/docs`
- **OpenAPI JSON:** `GET /api/docs.json`

In short: **Google OAuth** under `/auth/google` and **`/api/current_user`**, **`/api/logout`**; protected **recipes** and **categories** CRUD under **`/api/recipes`** and **`/api/categories`** (session cookie after login); **`POST /api/recipes/import`** to parse an external URL into a recipe draft (see [Recipe import](#recipe-import)). **`GET /health`** for a simple health check.

For request/response shapes and query parameters, use Swagger.

## Recipe import

**`POST /api/recipes/import`** with `{ "url": "<https URL>" }` fetches an external page and returns a **recipe draft** for prefilling the Create Recipe form. Nothing is saved — the client saves via `POST /api/recipes`.

| Source | Accepted URLs | How it is read |
|--------|---------------|----------------|
| Instagram | `instagram.com/p/…`, `/reel/…`, `/reels/…`, `/tv/…` (optionally `/<user>/…`) | HTML `og:description` / `<meta name="description">` (caption; current `CAPTION - @user on DATE` and legacy `likes, comments …: "CAPTION"` formats) |
| Telegraph | `telegra.ph/<path>`, `graph.org/<path>` (official mirror) | Official JSON API `api.telegra.ph/getPage/<path>?return_content=true` |
| Recipe websites (catch-all, checked last) | Any other `https` URL | schema.org `Recipe` structured data: JSON-LD first, microdata fallback (title, description, ingredients, steps; images ignored) |

Draft shape (fields a source does not provide are omitted):

```ts
{
  recipeTitle?: string;   // Instagram: first caption line; Telegraph: article title; recipe sites: Recipe `name` (max 100 chars)
  description?: string;   // recipe sites: Recipe `description`
  ingredients?: string[]; // recipe sites: `recipeIngredient`, one string per ingredient
  steps?: string[];       // Instagram/Telegraph: one entry with the full caption / article text; recipe sites: one entry per step
  imageUrl?: string;      // Telegraph: cover image
  sourceUrl: string;      // canonical URL, tracking params removed
}
```

### Request flow

1. **`routes/recipeRoutes.ts`** — `POST /import` → `asyncHandler(importRecipeDraft)`. Login is required (`requireLoginExceptSafeMethods`), and anything thrown below goes to the global error handler.
2. **`controllers/recipeController.ts` → `importRecipeDraft`** — validates the input only (`url` present, parseable, `https:`; otherwise **400**), asks the registry for a parser (none → **400** `Unsupported site. Supported: …`), then responds with `cleanDraft(await parser.parse(url))`. It knows nothing about specific sites. `cleanDraft` (`services/recipeImport/cleanText.ts`) strips emoji (keycap numbers at a line start become `1.`) and hashtags (a run ending a line is removed; one inside a sentence keeps its word) from every text field, dropping fields left empty.
3. **`services/recipeImport/parsers.ts`** — the registry: a list of `ExternalRecipeParser` objects (`name`, `canHandle(url)`, `parse(url)`; interface in `types.ts`). `findRecipeParser(url)` returns the first one that can handle the URL; `supportedSourceNames` feeds the error message.
4. **The source parser**:
   - **`instagramParser.ts`** — `getInstagramShortcode(url)` matches the URL; `parseInstagramPost(url)` normalizes it to `/p/<shortcode>/`, fetches the HTML and extracts the caption from `og:description` (or `<meta name="description">` when that's missing).
   - **`schemaRecipeParser.ts`** — the catch-all, registered last so the dedicated parsers win. Fetches via `fetchPublicHtml`, then looks for a schema.org `Recipe`: first in JSON-LD (`<script type="application/ld+json">`, searched depth-first so `@graph`, arrays and nesting all work; invalid blocks are skipped), then in microdata (`itemscope itemtype=".../Recipe"`). Handles the usual `recipeInstructions` shapes — one string with line breaks, strings, `HowToStep`s, `HowToSection`s (section name goes on its own line before the section's first step) — and strips HTML tags/entities from values. No ingredients and no steps → **422**. There is deliberately no guessing from CSS classes like `.ingredients` (too many false positives).
   - **`telegraphParser.ts`** — `getTelegraphPath(url)` accepts only the Telegraph hosts and a single path segment (rules out `/file/…`, `/api`, `/`). `parseTelegraphPage(url)` calls the Telegraph API, checks `ok` in the body (the API answers HTTP 200 even for errors; `PAGE_NOT_FOUND` → **422**, other errors → **502**), converts the content tree to text, and returns the draft. An article with no text (e.g. photos only) → **422**.
5. **`services/recipeImport/fetchExternal.ts`** — shared HTTP layer: `fetchHtml` (Instagram, `facebookexternalhit` User-Agent), `fetchJson` (Telegraph, YouTube) and `fetchPublicHtml` (recipe sites). All use a 10 s timeout and map failures to `HttpError`: timeout → **504**, unreachable / non-2xx / wrong content type → **502**, upstream 404 → **422**.
   - **`fetchPublicHtml`** fetches *user-supplied* URLs, so it guards against SSRF: every hop (the URL and each redirect, followed manually, max 5) must pass **`assertPublicUrl.ts`** — https only, no custom port, and every resolved address must be outside loopback / private / link-local (incl. cloud metadata `169.254.169.254`) / CGNAT / multicast / reserved ranges → otherwise **400**. The body is capped at 5 MB (**502** above that). It identifies itself as `DualCookbookImporter/1.0`. Known gap: `fetch` resolves the hostname again, so DNS rebinding between the check and the request isn't caught.
6. **`app.ts`** — the global error handler turns any `HttpError` into `{ message }` with its status.

"Nothing to import" is **422**, not 404, on purpose: the client redirects to its Not Found page on 404.

### Telegraph text extraction

Telegraph returns the article as a tree of [nodes](https://telegra.ph/api#Node): each node is a string or `{ tag, attrs?, children? }`. Three helpers in `telegraphParser.ts` turn it into plain text:

- **`collectLines`** — walks the tree and emits one line per block (`p`, `h3`, `h4`, `blockquote`, `aside`, `pre`, `figcaption`); list items get a `-` or `1.` prefix; containers such as `figure` are recursed into, so captions are kept while images are not.
- **`inlineText`** — flattens a block's contents: text kept, inline formatting (`strong`, `em`, `a`…) stripped, `<br>` → newline, `img`/`video`/`iframe` dropped.
- **`normalizeText`** — collapses whitespace and trims each line, and collapses runs of blank lines into one.

Ingredients are not split out from the text — articles are free-form, so this is left to the user in the form.

### Adding a source

1. Create `services/recipeImport/<source>Parser.ts` with a URL matcher (returns `null` for foreign URLs) and a `parse(url): Promise<ExternalRecipeDraft>` that throws `HttpError` on failure.
2. Register it in the `parsers` array in `parsers.ts`.
3. Update the `/api/recipes/import` description in `swagger/openapiSpec.ts`.

## Author

Gennadii Guliakov
