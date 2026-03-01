'use strict';

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const TextSearchEngine = require('./src/search/textSearch');
const ImageSearchEngine = require('./src/search/imageSearch');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// ---------------------------------------------------------------------------
// Ensure uploads directory exists
// ---------------------------------------------------------------------------
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// ---------------------------------------------------------------------------
// Multer – image upload configuration (multer ≥ 2.x API)
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  }
});

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(Object.assign(new Error('Only JPEG, PNG, GIF and WebP images are accepted'), { status: 415 }));
    }
  }
});

// Rate limiter for file-upload routes (prevents DoS via filesystem exhaustion)
const uploadRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many upload requests, please try again later.' }
});

// ---------------------------------------------------------------------------
// Search engines
// ---------------------------------------------------------------------------
const textEngine = new TextSearchEngine();
const imageEngine = new ImageSearchEngine();

// Seed a handful of demo documents so the engine returns results out of the box
const SEED_DOCS = [
  {
    title: 'Introduction to Artificial Intelligence',
    content: 'Artificial intelligence enables machines to learn from experience, adjust to new inputs, and perform human-like tasks using deep learning and neural networks.',
    tags: ['ai', 'machine learning', 'neural networks', 'deep learning']
  },
  {
    title: 'Image Recognition with Convolutional Neural Networks',
    content: 'CNNs are the backbone of modern image recognition systems. They use convolutional layers to automatically detect visual features such as edges, textures and shapes.',
    tags: ['cnn', 'image recognition', 'computer vision', 'deep learning']
  },
  {
    title: 'Natural Language Processing and Large Language Models',
    content: 'LLMs like GPT and BERT process human language to answer questions, summarise documents and generate coherent text.',
    tags: ['nlp', 'llm', 'bert', 'gpt', 'text', 'language']
  },
  {
    title: 'Search Engine Optimisation Strategies',
    content: 'Modern search engines use relevance ranking, semantic understanding and personalisation to deliver accurate results to users.',
    tags: ['search', 'seo', 'relevance', 'ranking']
  },
  {
    title: 'Mobile-first Web Development Best Practices',
    content: 'Building for mobile requires careful attention to responsive layouts, touch gestures, font sizes, and Safari-specific CSS quirks such as viewport meta and -webkit- prefixes.',
    tags: ['mobile', 'safari', 'responsive', 'css', 'frontend']
  }
];

SEED_DOCS.forEach(doc =>
  textEngine.indexDocument({ id: uuidv4(), ...doc, createdAt: new Date() })
);

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------
function parseTags(raw) {
  if (Array.isArray(raw)) return raw.map(t => String(t).trim()).filter(Boolean);
  if (typeof raw === 'string') return raw.split(',').map(t => t.trim()).filter(Boolean);
  return [];
}

// ---------------------------------------------------------------------------
// Routes – health
// ---------------------------------------------------------------------------
app.get('/api/status', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    indexed: { text: textEngine.size, images: imageEngine.size }
  });
});

// ---------------------------------------------------------------------------
// Routes – text search
// ---------------------------------------------------------------------------
app.post('/api/search/text', (req, res) => {
  const { query, page = 1, limit = 10 } = req.body;
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: 'query is required' });
  }
  const results = textEngine.search(query.trim(), {
    page: Math.max(1, parseInt(page, 10) || 1),
    limit: Math.min(100, Math.max(1, parseInt(limit, 10) || 10))
  });
  res.json(results);
});

// ---------------------------------------------------------------------------
// Routes – image search (upload a query image, find similar indexed images)
// ---------------------------------------------------------------------------
app.post('/api/search/image', uploadRateLimit, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'image file is required' });
  }
  const tags = parseTags(req.body.tags);
  const results = imageEngine.searchSimilar(req.file.path, tags);

  // Clean up the transient query image
  fs.unlink(req.file.path, () => {});

  res.json(results);
});

// ---------------------------------------------------------------------------
// Routes – index text document
// ---------------------------------------------------------------------------
app.post('/api/index/text', (req, res) => {
  const { title, content, tags } = req.body;
  if (!title || typeof title !== 'string' || !title.trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!content || typeof content !== 'string' || !content.trim()) {
    return res.status(400).json({ error: 'content is required' });
  }
  const doc = {
    id: uuidv4(),
    title: title.trim(),
    content: content.trim(),
    tags: parseTags(tags),
    createdAt: new Date()
  };
  textEngine.indexDocument(doc);
  res.status(201).json({ success: true, id: doc.id });
});

// ---------------------------------------------------------------------------
// Routes – index image document
// ---------------------------------------------------------------------------
app.post('/api/index/image', uploadRateLimit, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'image file is required' });
  }
  const doc = {
    id: uuidv4(),
    title: req.body.title ? req.body.title.trim() : req.file.originalname,
    filename: req.file.filename,
    path: req.file.path,
    size: req.file.size,
    mimetype: req.file.mimetype,
    tags: parseTags(req.body.tags),
    description: req.body.description ? req.body.description.trim() : '',
    createdAt: new Date()
  };
  const indexed = imageEngine.indexImage(doc);
  res.status(201).json({ success: true, id: indexed.id, url: indexed.url });
});

// ---------------------------------------------------------------------------
// Routes – image search by tags (GET for convenience)
// ---------------------------------------------------------------------------
app.get('/api/search/image/tags', (req, res) => {
  const tags = parseTags(req.query.tags);
  if (!tags.length) {
    return res.status(400).json({ error: 'tags query parameter is required' });
  }
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  res.json(imageEngine.searchByTags(tags, { page, limit }));
});

// ---------------------------------------------------------------------------
// Error handler
// ---------------------------------------------------------------------------
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AI Search Engine listening on http://localhost:${PORT}`);
  });
}

module.exports = app;
