# AI Search Engine

A top-tier, highly efficient AI search engine supporting both **text** and **image** content search, with full mobile/Safari optimisation and an age-verification gate for 18+ content platforms.

---

## Screenshots

| Age Gate | Desktop Search | Mobile (390 px) |
|---|---|---|
| ![Age Gate](https://github.com/user-attachments/assets/99c49efa-17ff-4fda-8e14-254e13d4d6b3) | ![Desktop](https://github.com/user-attachments/assets/7c59a8da-2e08-4be2-b211-4808820aedc7) | ![Mobile](https://github.com/user-attachments/assets/fcee811d-b1b3-422c-9901-85293ce0a718) |

---

## Features

| Capability | Details |
|---|---|
| **Smart AI text search** | TF-IDF scoring with IDF weighting, stop-word filtering and prefix fuzzy-matching |
| **Image search** | MD5 hash-based deduplication + tag-similarity scoring |
| **Age verification** | Full-screen gate persisted in `localStorage`; users must confirm 18+ before accessing the app |
| **Mobile / Safari** | `env(safe-area-inset-*)`, `-webkit-` prefixes, `min-height: -webkit-fill-available`, touch-friendly tap targets, `viewport-fit=cover` |
| **Responsive layout** | Mobile-first CSS, fluid `clamp()` typography, wrapping image grid (2 → 3 → 4 columns) |
| **Drag-and-drop upload** | Upload zone accepts drag-drop or tap-to-browse; shows instant image preview |
| **Content indexing** | REST endpoints to index new text documents and images at runtime |
| **Pagination** | Server-side pagination on all list endpoints |
| **Toast notifications** | Accessible, animated status toasts |
| **Reduced motion** | Respects `prefers-reduced-motion` |

---

## Project Structure

```
.
├── server.js                  # Express REST API + static file server
├── src/
│   └── search/
│       ├── textSearch.js      # TF-IDF text search engine
│       └── imageSearch.js     # Hash + tag-based image search engine
├── public/
│   ├── index.html             # Single-page UI
│   ├── css/style.css          # Mobile-first, Safari-optimised stylesheet
│   └── js/app.js              # Vanilla JS frontend
├── uploads/                   # Uploaded images (git-ignored except .gitkeep)
├── tests/
│   ├── textSearch.test.js     # Unit tests – text engine
│   ├── imageSearch.test.js    # Unit tests – image engine
│   └── server.test.js         # Integration tests – REST API
└── package.json
```

---

## Quick Start

```bash
npm install
npm start          # http://localhost:3000
```

Set `PORT` to override the default port:

```bash
PORT=8080 npm start
```

---

## REST API

### Health

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/status` | Engine status and indexed document counts |

### Text Search

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/api/search/text` | `{ query, page?, limit? }` | TF-IDF ranked text search |
| `POST` | `/api/index/text` | `{ title, content, tags? }` | Index a text document |

### Image Search

| Method | Path | Body | Description |
|---|---|---|---|
| `POST` | `/api/search/image` | `multipart: image, tags?` | Find similar images by content hash + tags |
| `GET` | `/api/search/image/tags` | `?tags=a,b&page=1&limit=20` | Search indexed images by tags |
| `POST` | `/api/index/image` | `multipart: image, title?, tags?, description?` | Index an image |

All list responses follow the shape:

```json
{
  "total": 42,
  "page": 1,
  "limit": 10,
  "results": [ /* ... */ ]
}
```

---

## Running Tests

```bash
npm test
```

45 unit + integration tests covering:

- Tokenisation and stop-word filtering
- TF-IDF scoring and fuzzy prefix matching
- Image hash deduplication and tag similarity
- All REST endpoints (happy path + error cases)

---

## Architecture

```
Browser (mobile / desktop / Safari)
    │
    │  HTTP/REST + multipart/form-data
    ▼
Express server  (server.js)
    ├── /api/search/text   ──►  TextSearchEngine  (TF-IDF inverted index)
    ├── /api/index/text    ──►  TextSearchEngine
    ├── /api/search/image  ──►  multer upload  ──►  ImageSearchEngine (hash + tags)
    ├── /api/index/image   ──►  multer upload  ──►  ImageSearchEngine
    ├── /api/search/image/tags  ──►  ImageSearchEngine
    └── /uploads           ──►  static file server
```

### Text Search Algorithm

1. **Tokenise** – lowercase, strip punctuation, remove stop words, drop single-char tokens.
2. **Index** – build an inverted index: `term → [{ docIndex, tf }]`. TF = term count ÷ total tokens.
3. **Query** – for each query token compute `TF × IDF` per posting; optionally boost prefix matches at 50% weight.
4. **Rank** – sum scores per document, sort descending, paginate.

### Image Search Algorithm

1. **Hash** – compute MD5 of the raw file bytes. Identical files score `1.0`.
2. **Tags** – each matching tag adds `+0.3` to the similarity score (capped at `1.0`).
3. **Rank** – sort by similarity descending.

---

## Mobile / Safari Optimisations

- `env(safe-area-inset-*)` for notch/home-indicator spacing
- `position: -webkit-sticky` + `backdrop-filter` with `-webkit-backdrop-filter`
- `-webkit-appearance: none` on all form inputs
- `-webkit-text-size-adjust: 100%` to prevent font inflation
- `min-height: -webkit-fill-available` for correct viewport height
- `apple-mobile-web-app-capable` and `theme-color` meta tags
- `-webkit-tap-highlight-color: transparent` for clean tap behaviour
- All animations include `@-webkit-keyframes` variants
- Flex/transform properties include `-webkit-` prefixes throughout

---

## Security Notes

- **multer 2.1.0** used (patched against all known DoS vulnerabilities in 1.x).
- Uploaded filenames are replaced with UUIDs to prevent path traversal.
- File type restricted to `image/jpeg`, `image/png`, `image/gif`, `image/webp` by MIME type check.
- File size capped at 50 MB.
- All user-supplied strings rendered via `escapeHtml()` in the frontend.
- CORS enabled for all origins (tighten in production with an allowlist).
