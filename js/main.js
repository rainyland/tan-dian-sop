/* ============================================================
   探店执行手册 · 交互脚本
   只做一件事：把每页的「可复制指令」复制到剪贴板
   ============================================================ */

(function () {
  'use strict';

  var toastEl = null;
  var toastTimer = null;

  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'toast';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove('show');
    }, 1600);
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'readonly');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.left = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    var ok = false;
    try {
      ok = document.execCommand('copy');
    } catch (e) {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }

  function copyText(text) {
    if (legacyCopy(text)) { return Promise.resolve(true); }
    if (navigator.clipboard && navigator.clipboard.writeText && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return false; });
    }
    return Promise.resolve(false);
  }

  function selectNodeText(el) {
    try {
      var range = document.createRange();
      range.selectNodeContents(el);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    } catch (e) {
      return false;
    }
  }

  function bindCopyButtons() {
    var buttons = document.querySelectorAll('.copy-btn');
    Array.prototype.forEach.call(buttons, function (btn) {
      if (btn.dataset.bound === 'true') { return; }
      btn.dataset.bound = 'true';
      btn.addEventListener('click', function () {
        var holder = btn.closest('.prompt');
        var body = holder ? holder.querySelector('pre') : null;
        if (!body) {
          toast('没有找到可复制的指令正文');
          return;
        }
        var text = body.innerText.replace(/\u00a0/g, ' ');
        copyText(text).then(function (ok) {
          if (ok) {
            toast('已复制');
            var old = btn.textContent;
            btn.dataset.copied = 'true';
            btn.textContent = '已复制';
            window.setTimeout(function () {
              btn.dataset.copied = 'false';
              btn.textContent = old === '已复制' ? '复制' : old;
            }, 1600);
          } else if (selectNodeText(body)) {
            toast('已选中这段指令，按 Ctrl+C 即可复制');
          } else {
            toast('浏览器不允许自动复制，请手动选中指令文本');
          }
        });
      });
    });
  }

  function boot() {
    bindCopyButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
