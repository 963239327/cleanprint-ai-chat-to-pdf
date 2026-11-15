/**
 * CleanPrint Pro — Multi-Article Print Queue & Booklet Studio Controller
 * Zero innerHTML assignments, 100% local compilation with automatic Table of Contents.
 */
(function (root) {
  'use strict';

  var api = (typeof browser !== 'undefined' && browser && browser.runtime)
    ? browser
    : (typeof chrome !== 'undefined' && chrome && chrome.runtime ? chrome : null);

  var QUEUE_KEY = 'cleanprint_queue_v1';
  var LICENSE_KEY = 'cleanprint_license_v1';

  var studioState = {
    isPro: false,
    clips: [],
    theme: 'academic-serif',
    includeToc: true,
    pageBreak: false,
    lowInk: true,
    hideImages: false,
    marginless: true,
    fontSize: 11.5
  };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (attrs[k] === undefined || attrs[k] === null) return;
        if (k === 'className') node.className = attrs[k];
        else if (k === 'textContent') node.textContent = attrs[k];
        else if (k.indexOf('on') === 0 && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
        } else {
          node.setAttribute(k, String(attrs[k]));
        }
      });
    }
    if (Array.isArray(children)) {
      children.forEach(function (ch) {
        if (ch === null || ch === undefined) return;
        if (typeof ch === 'string') node.appendChild(document.createTextNode(ch));
        else node.appendChild(ch);
      });
    }
    return node;
  }

  function storageGet(keys) {
    if (!api || !api.storage || !api.storage.local) return Promise.resolve({});
    return new Promise(function (resolve) {
      try {
        var p = api.storage.local.get(keys, function (res) { resolve(res || {}); });
        if (p && typeof p.then === 'function') {
          p.then(function (res) { resolve(res || {}); }).catch(function () { resolve({}); });
        }
      } catch (_e) { resolve({}); }
    });
  }

  function storageSet(obj) {
    if (!api || !api.storage || !api.storage.local) return Promise.resolve();
    return new Promise(function (resolve) {
      try {
        var p = api.storage.local.set(obj, function () { resolve(); });
        if (p && typeof p.then === 'function') {
          p.then(function () { resolve(); }).catch(function () { resolve(); });
        }
      } catch (_e) { resolve(); }
    });
  }

  function buildSampleClips() {
    return [
      {
        id: 'sample_ai_1',
        title: 'Designing Zero-Latency SQLite Write-Ahead Logging (WAL) Systems',
        domain: 'chatgpt.com',
        platform: 'ChatGPT',
        pageType: 'ai-chat',
        wordCount: 310,
        estPages: 1,
        clippedAt: new Date().toISOString(),
        blocks: [
          {
            type: 'qa-turn',
            turnIndex: 1,
            role: 'user',
            speaker: 'You',
            blocks: [
              {
                type: 'paragraph',
                text: 'Explain why SQLite WAL mode dramatically improves concurrent read/write throughput, and provide the exact PRAGMA tuning snippet for production services.'
              }
            ]
          },
          {
            type: 'qa-turn',
            turnIndex: 2,
            role: 'assistant',
            speaker: 'ChatGPT',
            blocks: [
              {
                type: 'paragraph',
                text: 'In rollback-journal mode, writers lock out readers while mutating original database pages. Write-Ahead Logging (WAL) inverts this: readers keep reading consistent snapshots while writers append sequentially to the -wal file.'
              },
              {
                type: 'code',
                lang: 'sql',
                text: 'PRAGMA journal_mode = WAL;\nPRAGMA synchronous = NORMAL;\nPRAGMA busy_timeout = 5000;\nPRAGMA wal_autocheckpoint = 1000;'
              },
              {
                type: 'table',
                rows: [
                  { header: true, cells: ['Mode', 'Concurrent Readers + Writer', 'Fsync Per Commit'] },
                  { header: false, cells: ['DELETE (Legacy)', 'Blocked during write lock', '2x full barriers'] },
                  { header: false, cells: ['WAL + NORMAL', 'Non-blocking snapshot reads', '0 on commit (checkpointed)'] }
                ]
              }
            ]
          }
        ]
      },
      {
        id: 'sample_doc_2',
        title: 'Manifest V3 Least-Privilege Architecture Checklist',
        domain: 'developer.mozilla.org',
        platform: 'MDN Docs',
        pageType: 'article',
        wordCount: 240,
        estPages: 1,
        clippedAt: new Date().toISOString(),
        blocks: [
          {
            type: 'heading',
            level: 2,
            text: 'Prefer activeTab Over Broad Host Permissions'
          },
          {
            type: 'paragraph',
            text: 'Requesting activeTab instead of <all_urls> ensures extensions run strictly when invoked by an explicit user gesture, accelerating automated review on both Microsoft Edge Add-ons and Firefox AMO.'
          },
          {
            type: 'list',
            ordered: true,
            items: [
              { text: 'Zero background content-script overhead on untouched tabs.' },
              { text: 'Zero scary install-time "Read and change all your data" warning dialogs.' },
              { text: 'Full local DOM styling and vector PDF print control on click.' }
            ]
          }
        ]
      }
    ];
  }

  function updateDynamicPageRule() {
    var pageStyle = document.getElementById('cleanprint-binder-page-rule');
    if (!pageStyle) {
      pageStyle = document.createElement('style');
      pageStyle.id = 'cleanprint-binder-page-rule';
      document.head.appendChild(pageStyle);
    }
    var sizePart = studioState.theme === 'booklet-2up' ? 'size: landscape; ' : '';
    var marginPart = studioState.marginless ? 'margin: 0mm;' : 'margin: 13mm 15mm;';
    var sheetPrintPad = studioState.marginless ? '13mm 15mm' : '0';
    pageStyle.textContent = '@page { ' + sizePart + marginPart + ' }\n' +
      '@media print { .binder-sheet { padding: ' + sheetPrintPad + ' !important; } }';
  }

  function renderBlocks(blocks) {
    var frag = document.createDocumentFragment();
    (blocks || []).forEach(function (b) {
      if (b.type === 'qa-turn') {
        var box = el('div', { className: 'b-qa ' + (b.role === 'user' ? 'b-qa-user' : 'b-qa-assistant') }, [
          el('div', {
            className: 'b-qa-role',
            textContent: (b.role === 'user' ? 'PROMPT #' + b.turnIndex : 'RESPONSE #' + b.turnIndex) + ' · ' + (b.speaker || '')
          })
        ]);
        box.appendChild(renderBlocks(b.blocks));
        frag.appendChild(box);
      } else if (b.type === 'heading') {
        var lvl = Math.min(4, Math.max(2, b.level || 2));
        frag.appendChild(el('h' + lvl, { className: 'b-heading', textContent: b.text }));
      } else if (b.type === 'paragraph') {
        frag.appendChild(el('p', { className: 'b-para', textContent: b.text }));
      } else if (b.type === 'code') {
        frag.appendChild(el('div', { className: 'b-code' }, [
          el('div', { className: 'b-code-head', textContent: b.lang || 'code' }),
          el('pre', {}, [el('code', { textContent: b.text })])
        ]));
      } else if (b.type === 'table') {
        var tbl = el('table', { className: 'b-table' });
        (b.rows || []).forEach(function (r, idx) {
          var tr = document.createElement('tr');
          (r.cells || []).forEach(function (c) {
            tr.appendChild(el((r.header || idx === 0) ? 'th' : 'td', { textContent: c }));
          });
          tbl.appendChild(tr);
        });
        frag.appendChild(tbl);
      } else if (b.type === 'quote') {
        frag.appendChild(el('blockquote', { className: 'b-quote', textContent: b.text }));
      } else if (b.type === 'list') {
        var ul = el(b.ordered ? 'ol' : 'ul', { className: 'b-list' });
        (b.items || []).forEach(function (it) {
          ul.appendChild(el('li', { textContent: it.text || '' }));
        });
        frag.appendChild(ul);
      } else if (b.type === 'image' && b.src) {
        frag.appendChild(el('figure', { className: 'b-figure' }, [
          el('img', { src: b.src, alt: b.alt || '' })
        ]));
      }
    });
    return frag;
  }

  function persistClips() {
    var patch = {};
    patch[QUEUE_KEY] = studioState.clips;
    return storageSet(patch).then(function () {
      if (api && api.runtime && api.runtime.sendMessage) {
        api.runtime.sendMessage({ type: 'SYNC_BADGE' });
      }
    });
  }

  function renderSidebarQueue() {
    var listEl = document.getElementById('clipItemsList');
    listEl.replaceChildren();
    document.getElementById('lblClipCount').textContent = String(studioState.clips.length);

    if (!studioState.clips.length) {
      listEl.appendChild(el('div', {
        className: 'clip-sub',
        textContent: 'Queue is empty. Clip any tab from the popup or click "+ Sample Pack" to test.'
      }));
      return;
    }

    studioState.clips.forEach(function (clip, idx) {
      var upBtn = el('button', {
        type: 'button',
        className: 'icon-btn',
        title: 'Move Up',
        textContent: '↑',
        onClick: function () {
          if (idx === 0) return;
          var tmp = studioState.clips[idx - 1];
          studioState.clips[idx - 1] = studioState.clips[idx];
          studioState.clips[idx] = tmp;
          persistClips();
          renderAll();
        }
      });

      var downBtn = el('button', {
        type: 'button',
        className: 'icon-btn',
        title: 'Move Down',
        textContent: '↓',
        onClick: function () {
          if (idx >= studioState.clips.length - 1) return;
          var tmp = studioState.clips[idx + 1];
          studioState.clips[idx + 1] = studioState.clips[idx];
          studioState.clips[idx] = tmp;
          persistClips();
          renderAll();
        }
      });

      var delBtn = el('button', {
        type: 'button',
        className: 'icon-btn',
        title: 'Remove',
        textContent: '✕',
        onClick: function () {
          studioState.clips.splice(idx, 1);
          persistClips();
          renderAll();
        }
      });

      var row = el('div', { className: 'clip-item' }, [
        el('div', { className: 'clip-meta' }, [
          el('div', { className: 'clip-name', textContent: (idx + 1) + '. ' + clip.title }),
          el('div', { className: 'clip-sub', textContent: (clip.platform || clip.domain) + ' · ' + (clip.wordCount || 0) + ' words' })
        ]),
        el('div', { className: 'clip-actions' }, [upBtn, downBtn, delBtn])
      ]);
      listEl.appendChild(row);
    });
  }

  function renderBinderSheet() {
    var sheet = document.getElementById('binderSheet');
    sheet.replaceChildren();

    var classes = ['binder-sheet', 'theme-' + studioState.theme];
    if (studioState.lowInk) classes.push('low-ink');
    if (studioState.hideImages) classes.push('hide-images');
    sheet.className = classes.join(' ');
    sheet.style.setProperty('--binder-font-size', studioState.fontSize + 'pt');
    updateDynamicPageRule();

    var docTitle = (document.getElementById('inpDocTitle').value || '').trim() || 'CleanPrint Research Compendium';
    var docSub = (document.getElementById('inpDocSubtitle').value || '').trim();

    var totalWords = studioState.clips.reduce(function (acc, c) { return acc + (c.wordCount || 0); }, 0);
    var totalEstPages = Math.max(1, Math.ceil(totalWords / 420));

    var cover = el('header', { className: 'binder-cover' }, [
      el('div', { className: 'binder-kicker', textContent: 'CLEANPRINT PRO STUDIO · MULTI-TAB VECTOR PDF BINDER' }),
      el('h1', { className: 'binder-title', textContent: docTitle }),
      docSub ? el('p', { className: 'binder-sub', textContent: docSub }) : null,
      el('div', { className: 'binder-stats' }, [
        el('span', { textContent: studioState.clips.length + ' Clipped Sources' }),
        el('span', { textContent: totalWords + ' Total Words (~' + totalEstPages + ' Pages)' }),
        el('span', { textContent: 'Compiled: ' + new Date().toISOString().slice(0, 10) })
      ])
    ]);
    sheet.appendChild(cover);

    if (!studioState.clips.length) {
      sheet.appendChild(el('div', { className: 'empty-state' }, [
        el('h2', { textContent: 'Your Multi-Article Print Queue is Ready' }),
        el('p', { textContent: 'Open any web article, GitHub README, or ChatGPT / Claude / Copilot conversation and click "+ Clip Tab / Selection", or click "+ Sample Pack" on the left to preview a multi-source binder with automatic Table of Contents.' })
      ]));
      return;
    }

    if (studioState.includeToc) {
      var tocList = el('ol', { className: 'toc-list' });
      var runningPage = 1;
      studioState.clips.forEach(function (clip, idx) {
        var chapId = 'chapter-' + (idx + 1);
        var row = el('li', { className: 'toc-row' }, [
          el('a', {
            className: 'toc-link',
            href: '#' + chapId,
            textContent: (idx + 1) + '. ' + clip.title
          }),
          el('span', {
            className: 'toc-meta',
            textContent: (clip.platform || clip.domain) + ' · ' + (clip.wordCount || 0) + 'w · p.' + runningPage
          })
        ]);
        runningPage += Math.max(1, clip.estPages || 1);
        tocList.appendChild(row);
      });
      sheet.appendChild(el('nav', { className: 'binder-toc', 'aria-label': 'Table of Contents' }, [
        el('div', { className: 'toc-heading', textContent: 'Table of Contents' }),
        tocList
      ]));
    }

    studioState.clips.forEach(function (clip, idx) {
      var chapClasses = ['binder-chapter'];
      if (studioState.pageBreak && idx > 0) chapClasses.push('page-break-before');
      var chap = el('section', { className: chapClasses.join(' '), id: 'chapter-' + (idx + 1) }, [
        el('div', { className: 'chapter-head' }, [
          el('div', {
            className: 'chapter-badge',
            textContent: 'SECTION ' + (idx + 1) + ' · ' + (clip.platform || 'WEB ARTICLE')
          }),
          el('h2', { className: 'chapter-title', textContent: clip.title }),
          el('div', {
            className: 'chapter-source',
            textContent: (clip.domain || '') + (clip.url ? ' — ' + clip.url : '')
          })
        ])
      ]);
      var flow = el('div', { className: 'chapter-flow' });
      flow.appendChild(renderBlocks(clip.blocks));
      chap.appendChild(flow);
      sheet.appendChild(chap);
    });
  }

  function renderAll() {
    var gateBox = document.getElementById('proGateBox');
    if (studioState.isPro) {
      gateBox.classList.add('hidden');
    } else {
      gateBox.classList.remove('hidden');
    }
    renderSidebarQueue();
    renderBinderSheet();
  }

  function initStudio() {
    var sdkUnlocked = Boolean(root.CraftLeafSDK && root.CraftLeafSDK.isUnlocked('cleanPrintPro', 'CLEANPRO'));

    storageGet([QUEUE_KEY, LICENSE_KEY]).then(function (data) {
      var lic = data[LICENSE_KEY];
      studioState.isPro = Boolean(sdkUnlocked || (lic && lic.unlocked));
      studioState.clips = Array.isArray(data[QUEUE_KEY]) ? data[QUEUE_KEY] : [];
      renderAll();
    });

    if (api && api.storage && api.storage.onChanged) {
      api.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local') {
          if (changes[QUEUE_KEY]) {
            studioState.clips = Array.isArray(changes[QUEUE_KEY].newValue) ? changes[QUEUE_KEY].newValue : [];
            renderAll();
          }
          if (changes[LICENSE_KEY] && changes[LICENSE_KEY].newValue) {
            studioState.isPro = Boolean(changes[LICENSE_KEY].newValue.unlocked);
            renderAll();
          }
        }
      });
    }

    document.getElementById('inpDocTitle').addEventListener('input', renderBinderSheet);
    document.getElementById('inpDocSubtitle').addEventListener('input', renderBinderSheet);

    document.getElementById('selStudioTheme').addEventListener('change', function (ev) {
      studioState.theme = ev.target.value;
      renderBinderSheet();
    });

    document.getElementById('chkToc').addEventListener('change', function (ev) {
      studioState.includeToc = Boolean(ev.target.checked);
      renderBinderSheet();
    });

    document.getElementById('chkPageBreak').addEventListener('change', function (ev) {
      studioState.pageBreak = Boolean(ev.target.checked);
      renderBinderSheet();
    });

    document.getElementById('chkStudioLowInk').addEventListener('change', function (ev) {
      studioState.lowInk = Boolean(ev.target.checked);
      renderBinderSheet();
    });

    document.getElementById('chkStudioHideImg').addEventListener('change', function (ev) {
      studioState.hideImages = Boolean(ev.target.checked);
      renderBinderSheet();
    });

    document.getElementById('chkStudioMarginless').addEventListener('change', function (ev) {
      studioState.marginless = Boolean(ev.target.checked);
      renderBinderSheet();
    });

    document.getElementById('rngStudioFont').addEventListener('input', function (ev) {
      studioState.fontSize = Number(ev.target.value) || 11.5;
      document.getElementById('lblStudioFont').textContent = studioState.fontSize + 'pt';
      renderBinderSheet();
    });

    document.getElementById('btnLoadSample').addEventListener('click', function () {
      studioState.clips = buildSampleClips();
      persistClips();
      renderAll();
    });

    document.getElementById('btnClearQueue').addEventListener('click', function () {
      studioState.clips = [];
      persistClips();
      renderAll();
    });

    document.getElementById('btnStudioUnlock').addEventListener('click', function () {
      var raw = (document.getElementById('inpStudioKey').value || '').trim();
      var msg = document.getElementById('studioGateMsg');
      if (!raw || !root.CraftLeafSDK) {
        msg.textContent = 'Enter a valid CLEANPRO-... or STUDIOALL-... key.';
        return;
      }
      root.CraftLeafSDK.verifyLicense('cleanPrintPro', raw, { keyPrefix: 'CLEANPRO' }).then(function (res) {
        if (res && res.valid) {
          studioState.isPro = true;
          var patch = {};
          patch[LICENSE_KEY] = { unlocked: true, key: res.key, mode: res.mode, unlockedAt: new Date().toISOString() };
          storageSet(patch).then(function () {
            renderAll();
          });
        } else {
          msg.textContent = 'Invalid key checksum. Check CLEANPRO-XXXX-XXXX-XXXXXX.';
        }
      });
    });

    document.getElementById('btnPrintCombined').addEventListener('click', function () {
      if (!studioState.isPro) {
        document.getElementById('studioGateMsg').textContent = 'Please unlock CleanPrint Pro ($5.99 lifetime) above to export combined multi-tab PDFs.';
        document.getElementById('inpStudioKey').focus();
        return;
      }
      if (!studioState.clips.length) {
        document.getElementById('printStatusHint').textContent = 'Add at least 1 clip (or click "+ Sample Pack") before printing.';
        return;
      }
      root.print();
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initStudio);
    } else {
      initStudio();
    }
  }

  root.__CleanPrintQueueStudio = {
    buildSampleClips: buildSampleClips
  };
})(typeof window !== 'undefined' ? window : globalThis);
