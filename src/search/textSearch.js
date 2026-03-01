'use strict';

/**
 * TF-IDF based text search engine with fuzzy matching and relevance scoring.
 */
class TextSearchEngine {
  constructor() {
    this.documents = [];
    this.invertedIndex = {};
    this._idfCache = {};
  }

  get stopWords() {
    return new Set([
      'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
      'should', 'may', 'might', 'must', 'can', 'could', 'to', 'of', 'in',
      'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
      'and', 'or', 'but', 'not', 'it', 'its', 'this', 'that', 'these', 'those'
    ]);
  }

  /**
   * Tokenize and normalize text into searchable terms.
   * @param {string} text
   * @returns {string[]}
   */
  tokenize(text) {
    return String(text)
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !this.stopWords.has(w));
  }

  /**
   * Index a document for full-text search.
   * @param {{ id: string, title: string, content: string, tags?: string[], createdAt?: Date }} doc
   */
  indexDocument(doc) {
    const docIndex = this.documents.length;
    this.documents.push(doc);

    const text = `${doc.title} ${doc.content} ${(doc.tags || []).join(' ')}`;
    const tokens = this.tokenize(text);

    // Compute term frequencies
    const termFreq = {};
    tokens.forEach(token => {
      termFreq[token] = (termFreq[token] || 0) + 1;
    });

    const totalTerms = tokens.length || 1;
    Object.entries(termFreq).forEach(([term, freq]) => {
      if (!this.invertedIndex[term]) {
        this.invertedIndex[term] = [];
      }
      this.invertedIndex[term].push({ docIndex, tf: freq / totalTerms });
    });

    // Invalidate IDF cache on new document
    this._idfCache = {};
  }

  /**
   * Compute inverse document frequency for a term.
   * @param {string} term
   * @returns {number}
   */
  _getIDF(term) {
    if (this._idfCache[term] !== undefined) return this._idfCache[term];
    const docCount = this.invertedIndex[term] ? this.invertedIndex[term].length : 0;
    const idf = Math.log((this.documents.length + 1) / (docCount + 1)) + 1;
    this._idfCache[term] = idf;
    return idf;
  }

  /**
   * Search indexed documents using TF-IDF scoring with optional fuzzy matching.
   * @param {string} query
   * @param {{ page?: number, limit?: number }} [options]
   * @returns {{ query: string, total: number, page: number, limit: number, results: object[] }}
   */
  search(query, { page = 1, limit = 10 } = {}) {
    const tokens = this.tokenize(query);
    const scores = new Map();

    tokens.forEach(token => {
      // Exact term match (TF-IDF)
      const idf = this._getIDF(token);
      (this.invertedIndex[token] || []).forEach(({ docIndex, tf }) => {
        scores.set(docIndex, (scores.get(docIndex) || 0) + tf * idf);
      });

      // Prefix / substring fuzzy match (half weight)
      if (token.length > 3) {
        Object.keys(this.invertedIndex).forEach(indexedTerm => {
          if (indexedTerm !== token && indexedTerm.startsWith(token)) {
            const partialIdf = this._getIDF(indexedTerm) * 0.5;
            this.invertedIndex[indexedTerm].forEach(({ docIndex, tf }) => {
              scores.set(docIndex, (scores.get(docIndex) || 0) + tf * partialIdf);
            });
          }
        });
      }
    });

    const sorted = [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([docIndex, score]) => ({
        ...this.documents[docIndex],
        score: parseFloat(Math.min(score, 1).toFixed(4))
      }));

    const total = sorted.length;
    const start = (page - 1) * limit;

    return {
      query,
      total,
      page,
      limit,
      results: sorted.slice(start, start + limit)
    };
  }

  /** Total number of indexed documents. */
  get size() {
    return this.documents.length;
  }
}

module.exports = TextSearchEngine;
