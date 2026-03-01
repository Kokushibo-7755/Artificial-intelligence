'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const ImageSearchEngine = require('../src/search/imageSearch');

// ---------------------------------------------------------------------------
// Helper – write a small PNG-like binary to a temp file
// ---------------------------------------------------------------------------
function createTempImage(content = 'img-data') {
  const dir = os.tmpdir();
  const filename = `test-${crypto.randomBytes(6).toString('hex')}.jpg`;
  const filePath = path.join(dir, filename);
  fs.writeFileSync(filePath, Buffer.from(content));
  return { filePath, filename };
}

describe('ImageSearchEngine', () => {
  let engine;

  beforeEach(() => { engine = new ImageSearchEngine(); });

  afterAll(() => {
    // Temp files are cleaned up by the OS; nothing to do here.
  });

  // ---- indexImage ----
  describe('indexImage()', () => {
    it('returns size 0 before any indexing', () => {
      expect(engine.size).toBe(0);
    });

    it('increases size after indexing', () => {
      const { filePath, filename } = createTempImage('data1');
      engine.indexImage({ id: '1', title: 'Test', filename, path: filePath, size: 5, mimetype: 'image/jpeg', tags: ['test'] });
      expect(engine.size).toBe(1);
    });

    it('sets a url derived from filename', () => {
      const { filePath, filename } = createTempImage('data2');
      const record = engine.indexImage({ id: '2', title: 'T2', filename, path: filePath, size: 5, mimetype: 'image/jpeg', tags: [] });
      expect(record.url).toBe(`/uploads/${filename}`);
    });

    it('sets a hash on the indexed record', () => {
      const { filePath, filename } = createTempImage('data3');
      const record = engine.indexImage({ id: '3', title: 'T3', filename, path: filePath, size: 5, mimetype: 'image/jpeg', tags: [] });
      expect(typeof record.hash).toBe('string');
      expect(record.hash.length).toBeGreaterThan(0);
    });
  });

  // ---- searchSimilar ----
  describe('searchSimilar()', () => {
    it('returns an exact match for the same file content', () => {
      const { filePath, filename } = createTempImage('unique-content');
      engine.indexImage({ id: 'a', title: 'A', filename, path: filePath, size: 14, mimetype: 'image/jpeg', tags: [] });

      const queryFile = createTempImage('unique-content');
      const result = engine.searchSimilar(queryFile.filePath);
      expect(result.total).toBe(1);
      expect(result.results[0].similarity).toBe(1.0);
      fs.unlinkSync(queryFile.filePath);
    });

    it('returns no results when nothing is indexed', () => {
      const { filePath } = createTempImage('no-match');
      const result = engine.searchSimilar(filePath);
      expect(result.total).toBe(0);
    });

    it('boosts results with matching tags', () => {
      const { filePath: fp1, filename: fn1 } = createTempImage('img-a');
      const { filePath: fp2, filename: fn2 } = createTempImage('img-b');
      engine.indexImage({ id: '1', title: 'A', filename: fn1, path: fp1, size: 5, mimetype: 'image/jpeg', tags: ['nature', 'art'] });
      engine.indexImage({ id: '2', title: 'B', filename: fn2, path: fp2, size: 5, mimetype: 'image/jpeg', tags: ['portrait'] });

      const query = createTempImage('query-img');
      const result = engine.searchSimilar(query.filePath, 'nature,art');
      // Image '1' should score higher due to two tag matches
      expect(result.results[0].id).toBe('1');
      fs.unlinkSync(query.filePath);
    });
  });

  // ---- searchByTags ----
  describe('searchByTags()', () => {
    beforeEach(() => {
      const imgs = [
        { id: '1', tags: ['ai', 'technology'] },
        { id: '2', tags: ['ai', 'art'] },
        { id: '3', tags: ['nature'] }
      ];
      imgs.forEach(({ id, tags }) => {
        const { filePath, filename } = createTempImage(`data-${id}`);
        engine.indexImage({ id, title: `Image ${id}`, filename, path: filePath, size: 5, mimetype: 'image/jpeg', tags });
      });
    });

    it('finds images by single tag', () => {
      const result = engine.searchByTags(['nature']);
      expect(result.total).toBe(1);
      expect(result.results[0].id).toBe('3');
    });

    it('finds images by multiple tags', () => {
      const result = engine.searchByTags(['ai']);
      expect(result.total).toBe(2);
    });

    it('ranks by number of matching tags', () => {
      const result = engine.searchByTags(['ai', 'art']);
      expect(result.results[0].id).toBe('2'); // matches both tags
    });

    it('returns empty when no tags match', () => {
      const result = engine.searchByTags(['nonexistent']);
      expect(result.total).toBe(0);
    });

    it('respects pagination', () => {
      const result = engine.searchByTags(['ai'], { page: 1, limit: 1 });
      expect(result.results).toHaveLength(1);
    });
  });

  // ---- _normaliseTags ----
  describe('_normaliseTags()', () => {
    it('handles string input', () => {
      expect(engine._normaliseTags('A, B, C')).toEqual(['a', 'b', 'c']);
    });

    it('handles array input', () => {
      expect(engine._normaliseTags(['X', 'Y'])).toEqual(['x', 'y']);
    });

    it('filters empty strings', () => {
      expect(engine._normaliseTags('a,,b')).toEqual(['a', 'b']);
    });

    it('handles non-string/non-array gracefully', () => {
      expect(engine._normaliseTags(null)).toEqual([]);
    });
  });
});
