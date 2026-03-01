/* global document, window, FormData, fetch, localStorage */
'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const API_BASE = '/api';
const AGE_KEY = 'ai_search_age_verified';

// ---------------------------------------------------------------------------
// DOM references (resolved after DOMContentLoaded)
// ---------------------------------------------------------------------------
let ageGate, app;
let tabText, tabImage, panelText, panelImage;
let formText, textQuery;
let formImage, imageFile, imageTags, uploadZone;
let formIndexText, formIndexImage;
let indexTabs, indexPanels;
let resultsMeta, resultsGrid, pagination, resultsEmpty;
let toastContainer;

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const state = {
  currentMode: 'text',    // 'text' | 'image'
  currentPage: 1,
  lastQuery: '',
  lastTags: '',
  totalResults: 0,
  limit: 10
};

// ---------------------------------------------------------------------------
// Age gate
// ---------------------------------------------------------------------------
function initAgeGate() {
  const verified = localStorage.getItem(AGE_KEY);
  if (verified === '1') {
    showApp();
  }
  document.getElementById('age-confirm').addEventListener('click', () => {
    localStorage.setItem(AGE_KEY, '1');
    showApp();
  });
}

function showApp() {
  ageGate.classList.add('hidden');
  app.classList.remove('hidden');
}

// ---------------------------------------------------------------------------
// Tab switching
// ---------------------------------------------------------------------------
function initTabs() {
  [tabText, tabImage].forEach(tab => {
    tab.addEventListener('click', () => {
      const mode = tab.dataset.tab;
      state.currentMode = mode;

      tabText.classList.toggle('tab--active', mode === 'text');
      tabImage.classList.toggle('tab--active', mode === 'image');
      panelText.classList.toggle('hidden', mode !== 'text');
      panelImage.classList.toggle('hidden', mode !== 'image');

      tab.setAttribute('aria-selected', 'true');
      (mode === 'text' ? tabImage : tabText).setAttribute('aria-selected', 'false');

      clearResults();
    });
  });
}

// ---------------------------------------------------------------------------
// Index sub-tabs
// ---------------------------------------------------------------------------
function initIndexTabs() {
  indexTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.panel;
      indexTabs.forEach(b => b.classList.remove('index-tab--active'));
      btn.classList.add('index-tab--active');
      indexPanels.forEach(p => p.classList.toggle('hidden', p.id !== targetId));
    });
  });
}

// ---------------------------------------------------------------------------
// Upload zone – drag-and-drop + preview
// ---------------------------------------------------------------------------
function initUploadZone() {
  uploadZone.addEventListener('dragover', e => {
    e.preventDefault();
    uploadZone.classList.add('upload-zone--dragover');
  });
  ['dragleave', 'dragend'].forEach(ev =>
    uploadZone.addEventListener(ev, () => uploadZone.classList.remove('upload-zone--dragover'))
  );
  uploadZone.addEventListener('drop', e => {
    e.preventDefault();
    uploadZone.classList.remove('upload-zone--dragover');
    const file = e.dataTransfer.files[0];
    if (file) {
      imageFile.files = e.dataTransfer.files;
      previewImage(file);
    }
  });

  imageFile.addEventListener('change', () => {
    if (imageFile.files[0]) previewImage(imageFile.files[0]);
  });

  // Touch-friendly: clicking the zone triggers the file input
  uploadZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') imageFile.click();
  });
}

function previewImage(file) {
  const reader = new window.FileReader();
  reader.onload = e => {
    const previewArea = document.getElementById('upload-preview-area');
    previewArea.innerHTML = '';
    const img = document.createElement('img');
    img.src = e.target.result;
    img.alt = 'Preview';
    img.className = 'upload-zone__preview';
    previewArea.appendChild(img);
  };
  reader.readAsDataURL(file);
}

// ---------------------------------------------------------------------------
// Text search
// ---------------------------------------------------------------------------
function initTextSearch() {
  formText.addEventListener('submit', async e => {
    e.preventDefault();
    const q = textQuery.value.trim();
    if (!q) { toast('Please enter a search query', 'info'); return; }
    state.lastQuery = q;
    state.currentPage = 1;
    await runTextSearch();
  });
}

async function runTextSearch() {
  setLoading(true);
  try {
    const res = await apiFetch('/search/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: state.lastQuery, page: state.currentPage, limit: state.limit })
    });
    renderTextResults(res);
  } catch (err) {
    toast(err.message || 'Search failed', 'error');
    clearResults();
  } finally {
    setLoading(false);
  }
}

function renderTextResults(data) {
  clearResults();
  state.totalResults = data.total;

  if (!data.results || !data.results.length) {
    resultsEmpty.classList.remove('hidden');
    return;
  }

  resultsMeta.classList.remove('hidden');
  resultsMeta.textContent = `${data.total} result${data.total !== 1 ? 's' : ''} for "${escapeHtml(data.query)}"`;

  const fragment = document.createDocumentFragment();
  data.results.forEach(doc => {
    const card = document.createElement('article');
    card.className = 'result-card';
    const snippet = truncate(doc.content, 160);
    const tags = (doc.tags || []).map(t => `<span class="tag-pill">${escapeHtml(t)}</span>`).join('');
    card.innerHTML = `
      <div class="result-card__title">${escapeHtml(doc.title)}</div>
      <div class="result-card__snippet">${escapeHtml(snippet)}</div>
      <div class="result-card__meta">
        ${tags}
        <span class="score-badge">Score: ${doc.score}</span>
      </div>`;
    fragment.appendChild(card);
  });
  resultsGrid.appendChild(fragment);
  renderPagination(data.total, data.page, data.limit, () => {
    state.currentPage = data.page;
    runTextSearch();
  });

  resultsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------------
// Image search
// ---------------------------------------------------------------------------
function initImageSearch() {
  formImage.addEventListener('submit', async e => {
    e.preventDefault();
    if (!imageFile.files || !imageFile.files[0]) {
      toast('Please select an image to search', 'info');
      return;
    }
    state.lastTags = imageTags.value;
    await runImageSearch();
  });
}

async function runImageSearch() {
  setLoading(true);
  try {
    const fd = new FormData();
    fd.append('image', imageFile.files[0]);
    if (state.lastTags.trim()) fd.append('tags', state.lastTags.trim());

    const res = await apiFetch('/search/image', { method: 'POST', body: fd });
    renderImageResults(res, 'Similar images');
  } catch (err) {
    toast(err.message || 'Image search failed', 'error');
    clearResults();
  } finally {
    setLoading(false);
  }
}

function renderImageResults(data, label = '') {
  clearResults();
  state.totalResults = data.total;

  if (!data.results || !data.results.length) {
    resultsEmpty.classList.remove('hidden');
    return;
  }

  resultsMeta.classList.remove('hidden');
  resultsMeta.textContent = `${data.total} ${label || 'result'}${data.total !== 1 ? 's' : ''}`;

  const grid = document.createElement('div');
  grid.className = 'image-results-grid';

  data.results.forEach(img => {
    const card = document.createElement('div');
    card.className = 'image-result-card';
    const simText = img.similarity !== undefined
      ? `Similarity: ${Math.round(img.similarity * 100)}%`
      : img.relevance !== undefined
        ? `Relevance: ${Math.round(img.relevance * 100)}%`
        : '';
    card.innerHTML = `
      <img src="${escapeHtml(img.url)}" alt="${escapeHtml(img.title || '')}" loading="lazy" />
      <div class="image-result-card__info">
        <div class="image-result-card__title">${escapeHtml(img.title || img.filename || '')}</div>
        ${simText ? `<div class="image-result-card__sim">${simText}</div>` : ''}
      </div>`;
    grid.appendChild(card);
  });

  resultsGrid.appendChild(grid);
  resultsGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------------------------------------------------------------------
// Index forms
// ---------------------------------------------------------------------------
function initIndexForms() {
  formIndexText.addEventListener('submit', async e => {
    e.preventDefault();
    const title   = document.getElementById('idx-title').value.trim();
    const content = document.getElementById('idx-content').value.trim();
    const tags    = document.getElementById('idx-tags').value.trim();
    if (!title || !content) { toast('Title and content are required', 'info'); return; }

    try {
      const res = await apiFetch('/index/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, tags })
      });
      if (res.success) {
        toast('Document indexed successfully', 'success');
        formIndexText.reset();
      }
    } catch (err) {
      toast(err.message || 'Failed to index document', 'error');
    }
  });

  formIndexImage.addEventListener('submit', async e => {
    e.preventDefault();
    const file = document.getElementById('idx-img-file').files[0];
    if (!file) { toast('Please select an image', 'info'); return; }

    const fd = new FormData(formIndexImage);
    try {
      const res = await apiFetch('/index/image', { method: 'POST', body: fd });
      if (res.success) {
        toast('Image indexed successfully', 'success');
        formIndexImage.reset();
      }
    } catch (err) {
      toast(err.message || 'Failed to index image', 'error');
    }
  });
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------
function renderPagination(total, currentPage, limit, onChangePage) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return;

  pagination.classList.remove('hidden');
  pagination.innerHTML = '';

  const prev = document.createElement('button');
  prev.className = 'btn btn--secondary btn--sm';
  prev.textContent = '← Prev';
  prev.disabled = currentPage <= 1;
  prev.addEventListener('click', () => { state.currentPage = currentPage - 1; onChangePage(); });
  pagination.appendChild(prev);

  const info = document.createElement('span');
  info.style.cssText = 'padding:.375rem .75rem;font-size:.85rem;color:var(--color-text-muted)';
  info.textContent = `${currentPage} / ${totalPages}`;
  pagination.appendChild(info);

  const next = document.createElement('button');
  next.className = 'btn btn--secondary btn--sm';
  next.textContent = 'Next →';
  next.disabled = currentPage >= totalPages;
  next.addEventListener('click', () => { state.currentPage = currentPage + 1; onChangePage(); });
  pagination.appendChild(next);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function clearResults() {
  resultsMeta.classList.add('hidden');
  resultsMeta.textContent = '';
  resultsGrid.innerHTML = '';
  pagination.classList.add('hidden');
  pagination.innerHTML = '';
  resultsEmpty.classList.add('hidden');
}

function setLoading(active) {
  const btn = state.currentMode === 'text'
    ? formText.querySelector('.search-bar__btn')
    : document.getElementById('btn-image-search');
  if (!btn) return;
  if (active) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span> Searching…';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn.dataset.origText || btn.innerHTML;
    btn.disabled = false;
  }
}

async function apiFetch(endpoint, options = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, options);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function toast(message, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.textContent = message;
  toastContainer.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function truncate(str, max) {
  return str && str.length > max ? str.slice(0, max) + '…' : str || '';
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  ageGate = document.getElementById('age-gate');
  app     = document.getElementById('app');

  tabText   = document.getElementById('tab-text');
  tabImage  = document.getElementById('tab-image');
  panelText = document.getElementById('panel-text');
  panelImage = document.getElementById('panel-image');

  formText  = document.getElementById('form-text');
  textQuery = document.getElementById('text-query');

  formImage  = document.getElementById('form-image');
  imageFile  = document.getElementById('image-file');
  imageTags  = document.getElementById('image-tags');
  uploadZone = document.getElementById('upload-zone');

  formIndexText  = document.getElementById('form-index-text');
  formIndexImage = document.getElementById('form-index-image');
  indexTabs      = Array.from(document.querySelectorAll('.index-tab'));
  indexPanels    = Array.from(document.querySelectorAll('.index-panel'));

  resultsMeta  = document.getElementById('results-meta');
  resultsGrid  = document.getElementById('results-grid');
  pagination   = document.getElementById('pagination');
  resultsEmpty = document.getElementById('results-empty');
  toastContainer = document.getElementById('toast-container');

  initAgeGate();
  initTabs();
  initIndexTabs();
  initUploadZone();
  initTextSearch();
  initImageSearch();
  initIndexForms();
});
