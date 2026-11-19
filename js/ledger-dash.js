/* ============================================================
   今日与卡点看板 · ledger-dash.js
   作用：把台账里的状态算成「今天报了几家、哪几条卡住了」
   原则：纯前端、零依赖、不联网；只读 StoreLedger 的数据
   ============================================================ */
(function () {
  'use strict';

  var GOAL = 20;       // 单日目标：20 家
  var STALE = 5;       // 待中签超过这么多天，值得催一句

  function $(id) { return document.getElementById(id); }

  function txt(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function esc(s) {
    return txt(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* 「3天前 / 11-18 / 2026-11-18 / 昨天」统一算成距今天数 */
  function daysAgo(t) {
    t = txt(t);
    if (!t) return null;

    var m = /([0-9]{1,3})\s*天前/.exec(t);
    if (m) return parseInt(m[1], 10);
    if (/小时前|分钟前|刚刚|今天|当日/.test(t)) return 0;
    if (/昨天/.test(t)) return 1;
    if (/前天/.test(t)) return 2;

    var y, mo, d;
    var full = /([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})/.exec(t);
    var short = /([0-9]{1,2})[-/月]([0-9]{1,2})/.exec(t);
    if (full) {
      y = +full[1]; mo = +full[2]; d = +full[3];
    } else if (short) {
      y = new Date().getFullYear(); mo = +short[1]; d = +short[2];
    } else {
      return null;
    }
    var then = new Date(y, mo - 1, d);
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((today - then) / 86400000);
  }

  function isYes(v) { return /^(是|√|已|done|yes|true)$/i.test(txt(v)); }

  function compute() {
    var all = (window.StoreLedger && window.StoreLedger.all()) || [];
    var rep = all.filter(function (r) { return r.kind === 'report'; });

    var now = new Date();
    var todayMD = String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0');

    var todayCount = 0;
    var batchTodayCount = 0;  // 台账里带今天日期的批次（第22批·11-18 这种）
    var daZeroCount = 0;      // 发布时间是今天/几小时前的
    var stale = [];        // 待中签很久没回，值得催
    var wonWaiting = [];   // 已中签但还没去体验
    var triedNoPost = [];  // 已体验但没发笔记 ← 最贵的一条
    var doneCount = 0;
    var statusFilled = 0;  // 三列里填了几条

    rep.forEach(function (r) {
      var da = daysAgo(r.date);
      if (r.batch && r.batch.indexOf(todayMD) > -1) batchTodayCount++;
      if (da === 0) daZeroCount++;

      var hasFlag = txt(r.tried) || txt(r.published) || txt(r.recv);
      if (hasFlag) statusFilled++;

      if (isYes(r.published) || /已发布/.test(txt(r.status))) { doneCount++; return; }

      if (isYes(r.tried)) {
        triedNoPost.push({ r: r, da: da, reason: '已体验未发布' });
        return;
      }

      if (/已中签|中签了/.test(txt(r.signed)) || /已中签/.test(txt(r.status))) {
        wonWaiting.push({ r: r, da: da, reason: '已中签待体验' });
        return;
      }

      if (/待中签|已报名/.test(txt(r.signed) + txt(r.status)) && da !== null && da >= STALE) {
        stale.push({ r: r, da: da, reason: '超 ' + STALE + ' 天没回' });
      }
    });

    // 今日已报：只认「当天批次」这一个口径，没有当天批次时退回发布时间
    todayCount = batchTodayCount || daZeroCount;

    return {
      total: rep.length,
      todayCount: todayCount,
      stale: stale,
      wonWaiting: wonWaiting,
      triedNoPost: triedNoPost,
      doneCount: doneCount,
      statusFilled: statusFilled
    };
  }

  function tile(num, label, cls, extra) {
    return '<div class="tile' + (cls ? ' ' + cls : '') + '">' +
      '<span class="tile-num">' + num + '</span>' +
      '<span class="tile-label">' + label + '</span>' +
      (extra || '') + '</div>';
  }

  function item(h) {
    var r = h.r;
    // 状态只取括号前的部分，「已报名（已关注✓赞✓260藏✓199…）」这种截一半很难看
    var st = txt(r.status).split(/[（(]/)[0];
    return '<li class="dash-item">' +
      '<span class="dash-item-brand">' + esc(r.brand) + '</span>' +
      '<span class="dash-item-meta">' + esc(r.date) + (st ? ' ｜ ' + esc(st) : '') + '</span>' +
      '<span class="dash-item-tag">' + h.reason + '</span>' +
      '</li>';
  }

  function block(title, list, emptyText) {
    if (!list.length) return '';
    var shown = list.slice(0, 6).map(item).join('');
    var more = list.length > 6
      ? '<li class="dash-more">还有 ' + (list.length - 6) + ' 条，明细去下面的台账正文看</li>'
      : '';
    return '<div class="dash-group"><h3>' + title + '</h3>' +
      '<ul class="dash-list">' + shown + more + '</ul></div>';
  }

  function render() {
    var box = $('dash');
    if (!box) return;

    var d = compute();

    if (!d.total) {
      box.innerHTML = '<p class="dash-empty">先在上面载入台账，这里会自动算出今天报了几家、哪几条卡住了。</p>';
      return;
    }

    var pct = Math.min(100, Math.round((d.todayCount / GOAL) * 100));

    var html = '<div class="dash-tiles">' +
      tile(d.todayCount + '<small>/' + GOAL + '</small>', '今日已报',
        d.todayCount >= GOAL ? 'tile-ok' : '',
        '<span class="tile-bar"><i style="width:' + pct + '%"></i></span>') +
      tile(d.triedNoPost.length, '已体验未发布', d.triedNoPost.length ? 'tile-danger' : '') +
      tile(d.stale.length, '超' + STALE + '天没回', d.stale.length ? 'tile-warn' : '') +
      tile(d.wonWaiting.length, '已中签待体验', d.wonWaiting.length ? 'tile-warn' : '') +
      tile(d.doneCount, '已发布完成', '') +
      '</div>' +
      '<p class="dash-cap">今日已报＝台账里含今天日期的那个批次（单日目标 ' + GOAL +
      ' 家）；「超 ' + STALE + ' 天没回」按帖发布时间算。</p>';

    if (d.triedNoPost.length) {
      html += '<div class="dash-alert">这 ' + d.triedNoPost.length +
        ' 条已经体验完了但还没发笔记 —— 不发等于白吃，先把它们清掉再报新的。</div>';
    }

    html += block('已体验未发布（最优先）', d.triedNoPost, '');
    html += block('超 ' + STALE + ' 天没动静，值得催一句', d.stale, '');
    html += block('已中签，等着去体验', d.wonWaiting, '');

    // 状态列没填就算不准，老实说清楚
    var empty = d.total - d.statusFilled;
    if (empty > 0) {
      html += '<div class="dash-note">' + empty + ' / ' + d.total +
        ' 条没填「已收货 / 已体验 / 已发布」—— 这几条看板算不出来，补上才准。</div>';
    }

    box.innerHTML = html;
  }

  function init() {
    render();
    // 载入新台账后由 ledger-tool.js 调 render()，这里只兜底
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) render();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(render, 60); });
  } else {
    setTimeout(render, 60);
  }

  window.LedgerDash = { render: render, compute: compute, daysAgo: daysAgo };
})();
