/* ============================================================
   台账工具 · ledger-tool.js
   作用：把 md 台账变成可查询的数据（判重 / 导出集合）
   原则：纯前端、零依赖、不联网、不上传；数据只存在本机 localStorage
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'store-playbook-ledger-text';
  var records = [];
  var batchLabel = '';

  /* ---------- 工具函数 ---------- */

  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/[（）()【】\[\]「」『』·、,，。:：;；!！?？"'’“”\s\-—–~]/g, '')
      .toLowerCase();
  }

  function cellText(cell) {
    return String(cell || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\*\*/g, '')
      .trim();
  }

  /* ---------- 解析 md ---------- */

  function parseMarkdown(text) {
    var lines = String(text || '').split(/\r?\n/);
    var out = [];
    var header = null;
    var isReportTable = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();

      if (/^#{2,3}\s/.test(line)) {
        var head = line.replace(/^#{2,3}\s*/, '');
        // 标题里常带「一·补五、本轮已完成四件套 · 第22批·11-18 …」，
        // 批次只取从「第N批」开始的那段，前面的序号说明丢掉
        var m = /第\s*[0-9]{1,3}\s*批.*/.exec(head);
        batchLabel = (m ? m[0] : head).replace(/[·、,，\s]+$/, '').slice(0, 50);
        header = null;
        continue;
      }

      if (line.charAt(0) !== '|') {
        header = null;
        continue;
      }

      var cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|');
      cells = cells.map(cellText);

      // 分隔行 |---|:--|
      var isSep = cells.every(function (c) { return c === '' || /^:?-{2,}:?$/.test(c); });
      if (isSep) continue;

      if (!header) {
        if (cells.some(function (c) { return /品牌|店名|门店|名称/.test(c); })) {
          header = cells;
          // 区分「报名记录表」和「排查/跳过名单表」：
          // 只有带状态、报名、中签、收货、体验、发布这类字段的，才算真的报过
          isReportTable = header.some(function (h) {
            return /状态|报名|中签|收货|体验|发布|动作/.test(h);
          });
        }
        continue;
      }

      var rec = {};
      for (var j = 0; j < header.length; j++) {
        rec[header[j]] = cells[j] || '';
      }

      var brand = rec['标准品牌名称'] || rec['品牌/门店'] || rec['品牌'] || rec['店名'] || rec['门店'] || '';
      if (!brand) continue;

      out.push({
        brand: brand,
        brandNorm: norm(brand),
        shop: rec['店名'] || rec['品牌/门店'] || '',
        activity: rec['招募活动名称'] || rec['招募活动'] || '',
        status: rec['当前状态'] || rec['状态'] || rec['报名动作'] || '',
        signed: rec['是否中签'] || '',
        recv: rec['是否已收货'] || '',
        tried: rec['是否已体验'] || '',
        published: rec['是否已发布'] || '',
        date: rec['日期'] || rec['招募发布时间'] || rec['发布'] || '',
        type: rec['类型'] || rec['品类'] || '',
        note: rec['备注'] || rec['门槛要点'] || '',
        batch: batchLabel,
        kind: isReportTable ? 'report' : 'screened'
      });
    }

    return out;
  }

  /* ---------- 渲染 ---------- */

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function setStat(text) {
    var el = document.getElementById('toolStat');
    if (el) el.textContent = text;
  }

  function loadText(text, sourceLabel) {
    records = parseMarkdown(text);
    if (!records.length) {
      setStat('没解析到任何记录 —— 检查是不是台账原文（表格要以 | 开头）');
      return;
    }
    var repCount = records.filter(function (r) { return r.kind === 'report'; }).length;
    setStat('已载入 ' + records.length + ' 条 · 其中报名记录 ' + repCount + ' 条 · 来源：' + sourceLabel);
    try { localStorage.setItem(STORE_KEY, text); } catch (e) { /* 隐私模式忽略 */ }
    if (window.LedgerDash) window.LedgerDash.render();
  }

  /* ---------- 判重查询 ---------- */

  function runQuery() {
    var input = document.getElementById('queryInput');
    var box = document.getElementById('queryResult');
    if (!input || !box) return;

    var tokens = input.value
      .split(/[\n,，、;；]/)
      .map(function (t) { return t.trim(); })
      .filter(function (t) { return t.length >= 2; });

    if (!tokens.length) {
      box.innerHTML = '<p class="tool-empty">至少输入一个品牌名（两个字以上）</p>';
      return;
    }

    var html = '';
    tokens.forEach(function (token) {
      var tn = norm(token);
      var hits = records.filter(function (r) {
        if (!r.brandNorm) return false;
        // 双向包含：输入的品牌能命中台账里的长短名称，反之亦然
        return r.brandNorm.indexOf(tn) > -1 || (tn.length >= 3 && tn.indexOf(r.brandNorm) > -1);
      });

      var reported = hits.filter(function (h) { return h.kind === 'report'; });
      var screened = hits.filter(function (h) { return h.kind !== 'report'; });

      if (reported.length) {
        var detail = reported.slice(0, 3).map(function (h) {
          return '　· ' + esc(h.brand) +
            (h.date ? ' ｜' + esc(h.date) : '') +
            (h.status ? ' ｜' + esc(h.status).slice(0, 26) : '');
        }).join('<br>');
        html += '<div class="hit hit-yes"><span class="hit-flag">已报过 ' + reported.length + ' 次</span>' +
          '<strong>' + esc(token) + '</strong><br>' + detail;
        if (screened.length) {
          html += '<br><span class="hit-sub">另有 ' + screened.length + ' 条排查记录（未报）</span>';
        }
        html += '</div>';
      } else if (screened.length) {
        html += '<div class="hit hit-warn"><span class="hit-flag">已排查未报</span>' +
          '<strong>' + esc(token) + '</strong> —— 查过暂无可报，可以再确认一次</div>';
      } else {
        html += '<div class="hit hit-no"><span class="hit-flag">未见记录</span>' +
          '<strong>' + esc(token) + '</strong> —— 可报（记得再过六道门）</div>';
      }
    });

    box.innerHTML = html;
  }

    /* ---------- 判重集合导出 ---------- */

  function exportSet() {
    var out = document.getElementById('setOut');
    if (!out) return;

    var seen = {};
    var list = [];
    records.forEach(function (r) {
      if (r.kind !== 'report') return; // 只导出真报过的，排查名单不算
      var key = r.brandNorm;
      if (!key || seen[key]) return;
      seen[key] = true;
      list.push(r.brand);
    });

    if (!list.length) {
      out.textContent = '先载入台账再导出。';
      return;
    }

    out.textContent = list.join('\n');
    setStat('已生成 ' + list.length + ' 个不重复品牌（去重后）');
  }

  /* ---------- 事件绑定 ---------- */

  function init() {
    var file = document.getElementById('ledgerFile');
    if (file) {
      file.addEventListener('change', function () {
        var f = file.files && file.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function () { loadText(String(reader.result), f.name); };
        reader.readAsText(f, 'utf-8');
      });
    }

    var pasteBtn = document.getElementById('loadPaste');
    if (pasteBtn) {
      pasteBtn.addEventListener('click', function () {
        var ta = document.getElementById('ledgerPaste');
        loadText(ta ? ta.value : '', '粘贴内容');
      });
    }

    var queryBtn = document.getElementById('runQuery');
    if (queryBtn) queryBtn.addEventListener('click', runQuery);

    var exportBtn = document.getElementById('exportSet');
    if (exportBtn) exportBtn.addEventListener('click', exportSet);

    var copySet = document.getElementById('copySet');
    if (copySet) {
      copySet.addEventListener('click', function () {
        var out = document.getElementById('setOut');
        if (!out || !out.textContent) return;
        navigator.clipboard.writeText(out.textContent).then(function () {
          copySet.setAttribute('data-copied', 'true');
          copySet.textContent = '已复制';
          setTimeout(function () {
            copySet.removeAttribute('data-copied');
            copySet.textContent = '复制集合';
          }, 1600);
        });
      });
    }

    // 打开页面时自动恢复上次载入的台账
    try {
      var saved = localStorage.getItem(STORE_KEY);
      if (saved) {
        records = parseMarkdown(saved);
        if (records.length) {
          var repCount = records.filter(function (r) { return r.kind === 'report'; }).length;
          setStat('已自动恢复上次台账：' + records.length + ' 条 · 报名记录 ' + repCount + ' 条');
          if (window.LedgerDash) window.LedgerDash.render();
        }
      }
    } catch (e) { /* 忽略 */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // 便于调试
  window.StoreLedger = {
    parse: parseMarkdown,
    load: loadText,
    query: runQuery,
    all: function () { return records; }
  };
})();
