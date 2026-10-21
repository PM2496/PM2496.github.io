#!/usr/bin/env node

/**
 * Recursively turn every Markdown file under data/ into the single JSON file
 * consumed by the blog.
 *
 * Supported frontmatter:
 *   id, slug, title, date, updated, excerpt, description, tags, category,
 *   status, draft, published
 *
 * Category rules:
 *   - data/<category-folder>/post.md uses data/categories.json when that folder
 *     is mapped, otherwise a category is created from the folder name.
 *   - frontmatter.category can be a category id or display name and overrides
 *     the folder mapping.
 *
 * Images referenced with Markdown syntax are resolved relative to the source
 * Markdown file and rewritten to a site-relative URL, e.g.
 *   ![x](images/a.png) in data/tech/post.md -> data/tech/images/a.png
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const DATA_DIR = path.join(ROOT, 'data');
const CATEGORIES_FILE = path.join(DATA_DIR, 'categories.json');
const SITE_FILE = path.join(DATA_DIR, 'site.json');
const OUTPUT_FILE = path.join(DATA_DIR, 'blog-content.json');
const COLORS = ['#4176e6', '#b06a3c', '#2f8f6b', '#8a6bbe', '#6b7280', '#c08a2e'];
const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
const DEFAULT_SITE = {
  title: 'Blog',
  subtitle: 'WORDS IN MARGIN',
  tagline: '把想法写下来，让时间慢一点。',
  role: '写作者 · 杭州'
};

function fail(message) {
  throw new Error(message);
}

function readText(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
}

function shortHash(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function cleanText(value, maxLength = 10000) {
  return String(value == null ? '' : value)
    .replace(/\u0000/g, '')
    .trim()
    .slice(0, maxLength);
}

function validColor(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : '';
}

function parseScalar(raw) {
  const value = String(raw == null ? '' : raw).trim();
  if (!value) return '';
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch (error) {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.startsWith('[') && value.endsWith(']')) {
    return parseInlineArray(value);
  }
  if (/^(true|yes)$/i.test(value)) return true;
  if (/^(false|no)$/i.test(value)) return false;
  if (/^(null|~)$/i.test(value)) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function parseInlineArray(raw) {
  const inner = raw.slice(1, -1).trim();
  if (!inner) return [];
  const parts = [];
  let current = '';
  let quote = '';
  let escaped = false;
  for (const character of inner) {
    if (escaped) {
      current += character;
      escaped = false;
      continue;
    }
    if (character === '\\') {
      current += character;
      escaped = true;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) quote = '';
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      current += character;
      continue;
    }
    if (character === ',') {
      parts.push(current);
      current = '';
      continue;
    }
    current += character;
  }
  parts.push(current);
  return parts.map((part) => parseScalar(part)).filter((part) => part !== '');
}

function parseFrontmatter(text) {
  const lines = text.split('\n');
  if (lines[0].trim() !== '---') {
    return { data: {}, body: text };
  }
  let closing = -1;
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---' || lines[index].trim() === '...') {
      closing = index;
      break;
    }
  }
  if (closing < 0) {
    throw new Error('frontmatter 缺少结束的 --- 行');
  }

  const data = {};
  let index = 1;
  while (index < closing) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith('#')) {
      index += 1;
      continue;
    }
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*:\s*(.*)$/);
    if (!match) {
      index += 1;
      continue;
    }
    const key = match[1];
    const rawValue = match[2].trim();

    if (/^[|>][-+]?$/.test(rawValue)) {
      const folded = rawValue.startsWith('>');
      const block = [];
      let cursor = index + 1;
      while (cursor < closing) {
        const blockLine = lines[cursor];
        if (blockLine.trim() && !/^\s+/.test(blockLine)) break;
        block.push(blockLine.replace(/^\s{2}/, ''));
        cursor += 1;
      }
      data[key] = folded ? block.join(' ').trim() : block.join('\n').trim();
      index = cursor;
      continue;
    }

    if (!rawValue) {
      const list = [];
      let cursor = index + 1;
      while (cursor < closing) {
        const item = lines[cursor].match(/^\s*-\s+(.*)$/);
        if (!item) break;
        list.push(parseScalar(item[1]));
        cursor += 1;
      }
      if (list.length) {
        data[key] = list;
        index = cursor;
        continue;
      }
    }

    data[key] = parseScalar(rawValue);
    index += 1;
  }

  return {
    data,
    body: lines.slice(closing + 1).join('\n').replace(/^\n+/, '')
  };
}

function walkMarkdown(directory) {
  const result = [];
  if (!fs.existsSync(directory)) return result;

  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkMarkdown(absolute));
    } else if (entry.isFile() && MARKDOWN_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      if (entry.name.startsWith('_')) continue;
      result.push(absolute);
    }
  }

  return result.sort((left, right) => left.localeCompare(right, 'en'));
}

function stripMarkdown(value, maxLength = 160) {
  const text = String(value || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>#]/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength - 1).trim() + '…' : text;
}

function ensureDate(value, fallback) {
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) return date.toISOString();
  const fallbackDate = new Date(fallback);
  return Number.isNaN(fallbackDate.getTime()) ? new Date().toISOString() : fallbackDate.toISOString();
}

function filenameDate(relativePath) {
  const match = path.basename(relativePath).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] + 'T00:00:00+08:00' : '';
}

function encodePath(value) {
  return String(value)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function rewriteImages(markdown, mdRelativePath, warnings) {
  return markdown.replace(
    /!\[([^\]]*)\]\(\s*(<[^>]+>|[^)\s]+)(\s+(?:"[^"]*"|'[^']*'))?\s*\)/g,
    (whole, alt, rawUrl, title) => {
      let url = String(rawUrl || '').trim();
      if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1);
      if (/^(https?:)?\/\//i.test(url) || /^data:/i.test(url) || url.startsWith('#')) {
        return whole;
      }
      if (url.startsWith('/')) return whole;

      const split = url.match(/^([^?#]+)([?#].*)?$/);
      const cleanPath = split ? split[1] : url;
      const suffix = split && split[2] ? split[2] : '';
      const sourceDirectory = path.posix.dirname(mdRelativePath);
      const resolved = path.posix.normalize(path.posix.join(sourceDirectory, cleanPath));
      if (resolved.startsWith('../') || path.posix.isAbsolute(resolved)) {
        warnings.push(
          mdRelativePath + ' 引用了 data 目录以外的图片：' + url
        );
        return whole;
      }

      const absoluteImage = path.join(ROOT, resolved);
      if (!fs.existsSync(absoluteImage)) {
        warnings.push(mdRelativePath + ' 引用了不存在的图片：' + url);
      }

      const encoded = encodePath(resolved) + suffix;
      return '![' + alt + '](' + encoded + (title || '') + ')';
    }
  );
}

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(readText(file));
  } catch (error) {
    fail('无法解析 ' + path.relative(ROOT, file) + '：' + error.message);
  }
}

function loadCategories() {
  const raw = loadJson(CATEGORIES_FILE, []);
  const list = Array.isArray(raw) ? raw : Array.isArray(raw.categories) ? raw.categories : [];
  const categories = [];
  const usedIds = new Set();

  for (const [index, item] of list.entries()) {
    if (!item || typeof item !== 'object') continue;
    let id = slugify(item.id) || 'category-' + shortHash(JSON.stringify(item));
    while (usedIds.has(id)) id += '-2';
    usedIds.add(id);
    categories.push({
      id,
      name: cleanText(item.name, 30) || id,
      color: validColor(item.color) || COLORS[index % COLORS.length],
      description: cleanText(item.description, 120),
      createdAt: item.createdAt ? ensureDate(item.createdAt, new Date().toISOString()) : '',
      folder: cleanText(item.folder, 40) || id,
      auto: false
    });
  }

  return categories;
}

function findCategory(categories, reference) {
  const value = cleanText(reference, 60);
  if (!value) return null;
  return (
    categories.find((category) => category.id === value) ||
    categories.find((category) => category.name === value) ||
    categories.find((category) => category.folder === value) ||
    null
  );
}

function createCategory(categories, folder, requestedName) {
  const baseName = cleanText(requestedName, 30) || folder || '未分类';
  let id = slugify(baseName) || 'category-' + shortHash(baseName);
  const usedIds = new Set(categories.map((category) => category.id));
  while (usedIds.has(id)) id += '-2';
  const category = {
    id,
    name: baseName,
    color: COLORS[categories.length % COLORS.length],
    description: '',
    createdAt: '',
    folder: folder || '',
    auto: true
  };
  categories.push(category);
  return category;
}

function categoryForArticle(categories, frontmatter, folder) {
  if (frontmatter.category) {
    const found = findCategory(categories, frontmatter.category);
    if (found) return found;
    return createCategory(categories, folder, frontmatter.category);
  }
  const found =
    categories.find((category) => category.folder === folder) ||
    categories.find((category) => category.id === slugify(folder)) ||
    categories.find((category) => category.name === folder);
  return found || createCategory(categories, folder, folder);
}

function articleId(frontmatter, relativePath, usedIds) {
  const base =
    cleanText(frontmatter.id, 100) ||
    cleanText(frontmatter.slug, 100) ||
    slugify(relativePath.replace(/\.(md|markdown)$/i, '').split(path.sep).join('-')) ||
    'article-' + shortHash(relativePath);
  let id = base.replace(/[^A-Za-z0-9_-]/g, '-').replace(/^-+|-+$/g, '') || 'article-' + shortHash(relativePath);
  while (usedIds.has(id)) id += '-2';
  usedIds.add(id);
  return id;
}

function normalizeTags(value) {
  let list = [];
  if (Array.isArray(value)) list = value;
  else if (typeof value === 'string') list = value.split(/[,，、;；]/);
  return Array.from(
    new Set(
      list
        .map((tag) => cleanText(tag, 24).replace(/^#+/, ''))
        .filter(Boolean)
    )
  ).slice(0, 8);
}

export function buildContent() {
  if (!fs.existsSync(DATA_DIR)) fail('找不到 data 目录。');

  const site = Object.assign({}, DEFAULT_SITE, loadJson(SITE_FILE, {}));
  delete site.author;
  for (const key of Object.keys(site)) {
    site[key] = cleanText(site[key], key === 'tagline' ? 120 : 40);
  }

  const categories = loadCategories();
  const files = walkMarkdown(DATA_DIR);
  const usedArticleIds = new Set();
  const warnings = [];
  const articles = [];

  for (const absoluteFile of files) {
    const relativeToData = path.relative(DATA_DIR, absoluteFile).split(path.sep).join('/');
    const relativeToRoot = path.relative(ROOT, absoluteFile).split(path.sep).join('/');
    const folder = relativeToData.includes('/') ? relativeToData.split('/')[0] : '';
    const stat = fs.statSync(absoluteFile);
    let parsed;
    try {
      parsed = parseFrontmatter(readText(absoluteFile));
    } catch (error) {
      fail(relativeToRoot + '：' + error.message);
    }
    const frontmatter = parsed.data || {};
    if (frontmatter.ignore === true || String(frontmatter.ignore).toLowerCase() === 'true') continue;

    let body = rewriteImages(parsed.body, relativeToRoot, warnings).trimEnd() + '\n';
    let title = cleanText(
      frontmatter.title || frontmatter.name || '',
      120
    );
    const leadingHeading = body.match(/^\s*#\s+(.+?)\s*$/m);
    if (!title && leadingHeading) {
      title = cleanText(leadingHeading[1].replace(/[*_`]/g, ''), 120);
    }
    if (title && leadingHeading && cleanText(leadingHeading[1].replace(/[*_`]/g, ''), 120) === title) {
      body = body.replace(leadingHeading[0], '').replace(/^\n+/, '');
    }
    if (!title) title = path.basename(relativeToData).replace(/\.(md|markdown)$/i, '');

    const date = ensureDate(
      frontmatter.date ||
        frontmatter.createdAt ||
        frontmatter.publishedAt ||
        filenameDate(relativeToData),
      stat.mtime
    );
    const updated = ensureDate(
      frontmatter.updated || frontmatter.updatedAt || frontmatter.modified || date,
      date
    );

    const statusValue = String(frontmatter.status || '').toLowerCase();
    const isDraft =
      frontmatter.draft === true ||
      String(frontmatter.draft).toLowerCase() === 'true' ||
      frontmatter.published === false ||
      String(frontmatter.published).toLowerCase() === 'false' ||
      statusValue === 'draft' ||
      statusValue === '草稿';

    const category = categoryForArticle(categories, frontmatter, folder);
    const excerpt =
      cleanText(frontmatter.excerpt || frontmatter.description || '', 200) ||
      stripMarkdown(body);

    articles.push({
      id: articleId(frontmatter, relativeToData, usedArticleIds),
      categoryId: category.id,
      title,
      excerpt,
      status: isDraft ? 'draft' : 'published',
      tags: normalizeTags(frontmatter.tags),
      createdAt: date,
      updatedAt: updated,
      content: body
    });
  }

  for (const category of categories) {
    if (!category.createdAt) {
      const dates = articles
        .filter((article) => article.categoryId === category.id)
        .map((article) => new Date(article.createdAt).getTime())
        .filter((value) => !Number.isNaN(value));
      category.createdAt = dates.length
        ? new Date(Math.min(...dates)).toISOString()
        : new Date(0).toISOString();
    }
    delete category.auto;
  }

  articles.sort((left, right) => {
    const leftDate = new Date(left.updatedAt).getTime();
    const rightDate = new Date(right.updatedAt).getTime();
    return rightDate - leftDate;
  });

  const output = {
    version: 1,
    site,
    categories,
    articles
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + '\n', 'utf8');
  console.log(
    '[build-content] ' +
      articles.length +
      ' 篇文章 / ' +
      categories.length +
      ' 个分类 -> ' +
      path.relative(ROOT, OUTPUT_FILE)
  );
  if (warnings.length) {
    for (const warning of warnings) console.warn('[build-content] 警告：' + warning);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    buildContent();
  } catch (error) {
    console.error('\n[build-content] ' + error.message + '\n');
    process.exit(1);
  }
}
