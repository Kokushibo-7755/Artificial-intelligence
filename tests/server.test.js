'use strict';

const request = require('supertest');
const path = require('path');
const fs = require('fs');
const os = require('os');

// We need a fresh app instance per test suite to avoid port conflicts
let app;

beforeAll(() => {
  app = require('../server');
});

// ---------------------------------------------------------------------------
// Helper – create a minimal JPEG buffer so multer accepts the upload
// ---------------------------------------------------------------------------
function minimalJpegBuffer() {
  // A 1×1 white JPEG (minimal valid JPEG structure)
  return Buffer.from(
    'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707' +
    '07090909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c23' +
    '1c1c2837292c30313434341f27393d38323c2e333432ffc0000b080001000101011100' +
    'ffc4001f0000010501010101010100000000000000000102030405060708090a0bffda' +
    '00080101000003f0ffd9',
    'hex'
  );
}

function tempJpeg(content = null) {
  const file = path.join(os.tmpdir(), `test-${Date.now()}.jpg`);
  fs.writeFileSync(file, content || minimalJpegBuffer());
  return file;
}

// ---------------------------------------------------------------------------
// GET /api/status
// ---------------------------------------------------------------------------
describe('GET /api/status', () => {
  it('returns status ok', async () => {
    const res = await request(app).get('/api/status');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('includes indexed counts', async () => {
    const res = await request(app).get('/api/status');
    expect(res.body.indexed).toHaveProperty('text');
    expect(res.body.indexed).toHaveProperty('images');
  });
});

// ---------------------------------------------------------------------------
// POST /api/search/text
// ---------------------------------------------------------------------------
describe('POST /api/search/text', () => {
  it('returns 400 when query is missing', async () => {
    const res = await request(app).post('/api/search/text').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 when query is whitespace only', async () => {
    const res = await request(app).post('/api/search/text').send({ query: '   ' });
    expect(res.status).toBe(400);
  });

  it('returns results for a valid query matching seed data', async () => {
    const res = await request(app)
      .post('/api/search/text')
      .send({ query: 'artificial intelligence' });
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('results');
    expect(Array.isArray(res.body.results)).toBe(true);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it('returns empty results for a nonsense query', async () => {
    const res = await request(app)
      .post('/api/search/text')
      .send({ query: 'zxqwzxqw123notexist' });
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
  });

  it('respects page and limit', async () => {
    const res = await request(app)
      .post('/api/search/text')
      .send({ query: 'learning', page: 1, limit: 1 });
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// POST /api/index/text
// ---------------------------------------------------------------------------
describe('POST /api/index/text', () => {
  it('returns 400 when title is missing', async () => {
    const res = await request(app)
      .post('/api/index/text')
      .send({ content: 'Some content' });
    expect(res.status).toBe(400);
  });

  it('returns 400 when content is missing', async () => {
    const res = await request(app)
      .post('/api/index/text')
      .send({ title: 'Title' });
    expect(res.status).toBe(400);
  });

  it('indexes a document and returns 201 with id', async () => {
    const res = await request(app)
      .post('/api/index/text')
      .send({ title: 'Test Doc', content: 'Hello world of search engines' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.id).toBe('string');
  });

  it('indexed document becomes searchable', async () => {
    const unique = `uniquetoken${Date.now()}`;
    await request(app)
      .post('/api/index/text')
      .send({ title: 'Unique Title', content: `This document contains ${unique}` });

    const search = await request(app)
      .post('/api/search/text')
      .send({ query: unique });
    expect(search.body.total).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// POST /api/index/image
// ---------------------------------------------------------------------------
describe('POST /api/index/image', () => {
  it('returns 400 when no file is uploaded', async () => {
    const res = await request(app).post('/api/index/image').send({});
    expect(res.status).toBe(400);
  });

  it('indexes an image and returns 201 with id and url', async () => {
    const filePath = tempJpeg();
    const res = await request(app)
      .post('/api/index/image')
      .attach('image', filePath)
      .field('title', 'Test Image')
      .field('tags', 'test,upload');
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.url).toMatch(/^\/uploads\//);
    fs.unlinkSync(filePath);
  });

  it('rejects non-image files with 415', async () => {
    const txtFile = path.join(os.tmpdir(), 'test.txt');
    fs.writeFileSync(txtFile, 'not an image');
    const res = await request(app)
      .post('/api/index/image')
      .attach('image', txtFile, { contentType: 'text/plain', filename: 'test.txt' });
    expect(res.status).toBe(415);
    fs.unlinkSync(txtFile);
  });
});

// ---------------------------------------------------------------------------
// GET /api/search/image/tags
// ---------------------------------------------------------------------------
describe('GET /api/search/image/tags', () => {
  it('returns 400 when tags param is missing', async () => {
    const res = await request(app).get('/api/search/image/tags');
    expect(res.status).toBe(400);
  });

  it('returns results (possibly empty) for a valid tags query', async () => {
    const res = await request(app).get('/api/search/image/tags?tags=test');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('results');
  });
});
