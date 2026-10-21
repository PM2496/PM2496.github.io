(function () {
  'use strict';

  const STORAGE_KEY = 'yubai.blog.v1';
  const APP_VERSION = '1.0.0';
  const SITE_TIME_ZONE = 'Asia/Shanghai';
  const FILTERS = {
    all: '全部文章',
    published: '已发布',
    draft: '草稿'
  };
  const SORTS = {
    'updated-desc': '最近更新',
    'created-asc': '最早发布',
    'title-asc': '标题 A–Z'
  };
  const CATEGORY_COLORS = ['#4176e6', '#b06a3c', '#2f8f6b', '#8a6bbe', '#6b7280', '#c08a2e'];

  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));

  const dom = {
    appShell: $('#appShell'),
    sidebar: $('#sidebar'),
    sidebarScrim: $('#sidebarScrim'),
    categoryTree: $('#categoryTree'),
    categoryScroll: $('#categoryScroll'),
    articleCount: $('#articleCount'),
    searchField: $('#searchField'),
    searchInput: $('#searchInput'),
    clearSearchBtn: $('#clearSearchBtn'),
    filterBtn: $('#filterBtn'),
    filterBadge: $('#filterBadge'),
    filterNote: $('#filterNote'),
    sortBtn: $('#sortBtn'),
    brandHome: $('#brandHome'),
    newArticleBtn: $('#newArticleBtn'),
    newCategoryBtn: $('#newCategoryBtn'),
    collapseSidebarBtn: $('#collapseSidebarBtn'),
    navToggle: $('#navToggle'),
    themeQuickBtn: $('#themeQuickBtn'),
    authorBtn: $('#authorBtn'),
    breadcrumbs: $('#breadcrumbs'),
    readingChip: $('#readingChip'),
    editArticleBtn: $('#editArticleBtn'),
    shareArticleBtn: $('#shareArticleBtn'),
    articleMenuBtn: $('#articleMenuBtn'),
    contentScroll: $('#contentScroll'),
    articleStage: $('#articleStage'),
    readingBar: $('#readingBar'),
    readerDockWrap: $('#readerDockWrap'),
    prevArticleBtn: $('#prevArticleBtn'),
    nextArticleBtn: $('#nextArticleBtn'),
    dockPosition: $('#dockPosition'),
    dockBar: $('#dockBar'),
    menuRoot: $('#menuRoot'),
    modalRoot: $('#modalRoot'),
    toastRoot: $('#toastRoot'),
    importFile: $('#importFile')
  };

  let state;
  let searchQuery = '';
  let activePopover = null;
  let activeModal = null;
  let lastModalFocus = null;
  let previousRenderedArticleId = null;
  let storageWarningShown = false;
  let scrollFrame = 0;

  const mediaDark = window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

  /* ------------------------------------------------------------------------
     Utilities
     ------------------------------------------------------------------------ */

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  const escapeAttr = escapeHtml;

  function icon(name, className) {
    return (
      '<svg' +
      (className ? ' class="' + className + '"' : '') +
      ' aria-hidden="true"><use href="#i-' +
      name +
      '"></use></svg>'
    );
  }

  function uid(prefix) {
    return (
      prefix +
      '-' +
      Date.now().toString(36) +
      '-' +
      Math.random().toString(36).slice(2, 7)
    );
  }

  function cleanText(value, maxLength) {
    return String(value == null ? '' : value)
      .replace(/\u0000/g, '')
      .trim()
      .slice(0, maxLength || 10000);
  }

  function validColor(value) {
    return /^#[0-9a-f]{6}$/i.test(String(value || '')) ? String(value).toLowerCase() : '';
  }

  function dateValue(value, fallback) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }

  function formatDateLong(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: SITE_TIME_ZONE
    }).format(date);
  }

  function formatDateShort(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      timeZone: SITE_TIME_ZONE
    }).formatToParts(date);
    const month = parts.find((part) => part.type === 'month');
    const day = parts.find((part) => part.type === 'day');
    return (month ? month.value : '') + '/' + (day ? day.value : '');
  }

  function formatDateKey(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const parts = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: SITE_TIME_ZONE
    }).formatToParts(date);
    const get = (type) => (parts.find((part) => part.type === type) || {}).value || '';
    return get('year') + '-' + get('month') + '-' + get('day');
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('zh-CN').format(value);
  }

  function isSameDay(a, b) {
    const left = formatDateKey(a);
    return Boolean(left) && left === formatDateKey(b);
  }

  function isTypingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    return (
      tag === 'INPUT' ||
      tag === 'TEXTAREA' ||
      tag === 'SELECT' ||
      target.isContentEditable
    );
  }

  /* ------------------------------------------------------------------------
     State
     ------------------------------------------------------------------------ */

  function normalizeUi(rawUi, articles, categories) {
    const ui = rawUi && typeof rawUi === 'object' ? rawUi : {};
    const ids = new Set(articles.map((article) => article.id));
    const categoryIds = new Set(categories.map((category) => category.id));
    let activeArticleId = ids.has(ui.activeArticleId) ? ui.activeArticleId : null;
    if (!activeArticleId && articles.length) activeArticleId = articles[0].id;
    const collapsed = Array.isArray(ui.collapsedCategoryIds)
      ? ui.collapsedCategoryIds.filter((id) => categoryIds.has(id))
      : [];
    return {
      activeArticleId,
      collapsedCategoryIds: Array.from(new Set(collapsed)),
      filter: Object.prototype.hasOwnProperty.call(FILTERS, ui.filter) ? ui.filter : 'all',
      sort: Object.prototype.hasOwnProperty.call(SORTS, ui.sort) ? ui.sort : 'updated-desc',
      theme: ['light', 'dark', 'system'].includes(ui.theme) ? ui.theme : 'system',
      sidebarCollapsed: Boolean(ui.sidebarCollapsed)
    };
  }

  function normalizeState(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    const now = new Date().toISOString();
    const usedCategoryIds = new Set();
    const categories = [];
    const rawCategories = Array.isArray(source.categories) ? source.categories : [];

    rawCategories.forEach((item, index) => {
      if (!item || typeof item !== 'object') return;
      let id = cleanText(item.id, 80).replace(/[^A-Za-z0-9_-]/g, '-');
      if (!id || usedCategoryIds.has(id)) id = uid('category');
      usedCategoryIds.add(id);
      const name = cleanText(item.name, 30) || '未命名分类';
      categories.push({
        id,
        name,
        color: validColor(item.color) || CATEGORY_COLORS[index % CATEGORY_COLORS.length],
        description: cleanText(item.description, 120),
        createdAt: dateValue(item.createdAt, now)
      });
    });

    const categoryIds = new Set(categories.map((category) => category.id));
    const usedArticleIds = new Set();
    const articles = [];
    const rawArticles = Array.isArray(source.articles) ? source.articles : [];

    rawArticles.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      let id = cleanText(item.id, 100).replace(/[^A-Za-z0-9_-]/g, '-');
      if (!id || usedArticleIds.has(id)) id = uid('article');
      usedArticleIds.add(id);
      const categoryId = categoryIds.has(item.categoryId)
        ? item.categoryId
        : categories.length
          ? categories[0].id
          : '';
      const tags = Array.isArray(item.tags)
        ? Array.from(
            new Set(
              item.tags
                .map((tag) => cleanText(tag, 24).replace(/^#+/, ''))
                .filter(Boolean)
            )
          ).slice(0, 8)
        : [];
      const createdAt = dateValue(item.createdAt, now);
      articles.push({
        id,
        categoryId,
        title: cleanText(item.title, 120) || '未命名文章',
        excerpt: cleanText(item.excerpt, 200),
        status: item.status === 'draft' ? 'draft' : 'published',
        tags,
        createdAt,
        updatedAt: dateValue(item.updatedAt, createdAt),
        content: String(item.content == null ? '' : item.content)
      });
    });

    const seedSite = (window.SEED_DATA && window.SEED_DATA.site) || {};
    const rawSite = source.site && typeof source.site === 'object' ? source.site : {};
    const site = {
      title: cleanText(rawSite.title, 24) || cleanText(seedSite.title, 24) || '余白',
      subtitle: cleanText(rawSite.subtitle, 40) || cleanText(seedSite.subtitle, 40) || 'WORDS IN MARGIN',
      tagline: cleanText(rawSite.tagline, 120) || cleanText(seedSite.tagline, 120) || '把想法写下来，让时间慢一点。',
      author: cleanText(rawSite.author, 24) || cleanText(seedSite.author, 24) || '林白',
      role: cleanText(rawSite.role, 40) || cleanText(seedSite.role, 40) || '写作者'
    };

    return {
      version: 1,
      site,
      categories,
      articles,
      ui: normalizeUi(source.ui, articles, categories)
    };
  }

  function createInitialState() {
    return normalizeState(clone(window.SEED_DATA));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return createInitialState();
      const parsed = JSON.parse(raw);
      return normalizeState(parsed);
    } catch (error) {
      console.warn('无法读取本地博客数据，已使用示例内容。', error);
      return createInitialState();
    }
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageWarningShown = false;
      return true;
    } catch (error) {
      console.warn('无法保存博客数据。', error);
      if (!storageWarningShown) {
        storageWarningShown = true;
        showToast('无法写入浏览器存储，当前修改可能不会被保留', 'error');
      }
      return false;
    }
  }

  function articleById(id) {
    return state.articles.find((article) => article.id === id) || null;
  }

  function categoryById(id) {
    return state.categories.find((category) => category.id === id) || null;
  }

  function activeArticle() {
    return articleById(state.ui.activeArticleId);
  }

  function sortArticles(list) {
    const copy = list.slice();
    const byDate = (a, b, key) => new Date(b[key]).getTime() - new Date(a[key]).getTime();
    if (state.ui.sort === 'created-asc') {
      copy.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    } else if (state.ui.sort === 'title-asc') {
      copy.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN', { sensitivity: 'base' }));
    } else {
      copy.sort((a, b) => byDate(a, b, 'updatedAt') || byDate(a, b, 'createdAt'));
    }
    return copy;
  }

  function articleMatchesQuery(article, query) {
    if (!query) return true;
    const category = categoryById(article.categoryId);
    const haystack = [
      article.title,
      article.excerpt,
      article.tags.join(' '),
      category ? category.name : '',
      article.content
    ]
      .join('\n')
      .toLowerCase();
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return terms.every((term) => haystack.includes(term));
  }

  function articleMatchesFilter(article) {
    if (state.ui.filter === 'draft') return article.status === 'draft';
    if (state.ui.filter === 'published') return article.status === 'published';
    return true;
  }

  function visibleArticles(options) {
    const opts = options || {};
    const query = opts.ignoreQuery ? '' : searchQuery.trim();
    const filtered = state.articles.filter(
      (article) => articleMatchesFilter(article) && articleMatchesQuery(article, query)
    );
    return sortArticles(filtered);
  }

  function articleStats(article) {
    const text = String(article.content || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/~~~[\s\S]*?~~~/g, ' ')
      .replace(/[#>*_`~[\]()!-]/g, ' ');
    const cjk = (text.match(/[\u3400-\u9fff]/g) || []).length;
    const latinWords = (text.match(/[A-Za-z0-9]+/g) || []).length;
    const characters = cjk + latinWords;
    const minutes = Math.max(1, Math.ceil(cjk / 350 + latinWords / 220));
    return { characters, minutes };
  }

  function autoExcerpt(content) {
    const plain = String(content || '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/~~~[\s\S]*?~~~/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_`~]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return plain.length > 90 ? plain.slice(0, 90).trim() + '…' : plain;
  }

  /* ------------------------------------------------------------------------
     Markdown
     ------------------------------------------------------------------------ */

  function safeUrl(raw) {
    const value = String(raw || '').trim().replace(/&amp;/g, '&');
    if (!value) return '#';
    if (/^(https?:|mailto:)/i.test(value)) return value;
    if (/^#[A-Za-z0-9_-]+$/.test(value)) return value;
    if (/^\.{0,2}\/[^\s]+$/.test(value) || /^assets\/[^\s]+$/i.test(value)) return value;
    return '#';
  }

  function inlineMarkdown(text) {
    const codeBits = [];
    let value = String(text || '');

    value = value.replace(/`([^`\n]+)`/g, function (_, code) {
      const token = '\uE000' + codeBits.length + '\uE001';
      codeBits.push(code);
      return token;
    });

    value = escapeHtml(value);

    value = value.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, function (_, alt, src, title) {
      const titleAttr = title ? ' title="' + title + '"' : '';
      return (
        '<img src="' +
        escapeAttr(safeUrl(src)) +
        '" alt="' +
        alt +
        '"' +
        titleAttr +
        ' loading="lazy">'
      );
    });

    value = value.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, function (_, label, href, title) {
      const titleAttr = title ? ' title="' + title + '"' : '';
      return (
        '<a href="' +
        escapeAttr(safeUrl(href)) +
        '" target="_blank" rel="noopener noreferrer"' +
        titleAttr +
        '>' +
        label +
        '</a>'
      );
    });

    value = value.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    value = value.replace(/~~([^~\n]+)~~/g, '<s>$1</s>');
    value = value.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');

    value = value.replace(/\uE000(\d+)\uE001/g, function (_, index) {
      return '<code>' + escapeHtml(codeBits[Number(index)]) + '</code>';
    });

    return value.replace(/\n/g, '<br>');
  }

  function renderCodeBlock(code, language) {
    const lang = cleanText(language, 24).replace(/[^A-Za-z0-9_+#.-]/g, '') || 'text';
    return (
      '<div class="code-block"><div class="code-head"><span class="code-lang">' +
      escapeHtml(lang) +
      '</span><button class="code-copy" type="button" data-copy-code aria-label="复制代码">' +
      icon('copy') +
      '<span>复制</span></button></div><pre><code>' +
      escapeHtml(code) +
      '</code></pre></div>'
    );
  }

  function isBlockStarter(line) {
    return (
      /^\s*(```|~~~)/.test(line) ||
      /^(#{1,4})\s+/.test(line) ||
      /^\s*>/.test(line) ||
      /^\s*([-*+])\s+/.test(line) ||
      /^\s*\d+[.)]\s+/.test(line) ||
      /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line) ||
      /^\s*!\[[^\]]*\]\([^)]+\)\s*$/.test(line)
    );
  }

  function splitTableRow(line) {
    let value = line.trim();
    if (value.startsWith('|')) value = value.slice(1);
    if (value.endsWith('|')) value = value.slice(0, -1);
    return value.split('|').map((cell) => cell.trim());
  }

  function renderMarkdown(markdown, options) {
    const opts = options || {};
    const lines = String(markdown == null ? '' : markdown).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;
    let paragraphCount = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (!line.trim()) {
        i += 1;
        continue;
      }

      const fence = line.match(/^\s*(```|~~~)\s*([^\s]*)\s*$/);
      if (fence) {
        const marker = fence[1];
        const language = fence[2] || '';
        const codeLines = [];
        i += 1;
        while (i < lines.length && !new RegExp('^\\s*' + marker + '\\s*$').test(lines[i])) {
          codeLines.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) i += 1;
        out.push(renderCodeBlock(codeLines.join('\n'), language));
        continue;
      }

      const heading = line.match(/^(#{1,4})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        out.push('<h' + level + '>' + inlineMarkdown(heading[2].trim()) + '</h' + level + '>');
        i += 1;
        continue;
      }

      if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        out.push('<hr>');
        i += 1;
        continue;
      }

      if (/^\s*>/.test(line)) {
        const quoteLines = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) {
          quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
          i += 1;
        }
        const first = quoteLines[0] || '';
        const callout = first.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING)\]\s*(.*)$/i);
        if (callout) {
          const type = callout[1].toUpperCase();
          const labels = {
            NOTE: '提示',
            TIP: '小记',
            IMPORTANT: '重要',
            WARNING: '注意'
          };
          const rest = callout[2] ? [callout[2]].concat(quoteLines.slice(1)) : quoteLines.slice(1);
          out.push(
            '<div class="callout"><div class="callout-label">' +
              icon('sparkle') +
              '<span>' +
              escapeHtml(labels[type]) +
              '</span></div>' +
              renderMarkdown(rest.join('\n'), { lead: false }) +
              '</div>'
          );
        } else {
          out.push(
            '<blockquote>' +
              renderMarkdown(quoteLines.join('\n'), { lead: false }) +
              '</blockquote>'
          );
        }
        continue;
      }

      if (/^\s*[-*+]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*[-*+]\s+/, ''));
          i += 1;
        }
        out.push(
          '<ul>' +
            items.map((item) => '<li>' + inlineMarkdown(item) + '</li>').join('') +
            '</ul>'
        );
        continue;
      }

      if (/^\s*\d+[.)]\s+/.test(line)) {
        const items = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
          items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''));
          i += 1;
        }
        out.push(
          '<ol>' +
            items.map((item) => '<li>' + inlineMarkdown(item) + '</li>').join('') +
            '</ol>'
        );
        continue;
      }

      if (
        line.includes('|') &&
        i + 1 < lines.length &&
        /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[i + 1])
      ) {
        const headers = splitTableRow(line);
        const alignments = splitTableRow(lines[i + 1]).map((cell) => {
          const left = cell.startsWith(':');
          const right = cell.endsWith(':');
          if (left && right) return 'center';
          if (right) return 'right';
          if (left) return 'left';
          return '';
        });
        i += 2;
        const rows = [];
        while (i < lines.length && lines[i].trim() && lines[i].includes('|')) {
          rows.push(splitTableRow(lines[i]));
          i += 1;
        }
        let table = '<div class="table-wrap"><table><thead><tr>';
        headers.forEach((cell, index) => {
          const align = alignments[index] ? ' style="text-align:' + alignments[index] + '"' : '';
          table += '<th' + align + '>' + inlineMarkdown(cell) + '</th>';
        });
        table += '</tr></thead><tbody>';
        rows.forEach((row) => {
          table += '<tr>';
          headers.forEach((_, index) => {
            const align = alignments[index] ? ' style="text-align:' + alignments[index] + '"' : '';
            table += '<td' + align + '>' + inlineMarkdown(row[index] || '') + '</td>';
          });
          table += '</tr>';
        });
        table += '</tbody></table></div>';
        out.push(table);
        continue;
      }

      const image = line.match(/^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)\s*$/);
      if (image) {
        out.push(
          '<figure><img src="' +
            escapeAttr(safeUrl(image[2])) +
            '" alt="' +
            escapeAttr(image[1] || '') +
            '" loading="lazy">' +
            (image[1] ? '<figcaption>' + escapeHtml(image[1]) + '</figcaption>' : '') +
            '</figure>'
        );
        i += 1;
        continue;
      }

      const paragraphLines = [line];
      i += 1;
      while (i < lines.length && lines[i].trim() && !isBlockStarter(lines[i])) {
        paragraphLines.push(lines[i]);
        i += 1;
      }
      const isLead = opts.lead !== false && paragraphCount === 0;
      out.push(
        '<p' +
          (isLead ? ' class="lead"' : '') +
          '>' +
          inlineMarkdown(paragraphLines.join('\n')) +
          '</p>'
      );
      paragraphCount += 1;
    }

    return out.join('');
  }

  /* ------------------------------------------------------------------------
     Theme and identity
     ------------------------------------------------------------------------ */

  function resolvedTheme() {
    if (state.ui.theme === 'light') return 'light';
    if (state.ui.theme === 'dark') return 'dark';
    return mediaDark && mediaDark.matches ? 'dark' : 'light';
  }

  function applyTheme() {
    const theme = resolvedTheme();
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    let meta = $('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = theme === 'dark' ? '#151517' : '#ffffff';
    dom.themeQuickBtn.setAttribute(
      'aria-label',
      theme === 'dark' ? '切换到浅色模式' : '切换到深色模式'
    );
    dom.themeQuickBtn.title = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
  }

  function setTheme(preference) {
    state.ui.theme = ['light', 'dark', 'system'].includes(preference) ? preference : 'system';
    saveState();
    applyTheme();
  }

  function renderSiteIdentity() {
    const site = state.site;
    const brandName = $('.brand-name');
    const brandSub = $('.brand-sub');
    const brandMark = $('.brand-mark');
    const authorName = $('.author-copy strong');
    const authorRole = $('.author-copy span');
    const authorAvatar = $('.author-avatar');
    if (brandName) brandName.textContent = site.title;
    if (brandSub) brandSub.textContent = site.subtitle;
    if (brandMark) brandMark.textContent = site.title.slice(0, 1);
    if (authorName) authorName.textContent = site.author;
    if (authorRole) authorRole.textContent = site.role;
    if (authorAvatar) authorAvatar.textContent = site.author.slice(0, 1);
  }

  function updateHead(article) {
    const site = state.site;
    const title = article ? article.title + ' · ' + site.title : site.title + ' · 个人博客';
    const description = article ? article.excerpt || autoExcerpt(article.content) : site.tagline;
    document.title = title;
    const metaDescription = $('meta[name="description"]');
    if (metaDescription) metaDescription.content = description;
    const ogTitle = $('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = title;
    const ogDescription = $('meta[property="og:description"]');
    if (ogDescription) ogDescription.content = description;

    let canonical = $('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    if (article) {
      canonical.href = articleUrl(article.id);
      let schema = $('#article-schema');
      if (!schema) {
        schema = document.createElement('script');
        schema.type = 'application/ld+json';
        schema.id = 'article-schema';
        document.head.appendChild(schema);
      }
      schema.textContent = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        headline: article.title,
        description: description,
        datePublished: article.createdAt,
        dateModified: article.updatedAt,
        author: { '@type': 'Person', name: state.site.author },
        publisher: { '@type': 'Organization', name: state.site.title }
      })
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
    } else {
      canonical.href = location.origin + location.pathname;
      const schema = $('#article-schema');
      if (schema) schema.remove();
    }
  }

  /* ------------------------------------------------------------------------
     Rendering — sidebar
     ------------------------------------------------------------------------ */

  function categoryTreeEmptyHtml() {
    if (!state.categories.length) {
      return (
        '<div class="tree-empty"><div class="tree-empty-icon">' +
        icon('folder-plus') +
        '</div><strong>还没有文章分类</strong><p>先为你的文字开辟一个方向，再开始写第一篇文章。</p><button class="text-btn" type="button" data-action="new-category">新建分类</button></div>'
      );
    }
    const hasSearch = Boolean(searchQuery.trim());
    const hasFilter = state.ui.filter !== 'all';
    const title = hasSearch ? '没有找到相关文章' : '当前筛选下没有文章';
    const hint = hasSearch
      ? '换一个关键词，或清除筛选后再看看。'
      : '试试切换到「全部文章」，或清除当前筛选。';
    return (
      '<div class="tree-empty"><div class="tree-empty-icon">' +
      icon(hasSearch ? 'search' : 'filter') +
      '</div><strong>' +
      title +
      '</strong><p>' +
      hint +
      '</p><button class="text-btn" type="button" data-action="clear-filters">' +
      (hasSearch || hasFilter ? '清除搜索与筛选' : '查看全部文章') +
      '</button></div>'
    );
  }

  function renderSidebar() {
    const visible = visibleArticles();
    const totalVisible = visible.length;
    const active = activeArticle();
    const forceExpanded = Boolean(searchQuery.trim()) || state.ui.filter !== 'all';
    const showEmptyCategories = !searchQuery.trim() && state.ui.filter === 'all';

    dom.articleCount.textContent = totalVisible + ' 篇' + (searchQuery.trim() ? '结果' : '');
    dom.filterBadge.hidden = state.ui.filter === 'all';
    dom.filterBtn.title = '筛选：' + FILTERS[state.ui.filter];
    dom.filterBtn.setAttribute('aria-label', '筛选文章，当前：' + FILTERS[state.ui.filter]);
    dom.sortBtn.title = '排序：' + SORTS[state.ui.sort];
    dom.sortBtn.setAttribute('aria-label', '排序文章，当前：' + SORTS[state.ui.sort]);
    dom.clearSearchBtn.hidden = !searchQuery;
    dom.searchField.classList.toggle('has-query', Boolean(searchQuery));

    if (state.ui.filter !== 'all') {
      dom.filterNote.hidden = false;
      dom.filterNote.innerHTML =
        '<span>筛选：<strong>' +
        FILTERS[state.ui.filter] +
        '</strong> · ' +
        totalVisible +
        ' 篇</span><button type="button" data-action="clear-filter-note" aria-label="清除筛选">' +
        icon('x') +
        '</button>';
    } else {
      dom.filterNote.hidden = true;
      dom.filterNote.innerHTML = '';
    }

    if (!state.categories.length) {
      dom.categoryTree.innerHTML = categoryTreeEmptyHtml();
      return;
    }

    const groups = state.categories
      .map((category) => {
        const articles = visible.filter((article) => article.categoryId === category.id);
        return { category, articles };
      })
      .filter((group) => showEmptyCategories || group.articles.length);

    if (!groups.length) {
      dom.categoryTree.innerHTML = categoryTreeEmptyHtml();
      return;
    }

    let html = '';
    if (searchQuery.trim()) {
      html +=
        '<div class="search-status"><span>搜索 “' +
        escapeHtml(searchQuery.trim()) +
        '” · <strong>' +
        totalVisible +
        '</strong> 篇</span></div>';
    }

    groups.forEach((group) => {
      const category = group.category;
      const isExpanded = forceExpanded || !state.ui.collapsedCategoryIds.includes(category.id);
      const isActiveGroup = active && active.categoryId === category.id;
      const articleHtml = group.articles.length
        ? group.articles
            .map((article) => {
              const selected = active && active.id === article.id;
              return (
                '<div class="article-row' +
                (selected ? ' is-current' : '') +
                (article.status === 'draft' ? ' is-draft' : '') +
                '" style="--category-color:' +
                escapeAttr(category.color) +
                '"><button class="article-link" type="button" data-open-article="' +
                escapeAttr(article.id) +
                '"' +
                (selected ? ' aria-current="page"' : '') +
                ' title="' +
                escapeAttr(article.title) +
                (article.status === 'draft' ? '（草稿）' : '') +
                '"><span class="article-dot" aria-hidden="true"></span><span class="article-title">' +
                escapeHtml(article.title) +
                '</span><span class="article-date">' +
                (article.status === 'draft' ? '草稿' : formatDateShort(article.updatedAt)) +
                '</span></button><button class="article-more" type="button" data-action="article-menu" data-article-id="' +
                escapeAttr(article.id) +
                '" aria-label="文章操作：' +
                escapeAttr(article.title) +
                '" aria-haspopup="menu" aria-expanded="false">' +
                icon('more') +
                '</button></div>'
              );
            })
            .join('')
        : '<div class="category-empty">这个分类还没有文章</div>';

      html +=
        '<div class="category-group' +
        (isExpanded ? ' is-expanded' : '') +
        (isActiveGroup ? ' is-active' : '') +
        '" data-category-group="' +
        escapeAttr(category.id) +
        '" style="--category-color:' +
        escapeAttr(category.color) +
        '"><div class="category-row"><button class="category-toggle" type="button" data-action="toggle-category" data-category-id="' +
        escapeAttr(category.id) +
        '" aria-expanded="' +
        (isExpanded ? 'true' : 'false') +
        '" title="' +
        escapeAttr(category.description || category.name) +
        '">' +
        icon('chevron-right', 'category-chevron') +
        icon('folder', 'category-folder') +
        '<span class="category-name">' +
        escapeHtml(category.name) +
        '</span></button><span class="category-total">' +
        group.articles.length +
        '</span><button class="category-add" type="button" data-action="new-article-in-category" data-category-id="' +
        escapeAttr(category.id) +
        '" aria-label="在「' +
        escapeAttr(category.name) +
        '」中新建文章" title="在这个分类中新建文章">' +
        icon('plus') +
        '</button><button class="category-more" type="button" data-action="category-menu" data-category-id="' +
        escapeAttr(category.id) +
        '" aria-label="分类操作：' +
        escapeAttr(category.name) +
        '" aria-haspopup="menu" aria-expanded="false">' +
        icon('more') +
        '</button></div><div class="category-articles"' +
        (isExpanded ? '' : ' hidden') +
        '>' +
        articleHtml +
        '</div></div>';
    });

    dom.categoryTree.innerHTML = html;
  }

  /* ------------------------------------------------------------------------
     Rendering — article
     ------------------------------------------------------------------------ */

  function promptMeta(article, category, stats) {
    const parts = [];
    if (category) {
      parts.push(
        '<span class="prompt-category" style="--category-color:' +
          escapeAttr(category.color) +
          '">' +
          escapeHtml(category.name) +
          '</span>'
      );
    }
    parts.push('<span>' + formatDateLong(article.createdAt) + '</span>');
    parts.push('<span>' + stats.minutes + ' 分钟阅读</span>');
    if (article.status === 'draft') parts.push('<span class="status-pill">草稿</span>');
    return parts.join('<span class="meta-sep">·</span>');
  }

  function articleFootHtml(article, stats) {
    const tags = article.tags.length
      ? article.tags
          .map(
            (tag) =>
              '<button class="tag-pill" type="button" data-action="search-tag" data-tag="' +
              escapeAttr(tag) +
              '" title="搜索标签：' +
              escapeAttr(tag) +
              '">' +
              escapeHtml(tag) +
              '</button>'
          )
          .join('')
      : '';
    return (
      '<div class="article-foot"><div class="article-tags">' +
      tags +
      '</div><div class="article-end-meta"><span class="article-end-mark" aria-hidden="true">余</span><span>约 ' +
      formatNumber(stats.characters) +
      ' 字</span><span>' +
      stats.minutes +
      ' 分钟</span></div></div><div class="article-actions"><button class="mini-btn" type="button" data-action="copy-link">' +
      icon('share') +
      '<span>复制链接</span></button><button class="mini-btn" type="button" data-action="copy-markdown">' +
      icon('copy') +
      '<span>复制 Markdown</span></button><button class="mini-btn" type="button" data-action="export-markdown">' +
      icon('download') +
      '<span>导出 .md</span></button></div>'
    );
  }

  function renderBreadcrumbs(article, category) {
    if (!article) {
      dom.breadcrumbs.innerHTML =
        '<button class="crumb" type="button" data-breadcrumb="home">' +
        escapeHtml(state.site.title) +
        '</button><span class="crumb-sep">/</span><span class="crumb crumb-current">文章库</span>';
      return;
    }
    dom.breadcrumbs.innerHTML =
      '<button class="crumb" type="button" data-breadcrumb="home" title="回到最近更新">' +
      escapeHtml(state.site.title) +
      '</button><span class="crumb-sep">/</span>' +
      (category
        ? '<button class="crumb" type="button" data-breadcrumb="category" data-category-id="' +
          escapeAttr(category.id) +
          '" title="定位到分类"><span class="crumb-dot" style="--crumb-color:' +
          escapeAttr(category.color) +
          '"></span>' +
          escapeHtml(category.name) +
          '</button><span class="crumb-sep hide-mobile">/</span>'
        : '') +
      '<span class="crumb crumb-current" title="' +
      escapeAttr(article.title) +
      '">' +
      escapeHtml(article.title) +
      '</span>';
  }

  function setTopbarEnabled(enabled) {
    dom.editArticleBtn.disabled = !enabled;
    dom.shareArticleBtn.disabled = !enabled;
    dom.articleMenuBtn.disabled = !enabled;
  }

  function renderEmpty() {
    previousRenderedArticleId = null;
    setTopbarEnabled(false);
    dom.readingChip.innerHTML = '';
    dom.readingChip.hidden = true;
    dom.readerDockWrap.hidden = true;
    renderBreadcrumbs(null, null);
    dom.articleStage.innerHTML =
      '<div class="empty-state"><div class="empty-glyph">' +
      icon('book') +
      '</div><h2>从第一篇文章开始</h2><p>这里还很安静。写下一个标题，让这张书桌拥有第一页。</p><button class="primary-btn" type="button" data-action="new-article">' +
      icon('edit') +
      '<span>写一篇文章</span></button></div>';
    updateHead(null);
    updateReadingProgress();
  }

  function renderMain() {
    const article = activeArticle();
    if (!article) {
      renderEmpty();
      return;
    }

    const category = categoryById(article.categoryId);
    const stats = articleStats(article);
    const allByUpdated = state.articles
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const number = allByUpdated.findIndex((item) => item.id === article.id) + 1;
    const editedDifferentDay = !isSameDay(article.createdAt, article.updatedAt);

    setTopbarEnabled(true);
    dom.readingChip.hidden = false;
    dom.readingChip.innerHTML = icon('clock') + '<span>' + stats.minutes + ' 分钟</span>';
    renderBreadcrumbs(article, category);

    dom.articleStage.innerHTML =
      '<header class="article-head"><div class="prompt-wrap"><div class="prompt-meta">' +
      promptMeta(article, category, stats) +
      '</div><div class="prompt-bubble"><div class="prompt-overline">文章 · ' +
      String(number).padStart(2, '0') +
      '</div><h1>' +
      escapeHtml(article.title) +
      '</h1>' +
      (article.tags.length
        ? '<div class="prompt-tags">' +
          article.tags
            .map((tag) => '<span class="prompt-tag">' + escapeHtml(tag) + '</span>')
            .join('') +
          '</div>'
        : '') +
      '</div></div></header><article class="article-response"><div class="assistant-avatar" aria-hidden="true">' +
      icon('fish') +
      '</div><div class="response-main"><div class="response-byline"><span class="response-name">' +
      escapeHtml(state.site.author) +
      '</span><span class="response-divider" aria-hidden="true"></span><span>写于 ' +
      formatDateLong(article.createdAt) +
      '</span>' +
      (editedDifferentDay
        ? '<span class="response-divider response-edited-divider" aria-hidden="true"></span><span class="response-edited">改于 ' +
          formatDateLong(article.updatedAt) +
          '</span>'
        : '') +
      '</div><div class="article-body" id="articleBody">' +
      renderMarkdown(article.content) +
      '</div>' +
      articleFootHtml(article, stats) +
      '</div></article>';

    decorateCodeBlocks();
    updateHead(article);
    updateDock();

    if (previousRenderedArticleId !== article.id) {
      dom.contentScroll.scrollTop = 0;
    }
    updateReadingProgress();
    previousRenderedArticleId = article.id;
  }

  function decorateCodeBlocks() {
    $$('.code-block', dom.articleStage).forEach((block) => {
      const button = $('[data-copy-code]', block);
      const code = $('code', block);
      if (button && code) button.dataset.code = code.textContent || '';
    });
  }

  function updateDock() {
    const sorted = state.articles
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const article = activeArticle();
    if (!article || !sorted.length) {
      dom.readerDockWrap.hidden = true;
      return;
    }
    dom.readerDockWrap.hidden = false;
    const index = sorted.findIndex((item) => item.id === article.id);
    const prev = sorted[index - 1];
    const next = sorted[index + 1];
    dom.dockPosition.textContent =
      String(index + 1).padStart(2, '0') + ' / ' + String(sorted.length).padStart(2, '0');
    dom.prevArticleBtn.disabled = !prev;
    dom.nextArticleBtn.disabled = !next;
    dom.prevArticleBtn.title = prev ? '上一篇：' + prev.title : '已经是第一篇';
    dom.nextArticleBtn.title = next ? '下一篇：' + next.title : '已经是最后一篇';
  }

  function updateReadingProgress() {
    const scroll = dom.contentScroll;
    const max = scroll.scrollHeight - scroll.clientHeight;
    const ratio = max > 0 ? Math.min(1, Math.max(0, scroll.scrollTop / max)) : 0;
    const percent = (ratio * 100).toFixed(2) + '%';
    dom.readingBar.style.width = percent;
    dom.dockBar.style.width = percent;
  }

  function renderAll() {
    renderSidebar();
    renderMain();
  }

  /* ------------------------------------------------------------------------
     Navigation
     ------------------------------------------------------------------------ */

  function articleUrl(id) {
    const url = new URL(location.href);
    url.hash = '#/article/' + encodeURIComponent(id);
    return url.toString();
  }

  function hashArticleId() {
    const match = location.hash.match(/^#\/article\/([^/?#]+)/);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch (error) {
      return null;
    }
  }

  function setHash(id, replace) {
    const hash = '#/article/' + encodeURIComponent(id);
    if (location.hash === hash) return;
    try {
      if (replace) history.replaceState(null, '', hash);
      else history.pushState(null, '', hash);
    } catch (error) {
      location.hash = hash;
    }
  }

  function clearHash() {
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch (error) {
      location.hash = '';
    }
  }

  function setActiveArticle(id, options) {
    const opts = options || {};
    const article = articleById(id);
    if (!article) return;
    closePopover();
    state.ui.activeArticleId = article.id;
    state.ui.collapsedCategoryIds = state.ui.collapsedCategoryIds.filter(
      (categoryId) => categoryId !== article.categoryId
    );
    saveState();
    if (opts.pushHistory !== false) setHash(article.id, false);
    if (opts.closeMobile !== false) closeMobileNav();
    renderSidebar();
    renderMain();
  }

  function goHome() {
    const sorted = state.articles
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (sorted.length) {
      if (sorted[0].id === state.ui.activeArticleId) {
        dom.contentScroll.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setActiveArticle(sorted[0].id);
      }
    } else {
      state.ui.activeArticleId = null;
      saveState();
      renderAll();
    }
  }

  function navigateAdjacent(direction) {
    const sorted = state.articles
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    const current = state.ui.activeArticleId;
    const index = sorted.findIndex((article) => article.id === current);
    const next = sorted[index + direction];
    if (next) setActiveArticle(next.id);
  }

  function revealCategory(categoryId) {
    if (window.innerWidth <= 900) openMobileNav();
    else if (document.body.classList.contains('sidebar-collapsed')) {
      document.body.classList.remove('sidebar-collapsed');
      state.ui.sidebarCollapsed = false;
      saveState();
      syncSidebarAccessibility();
    }
    requestAnimationFrame(() => {
      const group = $$('.category-group').find(
        (element) => element.dataset.categoryGroup === categoryId
      );
      if (group) {
        group.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const toggle = $('.category-toggle', group);
        if (toggle) toggle.focus({ preventScroll: true });
      }
    });
  }

  function syncSidebarAccessibility() {
    const hidden =
      window.innerWidth <= 900
        ? !document.body.classList.contains('mobile-nav-open')
        : document.body.classList.contains('sidebar-collapsed');
    dom.sidebar.inert = hidden;
    dom.sidebar.setAttribute('aria-hidden', String(hidden));
  }

  function openMobileNav() {
    if (window.innerWidth > 900) return;
    document.body.classList.add('mobile-nav-open');
    dom.sidebarScrim.hidden = false;
    dom.navToggle.setAttribute('aria-expanded', 'true');
    syncSidebarAccessibility();
  }

  function closeMobileNav() {
    document.body.classList.remove('mobile-nav-open');
    dom.sidebarScrim.hidden = true;
    dom.navToggle.setAttribute('aria-expanded', 'false');
    syncSidebarAccessibility();
  }

  function toggleSidebar() {
    if (window.innerWidth <= 900) {
      if (document.body.classList.contains('mobile-nav-open')) closeMobileNav();
      else openMobileNav();
      return;
    }
    if (document.body.classList.contains('sidebar-collapsed')) {
      document.body.classList.remove('sidebar-collapsed');
      state.ui.sidebarCollapsed = false;
    } else {
      document.body.classList.add('sidebar-collapsed');
      state.ui.sidebarCollapsed = true;
    }
    saveState();
    syncSidebarAccessibility();
  }

  /* ------------------------------------------------------------------------
     Search, filter, sort
     ------------------------------------------------------------------------ */

  function setSearchValue(value, options) {
    const opts = options || {};
    searchQuery = String(value || '');
    dom.searchInput.value = searchQuery;
    dom.searchField.classList.toggle('has-query', Boolean(searchQuery));
    dom.clearSearchBtn.hidden = !searchQuery;
    renderSidebar();
    if (opts.focus) {
      dom.searchInput.focus();
      if (opts.select) dom.searchInput.select();
    }
  }

  function clearFilters() {
    searchQuery = '';
    dom.searchInput.value = '';
    state.ui.filter = 'all';
    saveState();
    renderSidebar();
  }

  /* ------------------------------------------------------------------------
     Popovers
     ------------------------------------------------------------------------ */

  function closePopover(options) {
    const opts = options || {};
    if (!activePopover) return;
    const anchor = activePopover.anchor;
    const popover = activePopover.popover;
    activePopover = null;
    if (popover && popover.parentNode) popover.remove();
    if (anchor && anchor.isConnected) {
      anchor.setAttribute('aria-expanded', 'false');
      if (opts.restoreFocus) {
        try {
          anchor.focus({ preventScroll: true });
        } catch (error) {}
      }
    }
  }

  function openPopover(anchor, html, options) {
    const opts = options || {};
    if (activePopover && activePopover.anchor === anchor) {
      closePopover({ restoreFocus: true });
      return null;
    }
    closePopover();
    const popover = document.createElement('div');
    popover.className = 'popover' + (opts.className ? ' ' + opts.className : '');
    popover.setAttribute('role', opts.role || 'menu');
    popover.innerHTML = html;
    dom.menuRoot.appendChild(popover);
    popover.style.visibility = 'hidden';

    const rect = anchor.getBoundingClientRect();
    const margin = 8;
    const width = popover.offsetWidth;
    const height = popover.offsetHeight;
    let left = rect.left;
    let top = rect.bottom + 6;

    if (left + width > window.innerWidth - margin) left = rect.right - width;
    if (left < margin) left = margin;
    if (top + height > window.innerHeight - margin) {
      top = Math.max(margin, rect.top - height - 6);
    }
    if (top < margin) top = margin;

    popover.style.left = Math.round(left) + 'px';
    popover.style.top = Math.round(top) + 'px';
    popover.style.visibility = '';

    anchor.setAttribute('aria-expanded', 'true');
    activePopover = { anchor, popover };

    const firstButton = $('button:not([disabled])', popover);
    if (firstButton) {
      requestAnimationFrame(() => firstButton.focus({ preventScroll: true }));
    }
    return popover;
  }

  function bindPopoverActions(popover, callback) {
    $$('[data-menu]', popover).forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.menu;
        closePopover({ restoreFocus: true });
        callback(action, button);
      });
    });
  }

  function showFilterMenu(anchor) {
    if (activePopover && activePopover.anchor === anchor) {
      closePopover({ restoreFocus: true });
      return;
    }
    const counts = {
      all: state.articles.length,
      published: state.articles.filter((article) => article.status === 'published').length,
      draft: state.articles.filter((article) => article.status === 'draft').length
    };
    const items = Object.keys(FILTERS)
      .map((key) => {
        const selected = state.ui.filter === key;
        return (
          '<button class="popover-item' +
          (selected ? ' is-selected' : '') +
          '" type="button" role="menuitemradio" aria-checked="' +
          selected +
          '" data-filter-value="' +
          key +
          '"><span class="popover-item-label">' +
          FILTERS[key] +
          '</span><span class="popover-note" style="padding:0;border:0;margin:0;font-size:9px">' +
          counts[key] +
          '</span>' +
          (selected ? icon('check', 'check') : '') +
          '</button>'
        );
      })
      .join('');

    const popover = openPopover(
      anchor,
      '<div class="popover-group-label">显示</div>' +
        items +
        '<div class="popover-divider"></div><button class="popover-item" type="button" data-reset-filter>' +
        icon('reset') +
        '<span class="popover-item-label">重置筛选</span></button>',
      { role: 'menu' }
    );
    if (!popover) return;
    $$('[data-filter-value]', popover).forEach((button) => {
      button.addEventListener('click', () => {
        state.ui.filter = button.dataset.filterValue;
        saveState();
        closePopover({ restoreFocus: true });
        renderSidebar();
      });
    });
    const reset = $('[data-reset-filter]', popover);
    if (reset) {
      reset.addEventListener('click', () => {
        state.ui.filter = 'all';
        saveState();
        closePopover({ restoreFocus: true });
        renderSidebar();
      });
    }
  }

  function showSortMenu(anchor) {
    if (activePopover && activePopover.anchor === anchor) {
      closePopover({ restoreFocus: true });
      return;
    }
    const items = Object.keys(SORTS)
      .map((key) => {
        const selected = state.ui.sort === key;
        return (
          '<button class="popover-item' +
          (selected ? ' is-selected' : '') +
          '" type="button" role="menuitemradio" aria-checked="' +
          selected +
          '" data-sort-value="' +
          key +
          '"><span class="popover-item-label">' +
          SORTS[key] +
          '</span>' +
          (selected ? icon('check', 'check') : '') +
          '</button>'
        );
      })
      .join('');
    const popover = openPopover(
      anchor,
      '<div class="popover-group-label">文章排序</div>' + items,
      { role: 'menu' }
    );
    if (!popover) return;
    $$('[data-sort-value]', popover).forEach((button) => {
      button.addEventListener('click', () => {
        state.ui.sort = button.dataset.sortValue;
        saveState();
        closePopover({ restoreFocus: true });
        renderSidebar();
      });
    });
  }

  function showArticleMenu(anchor, articleId) {
    if (activePopover && activePopover.anchor === anchor) {
      closePopover({ restoreFocus: true });
      return;
    }
    const article = articleById(articleId);
    if (!article) return;
    const draftItem =
      article.status === 'draft'
        ? '<button class="popover-item" type="button" role="menuitem" data-menu="publish">' +
          icon('check') +
          '<span class="popover-item-label">发布这篇文章</span></button>'
        : '';
    const popover = openPopover(
      anchor,
      draftItem +
        '<button class="popover-item" type="button" role="menuitem" data-menu="edit">' +
        icon('edit') +
        '<span class="popover-item-label">编辑文章</span></button><button class="popover-item" type="button" role="menuitem" data-menu="copy-link">' +
        icon('share') +
        '<span class="popover-item-label">复制文章链接</span></button><button class="popover-item" type="button" role="menuitem" data-menu="copy-markdown">' +
        icon('copy') +
        '<span class="popover-item-label">复制 Markdown</span></button><button class="popover-item" type="button" role="menuitem" data-menu="export-markdown">' +
        icon('download') +
        '<span class="popover-item-label">导出 Markdown</span></button><div class="popover-divider"></div><button class="popover-item is-danger" type="button" role="menuitem" data-menu="delete">' +
        icon('trash') +
        '<span class="popover-item-label">删除文章</span></button>',
      { role: 'menu' }
    );
    if (!popover) return;
    bindPopoverActions(popover, (action) => {
      if (action === 'edit') openArticleEditor(article.id);
      else if (action === 'publish') publishArticle(article.id);
      else if (action === 'copy-link') copyText(articleUrl(article.id), '文章链接已复制');
      else if (action === 'copy-markdown') copyText(articleMarkdown(article), 'Markdown 已复制');
      else if (action === 'export-markdown') exportArticle(article);
      else if (action === 'delete') deleteArticle(article.id);
    });
  }

  function showCategoryMenu(anchor, categoryId) {
    if (activePopover && activePopover.anchor === anchor) {
      closePopover({ restoreFocus: true });
      return;
    }
    const category = categoryById(categoryId);
    if (!category) return;
    const popover = openPopover(
      anchor,
      '<button class="popover-item" type="button" role="menuitem" data-menu="new-article">' +
        icon('plus') +
        '<span class="popover-item-label">在此分类中新建文章</span></button><button class="popover-item" type="button" role="menuitem" data-menu="edit">' +
        icon('edit') +
        '<span class="popover-item-label">重命名与编辑</span></button><div class="popover-divider"></div><button class="popover-item is-danger" type="button" role="menuitem" data-menu="delete">' +
        icon('trash') +
        '<span class="popover-item-label">删除分类</span></button>',
      { role: 'menu' }
    );
    if (!popover) return;
    bindPopoverActions(popover, (action) => {
      if (action === 'new-article') openArticleEditor(null, category.id);
      else if (action === 'edit') openCategoryDialog('rename', category.id);
      else if (action === 'delete') deleteCategory(category.id);
    });
  }

  function showSettingsMenu(anchor) {
    if (activePopover && activePopover.anchor === anchor) {
      closePopover({ restoreFocus: true });
      return;
    }
    const theme = state.ui.theme;
    const themeButton = (value, label, iconName) =>
      '<button class="theme-option' +
      (theme === value ? ' is-selected' : '') +
      '" type="button" data-theme-choice="' +
      value +
      '" aria-pressed="' +
      (theme === value) +
      '">' +
      icon(iconName) +
      '<span>' +
      label +
      '</span></button>';
    const popover = openPopover(
      anchor,
      '<div class="settings-popover-inner"><div class="settings-title">' +
        escapeHtml(state.site.title) +
        '</div><div class="settings-subtitle">' +
        escapeHtml(state.site.tagline) +
        '</div><div class="settings-section"><div class="settings-section-label">外观</div><div class="theme-grid">' +
        themeButton('light', '浅色', 'sun') +
        themeButton('dark', '深色', 'moon') +
        themeButton('system', '跟随系统', 'monitor') +
        '</div></div><div class="settings-section"><div class="settings-section-label">文章数据</div><button class="popover-item" type="button" data-settings-action="export">' +
        icon('download') +
        '<span class="popover-item-label">导出全部文章</span><kbd>JSON</kbd></button><button class="popover-item" type="button" data-settings-action="import">' +
        icon('upload') +
        '<span class="popover-item-label">从备份导入</span></button><button class="popover-item" type="button" data-settings-action="reset">' +
        icon('reset') +
        '<span class="popover-item-label">恢复示例内容</span></button></div><div class="settings-foot">文章保存在当前浏览器。定期导出备份，换一台设备也能带走它们。 · v' +
        APP_VERSION +
        '</div></div>',
      { className: 'settings-popover', role: 'dialog' }
    );
    if (!popover) return;

    $$('[data-theme-choice]', popover).forEach((button) => {
      button.addEventListener('click', () => {
        setTheme(button.dataset.themeChoice);
        $$('[data-theme-choice]', popover).forEach((item) => {
          const selected = item.dataset.themeChoice === state.ui.theme;
          item.classList.toggle('is-selected', selected);
          item.setAttribute('aria-pressed', String(selected));
        });
      });
    });

    $$('[data-settings-action]', popover).forEach((button) => {
      button.addEventListener('click', () => {
        const action = button.dataset.settingsAction;
        closePopover({ restoreFocus: true });
        if (action === 'export') exportAll();
        else if (action === 'import') dom.importFile.click();
        else if (action === 'reset') resetDemo();
      });
    });
  }

  /* ------------------------------------------------------------------------
     Modal primitives
     ------------------------------------------------------------------------ */

  function closeModal() {
    if (!activeModal) return;
    const focusTarget = lastModalFocus;
    activeModal = null;
    dom.modalRoot.classList.remove('is-open');
    dom.modalRoot.innerHTML = '';
    dom.appShell.inert = false;
    if (focusTarget && focusTarget.isConnected) {
      try {
        focusTarget.focus({ preventScroll: true });
      } catch (error) {}
    }
  }

  function dismissModal() {
    if (!activeModal) return;
    const onDismiss = activeModal.onDismiss;
    closeModal();
    if (typeof onDismiss === 'function') onDismiss();
  }

  function showModal(options) {
    closePopover();
    if (activeModal) closeModal();
    lastModalFocus = document.activeElement;
    const sizeClass = options.size ? ' ' + options.size : '';
    dom.modalRoot.innerHTML =
      '<div class="modal-backdrop" data-modal-backdrop><div class="modal-panel' +
      sizeClass +
      '" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabindex="-1"><header class="modal-header"><div class="modal-heading"><h2 id="modal-title">' +
      escapeHtml(options.title || '') +
      '</h2>' +
      (options.subtitle ? '<p>' + escapeHtml(options.subtitle) + '</p>' : '') +
      '</div><button class="modal-close" type="button" data-modal-close aria-label="关闭">' +
      icon('x') +
      '</button></header><div class="modal-body' +
      (options.bodyClass ? ' ' + options.bodyClass : '') +
      '">' +
      (options.body || '') +
      '</div>' +
      (options.footer ? '<footer class="modal-footer">' + options.footer + '</footer>' : '') +
      '</div></div>';
    dom.modalRoot.classList.add('is-open');
    dom.appShell.inert = true;

    const modal = {
      panel: $('.modal-panel', dom.modalRoot),
      close: closeModal,
      onDismiss: options.onDismiss || null
    };
    activeModal = modal;

    const backdrop = $('[data-modal-backdrop]', dom.modalRoot);
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) dismissModal();
    });
    const closeButton = $('[data-modal-close]', dom.modalRoot);
    if (closeButton) closeButton.addEventListener('click', dismissModal);

    if (options.onMount) options.onMount(modal);
    requestAnimationFrame(() => {
      const target =
        typeof options.initialFocus === 'string'
          ? $(options.initialFocus, modal.panel)
          : options.initialFocus || $('.modal-close', dom.modalRoot);
      if (target && target.isConnected) target.focus({ preventScroll: true });
    });
    return modal;
  }

  function confirmAction(options) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        closeModal();
        resolve(value);
      };
      showModal({
        size: 'is-confirm',
        title: options.title || '请确认',
        subtitle: options.subtitle || '这个操作需要你的确认',
        body: '<p class="confirm-copy">' + (options.message || '') + '</p>',
        bodyClass: 'is-confirm',
        initialFocus: '[data-confirm-cancel]',
        footer:
          '<div class="modal-foot-left">' +
          (options.footnote || '') +
          '</div><div class="modal-actions"><button class="modal-btn" type="button" data-confirm-cancel>取消</button><button class="modal-btn ' +
          (options.danger === false ? 'is-primary' : 'is-danger') +
          '" type="button" data-confirm-ok>' +
          escapeHtml(options.confirmLabel || '确认') +
          '</button></div>',
        onMount(modal) {
          $('[data-confirm-cancel]', modal.panel).addEventListener('click', () => finish(false));
          $('[data-confirm-ok]', modal.panel).addEventListener('click', () => finish(true));
          requestAnimationFrame(() => {
            const cancel = $('[data-confirm-cancel]', modal.panel);
            if (cancel) cancel.focus({ preventScroll: true });
          });
        },
        onDismiss: () => finish(false)
      });
    });
  }

  /* ------------------------------------------------------------------------
     Article editor
     ------------------------------------------------------------------------ */

  function openArticleEditor(articleId, presetCategoryId) {
    const editing = articleId ? articleById(articleId) : null;
    if (!state.categories.length) {
      showToast('请先新建一个文章分类', 'error');
      openCategoryDialog('create');
      return;
    }
    const selectedCategory =
      (editing && editing.categoryId) ||
      (presetCategoryId && categoryById(presetCategoryId) && presetCategoryId) ||
      (state.ui.activeArticleId && activeArticle() && activeArticle().categoryId) ||
      state.categories[0].id;
    let selectedStatus = editing ? editing.status : 'published';

    const options = state.categories
      .map(
        (category) =>
          '<option value="' +
          escapeAttr(category.id) +
          '"' +
          (category.id === selectedCategory ? ' selected' : '') +
          '>' +
          escapeHtml(category.name) +
          '</option>'
      )
      .join('');

    const body =
      '<form class="editor-form" id="articleEditorForm" novalidate><div class="editor-title-wrap"><input class="editor-title" id="editorTitle" type="text" maxlength="120" placeholder="给这篇文章一个标题…" value="' +
      escapeAttr(editing ? editing.title : '') +
      '" autocomplete="off"></div><div class="form-grid"><label><span class="field-label">分类</span><select class="field-select" id="editorCategory">' +
      options +
      '</select></label><div><span class="field-label">状态</span><div class="segmented" id="editorStatus" role="group" aria-label="文章状态"><button type="button" data-status="published" aria-pressed="' +
      (selectedStatus === 'published') +
      '">发布</button><button type="button" data-status="draft" aria-pressed="' +
      (selectedStatus === 'draft') +
      '">草稿</button></div></div><label><span class="field-label">标签 <span class="optional">用逗号分隔</span></span><input class="field-input" id="editorTags" type="text" maxlength="120" placeholder="写作, 日常" value="' +
      escapeAttr(editing ? editing.tags.join(', ') : '') +
      '" autocomplete="off"></label></div><label><span class="field-label">摘要 <span class="optional">留空则自动生成</span></span><input class="field-input" id="editorExcerpt" type="text" maxlength="180" placeholder="用一两句话介绍这篇文章" value="' +
      escapeAttr(editing ? editing.excerpt : '') +
      '" autocomplete="off"></label><div><span class="field-label">正文 <span class="optional">支持 Markdown</span></span><textarea class="field-textarea" id="editorContent" spellcheck="false" placeholder="从这里开始写…">' +
      escapeHtml(editing ? editing.content : '') +
      '</textarea><div class="markdown-hint"><span><code>## 标题</code></span><span><code>**粗体**</code></span><span><code>&gt; 引用</code></span><span><code>`代码`</code></span><span><code>- 列表</code></span></div></div><p class="form-error" id="editorError" role="alert"></p></form>';

    const footer =
      '<span class="modal-foot-left" id="editorWordCount">约 0 字</span><div class="modal-actions"><button class="modal-btn" type="button" data-editor-cancel>取消</button><button class="modal-btn is-primary" type="button" data-editor-save>' +
      (editing ? '保存修改' : '发布文章') +
      '</button></div>';

    const modal = showModal({
      size: '',
      title: editing ? '编辑文章' : '新建文章',
      subtitle: editing ? '修改会同步保存到这台浏览器' : '一张干净的稿纸，写完之后再决定要放在哪里',
      body,
      footer,
      initialFocus: '#editorTitle',
      onMount(modal) {
        const panel = modal.panel;
        const titleInput = $('#editorTitle', panel);
        const contentInput = $('#editorContent', panel);
        const error = $('#editorError', panel);
        const save = $('[data-editor-save]', panel);
        const cancel = $('[data-editor-cancel]', panel);
        const wordCount = $('#editorWordCount', panel);
        const statusButtons = $$('[data-status]', panel);

        const updateWordCount = () => {
          const stats = articleStats({ content: contentInput.value });
          wordCount.textContent =
            '约 ' + formatNumber(stats.characters) + ' 字 · ' + stats.minutes + ' 分钟';
        };
        const updateSaveLabel = () => {
          if (editing) save.textContent = '保存修改';
          else save.textContent = selectedStatus === 'draft' ? '保存草稿' : '发布文章';
        };
        const showError = (message) => {
          error.textContent = message;
          error.classList.add('is-visible');
        };
        const clearError = () => {
          error.textContent = '';
          error.classList.remove('is-visible');
        };

        statusButtons.forEach((button) => {
          button.addEventListener('click', () => {
            selectedStatus = button.dataset.status;
            statusButtons.forEach((item) =>
              item.setAttribute('aria-pressed', String(item === button))
            );
            updateSaveLabel();
            clearError();
          });
        });

        const submit = () => {
          const title = titleInput.value.trim();
          const content = contentInput.value;
          const categoryId = $('#editorCategory', panel).value;
          if (!title) {
            showError('请先给这篇文章一个标题。');
            titleInput.focus();
            return;
          }
          if (!categoryById(categoryId)) {
            showError('请选择一个有效的文章分类。');
            return;
          }
          if (selectedStatus === 'published' && !content.trim()) {
            showError('发布前请先写一点正文，或把状态改为草稿。');
            contentInput.focus();
            return;
          }
          const now = new Date().toISOString();
          const tags = $('#editorTags', panel)
            .value.split(/[,，、;；\n]/)
            .map((tag) => tag.trim().replace(/^#+/, ''))
            .filter(Boolean);
          const excerptInput = $('#editorExcerpt', panel).value.trim();

          let saved;
          if (editing) {
            saved = editing;
            saved.title = title;
            saved.categoryId = categoryId;
            saved.tags = Array.from(new Set(tags)).slice(0, 8);
            saved.excerpt = excerptInput || autoExcerpt(content);
            saved.status = selectedStatus;
            saved.content = content;
            saved.updatedAt = now;
          } else {
            saved = {
              id: uid('article'),
              categoryId,
              title,
              excerpt: excerptInput || autoExcerpt(content),
              status: selectedStatus,
              tags: Array.from(new Set(tags)).slice(0, 8),
              createdAt: now,
              updatedAt: now,
              content
            };
            state.articles.push(saved);
          }

          state.ui.activeArticleId = saved.id;
          state.ui.collapsedCategoryIds = state.ui.collapsedCategoryIds.filter(
            (id) => id !== saved.categoryId
          );
          if (!articleMatchesFilter(saved) || !articleMatchesQuery(saved, searchQuery.trim())) {
            searchQuery = '';
            dom.searchInput.value = '';
            dom.searchField.classList.remove('has-query');
            dom.clearSearchBtn.hidden = true;
            state.ui.filter = 'all';
          }
          saveState();
          setHash(saved.id, false);
          closeModal();
          renderAll();
          showToast(
            editing
              ? '文章修改已保存'
              : selectedStatus === 'draft'
                ? '草稿已保存'
                : '文章已发布',
            'success'
          );
        };

        cancel.addEventListener('click', () => closeModal());
        save.addEventListener('click', submit);
        titleInput.addEventListener('input', clearError);
        contentInput.addEventListener('input', () => {
          updateWordCount();
          clearError();
        });
        $('#articleEditorForm', panel).addEventListener('submit', (event) => {
          event.preventDefault();
          submit();
        });
        panel.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          }
        });
        updateWordCount();
        updateSaveLabel();
      }
    });

    if (modal) {
      const input = $('#editorTitle', dom.modalRoot);
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }
  }

  /* ------------------------------------------------------------------------
     Category editor
     ------------------------------------------------------------------------ */

  function openCategoryDialog(mode, categoryId) {
    const editing = mode === 'rename' && categoryId ? categoryById(categoryId) : null;
    if (mode === 'rename' && !editing) return;
    const usedColors = new Set(state.categories.map((category) => category.color));
    const suggestedColor =
      CATEGORY_COLORS.find((color) => !usedColors.has(color)) || CATEGORY_COLORS[0];
    let selectedColor = editing ? editing.color : suggestedColor;
    const colors = Array.from(new Set([].concat(CATEGORY_COLORS, selectedColor)));
    const colorHtml = colors
      .map(
        (color) =>
          '<button class="color-swatch" type="button" data-color="' +
          color +
          '" style="--swatch:' +
          color +
          '" aria-label="选择颜色 ' +
          color +
          '" aria-pressed="' +
          (color === selectedColor) +
          '">' +
          (color === selectedColor ? icon('check') : '') +
          '</button>'
      )
      .join('');

    const body =
      '<form class="category-form" id="categoryForm" novalidate><label><span class="field-label">分类名称</span><input class="field-input" id="categoryName" type="text" maxlength="24" placeholder="例如：技术随笔" value="' +
      escapeAttr(editing ? editing.name : '') +
      '" autocomplete="off"></label><label><span class="field-label">一句描述 <span class="optional">可选</span></span><input class="field-input" id="categoryDescription" type="text" maxlength="100" placeholder="这个分类会收录什么？" value="' +
      escapeAttr(editing ? editing.description : '') +
      '" autocomplete="off"></label><div><span class="field-label">标记颜色</span><div class="color-field" id="categoryColors">' +
      colorHtml +
      '</div></div><p class="form-error" id="categoryError" role="alert"></p></form>';

    const footer =
      '<div class="modal-foot-left">分类会显示在左侧目录中</div><div class="modal-actions"><button class="modal-btn" type="button" data-category-cancel>取消</button><button class="modal-btn is-primary" type="button" data-category-save>' +
      (editing ? '保存修改' : '创建分类') +
      '</button></div>';

    showModal({
      size: 'is-small',
      title: editing ? '编辑文章分类' : '新建文章分类',
      subtitle: editing ? '调整名称、说明或颜色' : '为新的写作方向留一个位置',
      body,
      footer,
      initialFocus: '#categoryName',
      onMount(modal) {
        const panel = modal.panel;
        const nameInput = $('#categoryName', panel);
        const error = $('#categoryError', panel);
        const save = $('[data-category-save]', panel);
        const cancel = $('[data-category-cancel]', panel);
        const swatches = $$('[data-color]', panel);

        const showError = (message) => {
          error.textContent = message;
          error.classList.add('is-visible');
        };
        const clearError = () => {
          error.textContent = '';
          error.classList.remove('is-visible');
        };

        swatches.forEach((button) => {
          button.addEventListener('click', () => {
            selectedColor = button.dataset.color;
            swatches.forEach((item) => {
              const selected = item.dataset.color === selectedColor;
              item.setAttribute('aria-pressed', String(selected));
              item.innerHTML = selected ? icon('check') : '';
            });
          });
        });

        const submit = () => {
          const name = nameInput.value.trim();
          const description = $('#categoryDescription', panel).value.trim();
          if (!name) {
            showError('请给分类起一个名字。');
            nameInput.focus();
            return;
          }
          const duplicate = state.categories.find(
            (category) =>
              category.name.toLowerCase() === name.toLowerCase() &&
              (!editing || category.id !== editing.id)
          );
          if (duplicate) {
            showError('已经有同名的分类了。');
            nameInput.focus();
            return;
          }
          if (editing) {
            editing.name = name;
            editing.description = description;
            editing.color = selectedColor;
            showToast('分类已更新', 'success');
          } else {
            const category = {
              id: uid('category'),
              name,
              description,
              color: selectedColor,
              createdAt: new Date().toISOString()
            };
            state.categories.push(category);
            state.ui.collapsedCategoryIds = state.ui.collapsedCategoryIds.filter(
              (id) => id !== category.id
            );
            showToast('分类已创建', 'success');
          }
          saveState();
          closeModal();
          renderAll();
        };

        cancel.addEventListener('click', () => closeModal());
        save.addEventListener('click', submit);
        nameInput.addEventListener('input', clearError);
        $('#categoryForm', panel).addEventListener('submit', (event) => {
          event.preventDefault();
          submit();
        });
      }
    });
  }

  /* ------------------------------------------------------------------------
     Article actions
     ------------------------------------------------------------------------ */

  function publishArticle(id) {
    const article = articleById(id);
    if (!article) return;
    article.status = 'published';
    article.updatedAt = new Date().toISOString();
    saveState();
    renderAll();
    showToast('文章已发布', 'success');
  }

  async function deleteArticle(id) {
    const article = articleById(id);
    if (!article) return;
    const confirmed = await confirmAction({
      title: '删除这篇文章？',
      subtitle: '删除后无法恢复',
      message:
        '《<strong>' +
        escapeHtml(article.title) +
        '</strong>》将从博客中移除。如果你想保留它，可以先去设置中导出备份。',
      confirmLabel: '删除文章',
      footnote: '这不会影响其他文章'
    });
    if (!confirmed) return;
    const wasActive = state.ui.activeArticleId === id;
    state.articles = state.articles.filter((item) => item.id !== id);
    if (wasActive) {
      const remaining = state.articles
        .slice()
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      state.ui.activeArticleId = remaining[0] ? remaining[0].id : null;
    }
    saveState();
    if (state.ui.activeArticleId) setHash(state.ui.activeArticleId, true);
    else clearHash();
    renderAll();
    showToast('文章已删除', 'success');
  }

  async function deleteCategory(categoryId) {
    const category = categoryById(categoryId);
    if (!category) return;
    const count = state.articles.filter((article) => article.categoryId === category.id).length;
    const confirmed = await confirmAction({
      title: '删除这个分类？',
      subtitle: count ? '分类中的文章会被保留' : '这个分类目前是空的',
      message:
        '确定删除分类「<strong>' +
        escapeHtml(category.name) +
        '</strong>」吗？' +
        (count
          ? '<br><br>其中的 <strong>' +
            count +
            '</strong> 篇文章会移到「未分类」，不会丢失。'
          : ''),
      confirmLabel: '删除分类',
      footnote: count ? '文章只会更换分类，不会被删除' : '这个操作无法撤销'
    });
    if (!confirmed) return;

    let uncategorized = state.categories.find((item) => item.name === '未分类');
    if (count && !uncategorized) {
      uncategorized = {
        id: uid('category'),
        name: '未分类',
        color: '#8b8f96',
        description: '暂时没有归类的文章。',
        createdAt: new Date().toISOString()
      };
      state.categories.push(uncategorized);
    }
    if (count && uncategorized) {
      state.articles.forEach((article) => {
        if (article.categoryId === category.id) article.categoryId = uncategorized.id;
      });
    }
    state.categories = state.categories.filter((item) => item.id !== category.id);
    state.ui.collapsedCategoryIds = state.ui.collapsedCategoryIds.filter(
      (id) => id !== category.id
    );
    saveState();
    renderAll();
    showToast('分类已删除', 'success');
  }

  function articleMarkdown(article) {
    const category = categoryById(article.categoryId);
    const escapeYaml = (value) => String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const tagLine = article.tags.map((tag) => '"' + escapeYaml(tag) + '"').join(', ');
    const frontmatter = [
      '---',
      'title: "' + escapeYaml(article.title) + '"',
      'date: ' + formatDateKey(article.createdAt),
      'updated: ' + formatDateKey(article.updatedAt),
      'category: "' + escapeYaml(category ? category.name : '未分类') + '"',
      'status: ' + article.status,
      'tags: [' + tagLine + ']',
      '---',
      '',
      '# ' + article.title,
      '',
      article.content.trim(),
      ''
    ];
    return frontmatter.join('\n');
  }

  function exportArticle(article) {
    const safeTitle = article.title.replace(/[\\/:*?"<>|]/g, '-').slice(0, 60);
    downloadFile(articleMarkdown(article), safeTitle + '.md', 'text/markdown;charset=utf-8');
    showToast('Markdown 文件已导出', 'success');
  }

  function exportAll() {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      site: state.site,
      categories: state.categories,
      articles: state.articles
    };
    const date = new Date();
    const stamp =
      date.getFullYear() +
      String(date.getMonth() + 1).padStart(2, '0') +
      String(date.getDate()).padStart(2, '0');
    downloadFile(
      JSON.stringify(payload, null, 2),
      'yubai-backup-' + stamp + '.json',
      'application/json;charset=utf-8'
    );
    showToast('已导出全部文章与分类', 'success');
  }

  async function handleImportFile() {
    const file = dom.importFile.files && dom.importFile.files[0];
    dom.importFile.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      showToast('备份文件过大，无法导入', 'error');
      return;
    }
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.categories) || !Array.isArray(parsed.articles)) {
        throw new Error('invalid backup');
      }
      const confirmed = await confirmAction({
        title: '导入这份备份？',
        subtitle: '当前内容会被替换',
        message:
          '备份中包含 <strong>' +
          parsed.articles.length +
          '</strong> 篇文章和 <strong>' +
          parsed.categories.length +
          '</strong> 个分类。导入后，当前浏览器中的文章会被替换；建议先导出一份现有备份。',
        confirmLabel: '导入并替换',
        danger: true,
        footnote: '主题和侧栏状态会保留'
      });
      if (!confirmed) return;
      const imported = normalizeState(parsed);
      imported.ui.theme = state.ui.theme;
      imported.ui.sidebarCollapsed = state.ui.sidebarCollapsed;
      state = imported;
      searchQuery = '';
      dom.searchInput.value = '';
      state.ui.filter = 'all';
      state.ui.activeArticleId = state.articles[0] ? state.articles[0].id : null;
      saveState();
      renderSiteIdentity();
      if (state.ui.activeArticleId) setHash(state.ui.activeArticleId, true);
      else clearHash();
      renderAll();
      showToast('备份已导入', 'success');
    } catch (error) {
      console.warn('Import failed:', error);
      showToast('无法读取这份备份，请确认文件格式正确', 'error');
    }
  }

  async function resetDemo() {
    const confirmed = await confirmAction({
      title: '恢复示例内容？',
      subtitle: '当前文章会被替换',
      message:
        '这会把当前博客恢复为初始的示例文章与分类。<strong class="danger-text">当前内容会被清除</strong>，建议先导出备份。',
      confirmLabel: '恢复示例',
      footnote: '外观设置会保留'
    });
    if (!confirmed) return;
    const theme = state.ui.theme;
    const sidebarCollapsed = state.ui.sidebarCollapsed;
    state = createInitialState();
    state.ui.theme = theme;
    state.ui.sidebarCollapsed = sidebarCollapsed;
    searchQuery = '';
    dom.searchInput.value = '';
    saveState();
    renderSiteIdentity();
    applyTheme();
    if (state.ui.activeArticleId) setHash(state.ui.activeArticleId, true);
    else clearHash();
    renderAll();
    showToast('已恢复示例内容', 'success');
  }

  /* ------------------------------------------------------------------------
     Files and clipboard
     ------------------------------------------------------------------------ */

  function downloadFile(content, filename, mime) {
    const blob = new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  async function copyText(text, successMessage) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error('clipboard unavailable');
      }
    } catch (error) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        textarea.remove();
        if (!ok) throw new Error('copy failed');
      } catch (fallbackError) {
        showToast('复制失败，请手动选择内容', 'error');
        return;
      }
    }
    showToast(successMessage || '已复制', 'success');
  }

  /* ------------------------------------------------------------------------
     Toasts
     ------------------------------------------------------------------------ */

  function showToast(message, type) {
    if (!dom.toastRoot) return;
    while (dom.toastRoot.children.length >= 3) {
      dom.toastRoot.firstElementChild.remove();
    }
    const toast = document.createElement('div');
    toast.className = 'toast' + (type === 'error' ? ' is-error' : '');
    toast.innerHTML =
      icon(type === 'error' ? 'x' : 'check') + '<span>' + escapeHtml(message) + '</span>';
    dom.toastRoot.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('is-leaving');
      setTimeout(() => toast.remove(), 220);
    }, 2900);
  }

  /* ------------------------------------------------------------------------
     Event wiring
     ------------------------------------------------------------------------ */

  function handleTreeClick(event) {
    const open = event.target.closest('[data-open-article]');
    if (open) {
      setActiveArticle(open.dataset.openArticle);
      return;
    }
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'toggle-category') {
      const id = actionEl.dataset.categoryId;
      const isCollapsed = state.ui.collapsedCategoryIds.includes(id);
      if (isCollapsed) {
        state.ui.collapsedCategoryIds = state.ui.collapsedCategoryIds.filter(
          (categoryId) => categoryId !== id
        );
      } else {
        state.ui.collapsedCategoryIds.push(id);
      }
      saveState();
      renderSidebar();
    } else if (action === 'new-article-in-category') {
      openArticleEditor(null, actionEl.dataset.categoryId);
    } else if (action === 'category-menu') {
      showCategoryMenu(actionEl, actionEl.dataset.categoryId);
    } else if (action === 'article-menu') {
      showArticleMenu(actionEl, actionEl.dataset.articleId);
    } else if (action === 'new-category') {
      openCategoryDialog('create');
    } else if (action === 'clear-filters') {
      clearFilters();
    }
  }

  function handleStageClick(event) {
    const copyButton = event.target.closest('[data-copy-code]');
    if (copyButton) {
      copyText(copyButton.dataset.code || '', '代码已复制');
      return;
    }
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    const article = activeArticle();
    if (action === 'new-article') openArticleEditor();
    else if (action === 'copy-link' && article) {
      copyText(articleUrl(article.id), '文章链接已复制');
    } else if (action === 'copy-markdown' && article) {
      copyText(articleMarkdown(article), 'Markdown 已复制');
    } else if (action === 'export-markdown' && article) {
      exportArticle(article);
    } else if (action === 'search-tag') {
      setSearchValue(actionEl.dataset.tag || '', { focus: true, select: true });
      if (window.innerWidth <= 900) openMobileNav();
    }
  }

  function handleGlobalKeydown(event) {
    if (activeModal) {
      if (event.key === 'Escape') {
        event.preventDefault();
        dismissModal();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = $$(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          activeModal.panel
        ).filter((element) => element.offsetParent !== null || element === document.activeElement);
        if (!focusable.length) {
          event.preventDefault();
          activeModal.panel.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      return;
    }

    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    if (mod && key === 'k') {
      event.preventDefault();
      if (window.innerWidth <= 900) openMobileNav();
      dom.searchInput.focus();
      dom.searchInput.select();
      return;
    }
    if (mod && key === 'n') {
      event.preventDefault();
      openArticleEditor();
      return;
    }
    if (!isTypingTarget(event.target) && !mod && !event.altKey && key === 'n') {
      event.preventDefault();
      openArticleEditor();
      return;
    }
    if (event.key === 'Escape') {
      if (activePopover) {
        event.preventDefault();
        closePopover({ restoreFocus: true });
        return;
      }
      if (document.body.classList.contains('mobile-nav-open')) {
        event.preventDefault();
        closeMobileNav();
        return;
      }
      if (document.activeElement === dom.searchInput) {
        if (searchQuery) {
          event.preventDefault();
          setSearchValue('');
        } else {
          dom.searchInput.blur();
        }
      }
      return;
    }
    if (event.key === '/' && !isTypingTarget(event.target) && !mod) {
      event.preventDefault();
      if (window.innerWidth <= 900) openMobileNav();
      dom.searchInput.focus();
      return;
    }
    if (!isTypingTarget(event.target) && event.altKey && event.key === 'ArrowLeft') {
      event.preventDefault();
      navigateAdjacent(-1);
    } else if (!isTypingTarget(event.target) && event.altKey && event.key === 'ArrowRight') {
      event.preventDefault();
      navigateAdjacent(1);
    }
  }

  function bindEvents() {
    dom.brandHome.addEventListener('click', goHome);
    dom.newArticleBtn.addEventListener('click', () => openArticleEditor());
    dom.newCategoryBtn.addEventListener('click', () => openCategoryDialog('create'));
    dom.collapseSidebarBtn.addEventListener('click', () => {
      if (window.innerWidth <= 900) closeMobileNav();
      else toggleSidebar();
    });
    dom.navToggle.addEventListener('click', toggleSidebar);
    dom.sidebarScrim.addEventListener('click', closeMobileNav);

    dom.searchInput.addEventListener('input', () => {
      searchQuery = dom.searchInput.value;
      dom.searchField.classList.toggle('has-query', Boolean(searchQuery));
      dom.clearSearchBtn.hidden = !searchQuery;
      renderSidebar();
    });
    dom.clearSearchBtn.addEventListener('click', () => {
      setSearchValue('', { focus: true });
    });
    dom.filterBtn.addEventListener('click', () => showFilterMenu(dom.filterBtn));
    dom.sortBtn.addEventListener('click', () => showSortMenu(dom.sortBtn));
    dom.filterNote.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="clear-filter-note"]')) {
        state.ui.filter = 'all';
        saveState();
        renderSidebar();
      }
    });

    dom.categoryTree.addEventListener('click', handleTreeClick);
    dom.articleStage.addEventListener('click', handleStageClick);

    dom.articleMenuBtn.addEventListener('click', () => {
      const article = activeArticle();
      if (article) showArticleMenu(dom.articleMenuBtn, article.id);
    });
    dom.editArticleBtn.addEventListener('click', () => {
      const article = activeArticle();
      if (article) openArticleEditor(article.id);
    });
    dom.shareArticleBtn.addEventListener('click', () => {
      const article = activeArticle();
      if (article) copyText(articleUrl(article.id), '文章链接已复制');
    });
    dom.authorBtn.addEventListener('click', () => showSettingsMenu(dom.authorBtn));
    dom.themeQuickBtn.addEventListener('click', () => {
      setTheme(resolvedTheme() === 'dark' ? 'light' : 'dark');
    });

    dom.prevArticleBtn.addEventListener('click', () => navigateAdjacent(-1));
    dom.nextArticleBtn.addEventListener('click', () => navigateAdjacent(1));

    dom.breadcrumbs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-breadcrumb]');
      if (!button) return;
      if (button.dataset.breadcrumb === 'home') goHome();
      else if (button.dataset.breadcrumb === 'category') {
        revealCategory(button.dataset.categoryId);
      }
    });

    dom.importFile.addEventListener('change', handleImportFile);

    dom.contentScroll.addEventListener(
      'scroll',
      () => {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(() => {
          updateReadingProgress();
          scrollFrame = 0;
        });
      },
      { passive: true }
    );

    document.addEventListener('keydown', handleGlobalKeydown);
    document.addEventListener(
      'pointerdown',
      (event) => {
        if (!activePopover) return;
        if (
          activePopover.popover.contains(event.target) ||
          activePopover.anchor.contains(event.target)
        ) {
          return;
        }
        closePopover();
      },
      true
    );
    window.addEventListener(
      'scroll',
      (event) => {
        if (!activePopover) return;
        if (activePopover.popover.contains(event.target)) return;
        closePopover();
      },
      true
    );
    window.addEventListener('resize', () => {
      closePopover();
      if (window.innerWidth > 900) closeMobileNav();
      syncSidebarAccessibility();
      updateReadingProgress();
    });

    if (mediaDark) {
      const onThemeChange = () => {
        if (state.ui.theme === 'system') applyTheme();
      };
      if (mediaDark.addEventListener) mediaDark.addEventListener('change', onThemeChange);
      else if (mediaDark.addListener) mediaDark.addListener(onThemeChange);
    }

    window.addEventListener('popstate', syncFromHash);
    window.addEventListener('hashchange', syncFromHash);
  }

  function syncFromHash() {
    const id = hashArticleId();
    if (!id) return;
    if (!articleById(id)) return;
    if (id === state.ui.activeArticleId) return;
    state.ui.activeArticleId = id;
    const article = articleById(id);
    if (article) {
      state.ui.collapsedCategoryIds = state.ui.collapsedCategoryIds.filter(
        (categoryId) => categoryId !== article.categoryId
      );
    }
    saveState();
    renderSidebar();
    renderMain();
    closeMobileNav();
  }

  function updateShortcutLabels() {
    const kbd = $('.search-kbd');
    const newKbd = $('.new-article-btn kbd');
    if (kbd) kbd.textContent = '/';
    if (newKbd) newKbd.textContent = 'N';
  }

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  function init() {
    state = loadState();
    const hashId = hashArticleId();
    if (hashId && articleById(hashId)) {
      state.ui.activeArticleId = hashId;
    }
    document.body.classList.toggle('sidebar-collapsed', Boolean(state.ui.sidebarCollapsed));
    syncSidebarAccessibility();
    applyTheme();
    renderSiteIdentity();
    updateShortcutLabels();
    bindEvents();
    renderAll();

    if (state.ui.activeArticleId) {
      if (location.hash !== '#/article/' + encodeURIComponent(state.ui.activeArticleId)) {
        setHash(state.ui.activeArticleId, true);
      }
    } else if (location.hash) {
      clearHash();
    }

    requestAnimationFrame(() => {
      updateReadingProgress();
      dom.contentScroll.focus({ preventScroll: true });
    });
  }

  window.YubaiBlog = {
    version: APP_VERSION,
    renderMarkdown,
    getState: () => clone(state),
    exportAll
  };

  init();
})();
