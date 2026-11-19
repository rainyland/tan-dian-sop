/* ============================================================
   台账行生成器 · ledger-form.js
   作用：填表 → 校验（7天铁律 / 品牌重复）→ 生成可直接粘贴的行
   依赖：ledger-tool.js 暴露的 window.StoreLedger.all()
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var CATS = ['中餐正餐', '火锅', '烧烤', '自助', '面馆小吃', '饮品咖啡', '烘焙甜点', '零食', '护肤寄样', '生鲜'];

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function mdOfDate(dateStr) {
    return dateStr.slice(5); // MM-DD
  }

  function records() {
    try {
      return (window.StoreLedger && window.StoreLedger.all()) || [];
    } catch (e) {
      return [];
    }
  }

  function norm(s) {
    return String(s == null ? '' : s)
      .replace(/[（）()【】\[\]「」『』·、,，。:：;；!！?？"'’“”\s\-—–~]/g, '')
      .toLowerCase();
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/\|/g, '｜').trim();
  }

  /* ---------- 批次与序号自动推算 ---------- */

  function suggestBatch() {
    var list = records();
    var date = $('fDate').value || todayStr();
    // 当天已有记录 → 沿用当天批次
    var sameDay = list.filter(function (r) {
      return r.batch && r.batch.indexOf(mdOfDate(date)) > -1;
    });
    if (sameDay.length) return sameDay[0].batch;

    // 否则取历史最大批次号 +1
    var maxN = 0;
    list.forEach(function (r) {
      var m = /第\s*([0-9]{1,3})\s*批/.exec(r.batch || '');
      if (m) maxN = Math.max(maxN, parseInt(m[1], 10));
    });
    return '第' + (maxN + 1) + '批·' + mdOfDate(date) + '武汉免费体验/探店置换';
  }

  function suggestSeq() {
    var list = records();
    var date = $('fDate').value || todayStr();
    var batch = $('fBatch').value || '';
    var same = list.filter(function (r) {
      return (r.date && r.date.indexOf(mdOfDate(date)) > -1) ||
        (batch && r.batch === batch);
    });
    return String(same.length + 1);
  }

  /* ---------- 校验 ---------- */

  function daysFromText(t) {
    if (!t) return null;
    var m = /([0-9]{1,3})\s*天前/.exec(t);
    if (m) return parseInt(m[1], 10);
    if (/小时前|分钟前|刚刚|今天/.test(t)) return 0;
    return null;
  }

  function check() {
    var msgs = [];
    var brand = $('fBrand').value.trim();
    var pub = $('fPub').value.trim();

    if (!brand) {
      msgs.push({ level: 'danger', text: '品牌名必填（判重主要看它）' });
    } else {
      var bn = norm(brand);
      var hits = records().filter(function (r) {
        return r.kind === 'report' && r.brandNorm &&
          (r.brandNorm.indexOf(bn) > -1 || (bn.length >= 3 && bn.indexOf(r.brandNorm) > -1));
      });
      if (hits.length) {
        msgs.push({
          level: 'danger',
          text: '这台账里已报过 ' + hits.length + ' 次：' + hits[0].brand +
            (hits[0].date ? '（' + hits[0].date + '）' : '') + ' —— 除非是不同活动，否则别再报'
        });
      }
    }

    var d = daysFromText(pub);
    if (d !== null && d > 7) {
      msgs.push({ level: 'warn', text: '发布 ' + d + ' 天前，超过 7 天铁律，按规矩不该报' });
    }
    if (!pub) {
      msgs.push({ level: 'warn', text: '招募发布时间空着，回头没法核 7 天时限' });
    }

    var box = $('genMsg');
    box.innerHTML = msgs.length
      ? msgs.map(function (m) {
          return '<div class="msg msg-' + m.level + '">' + m.text + '</div>';
        }).join('')
      : '<div class="msg msg-ok">校验通过，可以生成</div>';
  }

  /* ---------- 生成 ---------- */

  function buildRow() {
    var v = {
      date: esc($('fDate').value),
      batch: esc($('fBatch').value),
      seq: esc($('fSeq').value),
      brand: esc($('fBrand').value),
      product: esc($('fProduct').value),
      activity: esc($('fActivity').value),
      pub: esc($('fPub').value),
      source: esc($('fSource').value),
      shop: esc($('fShop').value),
      cat: esc($('fCat').value),
      type: esc($('fType').value),
      signed: esc($('fSigned').value),
      status: esc($('fStatus').value),
      recv: esc($('fRecv').value),
      tried: esc($('fTried').value),
      pubd: esc($('fPubd').value),
      note: esc($('fNote').value)
    };

    // 台账里实际在用的表：15 列（日期/批次写在小节标题里）
    var row15 = '| ' + [
      v.seq, v.brand, v.product, v.activity, v.pub, v.source, v.shop,
      v.cat, v.type, v.signed, v.status, v.recv, v.tried, v.pubd, v.note
    ].join(' | ') + ' |';

    // 17 列全字段单行（SOP 4.2 规定的口径）
    var row17 = [
      v.date, v.batch, v.seq, v.brand, v.product, v.activity, v.pub, v.source,
      v.shop, v.cat, v.type, v.signed, v.status, v.recv, v.tried, v.pubd, v.note
    ].join('｜');

    return { row15: row15, row17: row17 };
  }

  function generate() {
    check();
    var r = buildRow();
    $('rowOut').textContent = r.row15 + '\n\n' + r.row17;
    $('rowOut').setAttribute('data-row15', r.row15);
    $('rowOut').setAttribute('data-row17', r.row17);
  }

  function copy(text, btn, label) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(function () {
      var old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = old; }, 1500);
    });
  }

  /* ---------- 初始化 ---------- */

  function init() {
    var dateEl = $('fDate');
    if (!dateEl) return;

    dateEl.value = todayStr();
    $('fBatch').value = suggestBatch();
    $('fSeq').value = suggestSeq();

    // 品类候选项
    var dl = $('catList');
    if (dl) {
      dl.innerHTML = CATS.map(function (c) { return '<option value="' + c + '">'; }).join('');
    }

    dateEl.addEventListener('change', function () {
      $('fBatch').value = suggestBatch();
      $('fSeq').value = suggestSeq();
    });

    $('fBrand').addEventListener('input', check);
    $('fPub').addEventListener('input', check);

    $('genRow').addEventListener('click', generate);

    $('copyRow').addEventListener('click', function () {
      copy($('rowOut').getAttribute('data-row15') || '', $('copyRow'));
    });
    $('copy17').addEventListener('click', function () {
      copy($('rowOut').getAttribute('data-row17') || '', $('copy17'));
    });

    // 品牌字段支持回车直接生成，少点一次
    $('fBrand').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); generate(); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.LedgerForm = { generate: generate, check: check, suggestBatch: suggestBatch };
})();
