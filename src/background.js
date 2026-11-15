/**
 * CleanPrint & AI-Chat to PDF Studio — MV3 Background Coordinator
 * Cross-browser compatible: Chromium/Edge service_worker & Firefox MV3 background scripts.
 * Zero network calls, zero telemetry, 100% local storage coordination.
 */
(function (root) {
  'use strict';

  var api = (typeof browser !== 'undefined' && browser && browser.runtime)
    ? browser
    : (typeof chrome !== 'undefined' && chrome && chrome.runtime ? chrome : null);

  var QUEUE_KEY = 'cleanprint_queue_v1';
  var LICENSE_KEY = 'cleanprint_license_v1';

  function storageGet(keys) {
    if (!api || !api.storage || !api.storage.local) {
      return Promise.resolve({});
    }
    return new Promise(function (resolve) {
      try {
        var maybePromise = api.storage.local.get(keys, function (res) {
          resolve(res || {});
        });
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(function (res) { resolve(res || {}); }).catch(function () { resolve({}); });
        }
      } catch (_err) {
        resolve({});
      }
    });
  }

  function storageSet(obj) {
    if (!api || !api.storage || !api.storage.local) {
      return Promise.resolve();
    }
    return new Promise(function (resolve) {
      try {
        var maybePromise = api.storage.local.set(obj, function () { resolve(); });
        if (maybePromise && typeof maybePromise.then === 'function') {
          maybePromise.then(function () { resolve(); }).catch(function () { resolve(); });
        }
      } catch (_err) {
        resolve();
      }
    });
  }

  function updateQueueBadge() {
    if (!api || !api.action) return Promise.resolve();
    return storageGet([QUEUE_KEY]).then(function (data) {
      var list = Array.isArray(data[QUEUE_KEY]) ? data[QUEUE_KEY] : [];
      var count = list.length;
      var text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
      try {
        api.action.setBadgeText({ text: text });
        if (count > 0 && api.action.setBadgeBackgroundColor) {
          api.action.setBadgeBackgroundColor({ color: '#059669' });
        }
      } catch (_e) {}
    });
  }

  function appendClipToQueue(clip) {
    if (!clip || !clip.blocks || !clip.blocks.length) {
      return Promise.resolve({ ok: false, reason: 'empty_clip' });
    }
    return storageGet([QUEUE_KEY, LICENSE_KEY]).then(function (data) {
      var lic = data[LICENSE_KEY];
      if (!lic || !lic.unlocked) {
        return { ok: false, reason: 'pro_required' };
      }
      var list = Array.isArray(data[QUEUE_KEY]) ? data[QUEUE_KEY] : [];
      if (list.length >= 40) {
        list = list.slice(list.length - 39);
      }
      list.push(clip);
      var patch = {};
      patch[QUEUE_KEY] = list;
      return storageSet(patch).then(function () {
        return updateQueueBadge().then(function () {
          return { ok: true, count: list.length };
        });
      });
    });
  }

  if (api && api.runtime) {
    if (api.runtime.onInstalled) {
      api.runtime.onInstalled.addListener(function () {
        updateQueueBadge();
      });
    }
    if (api.runtime.onStartup) {
      api.runtime.onStartup.addListener(function () {
        updateQueueBadge();
      });
    }
    if (api.storage && api.storage.onChanged) {
      api.storage.onChanged.addListener(function (changes, area) {
        if (area === 'local' && changes && changes[QUEUE_KEY]) {
          updateQueueBadge();
        }
      });
    }
    if (api.runtime.onMessage) {
      api.runtime.onMessage.addListener(function (msg, _sender, sendResponse) {
        if (!msg || typeof msg !== 'object') return false;
        if (msg.type === 'SYNC_BADGE') {
          updateQueueBadge().then(function () {
            sendResponse({ ok: true });
          });
          return true;
        }
        if (msg.type === 'APPEND_CLIP_FROM_PAGE') {
          appendClipToQueue(msg.clip).then(function (res) {
            sendResponse(res);
          });
          return true;
        }
        if (msg.type === 'OPEN_QUEUE_STUDIO') {
          if (api.tabs && api.tabs.create) {
            api.tabs.create({ url: api.runtime.getURL('queue-studio.html') });
          }
          sendResponse({ ok: true });
          return false;
        }
        return false;
      });
    }
  }

  root.__CleanPrintBackground = {
    updateQueueBadge: updateQueueBadge,
    appendClipToQueue: appendClipToQueue
  };
})(typeof self !== 'undefined' ? self : globalThis);
