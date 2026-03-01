'use strict';

const fs = require('fs');
const crypto = require('crypto');

/**
 * Image search engine using MD5 hash deduplication and tag-based similarity.
 */
class ImageSearchEngine {
  constructor() {
    this.images = [];
    this.tagIndex = {};
    this.hashIndex = {};
  }

  /**
   * Compute a lightweight MD5 hash of an image file for deduplication.
   * @param {string} filePath
   * @returns {string}
   */
  _hashFile(filePath) {
    const buffer = fs.readFileSync(filePath);
    return crypto.createHash('md5').update(buffer).digest('hex');
  }

  /**
   * Index an uploaded image document.
   * @param {{ id: string, title: string, filename: string, path: string,
   *            size: number, mimetype: string, tags?: string[], description?: string,
   *            createdAt?: Date }} imageDoc
   * @returns {object} The indexed image record.
   */
  indexImage(imageDoc) {
    const hash = this._hashFile(imageDoc.path);
    const record = {
      ...imageDoc,
      hash,
      url: `/uploads/${imageDoc.filename}`
    };

    const idx = this.images.length;
    this.images.push(record);

    // Map hash → index for deduplication lookups
    if (!this.hashIndex[hash]) {
      this.hashIndex[hash] = [];
    }
    this.hashIndex[hash].push(idx);

    // Map normalised tags → indices
    (imageDoc.tags || []).forEach(tag => {
      const norm = tag.toLowerCase().trim();
      if (!norm) return;
      if (!this.tagIndex[norm]) {
        this.tagIndex[norm] = [];
      }
      this.tagIndex[norm].push(idx);
    });

    return record;
  }

  /**
   * Search for images similar to a query image file.
   * Exact hash matches score 1.0; each matching tag adds 0.3 (capped at 1.0).
   * @param {string} imagePath  Path to the query image.
   * @param {string|string[]} [tags]  Optional tags to boost similarity.
   * @returns {{ total: number, results: object[] }}
   */
  searchSimilar(imagePath, tags = '') {
    const queryHash = this._hashFile(imagePath);
    const tagList = this._normaliseTags(tags);
    const scores = new Map();

    // Exact hash match → perfect score
    (this.hashIndex[queryHash] || []).forEach(idx => scores.set(idx, 1.0));

    // Tag-based similarity
    tagList.forEach(tag => {
      (this.tagIndex[tag] || []).forEach(idx => {
        scores.set(idx, Math.min((scores.get(idx) || 0) + 0.3, 1.0));
      });
    });

    const results = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([idx, similarity]) => ({ ...this.images[idx], similarity }));

    return { total: results.length, results };
  }

  /**
   * Search indexed images by tags.
   * @param {string|string[]} tags
   * @param {{ page?: number, limit?: number }} [options]
   * @returns {{ total: number, page: number, limit: number, results: object[] }}
   */
  searchByTags(tags, { page = 1, limit = 20 } = {}) {
    const tagList = this._normaliseTags(tags);
    const scores = new Map();

    tagList.forEach(tag => {
      (this.tagIndex[tag] || []).forEach(idx => {
        scores.set(idx, (scores.get(idx) || 0) + 1);
      });
    });

    const sorted = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([idx, hits]) => ({
        ...this.images[idx],
        relevance: parseFloat((hits / (tagList.length || 1)).toFixed(4))
      }));

    const total = sorted.length;
    const start = (page - 1) * limit;

    return {
      total,
      page,
      limit,
      results: sorted.slice(start, start + limit)
    };
  }

  /**
   * Normalise a tag string or array into lowercase trimmed strings.
   * @param {string|string[]} tags
   * @returns {string[]}
   */
  _normaliseTags(tags) {
    if (Array.isArray(tags)) return tags.map(t => t.toLowerCase().trim()).filter(Boolean);
    if (typeof tags === 'string') return tags.split(',').map(t => t.toLowerCase().trim()).filter(Boolean);
    return [];
  }

  /** Total number of indexed images. */
  get size() {
    return this.images.length;
  }
}

module.exports = ImageSearchEngine;
