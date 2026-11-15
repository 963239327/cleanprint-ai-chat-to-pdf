/**
 * CleanPrint & AI-Chat to PDF Studio — Options & License Manager
 */
(function (root) {
  'use strict';

  var api = (typeof browser !== 'undefined' && browser && browser.runtime)
    ? browser
    : (typeof chrome !== 'undefined' && chrome && chrome.runtime ? chrome : null);

  var SETTINGS_KEY = 'cleanprint_settings_v1';
  var LICENSE_KEY = 'cleanprint_license_v1';

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

  function renderLicenseUi(licObj) {
    var badge = document.getElementById('optTierBadge');
    var statusEl = document.getElementById('optLicenseStatus');
    var resetBtn = document.getElementById('optBtnDeactivate');
    var inp = document.getElementById('optLicenseInput');

    if (licObj && licObj.unlocked) {
      badge.textContent = 'PRO LIFETIME UNLOCKED';
      badge.classList.add('pro');
      inp.value = licObj.key || 'CLEANPRO-VERIFIED';
      statusEl.textContent = 'Active Pro License (' + (licObj.mode || 'offline') + ' verified). All Multi-Tab & Booklet features unlocked.';
      statusEl.className = 'status-msg ok';
      resetBtn.classList.remove('hidden');
    } else {
      badge.textContent = 'FREE EDITION';
      badge.classList.remove('pro');
      resetBtn.classList.add('hidden');
    }
  }

  function initOptions() {
    var sdkUnlocked = Boolean(root.CraftLeafSDK && root.CraftLeafSDK.isUnlocked('cleanPrintPro', 'CLEANPRO'));

    storageGet([SETTINGS_KEY, LICENSE_KEY]).then(function (data) {
      var prefs = data[SETTINGS_KEY] || { lowInk: true, hideImages: false, fontSize: 12 };
      document.getElementById('optLowInk').checked = Boolean(prefs.lowInk);
      document.getElementById('optHideImages').checked = Boolean(prefs.hideImages);
      document.getElementById('optFontSize').value = String(prefs.fontSize || 12);

      var lic = data[LICENSE_KEY];
      if (sdkUnlocked) {
        renderLicenseUi({ unlocked: true, mode: 'gumroad' });
      } else if (lic && typeof lic.key === 'string' && lic.key.trim().length >= 8 && root.CraftLeafSDK) {
        renderLicenseUi(null);
        root.CraftLeafSDK.verifyLicense('cleanPrintPro', lic.key.trim()).then(function (vRes) {
          if (vRes && vRes.valid) {
            renderLicenseUi({ unlocked: true, mode: 'gumroad' });
          } else if (vRes && vRes.reason !== 'network_error') {
            var clearPatch = {};
            clearPatch[LICENSE_KEY] = null;
            storageSet(clearPatch);
          }
        });
      } else {
        renderLicenseUi(null);
      }
    });

    document.getElementById('optBtnVerify').addEventListener('click', function () {
      var raw = (document.getElementById('optLicenseInput').value || '').trim();
      var statusEl = document.getElementById('optLicenseStatus');
      if (!raw || !root.CraftLeafSDK) {
        statusEl.textContent = 'Please enter a valid CLEANPRO-... or STUDIOALL-... key.';
        statusEl.className = 'status-msg err';
        return;
      }
      root.CraftLeafSDK.verifyLicense('cleanPrintPro', raw, { keyPrefix: 'CLEANPRO' }).then(function (res) {
        if (res && res.valid) {
          var licObj = {
            key: raw,
            mode: res.mode,
            cachedAt: new Date().toISOString()
          };
          var patch = {};
          patch[LICENSE_KEY] = licObj;
          storageSet(patch).then(function () {
            renderLicenseUi({ unlocked: true, mode: 'gumroad' });
          });
        } else {
          statusEl.textContent = 'Invalid license key. Expected XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX or STUDIOALL-...';
          statusEl.className = 'status-msg err';
        }
      });
    });

    document.getElementById('optBtnDeactivate').addEventListener('click', function () {
      try {
        localStorage.removeItem('craftleaf_license_cleanPrintPro');
        localStorage.removeItem('craftleaf_license_allAccessPass');
      } catch (_e) {}
      var patch = {};
      patch[LICENSE_KEY] = { unlocked: false };
      storageSet(patch).then(function () {
        document.getElementById('optLicenseInput').value = '';
        document.getElementById('optLicenseStatus').textContent = 'License cleared on this browser profile.';
        document.getElementById('optLicenseStatus').className = 'status-msg';
        renderLicenseUi({ unlocked: false });
      });
    });

    document.getElementById('optBtnSavePrefs').addEventListener('click', function () {
      storageGet([SETTINGS_KEY]).then(function (data) {
        var existing = data[SETTINGS_KEY] || {};
        var fs = Number(document.getElementById('optFontSize').value) || 12;
        if (fs < 10) fs = 10;
        if (fs > 16) fs = 16;
        var updated = Object.assign({}, existing, {
          lowInk: Boolean(document.getElementById('optLowInk').checked),
          hideImages: Boolean(document.getElementById('optHideImages').checked),
          fontSize: fs
        });
        var patch = {};
        patch[SETTINGS_KEY] = updated;
        storageSet(patch).then(function () {
          var toast = document.getElementById('optSaveToast');
          toast.textContent = '✓ Saved!';
          setTimeout(function () { toast.textContent = ''; }, 2200);
        });
      });
    });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initOptions);
    } else {
      initOptions();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
