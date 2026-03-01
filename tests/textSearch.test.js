'use strict';

const TextSearchEngine = require('../src/search/textSearch');

describe('TextSearchEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new TextSearchEngine();
  });

  // ---- tokenize ----
  describe('tokenize()', () => {
    it('lowercases and splits text', () => {
      expect(engine.tokenize('Hello World')).toEqual(expect.arrayContaining(['hello', 'world']));
    });

    it('removes punctuation', () => {
      const tokens = engine.tokenize('AI-powered search!');
      expect(tokens).toContain('powered');
      expect(tokens).toContain('search');
    });

    it('filters stop words', () => {
      const tokens = engine.tokenize('the quick fox');
      expect(tokens).not.toContain('the');
    });

    it('filters single-character tokens', () => {
      const tokens = engine.tokenize('a b c hello');
      expect(tokens).not.toContain('a');
      expect(tokens).not.toContain('b');
    });
  });

  // ---- indexDocument ----
  describe('indexDocument()', () => {
    it('increases size after indexing', () => {
      expect(engine.size).toBe(0);
      engine.indexDocument({ id: '1', title: 'Test', content: 'Hello world', tags: [] });
      expect(engine.size).toBe(1);
    });

    it('indexes multiple documents', () => {
      for (let i = 0; i < 5; i++) {
        engine.indexDocument({ id: String(i), title: `Doc ${i}`, content: `Content ${i}`, tags: [] });
      }
      expect(engine.size).toBe(5);
    });
  });

  // ---- search ----
  describe('search()', () => {
    beforeEach(() => {
      engine.indexDocument({
        id: '1', title: 'Artificial Intelligence',
        content: 'AI enables machines to learn and make decisions.',
        tags: ['ai', 'machine learning']
      });
      engine.indexDocument({
        id: '2', title: 'Web Development',
        content: 'Building responsive and accessible web applications.',
        tags: ['web', 'html', 'css']
      });
      engine.indexDocument({
        id: '3', title: 'Deep Learning',
        content: 'Deep learning uses neural networks to process data.',
        tags: ['deep learning', 'neural networks', 'ai']
      });
    });

    it('returns results for a matching query', () => {
      const result = engine.search('artificial intelligence');
      expect(result.total).toBeGreaterThan(0);
      expect(result.results[0].id).toBe('1');
    });

    it('returns empty results for unmatched query', () => {
      const result = engine.search('xyznotexist');
      expect(result.total).toBe(0);
      expect(result.results).toHaveLength(0);
    });

    it('ranks more relevant documents higher', () => {
      const result = engine.search('deep learning neural');
      const ids = result.results.map(r => r.id);
      expect(ids[0]).toBe('3');
    });

    it('respects pagination limits', () => {
      const result = engine.search('learning', { page: 1, limit: 1 });
      expect(result.results).toHaveLength(1);
      expect(result.limit).toBe(1);
    });

    it('returns correct page metadata', () => {
      const result = engine.search('learning', { page: 1, limit: 10 });
      expect(result).toMatchObject({ query: 'learning', page: 1, limit: 10 });
    });

    it('includes score on each result', () => {
      const result = engine.search('ai');
      result.results.forEach(r => expect(typeof r.score).toBe('number'));
    });

    it('fuzzy-matches prefixes', () => {
      const result = engine.search('artif'); // prefix of 'artificial'
      expect(result.total).toBeGreaterThan(0);
    });
  });
});
