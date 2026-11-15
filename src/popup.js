/**
 * CleanPrint & AI-Chat to PDF Studio — Extension Popup Controller
 * Uses strictly activeTab + scripting + storage. Zero external network telemetry.
 */
(function (root) {
  'use strict';

  var api = (typeof browser !== 'undefined' && browser && browser.runtime)
    ? browser
    : (typeof chrome !== 'undefined' && chrome && chrome.runtime ? chrome : null);

  var SETTINGS_KEY = 'cleanprint_settings_v1';
  var QUEUE_KEY = 'cleanprint_queue_v1';
  var LICENSE_KEY = 'cleanprint_license_v1';
  var LANG_KEY = 'cleanprint_lang_v1';

  var I18N = {
    en: {
      clutterRemoved: 'Clutter Stripped',
      inkSaved: 'Est. Ink Saved',
      cleanPages: 'Vector Pages',
      purifyBtn: 'Purify Article / AI Chat',
      exitPurifyBtn: 'Restore Original Web View',
      printPdfBtn: 'Instant Print / Save Vector PDF',
      freeControlsTitle: 'CLEAN READER & ECO INK',
      lowInkTitle: 'Eco Low-Ink Print Stylesheet',
      lowInkDesc: 'Strips dark fills & terminal backgrounds; crisp borders',
      hideImagesTitle: 'Hide Article Images',
      hideImagesDesc: 'Text & code only for compact study handouts',
      fontSizeTitle: 'Print Font Size',
      proStudioTitle: 'PRO MULTI-TAB & BOOKLET STUDIO',
      clipToQueueBtn: '+ Clip Tab / Selection',
      openQueueBtn: 'Queue & TOC',
      themeTitle: 'Typography & Booklet Theme',
      themeStandard: 'Modern Clean Sans (Free)',
      themeAcademicLocked: '🔒 Academic Serif Paper (Pro)',
      themeSwissLocked: '🔒 Minimalist Swiss Grid (Pro)',
      themeTwoColLocked: '🔒 Compact 2-Column Study Sheet (Pro)',
      themeBookletLocked: '🔒 2-Up Landscape Booklet (Pro)',
      themeAcademicUnlocked: 'Academic Serif Paper (Pro)',
      themeSwissUnlocked: 'Minimalist Swiss Grid (Pro)',
      themeTwoColUnlocked: 'Compact 2-Column Study Sheet (Pro)',
      themeBookletUnlocked: '2-Up Landscape Booklet (Pro)',
      headerFooterTitle: 'Remove Browser URL/Date Headers',
      unlockPitch: 'One-time $5.99 lifetime key — unlocks Multi-Tab PDF Queue + TOC, 4 Pro Themes & Marginless Header Remover.',
      activateBtn: 'Unlock',
      getLicenseLink: 'Get Lifetime Key ($5.99) →',
      optionsLink: 'Settings & Privacy',
      privacyFooter: 'Zero cloud uploads · Runs 100% offline in your browser',
      restrictedMsg: 'Browser internal page detected. Switch to any web article, GitHub doc, or AI chat (ChatGPT / Claude / Copilot) to purify & print.',
      proRequiredHint: 'Enter your $5.99 CLEANPRO lifetime key below to unlock Multi-Tab Queue & Pro Themes.',
      clippedOk: 'Clipped to Print Queue! Total items: ',
      clippedSelOk: 'Clipped highlighted selection! Total items: ',
      keyValidMsg: 'Pro Studio Unlocked! Lifetime features active.',
      keyInvalidMsg: 'Invalid key. Expected CLEANPRO-XXXX-XXXX-XXXXXX or STUDIOALL-...'
    },
    zh: {
      clutterRemoved: '移除广告杂项',
      inkSaved: '预计省墨比例',
      cleanPages: '矢量排版页数',
      purifyBtn: '一键净化网页 / AI 对话',
      exitPurifyBtn: '退出净版 · 恢复原网页',
      printPdfBtn: '立即打印 / 导出高清矢量 PDF',
      freeControlsTitle: '免费净版阅读与省墨控制',
      lowInkTitle: 'Eco 环保省墨打印模式',
      lowInkDesc: '去除代码块黑底与深色背景，保留清晰细线边框',
      hideImagesTitle: '隐藏正文配图',
      hideImagesDesc: '纯文本与代码紧凑排版，适合复习讲义打印',
      fontSizeTitle: '打印正文字号',
      proStudioTitle: 'PRO 多标签合并与专业拼版工坊',
      clipToQueueBtn: '+ 加入多页待印队列',
      openQueueBtn: '合并打印台',
      themeTitle: '专业排版与双栏小册子主题',
      themeStandard: '现代清爽无衬线 (免费)',
      themeAcademicLocked: '🔒 学术论文衬线排版 (Pro)',
      themeSwissLocked: '🔒 极简瑞士网格排版 (Pro)',
      themeTwoColLocked: '🔒 紧凑双栏复习讲义 (Pro)',
      themeBookletLocked: '🔒 横向双页对折小册子 (Pro)',
      themeAcademicUnlocked: '学术论文衬线排版 (Pro)',
      themeSwissUnlocked: '极简瑞士网格排版 (Pro)',
      themeTwoColUnlocked: '紧凑双栏复习讲义 (Pro)',
      themeBookletUnlocked: '横向双页对折小册子 (Pro)',
      headerFooterTitle: '自动隐藏浏览器页眉网址与日期',
      unlockPitch: '$5.99 / ¥19.9 一次买断终身解锁：跨标签多文章合并导出 PDF（自动生成目录）、4 款专业排版与去页眉页脚。',
      activateBtn: '激活解锁',
      getLicenseLink: '获取终身激活码 (¥19.9 / $5.99) →',
      optionsLink: '偏好与隐私说明',
      privacyFooter: '零云端上传 · 100% 浏览器纯本地离线处理',
      restrictedMsg: '当前为浏览器系统内置页。请切换到任意网页文章、GitHub 文档或 ChatGPT / Claude / Copilot 对话页使用。',
      proRequiredHint: '请在下方输入 CLEANPRO 终身激活码解锁跨标签合并队列与专业主题。',
      clippedOk: '已加入合并打印队列！当前共 ',
      clippedSelOk: '已截取选中内容入队！当前共 ',
      keyValidMsg: 'Pro 专业版已永久激活！全部高级功能已解锁。',
      keyInvalidMsg: '激活码格式有误，请输入 CLEANPRO-... 或 STUDIOALL-... 密钥'
    }
  };

  var uiState = {
    lang: 'en',
    isPro: false,
    activeTabId: null,
    canScriptTab: false,
    readerActive: false,
    queueCount: 0,
    settings: {
      lowInk: true,
      hideImages: false,
      fontSize: 12,
      theme: 'standard',
      removeHeaderFooter: false
    }
  };

  function storageGet(keys) {
    if (!api || !api.storage || !api.storage.local) return Promise.resolve({});
    return new Promise(function (resolve) {
      try {
        var p = api.storage.local.get(keys, function (res) { resolve(res || {}); });
        if (p && typeof p.then === 'function') {
          p.then(function (res) { resolve(res || {}); }).catch(function () { resolve({}); });
        }
      } catch (_e) {
        resolve({});
      }
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
      } catch (_e) {
        resolve();
      }
    });
  }

  function queryActiveTab() {
    if (!api || !api.tabs || !api.tabs.query) return Promise.resolve(null);
    return new Promise(function (resolve) {
      try {
        var p = api.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          resolve((tabs && tabs[0]) || null);
        });
        if (p && typeof p.then === 'function') {
          p.then(function (tabs) { resolve((tabs && tabs[0]) || null); }).catch(function () { resolve(null); });
        }
      } catch (_e) {
        resolve(null);
      }
    });
  }

  function isScriptableUrl(url) {
    if (!url) return false;
    if (/^(chrome|edge|about|moz-extension|chrome-extension|view-source):/i.test(url)) return false;
    if (/^https?:\/\/(chromewebstore\.google\.com|microsoftedge\.microsoft\.com\/addons|addons\.mozilla\.org)/i.test(url)) return false;
    return /^(https?|file):/i.test(url);
  }

  function ensurePurifierInjected(tabId) {
    if (!api || !api.scripting || !api.scripting.executeScript) {
      return Promise.resolve(false);
    }
    return new Promise(function (resolve) {
      try {
        var p = api.scripting.executeScript({
          target: { tabId: tabId },
          files: ['purifier.js']
        }, function () {
          if (api.runtime && api.runtime.lastError) {
            resolve(false);
            return;
          }
          resolve(true);
        });
        if (p && typeof p.then === 'function') {
          p.then(function () { resolve(true); }).catch(function () { resolve(false); });
        }
      } catch (_e) {
        resolve(false);
      }
    });
  }

  function callTabPurifier(methodName, arg1, arg2) {
    if (!uiState.activeTabId || !uiState.canScriptTab) {
      return Promise.resolve(null);
    }
    return ensurePurifierInjected(uiState.activeTabId).then(function (ok) {
      if (!ok) return null;
      return new Promise(function (resolve) {
        try {
          var exec = api.scripting.executeScript({
            target: { tabId: uiState.activeTabId },
            func: function (mName, a1, a2) {
              var studio = window.__CleanPrintStudio;
              if (!studio || typeof studio[mName] !== 'function') return null;
              return studio[mName](a1, a2);
            },
            args: [methodName, arg1 === undefined ? null : arg1, arg2 === undefined ? null : arg2]
          }, function (results) {
            if (api.runtime && api.runtime.lastError) {
              resolve(null);
              return;
            }
            resolve(results && results[0] ? results[0].result : null);
          });
          if (exec && typeof exec.then === 'function') {
            exec.then(function (results) {
              resolve(results && results[0] ? results[0].result : null);
            }).catch(function () { resolve(null); });
          }
        } catch (_e) {
          resolve(null);
        }
      });
    });
  }

  function t(key) {
    var dict = I18N[uiState.lang] || I18N.en;
    return dict[key] || I18N.en[key] || key;
  }

  function refreshTranslations() {
    document.getElementById('langBtn').textContent = uiState.lang === 'en' ? '中文' : 'EN';
    Array.prototype.forEach.call(document.querySelectorAll('[data-i18n]'), function (node) {
      var key = node.getAttribute('data-i18n');
      if (key === 'purifyBtn') {
        node.textContent = uiState.readerActive ? t('exitPurifyBtn') : t('purifyBtn');
      } else if (key === 'themeAcademic') {
        node.textContent = uiState.isPro ? t('themeAcademicUnlocked') : t('themeAcademicLocked');
      } else if (key === 'themeSwiss') {
        node.textContent = uiState.isPro ? t('themeSwissUnlocked') : t('themeSwissLocked');
      } else if (key === 'themeTwoCol') {
        node.textContent = uiState.isPro ? t('themeTwoColUnlocked') : t('themeTwoColLocked');
      } else if (key === 'themeBooklet') {
        node.textContent = uiState.isPro ? t('themeBookletUnlocked') : t('themeBookletLocked');
      } else {
        node.textContent = t(key);
      }
    });
    document.getElementById('restrictedText').textContent = t('restrictedMsg');
  }

  function syncProVisualState() {
    var tierBadge = document.getElementById('tierBadge');
    var proLockLabel = document.getElementById('proLockLabel');
    var unlockDrawer = document.getElementById('unlockDrawer');

    if (uiState.isPro) {
      tierBadge.textContent = 'PRO';
      tierBadge.classList.add('is-pro');
      proLockLabel.textContent = uiState.lang === 'zh' ? 'PRO 已激活' : 'PRO UNLOCKED';
      proLockLabel.classList.add('unlocked');
      unlockDrawer.classList.add('hidden');
    } else {
      tierBadge.textContent = 'FREE';
      tierBadge.classList.remove('is-pro');
      proLockLabel.textContent = uiState.lang === 'zh' ? 'PRO · ¥19.9' : 'PRO · $5.99';
      proLockLabel.classList.remove('unlocked');
      unlockDrawer.classList.remove('hidden');
    }

    var cfg = (root.CraftLeafSDK && root.CraftLeafSDK.getConfig && root.CraftLeafSDK.getConfig()) || {};
    var prodCfg = (cfg.products && cfg.products.cleanPrintPro) || {};
    var buyLink = document.getElementById('lnkBuyPro');
    if (buyLink) {
      buyLink.href = (uiState.lang === 'zh' ? prodCfg.checkoutUrlZh : prodCfg.checkoutUrlEn) ||
        'https://963239327.github.io/craftleaf-studio/extensions/cleanprint/#pro';
    }
    refreshTranslations();
  }

  function renderStatusMetrics(status) {
    var btnPurify = document.getElementById('btnPurify');
    var btnPurifyLabel = document.getElementById('btnPurifyLabel');
    if (!status) {
      uiState.readerActive = false;
      btnPurify.classList.remove('is-active');
      btnPurifyLabel.textContent = t('purifyBtn');
      return;
    }
    uiState.readerActive = Boolean(status.active);
    if (uiState.readerActive) {
      btnPurify.classList.add('is-active');
      btnPurifyLabel.textContent = t('exitPurifyBtn');
    } else {
      btnPurify.classList.remove('is-active');
      btnPurifyLabel.textContent = t('purifyBtn');
    }

    document.getElementById('statusPlatform').textContent =
      status.platform + (status.pageType === 'ai-chat' ? ' · AI Q&A Ready' : ' · Local Mode');
    document.getElementById('metricClutter').textContent = String(status.clutterRemoved || 6);
    document.getElementById('metricInk').textContent = '~' + String(status.inkSavedPct || (uiState.settings.lowInk ? 58 : 28)) + '%';
    document.getElementById('metricPages').textContent = '~' + String(status.estPages || 2) + 'p';
  }

  function saveAndPushSettings() {
    var patch = {};
    patch[SETTINGS_KEY] = uiState.settings;
    storageSet(patch);
    document.getElementById('metricInk').textContent = uiState.settings.lowInk ? '~60%' : '~28%';
    if (uiState.canScriptTab) {
      callTabPurifier('updateSettings', uiState.settings, uiState.isPro).then(renderStatusMetrics);
    }
  }

  function showQueueFeedback(msg, isWarn) {
    var fb = document.getElementById('queueFeedback');
    fb.textContent = msg;
    fb.className = 'feedback-line' + (isWarn ? ' warn' : '');
  }

  function openQueueStudio() {
    if (api && api.tabs && api.tabs.create) {
      api.tabs.create({ url: api.runtime.getURL('queue-studio.html') });
      if (typeof window !== 'undefined' && window.close) window.close();
    }
  }

  function openOptionsPage() {
    if (!api) return;
    if (api.runtime && api.runtime.openOptionsPage) {
      api.runtime.openOptionsPage();
    } else if (api.tabs && api.tabs.create) {
      api.tabs.create({ url: api.runtime.getURL('options.html') });
    }
  }

  function initPopup() {
    var sdkUnlocked = Boolean(root.CraftLeafSDK && root.CraftLeafSDK.isUnlocked('cleanPrintPro', 'CLEANPRO'));

    Promise.all([
      storageGet([SETTINGS_KEY, QUEUE_KEY, LICENSE_KEY, LANG_KEY]),
      queryActiveTab()
    ]).then(function (arr) {
      var stored = arr[0] || {};
      var tab = arr[1];

      if (stored[LANG_KEY] === 'zh' || stored[LANG_KEY] === 'en') {
        uiState.lang = stored[LANG_KEY];
      } else if (typeof navigator !== 'undefined' && /^zh/i.test(navigator.language || '')) {
        uiState.lang = 'zh';
      }

      var licObj = stored[LICENSE_KEY];
      uiState.isPro = Boolean(sdkUnlocked);
      if (!uiState.isPro && licObj && typeof licObj.key === 'string' && licObj.key.trim().length >= 8 && root.CraftLeafSDK) {
        root.CraftLeafSDK.verifyLicense('cleanPrintPro', licObj.key.trim()).then(function (vRes) {
          if (vRes && vRes.valid) {
            uiState.isPro = true;
            syncProVisualState();
          } else if (vRes && vRes.reason !== 'network_error') {
            var clearPatch = {};
            clearPatch[LICENSE_KEY] = null;
            storageSet(clearPatch);
          }
        });
      }

      if (stored[SETTINGS_KEY]) {
        uiState.settings = Object.assign({}, uiState.settings, stored[SETTINGS_KEY]);
      }
      if (!uiState.isPro) {
        if (uiState.settings.theme !== 'standard') uiState.settings.theme = 'standard';
        uiState.settings.removeHeaderFooter = false;
      }

      var queueItems = Array.isArray(stored[QUEUE_KEY]) ? stored[QUEUE_KEY] : [];
      uiState.queueCount = queueItems.length;
      document.getElementById('queueCountBadge').textContent = String(uiState.queueCount);

      document.getElementById('chkLowInk').checked = Boolean(uiState.settings.lowInk);
      document.getElementById('chkHideImages').checked = Boolean(uiState.settings.hideImages);
      document.getElementById('rngFontSize').value = String(uiState.settings.fontSize || 12);
      document.getElementById('fontSizeVal').textContent = (uiState.settings.fontSize || 12) + 'pt';
      document.getElementById('selTheme').value = uiState.settings.theme || 'standard';
      document.getElementById('chkRemoveHeaderFooter').checked = Boolean(uiState.settings.removeHeaderFooter);

      syncProVisualState();

      if (tab && tab.id && isScriptableUrl(tab.url || '')) {
        uiState.activeTabId = tab.id;
        uiState.canScriptTab = true;
        callTabPurifier('getStatus').then(function (status) {
          if (status) {
            renderStatusMetrics(status);
          } else {
            uiState.canScriptTab = false;
            document.getElementById('restrictedBanner').classList.remove('hidden');
            document.getElementById('btnPurify').disabled = true;
            document.getElementById('btnPrint').disabled = true;
          }
        });
      } else {
        uiState.canScriptTab = false;
        document.getElementById('restrictedBanner').classList.remove('hidden');
        document.getElementById('btnPurify').disabled = true;
        document.getElementById('btnPrint').disabled = true;
      }
    });

    document.getElementById('langBtn').addEventListener('click', function () {
      uiState.lang = uiState.lang === 'en' ? 'zh' : 'en';
      var patch = {};
      patch[LANG_KEY] = uiState.lang;
      storageSet(patch);
      syncProVisualState();
    });

    document.getElementById('btnPurify').addEventListener('click', function () {
      callTabPurifier('toggle', uiState.settings, uiState.isPro).then(renderStatusMetrics);
    });

    document.getElementById('btnPrint').addEventListener('click', function () {
      callTabPurifier('triggerPrint', uiState.settings, uiState.isPro).then(function (status) {
        renderStatusMetrics(status);
      });
    });

    document.getElementById('chkLowInk').addEventListener('change', function (ev) {
      uiState.settings.lowInk = Boolean(ev.target.checked);
      saveAndPushSettings();
    });

    document.getElementById('chkHideImages').addEventListener('change', function (ev) {
      uiState.settings.hideImages = Boolean(ev.target.checked);
      saveAndPushSettings();
    });

    document.getElementById('rngFontSize').addEventListener('input', function (ev) {
      var val = Number(ev.target.value) || 12;
      uiState.settings.fontSize = val;
      document.getElementById('fontSizeVal').textContent = val + 'pt';
      saveAndPushSettings();
    });

    document.getElementById('selTheme').addEventListener('change', function (ev) {
      var picked = ev.target.value;
      if (picked !== 'standard' && !uiState.isPro) {
        ev.target.value = 'standard';
        showQueueFeedback(t('proRequiredHint'), true);
        document.getElementById('inpLicenseKey').focus();
        return;
      }
      uiState.settings.theme = picked;
      saveAndPushSettings();
    });

    document.getElementById('chkRemoveHeaderFooter').addEventListener('change', function (ev) {
      if (!uiState.isPro) {
        ev.target.checked = false;
        showQueueFeedback(t('proRequiredHint'), true);
        document.getElementById('inpLicenseKey').focus();
        return;
      }
      uiState.settings.removeHeaderFooter = Boolean(ev.target.checked);
      saveAndPushSettings();
    });

    document.getElementById('btnClipTab').addEventListener('click', function () {
      if (!uiState.isPro) {
        showQueueFeedback(t('proRequiredHint'), true);
        document.getElementById('inpLicenseKey').focus();
        return;
      }
      if (!uiState.canScriptTab) {
        showQueueFeedback(t('restrictedMsg'), true);
        return;
      }
      callTabPurifier('extractClip', true).then(function (res) {
        if (!res || !res.ok || !res.clip) {
          showQueueFeedback('Could not extract readable blocks from this tab.', true);
          return;
        }
        storageGet([QUEUE_KEY]).then(function (data) {
          var list = Array.isArray(data[QUEUE_KEY]) ? data[QUEUE_KEY] : [];
          if (list.length >= 40) list = list.slice(list.length - 39);
          list.push(res.clip);
          var patch = {};
          patch[QUEUE_KEY] = list;
          storageSet(patch).then(function () {
            uiState.queueCount = list.length;
            document.getElementById('queueCountBadge').textContent = String(list.length);
            showQueueFeedback((res.fromSelection ? t('clippedSelOk') : t('clippedOk')) + list.length, false);
            if (api && api.runtime && api.runtime.sendMessage) {
              api.runtime.sendMessage({ type: 'SYNC_BADGE' });
            }
          });
        });
      });
    });

    document.getElementById('btnOpenQueue').addEventListener('click', openQueueStudio);
    document.getElementById('btnOpenOptions').addEventListener('click', openOptionsPage);
    document.getElementById('btnFooterOptions').addEventListener('click', openOptionsPage);

    document.getElementById('btnVerifyKey').addEventListener('click', function () {
      var rawKey = (document.getElementById('inpLicenseKey').value || '').trim();
      var msgEl = document.getElementById('licenseMsg');
      if (!rawKey || !root.CraftLeafSDK) {
        msgEl.textContent = t('keyInvalidMsg');
        msgEl.className = 'license-msg err';
        return;
      }
      root.CraftLeafSDK.verifyLicense('cleanPrintPro', rawKey, { keyPrefix: 'CLEANPRO' }).then(function (result) {
        if (result && result.valid) {
          uiState.isPro = true;
          var patch = {};
          patch[LICENSE_KEY] = {
            key: rawKey,
            mode: result.mode,
            cachedAt: new Date().toISOString()
          };
          storageSet(patch).then(function () {
            msgEl.textContent = t('keyValidMsg');
            msgEl.className = 'license-msg ok';
            showQueueFeedback(t('keyValidMsg'), false);
            syncProVisualState();
            saveAndPushSettings();
          });
        } else {
          msgEl.textContent = t('keyInvalidMsg');
          msgEl.className = 'license-msg err';
        }
      });
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initPopup);
    } else {
      initPopup();
    }
  }

  root.__CleanPrintPopup = {
    isScriptableUrl: isScriptableUrl
  };
})(typeof window !== 'undefined' ? window : globalThis);
