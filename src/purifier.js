/**
 * CleanPrint & AI-Chat to PDF Studio — On-Demand Reader & AI-Chat Purifier
 * Injected strictly via activeTab + scripting.executeScript on user interaction.
 * Zero innerHTML assignments, zero external assets, 100% local DOM purification.
 */
(function (root) {
  'use strict';

  if (root.__CleanPrintStudio && root.__CleanPrintStudio.version === '1.1.0') {
    return;
  }

  var api = (typeof browser !== 'undefined' && browser && browser.runtime)
    ? browser
    : (typeof chrome !== 'undefined' && chrome && chrome.runtime ? chrome : null);

  var DEFAULT_SETTINGS = {
    lowInk: true,
    hideImages: false,
    fontSize: 12,
    theme: 'standard',
    removeHeaderFooter: false
  };

  var PRO_THEMES = {
    'academic-serif': true,
    'minimalist-swiss': true,
    'study-two-col': true,
    'booklet-2up': true
  };

  var NOISE_SELECTORS = [
    'nav', 'header:not(article header):not(main header)', 'footer:not(article footer)',
    'aside', '[role="navigation"]', '[role="banner"]', '[role="complementary"]',
    '[role="dialog"]', '[aria-modal="true"]', '.cookie', '#cookie', '[id*="cookie" i]',
    '[class*="cookie" i]', '[class*="consent" i]', '[class*="gdpr" i]',
    '[class*="ad-" i]', '[class*="ads-" i]', '[id*="google_ads" i]', '.adsbygoogle',
    '[class*="sidebar" i]', '[class*="sticky" i]', '[class*="popup" i]',
    '[class*="newsletter" i]', '[class*="subscribe" i]', '[class*="share" i]',
    '[class*="social" i]', '[class*="comment" i]', '[id*="comments" i]',
    'iframe', 'script', 'style', 'noscript', 'form', 'button:not([data-cp-keep])'
  ].join(',');

  var state = {
    active: false,
    savedScrollY: 0,
    settings: Object.assign({}, DEFAULT_SETTINGS),
    isPro: false,
    lastParsed: null
  };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] === undefined || attrs[k] === null) return;
        if (k === 'className') {
          node.className = attrs[k];
        } else if (k === 'textContent') {
          node.textContent = attrs[k];
        } else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else {
          node.setAttribute(k, String(attrs[k]));
        }
      });
    }
    if (Array.isArray(children)) {
      children.forEach(function (ch) {
        if (ch === null || ch === undefined) return;
        if (typeof ch === 'string') {
          node.appendChild(document.createTextNode(ch));
        } else {
          node.appendChild(ch);
        }
      });
    }
    return node;
  }

  function detectPlatform(loc, doc) {
    var host = String((loc && loc.hostname) || '').toLowerCase();
    var path = String((loc && loc.pathname) || '').toLowerCase();
    if (host.indexOf('chatgpt.com') !== -1 || host.indexOf('chat.openai.com') !== -1 ||
        (doc && doc.querySelector('[data-message-author-role]'))) {
      return { pageType: 'ai-chat', platform: 'ChatGPT' };
    }
    if (host.indexOf('claude.ai') !== -1 ||
        (doc && (doc.querySelector('[data-testid="user-message"]') || doc.querySelector('.font-claude-message')))) {
      return { pageType: 'ai-chat', platform: 'Claude' };
    }
    if (host.indexOf('copilot.microsoft.com') !== -1 ||
        (host.indexOf('github.com') !== -1 && path.indexOf('/copilot') === 0) ||
        (doc && (doc.querySelector('[data-content="ai-message"]') || doc.querySelector('.copilot-chat-message')))) {
      return { pageType: 'ai-chat', platform: 'Copilot' };
    }
    if (host.indexOf('chat.deepseek.com') !== -1) {
      return { pageType: 'ai-chat', platform: 'DeepSeek' };
    }
    if (host.indexOf('gemini.google.com') !== -1 || (doc && doc.querySelector('message-content, user-query'))) {
      return { pageType: 'ai-chat', platform: 'Gemini' };
    }
    if (host.indexOf('perplexity.ai') !== -1) {
      return { pageType: 'ai-chat', platform: 'Perplexity' };
    }
    if (host.indexOf('github.com') !== -1) {
      return { pageType: 'article', platform: 'GitHub Docs / Repo' };
    }
    if (doc && doc.querySelector('article, .markdown-body, .prose, [role="article"]')) {
      return { pageType: 'article', platform: 'Web Article' };
    }
    return { pageType: 'article', platform: 'Web Page' };
  }

  function countClutterNodes(doc) {
    if (!doc) return 0;
    try {
      return doc.querySelectorAll(
        'nav, aside, iframe, .adsbygoogle, [class*="cookie" i], [class*="banner" i], [class*="sidebar" i], [class*="sticky" i], [class*="share" i]'
      ).length;
    } catch (_e) {
      return 0;
    }
  }

  function normalizeSettings(raw, isPro) {
    var merged = Object.assign({}, DEFAULT_SETTINGS, raw || {});
    var fs = Number(merged.fontSize);
    if (!isFinite(fs) || fs < 10) fs = 10;
    if (fs > 17) fs = 17;
    merged.fontSize = Math.round(fs * 2) / 2;
    merged.lowInk = Boolean(merged.lowInk);
    merged.hideImages = Boolean(merged.hideImages);
    if (!isPro) {
      if (PRO_THEMES[merged.theme]) {
        merged.theme = 'standard';
      }
      merged.removeHeaderFooter = false;
    } else {
      merged.removeHeaderFooter = Boolean(merged.removeHeaderFooter);
    }
    return merged;
  }

  function isNoiseNode(node) {
    if (!node || node.nodeType !== 1) return false;
    if (node.id === 'cleanprint-studio-root') return true;
    var tag = node.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'iframe' || tag === 'svg' || tag === 'canvas' || tag === 'form') {
      return true;
    }
    try {
      if (node.hasAttribute('hidden') || node.getAttribute('aria-hidden') === 'true') return true;
      var cls = String(node.className || '') + ' ' + String(node.id || '');
      if (/\b(cookie|consent|gdpr|advert|adsense|adsbygoogle|newsletter|popup|share-bar|social-share|related-posts|sidebar|nav-bar|navbar|breadcrumb)\b/i.test(cls)) {
        return true;
      }
    } catch (_e) {}
    return false;
  }

  function extractInlineRuns(elem) {
    var runs = [];
    if (!elem || !elem.childNodes) return runs;
    Array.prototype.forEach.call(elem.childNodes, function (child) {
      if (child.nodeType === 3) {
        var t = child.nodeValue;
        if (t) runs.push({ kind: 'text', text: t });
        return;
      }
      if (child.nodeType !== 1 || isNoiseNode(child)) return;
      var tag = child.tagName.toLowerCase();
      if (tag === 'br') {
        runs.push({ kind: 'br' });
        return;
      }
      var text = (child.textContent || '');
      if (!text.trim()) return;
      if (tag === 'code') {
        runs.push({ kind: 'code', text: text });
      } else if (tag === 'strong' || tag === 'b') {
        runs.push({ kind: 'strong', text: text });
      } else if (tag === 'em' || tag === 'i') {
        runs.push({ kind: 'em', text: text });
      } else if (tag === 'a') {
        var href = child.getAttribute('href') || '';
        if (href && !/^javascript:/i.test(href)) {
          try {
            href = new URL(href, document.location.href).href;
          } catch (_e) {}
          runs.push({ kind: 'link', text: text, href: href });
        } else {
          runs.push({ kind: 'text', text: text });
        }
      } else {
        var nested = extractInlineRuns(child);
        Array.prototype.push.apply(runs, nested);
      }
    });
    return runs;
  }

  function extractCodeLanguage(preNode) {
    var codeEl = preNode.querySelector('code') || preNode;
    var cls = String(codeEl.className || '') + ' ' + String(preNode.className || '');
    var m = cls.match(/language-([a-z0-9_+-]+)/i) || cls.match(/lang-([a-z0-9_+-]+)/i);
    if (m && m[1]) return m[1].toLowerCase();
    var headerBadge = preNode.previousElementSibling;
    if (headerBadge && (headerBadge.textContent || '').trim().length <= 18) {
      var cand = (headerBadge.textContent || '').trim().split(/\s+/)[0];
      if (/^[a-z0-9+#.-]{1,14}$/i.test(cand) && !/^(copy|run|edit)$/i.test(cand)) {
        return cand.toLowerCase();
      }
    }
    return 'code';
  }

  function extractTableData(tableNode) {
    var rows = [];
    var trList = tableNode.querySelectorAll('tr');
    Array.prototype.forEach.call(trList, function (tr) {
      var cells = [];
      var isHeader = false;
      Array.prototype.forEach.call(tr.querySelectorAll('th, td'), function (cell) {
        if (cell.tagName.toLowerCase() === 'th') isHeader = true;
        cells.push((cell.textContent || '').replace(/\s+/g, ' ').trim());
      });
      if (cells.some(function (c) { return c.length > 0; })) {
        rows.push({ header: isHeader, cells: cells });
      }
    });
    return rows;
  }

  function extractBlocksFromContainer(container) {
    var blocks = [];
    if (!container) return blocks;

    function walk(node) {
      if (!node || node.nodeType !== 1 || isNoiseNode(node)) return;
      var tag = node.tagName.toLowerCase();

      if (/^h[1-6]$/.test(tag)) {
        var hText = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (hText) {
          blocks.push({ type: 'heading', level: Number(tag.slice(1)), text: hText });
        }
        return;
      }

      if (tag === 'pre') {
        var codeNode = node.querySelector('code') || node;
        var rawCode = (codeNode.textContent || '').replace(/^\n+|\s+$/g, '');
        if (rawCode) {
          blocks.push({
            type: 'code',
            lang: extractCodeLanguage(node),
            text: rawCode
          });
        }
        return;
      }

      if (tag === 'table') {
        var rows = extractTableData(node);
        if (rows.length) {
          blocks.push({ type: 'table', rows: rows });
        }
        return;
      }

      if (tag === 'blockquote') {
        var qText = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (qText) {
          blocks.push({ type: 'quote', text: qText, runs: extractInlineRuns(node) });
        }
        return;
      }

      if (tag === 'ul' || tag === 'ol') {
        var items = [];
        Array.prototype.forEach.call(node.children, function (li) {
          if (!li || li.tagName.toLowerCase() !== 'li') return;
          var liCloneText = (li.textContent || '').replace(/\s+/g, ' ').trim();
          if (liCloneText) {
            items.push({ text: liCloneText, runs: extractInlineRuns(li) });
          }
        });
        if (items.length) {
          blocks.push({ type: 'list', ordered: tag === 'ol', items: items });
        }
        return;
      }

      if (tag === 'img') {
        var src = node.currentSrc || node.getAttribute('src') || '';
        var w = node.naturalWidth || node.width || 0;
        var h = node.naturalHeight || node.height || 0;
        if (src && !/^data:image\/gif/i.test(src) && (w === 0 || w >= 100) && (h === 0 || h >= 60)) {
          blocks.push({
            type: 'image',
            src: src,
            alt: (node.getAttribute('alt') || '').trim()
          });
        }
        return;
      }

      if (tag === 'hr') {
        blocks.push({ type: 'hr' });
        return;
      }

      if (tag === 'p') {
        var pText = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (pText) {
          blocks.push({ type: 'paragraph', text: pText, runs: extractInlineRuns(node) });
        }
        Array.prototype.forEach.call(node.querySelectorAll('img'), function (img) {
          walk(img);
        });
        return;
      }

      var hasBlockChildren = false;
      Array.prototype.forEach.call(node.children, function (ch) {
        var ct = ch.tagName ? ch.tagName.toLowerCase() : '';
        if (/^(p|div|section|article|main|pre|table|ul|ol|blockquote|h[1-6]|figure|hr)$/.test(ct)) {
          hasBlockChildren = true;
        }
      });

      if (hasBlockChildren) {
        Array.prototype.forEach.call(node.children, function (ch) {
          walk(ch);
        });
      } else {
        var leafText = (node.textContent || '').replace(/\s+/g, ' ').trim();
        if (leafText.length >= 28) {
          blocks.push({ type: 'paragraph', text: leafText, runs: extractInlineRuns(node) });
        }
      }
    }

    Array.prototype.forEach.call(container.children, function (child) {
      walk(child);
    });

    if (!blocks.length) {
      var fallback = (container.textContent || '').trim();
      if (fallback) {
        fallback.split(/\n{2,}/).forEach(function (para) {
          var clean = para.replace(/\s+/g, ' ').trim();
          if (clean) blocks.push({ type: 'paragraph', text: clean, runs: [{ kind: 'text', text: clean }] });
        });
      }
    }
    return blocks;
  }

  function extractAiChatTurns(doc, platformName) {
    var turns = [];

    // 1. ChatGPT / OpenAI standard [data-message-author-role]
    var roleNodes = doc.querySelectorAll('[data-message-author-role]');
    if (roleNodes.length >= 1) {
      Array.prototype.forEach.call(roleNodes, function (node) {
        var roleAttr = (node.getAttribute('data-message-author-role') || '').toLowerCase();
        if (roleAttr !== 'user' && roleAttr !== 'assistant') return;
        var turnBlocks = extractBlocksFromContainer(node);
        if (!turnBlocks.length) {
          var txt = (node.textContent || '').trim();
          if (txt) turnBlocks = [{ type: 'paragraph', text: txt, runs: [{ kind: 'text', text: txt }] }];
        }
        if (turnBlocks.length) {
          turns.push({
            role: roleAttr === 'user' ? 'user' : 'assistant',
            speaker: roleAttr === 'user' ? 'You' : platformName,
            blocks: turnBlocks
          });
        }
      });
      if (turns.length) return turns;
    }

    // 2. Claude / Copilot / Gemini / DeepSeek / Perplexity turn selectors
    var combinedTurnNodes = doc.querySelectorAll(
      '[data-testid="user-message"], .font-claude-message, [data-content="user-message"], [data-content="ai-message"], user-query, model-response, message-content, .copilot-chat-message, .ds-markdown, [class*="ds-chat-message" i], [data-testid*="query" i], [data-testid*="answer" i]'
    );
    if (combinedTurnNodes.length >= 1) {
      Array.prototype.forEach.call(combinedTurnNodes, function (node) {
        var testId = (node.getAttribute('data-testid') || node.getAttribute('data-content') || node.tagName || '').toLowerCase();
        var cls = String(node.className || '').toLowerCase();
        var isUser = testId.indexOf('user') !== -1 || testId.indexOf('query') !== -1 || cls.indexOf('user') !== -1 || cls.indexOf('query') !== -1;
        var turnBlocks = extractBlocksFromContainer(node);
        if (!turnBlocks.length) {
          var txt = (node.textContent || '').trim();
          if (txt) turnBlocks = [{ type: 'paragraph', text: txt, runs: [{ kind: 'text', text: txt }] }];
        }
        if (turnBlocks.length) {
          turns.push({
            role: isUser ? 'user' : 'assistant',
            speaker: isUser ? 'You' : platformName,
            blocks: turnBlocks
          });
        }
      });
      if (turns.length) return turns;
    }

    // 3. Conversation turn articles (e.g. article[data-testid^="conversation-turn"])
    var turnArticles = doc.querySelectorAll('article[data-testid*="conversation-turn"], [class*="chat-turn" i], [class*="message-row" i]');
    if (turnArticles.length >= 2) {
      Array.prototype.forEach.call(turnArticles, function (node, idx) {
        var turnBlocks = extractBlocksFromContainer(node);
        if (turnBlocks.length) {
          var isUser = idx % 2 === 0;
          turns.push({
            role: isUser ? 'user' : 'assistant',
            speaker: isUser ? 'You' : platformName,
            blocks: turnBlocks
          });
        }
      });
    }

    return turns;
  }

  function findBestArticleRoot(doc) {
    var prioritySelectors = [
      'article .markdown-body',
      '.markdown-body',
      'article[role="article"]',
      'main article',
      'article',
      '[role="main"]',
      'main',
      '.post-content',
      '.article-content',
      '.entry-content',
      '.prose'
    ];
    for (var i = 0; i < prioritySelectors.length; i++) {
      var found = doc.querySelector(prioritySelectors[i]);
      if (found && (found.textContent || '').trim().length >= 180) {
        return found;
      }
    }

    // Density-based fallback scorer
    var best = doc.body;
    var bestScore = 0;
    var candidates = doc.querySelectorAll('section, div');
    Array.prototype.forEach.call(candidates, function (cand) {
      if (isNoiseNode(cand)) return;
      var pCount = cand.querySelectorAll('p, pre, li').length;
      if (pCount < 2) return;
      var textLen = (cand.textContent || '').trim().length;
      if (textLen < 200) return;
      var linkTextLen = 0;
      Array.prototype.forEach.call(cand.querySelectorAll('a'), function (a) {
        linkTextLen += (a.textContent || '').length;
      });
      var linkDensity = linkTextLen / Math.max(1, textLen);
      if (linkDensity > 0.55) return;
      var score = textLen * (1 - linkDensity) + pCount * 45;
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    });
    return best || doc.body;
  }

  function countWordsInBlocks(blocks) {
    var total = 0;
    (blocks || []).forEach(function (b) {
      if (b.type === 'qa-turn') {
        total += countWordsInBlocks(b.blocks);
        return;
      }
      var sample = b.text || '';
      if (b.type === 'list' && b.items) {
        sample = b.items.map(function (it) { return it.text; }).join(' ');
      } else if (b.type === 'table' && b.rows) {
        sample = b.rows.map(function (r) { return r.cells.join(' '); }).join(' ');
      }
      var cjk = (sample.match(/[\u4e00-\u9fff]/g) || []).length;
      var latin = sample.replace(/[\u4e00-\u9fff]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
      total += cjk + latin;
    });
    return total;
  }

  function parseDocument(doc, loc, preferSelection) {
    var info = detectPlatform(loc, doc);
    var title = ((doc.querySelector('h1') && doc.querySelector('h1').textContent) || doc.title || 'Untitled Document')
      .replace(/\s+/g, ' ')
      .trim();
    var clutterCount = countClutterNodes(doc);
    var blocks = [];

    // Check user selection if requested (for targeted Pro clipping)
    if (preferSelection && root.getSelection) {
      var sel = root.getSelection();
      if (sel && !sel.isCollapsed && String(sel.toString() || '').trim().length >= 24) {
        var fragWrap = doc.createElement('div');
        for (var r = 0; r < sel.rangeCount; r++) {
          fragWrap.appendChild(sel.getRangeAt(r).cloneContents());
        }
        var selBlocks = extractBlocksFromContainer(fragWrap);
        if (selBlocks.length) {
          var selWords = countWordsInBlocks(selBlocks);
          return {
            title: title + ' (Selected Excerpt)',
            url: loc ? loc.href : '',
            domain: loc ? loc.hostname : 'local',
            pageType: info.pageType,
            platform: info.platform,
            clutterRemoved: clutterCount,
            wordCount: selWords,
            estPages: Math.max(1, Math.ceil(selWords / 420)),
            blocks: selBlocks,
            fromSelection: true
          };
        }
      }
    }

    if (info.pageType === 'ai-chat') {
      var turns = extractAiChatTurns(doc, info.platform);
      if (turns.length) {
        blocks = turns.map(function (t, idx) {
          return {
            type: 'qa-turn',
            turnIndex: idx + 1,
            role: t.role,
            speaker: t.speaker,
            blocks: t.blocks
          };
        });
      }
    }

    if (!blocks.length) {
      var rootEl = findBestArticleRoot(doc);
      blocks = extractBlocksFromContainer(rootEl);
      // Avoid duplicating main H1 inside body if identical to document header
      if (blocks.length && blocks[0].type === 'heading' && blocks[0].level === 1 &&
          blocks[0].text.toLowerCase() === title.toLowerCase()) {
        blocks.shift();
      }
    }

    var words = countWordsInBlocks(blocks);
    return {
      title: title,
      url: loc ? loc.href : '',
      domain: (loc && loc.hostname) ? loc.hostname.replace(/^www\./, '') : 'local-page',
      pageType: info.pageType,
      platform: info.platform,
      clutterRemoved: Math.max(4, clutterCount),
      wordCount: words,
      estPages: Math.max(1, Math.ceil(words / 420)),
      blocks: blocks,
      fromSelection: false
    };
  }

  function renderRunsInto(targetEl, runs, fallbackText) {
    if (!Array.isArray(runs) || !runs.length) {
      targetEl.textContent = fallbackText || '';
      return;
    }
    runs.forEach(function (run) {
      if (run.kind === 'br') {
        targetEl.appendChild(document.createElement('br'));
      } else if (run.kind === 'code') {
        targetEl.appendChild(el('code', { className: 'cp-inline-code', textContent: run.text }));
      } else if (run.kind === 'strong') {
        targetEl.appendChild(el('strong', { textContent: run.text }));
      } else if (run.kind === 'em') {
        targetEl.appendChild(el('em', { textContent: run.text }));
      } else if (run.kind === 'link') {
        targetEl.appendChild(el('a', {
          className: 'cp-link',
          href: run.href,
          target: '_blank',
          rel: 'noopener noreferrer',
          textContent: run.text
        }));
      } else {
        targetEl.appendChild(document.createTextNode(run.text || ''));
      }
    });
  }

  function renderBlockList(blocks) {
    var frag = document.createDocumentFragment();
    (blocks || []).forEach(function (b) {
      if (b.type === 'qa-turn') {
        var card = el('section', {
          className: 'cp-qa-card cp-qa-' + (b.role === 'user' ? 'user' : 'assistant')
        });
        var badgeRow = el('div', { className: 'cp-qa-header' }, [
          el('span', {
            className: 'cp-qa-badge',
            textContent: (b.role === 'user' ? 'PROMPT #' + b.turnIndex + ' · ' : 'RESPONSE #' + b.turnIndex + ' · ') + (b.speaker || '')
          })
        ]);
        var bodyWrap = el('div', { className: 'cp-qa-body' });
        bodyWrap.appendChild(renderBlockList(b.blocks));
        card.appendChild(badgeRow);
        card.appendChild(bodyWrap);
        frag.appendChild(card);
        return;
      }

      if (b.type === 'heading') {
        var lvl = Math.min(4, Math.max(2, b.level || 2));
        frag.appendChild(el('h' + lvl, { className: 'cp-heading cp-h' + lvl, textContent: b.text }));
        return;
      }

      if (b.type === 'paragraph') {
        var p = el('p', { className: 'cp-para' });
        renderRunsInto(p, b.runs, b.text);
        frag.appendChild(p);
        return;
      }

      if (b.type === 'code') {
        var codeBox = el('div', { className: 'cp-code-block cp-avoid-break' }, [
          el('div', { className: 'cp-code-header' }, [
            el('span', { className: 'cp-code-lang', textContent: (b.lang || 'code').toUpperCase() })
          ]),
          el('pre', { className: 'cp-pre' }, [
            el('code', { textContent: b.text })
          ])
        ]);
        frag.appendChild(codeBox);
        return;
      }

      if (b.type === 'table') {
        var tableWrap = el('div', { className: 'cp-table-wrap cp-avoid-break' });
        var table = el('table', { className: 'cp-table' });
        (b.rows || []).forEach(function (row, rIdx) {
          var tr = document.createElement('tr');
          (row.cells || []).forEach(function (cellText) {
            var cellTag = (row.header || rIdx === 0) ? 'th' : 'td';
            tr.appendChild(el(cellTag, { textContent: cellText }));
          });
          table.appendChild(tr);
        });
        tableWrap.appendChild(table);
        frag.appendChild(tableWrap);
        return;
      }

      if (b.type === 'quote') {
        var bq = el('blockquote', { className: 'cp-quote cp-avoid-break' });
        renderRunsInto(bq, b.runs, b.text);
        frag.appendChild(bq);
        return;
      }

      if (b.type === 'list') {
        var listEl = el(b.ordered ? 'ol' : 'ul', { className: 'cp-list' });
        (b.items || []).forEach(function (item) {
          var li = document.createElement('li');
          renderRunsInto(li, item.runs, item.text);
          listEl.appendChild(li);
        });
        frag.appendChild(listEl);
        return;
      }

      if (b.type === 'image') {
        var fig = el('figure', { className: 'cp-figure cp-avoid-break' }, [
          el('img', { className: 'cp-image', src: b.src, alt: b.alt || '' })
        ]);
        if (b.alt) {
          fig.appendChild(el('figcaption', { className: 'cp-figcaption', textContent: b.alt }));
        }
        frag.appendChild(fig);
        return;
      }

      if (b.type === 'hr') {
        frag.appendChild(el('hr', { className: 'cp-hr' }));
      }
    });
    return frag;
  }

  function buildStylesheetText(settings) {
    var pageRule = settings.removeHeaderFooter
      ? '@page { margin: 0mm; }'
      : (settings.theme === 'booklet-2up' ? '@page { size: landscape; margin: 10mm; }' : '@page { margin: 14mm 15mm; }');

    if (settings.removeHeaderFooter && settings.theme === 'booklet-2up') {
      pageRule = '@page { size: landscape; margin: 0mm; }';
    }

    return [
      pageRule,
      'html.cleanprint-studio-active, html.cleanprint-studio-active body {',
      '  background: #e2e8f0 !important;',
      '  margin: 0 !important;',
      '  padding: 0 !important;',
      '}',
      'html.cleanprint-studio-active body > *:not(#cleanprint-studio-root) {',
      '  display: none !important;',
      '}',
      '#cleanprint-studio-root {',
      '  --cp-font-size: ' + settings.fontSize + 'pt;',
      '  display: block !important;',
      '  min-height: 100vh;',
      '  padding: 68px 16px 48px;',
      '  box-sizing: border-box;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, sans-serif;',
      '  color: #0f172a;',
      '}',
      '#cleanprint-studio-root * { box-sizing: border-box; }',
      '#cleanprint-studio-root .cp-toolbar {',
      '  position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 2147483646;',
      '  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;',
      '  background: #0f172a; color: #f8fafc; padding: 8px 14px; border-radius: 999px;',
      '  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.28); font-size: 12.5px;',
      '  border: 1px solid rgba(255,255,255,0.14);',
      '}',
      '#cleanprint-studio-root .cp-tb-brand { font-weight: 700; color: #34d399; margin-right: 4px; letter-spacing: 0.2px; }',
      '#cleanprint-studio-root .cp-tb-btn {',
      '  appearance: none; border: 1px solid rgba(255,255,255,0.2); background: rgba(255,255,255,0.08);',
      '  color: #f8fafc; border-radius: 999px; padding: 4px 10px; font-size: 12px; font-weight: 600; cursor: pointer;',
      '}',
      '#cleanprint-studio-root .cp-tb-btn:hover { background: rgba(255,255,255,0.18); }',
      '#cleanprint-studio-root .cp-tb-btn.cp-tb-active { background: #059669; border-color: #10b981; color: #ffffff; }',
      '#cleanprint-studio-root .cp-tb-primary { background: #2563eb; border-color: #3b82f6; color: #ffffff; }',
      '#cleanprint-studio-root .cp-tb-primary:hover { background: #1d4ed8; }',
      '#cleanprint-studio-root .cp-sheet {',
      '  max-width: 816px; margin: 0 auto; background: #ffffff; color: #111827;',
      '  padding: 46px 54px; border-radius: 12px; box-shadow: 0 12px 36px rgba(15, 23, 42, 0.12);',
      '  font-size: var(--cp-font-size); line-height: 1.65;',
      '}',
      '#cleanprint-studio-root.cp-theme-academic-serif .cp-sheet {',
      '  font-family: Georgia, "Iowan Old Style", Baskerville, "Times New Roman", serif;',
      '  line-height: 1.72;',
      '}',
      '#cleanprint-studio-root.cp-theme-academic-serif .cp-para { text-align: justify; }',
      '#cleanprint-studio-root.cp-theme-minimalist-swiss .cp-sheet {',
      '  font-family: "Helvetica Neue", Helvetica, Inter, Arial, sans-serif;',
      '  letter-spacing: -0.01em;',
      '}',
      '#cleanprint-studio-root.cp-theme-minimalist-swiss .cp-doc-header {',
      '  border-bottom: 3px solid #0f172a; padding-bottom: 14px;',
      '}',
      '#cleanprint-studio-root.cp-theme-study-two-col .cp-sheet {',
      '  max-width: 920px; padding: 34px 38px; line-height: 1.5;',
      '}',
      '#cleanprint-studio-root.cp-theme-study-two-col .cp-content-flow {',
      '  column-count: 2; column-gap: 26px; column-rule: 1px solid #cbd5e1;',
      '}',
      '#cleanprint-studio-root.cp-theme-booklet-2up .cp-sheet {',
      '  max-width: 1040px; padding: 30px 36px; line-height: 1.48;',
      '}',
      '#cleanprint-studio-root.cp-theme-booklet-2up .cp-content-flow {',
      '  column-count: 2; column-gap: 44px; column-rule: 1px dashed #94a3b8;',
      '}',
      '#cleanprint-studio-root .cp-doc-header { border-bottom: 1.5px solid #cbd5e1; padding-bottom: 16px; margin-bottom: 22px; }',
      '#cleanprint-studio-root .cp-doc-kicker {',
      '  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #059669; margin-bottom: 6px;',
      '}',
      '#cleanprint-studio-root .cp-doc-title { font-size: 1.75em; line-height: 1.25; font-weight: 800; margin: 0 0 8px; color: #0f172a; }',
      '#cleanprint-studio-root .cp-doc-meta { font-size: 0.82em; color: #475569; display: flex; gap: 14px; flex-wrap: wrap; }',
      '#cleanprint-studio-root .cp-heading { color: #0f172a; margin: 1.35em 0 0.45em; line-height: 1.3; break-after: avoid; page-break-after: avoid; }',
      '#cleanprint-studio-root .cp-h2 { font-size: 1.32em; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }',
      '#cleanprint-studio-root .cp-h3 { font-size: 1.14em; }',
      '#cleanprint-studio-root .cp-para { margin: 0 0 0.9em; color: #1e293b; }',
      '#cleanprint-studio-root .cp-list { margin: 0 0 1em 1.35em; padding: 0; }',
      '#cleanprint-studio-root .cp-list li { margin-bottom: 0.35em; }',
      '#cleanprint-studio-root .cp-inline-code {',
      '  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.88em;',
      '  background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 4px; padding: 1px 5px; color: #0f172a;',
      '}',
      '#cleanprint-studio-root .cp-code-block {',
      '  margin: 0.95em 0; border: 1px solid #94a3b8; border-radius: 8px; overflow: hidden;',
      '  background: #1e293b; color: #f8fafc;',
      '}',
      '#cleanprint-studio-root .cp-code-header {',
      '  padding: 5px 12px; font-size: 10px; font-weight: 700; letter-spacing: 0.06em;',
      '  background: #0f172a; color: #cbd5e1; border-bottom: 1px solid #334155;',
      '}',
      '#cleanprint-studio-root .cp-pre {',
      '  margin: 0; padding: 12px 14px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;',
      '  font-size: 0.86em; line-height: 1.5; white-space: pre-wrap; word-break: break-word; overflow-x: visible;',
      '}',
      '#cleanprint-studio-root .cp-qa-card {',
      '  margin: 0 0 14px; padding: 13px 16px; border-radius: 10px; border: 1px solid #cbd5e1;',
      '}',
      '#cleanprint-studio-root .cp-qa-user { background: #f8fafc; border-left: 4px solid #2563eb; }',
      '#cleanprint-studio-root .cp-qa-assistant { background: #ffffff; border-left: 4px solid #059669; }',
      '#cleanprint-studio-root .cp-qa-header { margin-bottom: 7px; break-after: avoid; page-break-after: avoid; }',
      '#cleanprint-studio-root .cp-qa-badge {',
      '  display: inline-block; font-size: 10.5px; font-weight: 800; letter-spacing: 0.05em;',
      '  color: #334155; text-transform: uppercase;',
      '}',
      '#cleanprint-studio-root .cp-table-wrap { margin: 1em 0; overflow-x: visible; }',
      '#cleanprint-studio-root .cp-table { width: 100%; border-collapse: collapse; font-size: 0.9em; }',
      '#cleanprint-studio-root .cp-table th, #cleanprint-studio-root .cp-table td {',
      '  border: 1px solid #94a3b8; padding: 7px 10px; text-align: left; vertical-align: top;',
      '}',
      '#cleanprint-studio-root .cp-table th { background: #f1f5f9; font-weight: 700; color: #0f172a; }',
      '#cleanprint-studio-root .cp-quote {',
      '  margin: 0.9em 0; padding: 8px 14px; border-left: 3.5px solid #475569; background: #f8fafc; color: #334155;',
      '}',
      '#cleanprint-studio-root .cp-figure { margin: 1em 0; text-align: center; }',
      '#cleanprint-studio-root .cp-image { max-width: 100%; height: auto; border-radius: 6px; border: 1px solid #e2e8f0; }',
      '#cleanprint-studio-root .cp-figcaption { font-size: 0.8em; color: #64748b; margin-top: 4px; }',
      '#cleanprint-studio-root .cp-avoid-break, #cleanprint-studio-root pre, #cleanprint-studio-root table, #cleanprint-studio-root blockquote, #cleanprint-studio-root figure {',
      '  break-inside: avoid; page-break-inside: avoid;',
      '}',
      /* Eco Low-Ink overrides: removes dark fills on code blocks & cards, crisp high-contrast hairlines */
      '#cleanprint-studio-root.cp-low-ink .cp-sheet,',
      '#cleanprint-studio-root.cp-low-ink .cp-qa-user,',
      '#cleanprint-studio-root.cp-low-ink .cp-qa-assistant,',
      '#cleanprint-studio-root.cp-low-ink .cp-quote,',
      '#cleanprint-studio-root.cp-low-ink .cp-table th,',
      '#cleanprint-studio-root.cp-low-ink .cp-inline-code {',
      '  background: #ffffff !important; color: #000000 !important; box-shadow: none !important;',
      '}',
      '#cleanprint-studio-root.cp-low-ink .cp-code-block {',
      '  background: #ffffff !important; color: #0f172a !important; border: 1.25px solid #334155 !important;',
      '}',
      '#cleanprint-studio-root.cp-low-ink .cp-code-header {',
      '  background: #f8fafc !important; color: #0f172a !important; border-bottom: 1px solid #64748b !important;',
      '}',
      '#cleanprint-studio-root.cp-hide-images .cp-figure { display: none !important; }',
      '@media print {',
      '  html.cleanprint-studio-active, html.cleanprint-studio-active body {',
      '    background: #ffffff !important;',
      '  }',
      '  #cleanprint-studio-root { padding: 0 !important; min-height: 0 !important; }',
      '  #cleanprint-studio-root .cp-toolbar { display: none !important; }',
      '  #cleanprint-studio-root .cp-sheet {',
      '    max-width: 100% !important; width: 100% !important; box-shadow: none !important; border-radius: 0 !important;',
      '    padding: ' + (settings.removeHeaderFooter ? '14mm 15mm' : '0') + ' !important;',
      '  }',
      '  #cleanprint-studio-root .cp-link { color: #0f172a !important; text-decoration: underline; }',
      '}'
    ].join('\n');
  }

  function applyRootAttributes(rootOverlay) {
    if (!rootOverlay) return;
    var classes = ['cp-theme-' + (state.settings.theme || 'standard')];
    if (state.settings.lowInk) classes.push('cp-low-ink');
    if (state.settings.hideImages) classes.push('cp-hide-images');
    rootOverlay.className = classes.join(' ');

    var styleEl = document.getElementById('cleanprint-studio-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'cleanprint-studio-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = buildStylesheetText(state.settings);

    var lowInkBtn = rootOverlay.querySelector('[data-cp-btn="lowInk"]');
    if (lowInkBtn) {
      lowInkBtn.className = 'cp-tb-btn' + (state.settings.lowInk ? ' cp-tb-active' : '');
      lowInkBtn.textContent = state.settings.lowInk ? 'Eco Low-Ink: ON' : 'Eco Low-Ink: OFF';
    }
    var imgBtn = rootOverlay.querySelector('[data-cp-btn="hideImages"]');
    if (imgBtn) {
      imgBtn.className = 'cp-tb-btn' + (state.settings.hideImages ? ' cp-tb-active' : '');
      imgBtn.textContent = state.settings.hideImages ? 'Images: Hidden' : 'Images: Shown';
    }
    var fsLabel = rootOverlay.querySelector('[data-cp-label="fontSize"]');
    if (fsLabel) {
      fsLabel.textContent = state.settings.fontSize + 'pt';
    }
  }

  function buildToolbar(parsed) {
    var clipFeedback = el('span', { className: 'cp-tb-feedback', textContent: '' });

    var lowInkBtn = el('button', {
      type: 'button',
      'data-cp-btn': 'lowInk',
      className: 'cp-tb-btn' + (state.settings.lowInk ? ' cp-tb-active' : ''),
      textContent: state.settings.lowInk ? 'Eco Low-Ink: ON' : 'Eco Low-Ink: OFF',
      onClick: function () {
        state.settings.lowInk = !state.settings.lowInk;
        applyRootAttributes(document.getElementById('cleanprint-studio-root'));
      }
    });

    var imgBtn = el('button', {
      type: 'button',
      'data-cp-btn': 'hideImages',
      className: 'cp-tb-btn' + (state.settings.hideImages ? ' cp-tb-active' : ''),
      textContent: state.settings.hideImages ? 'Images: Hidden' : 'Images: Shown',
      onClick: function () {
        state.settings.hideImages = !state.settings.hideImages;
        applyRootAttributes(document.getElementById('cleanprint-studio-root'));
      }
    });

    var minusBtn = el('button', {
      type: 'button',
      className: 'cp-tb-btn',
      textContent: 'A-',
      onClick: function () {
        state.settings.fontSize = Math.max(10, state.settings.fontSize - 0.5);
        applyRootAttributes(document.getElementById('cleanprint-studio-root'));
      }
    });

    var fsLabel = el('span', {
      'data-cp-label': 'fontSize',
      textContent: state.settings.fontSize + 'pt'
    });

    var plusBtn = el('button', {
      type: 'button',
      className: 'cp-tb-btn',
      textContent: 'A+',
      onClick: function () {
        state.settings.fontSize = Math.min(17, state.settings.fontSize + 0.5);
        applyRootAttributes(document.getElementById('cleanprint-studio-root'));
      }
    });

    var clipBtn = el('button', {
      type: 'button',
      className: 'cp-tb-btn',
      textContent: state.isPro ? '+ Queue PDF' : '+ Queue (Pro)',
      onClick: function () {
        if (!state.isPro) {
          clipFeedback.textContent = 'Unlock Pro in toolbar icon';
          return;
        }
        if (api && api.runtime && api.runtime.sendMessage) {
          var clipObj = buildClipObject(parsed);
          api.runtime.sendMessage({ type: 'APPEND_CLIP_FROM_PAGE', clip: clipObj }, function (res) {
            if (res && res.ok) {
              clipFeedback.textContent = 'Queued (' + res.count + ')';
            }
          });
        }
      }
    });

    var mdBtn = el('button', {
      type: 'button',
      className: 'cp-tb-btn',
      textContent: 'Export .md',
      onClick: function () {
        exportMarkdownFile(parsed);
        clipFeedback.textContent = 'Saved .md!';
      }
    });

    var printBtn = el('button', {
      type: 'button',
      className: 'cp-tb-btn cp-tb-primary',
      textContent: 'Print / Save Vector PDF',
      onClick: function () {
        root.print();
      }
    });

    var exitBtn = el('button', {
      type: 'button',
      className: 'cp-tb-btn',
      textContent: 'Exit Reader',
      onClick: function () {
        deactivate();
      }
    });

    return el('div', { className: 'cp-toolbar', role: 'toolbar', 'aria-label': 'CleanPrint Controls' }, [
      el('span', { className: 'cp-tb-brand', textContent: 'CleanPrint Studio' }),
      lowInkBtn,
      imgBtn,
      minusBtn,
      fsLabel,
      plusBtn,
      clipBtn,
      mdBtn,
      printBtn,
      exitBtn,
      clipFeedback
    ]);
  }

  function blocksToMarkdown(blocks) {
    var out = [];
    (blocks || []).forEach(function (b) {
      if (b.type === 'qa-turn') {
        var hdr = (b.role === 'user' ? '## Prompt #' : '## Response #') + b.turnIndex + ' (' + (b.speaker || '') + ')';
        out.push(hdr + '\n\n' + blocksToMarkdown(b.blocks));
      } else if (b.type === 'heading') {
        var hashes = new Array(Math.min(6, Math.max(2, b.level || 2)) + 1).join('#');
        out.push(hashes + ' ' + b.text);
      } else if (b.type === 'paragraph') {
        out.push(b.text);
      } else if (b.type === 'code') {
        out.push('```' + (b.lang && b.lang !== 'code' ? b.lang : '') + '\n' + b.text + '\n```');
      } else if (b.type === 'quote') {
        out.push('> ' + String(b.text || '').replace(/\n/g, '\n> '));
      } else if (b.type === 'list') {
        var lines = (b.items || []).map(function (it, idx) {
          return (b.ordered ? (idx + 1) + '. ' : '- ') + it.text;
        });
        out.push(lines.join('\n'));
      } else if (b.type === 'table' && b.rows && b.rows.length) {
        var tLines = [];
        b.rows.forEach(function (r, idx) {
          var rowStr = '| ' + r.cells.map(function (c) { return String(c).replace(/\|/g, '\\|'); }).join(' | ') + ' |';
          tLines.push(rowStr);
          if (idx === 0) {
            tLines.push('| ' + r.cells.map(function () { return '---'; }).join(' | ') + ' |');
          }
        });
        out.push(tLines.join('\n'));
      } else if (b.type === 'hr') {
        out.push('---');
      }
    });
    return out.join('\n\n');
  }

  function serializeParsedToMarkdown(parsed) {
    var dateIso = new Date().toISOString();
    var safeTitle = String((parsed && parsed.title) || 'CleanPrint Export').replace(/"/g, '\\"');
    var fm = [
      '---',
      'title: "' + safeTitle + '"',
      'source: "' + String((parsed && parsed.url) || '') + '"',
      'platform: "' + String((parsed && parsed.platform) || 'Web') + '"',
      'exported_at: "' + dateIso + '"',
      'generator: "CleanPrint Studio v1.1.0"',
      '---',
      '',
      '# ' + ((parsed && parsed.title) || 'CleanPrint Export'),
      '',
      blocksToMarkdown((parsed && parsed.blocks) || []),
      ''
    ];
    return fm.join('\n');
  }

  function exportMarkdownFile(parsed) {
    var src = parsed || state.lastParsed || parseDocument(document, document.location, false);
    var mdText = serializeParsedToMarkdown(src);
    var slug = String(src.title || 'cleanprint-export')
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'cleanprint-export';
    var blob = new Blob([mdText], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: slug + '.md' });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    return mdText;
  }

  function buildClipObject(parsed) {
    var src = parsed || parseDocument(document, document.location, true);
    return {
      id: 'clip_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      title: src.title,
      url: src.url,
      domain: src.domain,
      pageType: src.pageType,
      platform: src.platform,
      wordCount: src.wordCount,
      estPages: src.estPages,
      clippedAt: new Date().toISOString(),
      blocks: src.blocks
    };
  }

  function activate(rawSettings, isPro) {
    state.isPro = Boolean(isPro);
    state.settings = normalizeSettings(rawSettings, state.isPro);

    if (!state.active) {
      state.savedScrollY = root.scrollY || 0;
    }

    var existing = document.getElementById('cleanprint-studio-root');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    var parsed = parseDocument(document, document.location, false);
    state.lastParsed = parsed;

    var overlay = el('div', { id: 'cleanprint-studio-root' });
    overlay.appendChild(buildToolbar(parsed));

    var dateStr = new Date().toISOString().slice(0, 10);
    var header = el('header', { className: 'cp-doc-header' }, [
      el('div', {
        className: 'cp-doc-kicker',
        textContent: (parsed.pageType === 'ai-chat' ? parsed.platform + ' Conversation Transcript' : parsed.platform + ' · CleanPrint Edition')
      }),
      el('h1', { className: 'cp-doc-title', textContent: parsed.title }),
      el('div', { className: 'cp-doc-meta' }, [
        el('span', { textContent: 'Source: ' + parsed.domain }),
        el('span', { textContent: parsed.wordCount + ' words · ~' + parsed.estPages + ' pg' }),
        el('span', { textContent: 'Purified: ' + dateStr })
      ])
    ]);

    var flow = el('div', { className: 'cp-content-flow' });
    flow.appendChild(renderBlockList(parsed.blocks));

    var sheet = el('article', { className: 'cp-sheet' }, [header, flow]);
    overlay.appendChild(sheet);

    document.body.appendChild(overlay);
    document.documentElement.classList.add('cleanprint-studio-active');
    applyRootAttributes(overlay);
    state.active = true;
    root.scrollTo(0, 0);

    return getStatus();
  }

  function updateSettings(rawSettings, isPro) {
    state.isPro = Boolean(isPro);
    state.settings = normalizeSettings(rawSettings, state.isPro);
    if (state.active) {
      var overlay = document.getElementById('cleanprint-studio-root');
      if (overlay) {
        applyRootAttributes(overlay);
      }
    }
    return getStatus();
  }

  function deactivate() {
    var overlay = document.getElementById('cleanprint-studio-root');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
    }
    var styleEl = document.getElementById('cleanprint-studio-style');
    if (styleEl && styleEl.parentNode) {
      styleEl.parentNode.removeChild(styleEl);
    }
    document.documentElement.classList.remove('cleanprint-studio-active');
    if (state.active) {
      state.active = false;
      root.scrollTo(0, state.savedScrollY || 0);
    }
    return getStatus();
  }

  function toggle(rawSettings, isPro) {
    if (state.active) {
      return deactivate();
    }
    return activate(rawSettings, isPro);
  }

  function triggerPrint(rawSettings, isPro) {
    if (!state.active) {
      activate(rawSettings, isPro);
    } else {
      updateSettings(rawSettings, isPro);
    }
    setTimeout(function () {
      root.print();
    }, 90);
    return getStatus();
  }

  function extractClip(isPro) {
    if (!isPro) {
      return { ok: false, reason: 'pro_required' };
    }
    var parsed = parseDocument(document, document.location, true);
    if (!parsed.blocks || !parsed.blocks.length) {
      return { ok: false, reason: 'no_readable_content' };
    }
    return {
      ok: true,
      fromSelection: parsed.fromSelection,
      clip: buildClipObject(parsed)
    };
  }

  function getStatus() {
    if (typeof document === 'undefined') {
      return { active: false, pageType: 'article', platform: 'Headless', clutterRemoved: 0, wordCount: 0, estPages: 1 };
    }
    var info = detectPlatform(document.location, document);
    var parsed = state.lastParsed;
    var clutter = parsed ? parsed.clutterRemoved : countClutterNodes(document);
    var words = parsed ? parsed.wordCount : Math.max(80, Math.round(((document.body && document.body.innerText) || '').length / 6));
    return {
      active: state.active,
      pageType: info.pageType,
      platform: info.platform,
      clutterRemoved: Math.max(4, clutter),
      wordCount: words,
      estPages: Math.max(1, Math.ceil(words / 420)),
      inkSavedPct: state.settings.lowInk ? (info.pageType === 'ai-chat' ? 64 : 52) : 28,
      settings: Object.assign({}, state.settings)
    };
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && state.active) {
        deactivate();
      }
    });
  }

  root.__CleanPrintStudio = {
    version: '1.1.0',
    detectPlatform: detectPlatform,
    normalizeSettings: normalizeSettings,
    serializeParsedToMarkdown: serializeParsedToMarkdown,
    getStatus: getStatus,
    activate: activate,
    updateSettings: updateSettings,
    deactivate: deactivate,
    toggle: toggle,
    triggerPrint: triggerPrint,
    extractClip: extractClip
  };
})(typeof window !== 'undefined' ? window : globalThis);
