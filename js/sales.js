// تبويب المبيعات: فاتورة مبيعات ضريبية على ورق شركة فخر الجزيرة (نفس خلفية العقود: اللوجو + العلامة المائية).
// الملف مستقل: يتلقى من app.js عبر HRSales.init({...}) دوال القراءة والحفظ فقط.
(function(root){
  'use strict';

  const MAX_ROWS = 9;                       // أقصى عدد بنود يتسع له الورق A4 بدون التداخل مع الفوتر
  const DEFAULT_CR = '4031263286';          // السجل التجاري المذكور في نص عقود الشركة (قابل للتعديل في الفاتورة)
  const DEFAULT_COMPANY = 'شركة فخر الجزيرة للحراسات الأمنية';

  const INV_PREFIX = 'INV-MAK-';
  const BASE_TYPES = ['حارس أمن','حارسة أمن','مشرف أمن','مدير مشروع','دورية أمنية'];
  // مفاتيح الإيرادات في تبويب المشاريع -> النوع في الفاتورة
  const KIND_TYPE = { guards:'حارس أمن', guardsFemale:'حارسة أمن', supervisors:'مشرف أمن', managers:'مدير مشروع', patrols:'دورية أمنية' };
  const KIND_LABEL = { devices:'أجهزة اتصالات', uniforms:'بدل أمن', extras:'أقماع وملحقات', adminEmployees:'موظفين إداريين', other:'أخرى' };

  const SELLER_FIELDS = [
    ['name','اسم الشركة','Company name'],['branch','اسم الفرع','Branch Name'],['bno','رقم المبنى','Building NO'],
    ['addno','الرقم الإضافي للعنوان','Additional Address NO'],['street','اسم الشارع','Address'],['city','المدينة','City'],
    ['area','المنطقة','Area'],['country','البلد','Country'],['postal','الرمز البريدي','Postal Code'],
    ['vat','الرقم الضريبي','Vat No'],['cr','السجل التجاري','CR.No']
  ];
  const CUSTOMER_FIELDS = [
    ['name','اسم العميل','Customer Name'],['bno','رقم المبنى','Building NO'],
    ['addno','الرقم الإضافي للعنوان','Additional Address NO'],['street','اسم الشارع','Address'],['city','المدينة','City'],
    ['area','المنطقة','Area'],['country','البلد','Country'],['postal','الرمز البريدي','Postal Code'],
    ['vat','الرقم الضريبي','VAT Ref'],['cr','السجل التجاري','CR NO']
  ];

  let ctx = null;        // { getInvoices, getProjects, getSettings, save, toast, todayISO }
  let cur = null;        // الفاتورة المفتوحة الآن (مسودة في الذاكرة حتى الحفظ)
  let rendered = false;
  let bound = false;

  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clone = o => JSON.parse(JSON.stringify(o));

  // ---------- أرقام ----------
  function num(v){
    let s = String(v == null ? '' : v).trim();
    s = s.replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
         .replace(/٫/g, '.').replace(/[,٬\s]/g, '');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const money = n => r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function allTypes(extra){
    const st = (ctx && ctx.getSettings && ctx.getSettings()) || {};
    const list = [...BASE_TYPES, ...(Array.isArray(st.invoiceTypes) ? st.invoiceTypes : [])];
    (extra || []).forEach(t => { if(t) list.push(t); });
    return [...new Set(list.map(x => String(x).trim()).filter(Boolean))];
  }
  function parseD(v){ const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || '')); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; }
  // عدد الأيام المستحقة (شامل يوم البداية والنهاية) وعامل التناسب مع أيام شهر البداية
  function periodInfo(inv){
    const a = parseD(inv.supply), b = parseD(inv.supplyEnd);
    if(a == null || b == null || b < a) return { days: 0, factor: 1, ok: false };
    const days = Math.round((b - a) / 86400000) + 1;
    const d = new Date(a), md = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return { days, factor: days === md ? 1 : days / md, ok: true, monthDays: md };
  }

  function calcRow(it, factor){
    const qty = num(it.qty), price = num(it.price), disc = num(it.disc), pct = num(it.vatPct);
    const gross = r2(qty * price * (factor == null ? 1 : factor));
    const total = r2(gross - disc);
    const vat = r2(total * pct / 100);
    return { gross, disc, total, vat, net: r2(total + vat), pct, empty: !gross && !disc };
  }
  function calcAll(inv){
    const f = periodInfo(inv).factor;
    const rows = (inv.items || []).map(it => calcRow(it, f));
    const sum = k => r2(rows.reduce((a, r) => a + r[k], 0));
    const pcts = [...new Set(rows.filter(r => !r.empty).map(r => r.pct))];
    return { rows, gross: sum('gross'), disc: sum('disc'), total: sum('total'), vat: sum('vat'), net: sum('net'),
             pct: pcts.length === 1 ? pcts[0] : (pcts.length ? null : 15) };
  }

  // ---------- التفقيط (المبلغ بالحروف) ----------
  const ONES_M = ['','واحد','اثنان','ثلاثة','أربعة','خمسة','ستة','سبعة','ثمانية','تسعة','عشرة','أحد عشر','اثنا عشر','ثلاثة عشر','أربعة عشر','خمسة عشر','ستة عشر','سبعة عشر','ثمانية عشر','تسعة عشر'];
  const ONES_F = ['','واحدة','اثنتان','ثلاث','أربع','خمس','ست','سبع','ثمان','تسع','عشر','إحدى عشرة','اثنتا عشرة','ثلاث عشرة','أربع عشرة','خمس عشرة','ست عشرة','سبع عشرة','ثماني عشرة','تسع عشرة'];
  const TENS = ['','','عشرون','ثلاثون','أربعون','خمسون','ستون','سبعون','ثمانون','تسعون'];
  const HUNDREDS = ['','مائة','مائتان','ثلاثمائة','أربعمائة','خمسمائة','ستمائة','سبعمائة','ثمانمائة','تسعمائة'];

  function below1000(n, fem){
    const ones = fem ? ONES_F : ONES_M;
    const parts = [];
    const h = Math.floor(n / 100), r = n % 100;
    if(h) parts.push(HUNDREDS[h]);
    if(r){
      if(r < 20) parts.push(ones[r]);
      else { const o = r % 10, t = Math.floor(r / 10); if(o) parts.push(ones[o]); parts.push(TENS[t]); }
    }
    return parts.join(' و');
  }
  function scaleWords(g, one, two, few, many, fem){
    if(g === 1) return one;
    if(g === 2) return two;
    if(g >= 3 && g <= 10) return below1000(g, fem) + ' ' + few;
    return below1000(g, fem) + ' ' + many;
  }
  function intWords(n, fem){
    if(n === 0) return 'صفر';
    const parts = [];
    const bil = Math.floor(n / 1e9), mil = Math.floor(n % 1e9 / 1e6), th = Math.floor(n % 1e6 / 1e3), rest = n % 1000;
    if(bil) parts.push(scaleWords(bil, 'مليار', 'ملياران', 'مليارات', 'مليار', false));
    if(mil) parts.push(scaleWords(mil, 'مليون', 'مليونان', 'ملايين', 'مليون', false));
    if(th) parts.push(scaleWords(th, 'ألف', 'ألفان', 'آلاف', 'ألف', false));
    if(rest) parts.push(below1000(rest, fem));
    return parts.join(' و');
  }
  function tafqeet(amount){
    const a = Math.abs(r2(amount));
    let riyal = Math.floor(a + 1e-9), hal = Math.round((a - riyal) * 100);
    if(hal >= 100){ riyal += 1; hal -= 100; }
    if(riyal > 999999999999) return '';
    const rp = riyal === 1 ? 'ريال سعودي واحد' : riyal === 2 ? 'ريالان سعوديان' : intWords(riyal, false) + ' ريال سعودي';
    const hp = hal === 1 ? 'هللة واحدة' : hal === 2 ? 'هللتان' : intWords(hal, true) + ' هللة';
    if(!riyal && !hal) return 'فقط صفر ريال سعودي لا غير';
    if(!hal) return 'فقط ' + rp + ' لا غير';
    if(!riyal) return 'فقط ' + hp + ' لا غير';
    return 'فقط ' + rp + ' و' + hp + ' لا غير';
  }

  // ---------- QR الفاتورة الضريبية (نسق هيئة الزكاة والضريبة TLV ثم Base64) ----------
  function tlv(tag, val){ const b = new TextEncoder().encode(String(val)); return [tag, b.length, ...b]; }
  function zatcaPayload(inv, T){
    const ts = (inv.date || ctx.todayISO()) + 'T00:00:00Z';
    const bytes = [
      ...tlv(1, inv.seller.name || ''), ...tlv(2, inv.seller.vat || ''), ...tlv(3, ts),
      ...tlv(4, T.net.toFixed(2)), ...tlv(5, T.vat.toFixed(2))
    ];
    let bin = ''; bytes.forEach(b => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }
  function qrSvg(text){
    if(typeof root.qrcode !== 'function') return '';
    try{
      const q = root.qrcode(0, 'M'); q.addData(text); q.make();
      const n = q.getModuleCount(), m = 2; let d = '';
      for(let r = 0; r < n; r++) for(let c = 0; c < n; c++) if(q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`;
      const t = n + m * 2;
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-m} ${-m} ${t} ${t}" shape-rendering="crispEdges"><rect x="${-m}" y="${-m}" width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
    }catch(e){ return ''; }
  }

  // ---------- نموذج الفاتورة ----------
  const blankItem = () => ({ code: '', type: '', qty: '', price: '', disc: '', vatPct: '15' });
  function nextNo(){
    let max = 0;
    ctx.getInvoices().forEach(i => {
      const m = /^INV-MAK-(\d+)$/i.exec(String(i.no || '').trim());
      if(m) max = Math.max(max, parseInt(m[1], 10));
    });
    return INV_PREFIX + String(max + 1).padStart(5, '0');
  }
  function blankInvoice(){
    const list = ctx.getInvoices();
    const last = list.length ? list[list.length - 1] : null;
    const st = ctx.getSettings() || {};
    const seller = last && last.seller ? clone(last.seller) : {
      name: st.company || DEFAULT_COMPANY, branch: '', bno: '', addno: '', street: '', city: 'مكة المكرمة',
      area: '', country: 'السعودية', postal: '', vat: '', cr: st.cr || DEFAULT_CR
    };
    return {
      id: '', no: nextNo(), date: '', supply: '', supplyEnd: '', projectId: '', seller,
      customer: { name: '', bno: '', addno: '', street: '', city: '', area: '', country: 'السعودية', postal: '', vat: '', cr: '' },
      items: [blankItem()], iban: last && last.iban ? last.iban : ''
    };
  }
  function normalize(inv){
    const b = blankInvoice();
    const o = Object.assign({}, b, clone(inv || {}));
    o.seller = Object.assign({}, b.seller, o.seller || {});
    o.customer = Object.assign({}, b.customer, o.customer || {});
    o.items = Array.isArray(o.items) && o.items.length ? o.items.map(i => { const x = Object.assign(blankItem(), i); if(!x.type && x.desc) x.type = x.desc; return x; }) : [blankItem()];
    return o;
  }
  function setPath(o, p, v){
    const k = p.split('.'); let t = o;
    for(let i = 0; i < k.length - 1; i++) t = t[k[i]];
    t[k[k.length - 1]] = v;
  }

  // ---------- العرض ----------
  function projectSelectHtml(path, val){
    const names = (ctx.getProjects() || []).map(p => p && p.name ? String(p.name).trim() : '').filter(Boolean);
    const list = [...new Set(names)];
    if(val && !list.includes(val)) list.push(val);
    return `<select class="inv-in inv-sel" data-p="${path}" data-proj="1"><option value="">— اختر العميل / المشروع —</option>` +
      list.map(n => `<option value="${esc(n)}"${n === val ? ' selected' : ''}>${esc(n)}</option>`).join('') + '</select>';
  }
  function rowHtml(path, ar, en, val, o){
    o = o || {};
    const inp = o.ta
      ? `<textarea class="inv-in inv-ta" rows="1" data-p="${path}">${esc(val)}</textarea>`
      : o.projSelect ? projectSelectHtml(path, val)
      : `<input class="inv-in${o.ltr ? ' inv-ltr' : ''}" data-p="${path}" value="${esc(val)}">`;
    return `<div class="inv-row"><span class="inv-ar">${ar}</span>${inp}<span class="inv-en">${en}</span></div>`;
  }
  function panelHtml(titleAr, titleEn, fields, obj, key){
    return `<div class="inv-panel"><div class="inv-panel-h"><span>${titleAr}</span><span class="inv-en-h">${titleEn}</span></div>` +
      fields.map(([k, ar, en]) => rowHtml(`${key}.${k}`, ar, en, obj[k] || '', {
        ta: (k === 'name' && key !== 'customer') || k === 'street', projSelect: key === 'customer' && k === 'name',
        ltr: ['vat','cr','postal','bno','addno'].includes(k)
      })).join('') + '</div>';
  }
  function itemRowHtml(it, i){
    const n = (f, extra) => `<td><input class="inv-in inv-c ${extra || ''}" inputmode="decimal" data-p="items.${i}.${f}" value="${esc(it[f])}"></td>`;
    return `<tr data-i="${i}">
      <td><input class="inv-in inv-c" data-p="items.${i}.code" value="${esc(it.code)}"></td>
      <td class="inv-type-cell"><select class="inv-in inv-sel" data-p="items.${i}.type"><option value="">— النوع —</option>${allTypes([it.type]).map(t => `<option value="${esc(t)}"${t === it.type ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select><button type="button" class="inv-addtype no-print" title="إضافة نوع جديد">+</button></td>
      ${n('qty')}${n('price')}${n('disc')}
      <td class="inv-calc" data-c="total"></td>
      ${n('vatPct')}
      <td class="inv-calc" data-c="vat"></td>
      <td class="inv-calc inv-net" data-c="net"><span data-c="net-v"></span><button type="button" class="inv-del no-print" data-del="${i}" title="حذف البند">✕</button></td>
    </tr>`;
  }
  function sheetHtml(){
    const inv = cur;
    return `
      <div class="inv-title"><b>فاتورة مبيعات ضريبية</b><span>Tax Invoice</span></div>
      <div class="inv-meta">
        <div class="inv-meta-col">
          ${rowHtml('no', 'رقم الفاتورة', 'Inv.No', inv.no, { ltr: true })}
          <div class="inv-row"><span class="inv-ar">تاريخ الفاتورة</span><input type="date" class="inv-in inv-ltr" data-p="date" value="${esc(inv.date)}"><span class="inv-en">Date</span></div>
          <div class="inv-row"><span class="inv-ar">الأيام المستحقة</span><b class="inv-days" data-c="days"></b><span class="inv-en">Due days</span></div>
        </div>
        <div class="inv-meta-col">
          <div class="inv-row"><span class="inv-ar">بداية التنفيذ</span><input type="date" class="inv-in inv-ltr" data-p="supply" value="${esc(inv.supply)}"><span class="inv-en">Start</span></div>
          <div class="inv-row"><span class="inv-ar">نهاية التنفيذ</span><input type="date" class="inv-in inv-ltr" data-p="supplyEnd" value="${esc(inv.supplyEnd)}"><span class="inv-en">End</span></div>
        </div>
      </div>
      <div class="inv-panels">
        ${panelHtml('بيانات البائع', 'Seller Info', SELLER_FIELDS, inv.seller, 'seller')}
        ${panelHtml('بيانات العميل', 'Customer Info', CUSTOMER_FIELDS, inv.customer, 'customer')}
      </div>
      <table class="inv-items">
        <thead><tr>
          <th>الرمز<small>Item Code</small></th><th>النوع<small>Type</small></th><th>الكمية<small>QTY</small></th>
          <th>السعر<small>PRICE</small></th><th>الخصم<small>Disc.</small></th><th>السعر الإجمالي<small>Total Price</small></th>
          <th>% ضريبة<small>VAT %</small></th><th>قيمة الضريبة<small>VAT</small></th><th>الصافي<small>Net Price</small></th>
        </tr></thead>
        <tbody>${inv.items.map(itemRowHtml).join('')}</tbody>
      </table>
      <div class="inv-addrow no-print"><button type="button" class="btn btn-sm" id="invAddRow">+ إضافة بند</button><small id="invRowsNote"></small></div>
      <div class="inv-sum">
        <div class="inv-totals">
          <div class="inv-trow"><span class="inv-ar">الاجمالي</span><span class="inv-en">Amount</span><b data-c="t-gross"></b></div>
          <div class="inv-trow"><span class="inv-ar">الخصم</span><span class="inv-en">Discount</span><b data-c="t-disc"></b></div>
          <div class="inv-trow"><span class="inv-ar">الضرائب</span><span class="inv-en" data-c="t-vatlabel">VAT 15 %</span><b data-c="t-vat"></b></div>
          <div class="inv-trow inv-trow-net"><span class="inv-ar">الصافي</span><span class="inv-en">Net Amount</span><b data-c="t-net"></b></div>
        </div>
        <div class="inv-qr" data-c="qr"></div>
      </div>
      <div class="inv-words" data-c="words"></div>
      <div class="inv-iban"><span>رقم الحساب الدولي (IBAN)</span><input class="inv-in inv-ltr" data-p="iban" value="${esc(inv.iban)}" placeholder="SA…"></div>
      <div class="inv-sign"><span>المستلم <small>Receiver</small></span></div>`;
  }

  function grow(el){ el.style.height = 'auto'; el.style.height = (el.scrollHeight + 1) + 'px'; }
  function growAll(){ const s = $('invSheet'); if(s) s.querySelectorAll('textarea.inv-ta').forEach(grow); }

  function renderSheet(){
    const s = $('invSheet'); if(!s) return;
    s.innerHTML = sheetHtml();
    rendered = true;
    refresh();
    growAll();
    setTimeout(growAll, 250);
    if(document.fonts && document.fonts.ready) document.fonts.ready.then(growAll).catch(() => {});
  }

  // يحدّث الخلايا المحسوبة فقط (بدون إعادة بناء الحقول حتى لا يضيع المؤشر)
  function refresh(){
    const s = $('invSheet'); if(!s || !cur) return;
    const T = calcAll(cur);
    cur.items.forEach((it, i) => {
      const tr = s.querySelector(`tr[data-i="${i}"]`); if(!tr) return;
      const r = T.rows[i], set = (c, v) => { const el = tr.querySelector(`[data-c="${c}"]`); if(el) el.textContent = v; };
      tr.classList.toggle('inv-empty-row', r.empty);
      set('total', r.empty ? '' : money(r.total));
      set('vat', r.empty ? '' : money(r.vat));
      set('net-v', r.empty ? '' : money(r.net));
    });
    const P = periodInfo(cur), dEl = s.querySelector('[data-c="days"]');
    if(dEl) dEl.textContent = P.ok ? (P.days + ' يوم' + (P.factor !== 1 ? ' (× ' + (Math.round(P.factor * 10000) / 10000) + ' من الشهر)' : '')) : '';
    const put = (c, v) => { const el = s.querySelector(`[data-c="${c}"]`); if(el) el.textContent = v; };
    put('t-gross', money(T.gross)); put('t-disc', money(T.disc)); put('t-vat', money(T.vat)); put('t-net', money(T.net));
    put('t-vatlabel', 'VAT ' + (T.pct == null ? '' : T.pct + ' ') + '%');
    put('words', tafqeet(T.net));
    const qr = s.querySelector('[data-c="qr"]');
    if(qr) qr.innerHTML = qrSvg(zatcaPayload(cur, T));
    const add = $('invAddRow'), note = $('invRowsNote');
    if(add) add.disabled = cur.items.length >= MAX_ROWS;
    if(note) note.textContent = cur.items.length >= MAX_ROWS ? `الحد الأقصى ${MAX_ROWS} بنود في الصفحة الواحدة` : '';
  }

  function renderList(){
    const body = $('invListBody'); if(!body) return;
    const list = [...ctx.getInvoices()].sort((a, b) => String(b.no).localeCompare(String(a.no)));
    body.innerHTML = list.length ? list.map(inv => {
      const T = calcAll(inv);
      return `<tr${cur && cur.id === inv.id ? ' class="inv-active"' : ''}>
        <td class="mono">${esc(inv.no)}</td><td class="mono">${esc(inv.date)}</td><td>${esc(inv.customer && inv.customer.name)}</td>
        <td class="mono">${money(T.net)}</td>
        <td><button type="button" class="btn btn-sm" data-inv-open="${esc(inv.id)}">فتح</button>
            <button type="button" class="btn btn-sm" data-inv-copy="${esc(inv.id)}">نسخ</button>
            <button type="button" class="btn btn-sm btn-danger" data-inv-del="${esc(inv.id)}">حذف</button></td></tr>`;
    }).join('') : '<tr><td colspan="5" class="empty-note">لا توجد فواتير محفوظة بعد</td></tr>';

    const dl = $('invCustomerList');
    if(dl){
      const names = new Set();
      (ctx.getProjects() || []).forEach(p => { if(p && p.name) names.add(String(p.name).trim()); });
      ctx.getInvoices().forEach(i => { if(i.customer && i.customer.name) names.add(String(i.customer.name).trim()); });
      dl.innerHTML = [...names].filter(Boolean).map(n => `<option value="${esc(n)}"></option>`).join('');
    }
  }

  // ---------- عمليات ----------
  function newInvoice(){ cur = blankInvoice(); renderSheet(); renderList(); }
  function openInvoice(id, asCopy){
    const inv = ctx.getInvoices().find(x => x.id === id); if(!inv) return;
    cur = normalize(inv);
    if(asCopy){ cur.id = ''; cur.no = nextNo(); cur.date = ''; cur.supply = ''; cur.supplyEnd = ''; }
    renderSheet(); renderList();
    const w = document.querySelector('.inv-sheet-wrap'); if(w) w.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function save(){
    if(!cur) return;
    if(!String(cur.customer.name || '').trim()){ ctx.toast('اكتب اسم العميل أولاً'); return; }
    if(!String(cur.no || '').trim()){ ctx.toast('رقم الفاتورة مطلوب'); return; }
    if(!String(cur.date || '').trim()){ ctx.toast('أدخل تاريخ الفاتورة'); return; }
    const list = ctx.getInvoices();
    if(list.some(x => x.id !== cur.id && String(x.no) === String(cur.no))){ ctx.toast('رقم الفاتورة مستخدم في فاتورة أخرى'); return; }
    const rec = clone(cur); rec.updatedAt = new Date().toISOString();
    if(!rec.id) rec.id = 'inv' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const i = list.findIndex(x => x.id === rec.id);
    if(i >= 0) list[i] = rec; else list.push(rec);
    cur.id = rec.id;
    ctx.save('تم حفظ الفاتورة');
    renderList();
  }
  function remove(id){
    if(!confirm('حذف هذه الفاتورة نهائياً؟')) return;
    const list = ctx.getInvoices(), i = list.findIndex(x => x.id === id); if(i < 0) return;
    list.splice(i, 1);
    ctx.save('تم حذف الفاتورة');
    if(cur && cur.id === id){ cur = blankInvoice(); renderSheet(); }
    renderList();
  }
  // اختيار العميل من المشاريع: ترحيل بياناته وبنود الإيرادات (العدد × الإيراد للفرد) — قابلة للتعديل بعد الترحيل
  function fillFromProject(name){
    const nm = String(name || '').trim();
    const C = cur.customer;
    if(!nm){ cur.projectId = ''; return; }
    const p = (ctx.getProjects() || []).find(x => String(x.name || '').trim() === nm);
    C.name = nm;
    if(!p){ renderSheet(); return; }
    cur.projectId = p.id || '';
    C.cr = p.cr || ''; C.vat = p.vatNo || ''; C.street = p.address || ''; C.city = p.region || C.city || '';
    const old = [...ctx.getInvoices()].reverse().find(x => x.customer && String(x.customer.name || '').trim() === nm);
    if(old) ['bno','addno','area','country','postal'].forEach(k => { if(old.customer[k]) C[k] = old.customer[k]; });
    const vp = p.vatRate == null || p.vatRate === '' ? '15' : String(p.vatRate);
    const rows = [], rv = p.revenueItems || {};
    Object.keys(rv).forEach(k => {
      (Array.isArray(rv[k]) ? rv[k] : []).forEach(r => {
        const qty = Number(r.quantity || r.count || 0) || 0, unit = Number(r.unit || r.price || 0) || 0;
        if(!qty && !unit) return;
        const type = KIND_TYPE[k] || String(r.type || '').trim() || KIND_LABEL[k] || k;
        rows.push(Object.assign(blankItem(), { type, qty: String(qty), price: String(unit), vatPct: vp }));
      });
    });
    if(!rows.length && Number(p.guards) && Number(p.revenueGuard)){
      rows.push(Object.assign(blankItem(), { type: 'حارس أمن', qty: String(p.guards), price: String(p.revenueGuard), vatPct: vp }));
    }
    if(rows.length) cur.items = rows.slice(0, MAX_ROWS);
    if(rows.length > MAX_ROWS) ctx.toast('عدد البنود أكثر من ' + MAX_ROWS + ' — تم ترحيل أول ' + MAX_ROWS + ' فقط');
    renderSheet();
  }
  function addType(){
    const nm = (prompt('اسم النوع الجديد:') || '').trim(); if(!nm) return null;
    const st = ctx.getSettings(); if(!Array.isArray(st.invoiceTypes)) st.invoiceTypes = [];
    if(!allTypes().includes(nm)){ st.invoiceTypes.push(nm); ctx.save('تمت إضافة النوع'); }
    return nm;
  }
  function print(){
    if(!cur) return;
    document.getElementById('dynamicPrintOrientation')?.remove();
    document.getElementById('invPageStyle')?.remove();
    const st = document.createElement('style'); st.id = 'invPageStyle';
    st.textContent = '@media print{@page{size:A4 portrait !important;margin:0 !important}}';
    document.head.appendChild(st);
    const oldTitle = document.title;
    document.title = 'فاتورة-' + (cur.no || '');
    document.body.classList.add('inv-printing');
    growAll();
    const done = () => {
      document.body.classList.remove('inv-printing'); st.remove(); document.title = oldTitle;
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  }

  function bind(){
    if(bound) return; bound = true;
    $('newInvoiceBtn')?.addEventListener('click', newInvoice);
    $('saveInvoiceBtn')?.addEventListener('click', save);
    $('printInvoiceBtn')?.addEventListener('click', print);
    $('invListBody')?.addEventListener('click', e => {
      const o = e.target.closest('[data-inv-open]'), c = e.target.closest('[data-inv-copy]'), d = e.target.closest('[data-inv-del]');
      if(o) openInvoice(o.dataset.invOpen);
      else if(c) openInvoice(c.dataset.invCopy, true);
      else if(d) remove(d.dataset.invDel);
    });
    const s = $('invSheet'); if(!s) return;
    s.addEventListener('input', e => {
      const p = e.target.dataset && e.target.dataset.p; if(!p || !cur) return;
      setPath(cur, p, e.target.value);
      if(e.target.tagName === 'TEXTAREA') grow(e.target);
      refresh();
    });
    s.addEventListener('change', e => {
      const t = e.target;
      if(t.dataset && t.dataset.proj){ setPath(cur, t.dataset.p, t.value); fillFromProject(t.value); }
      else if(t.tagName === 'SELECT' && t.dataset && t.dataset.p){ setPath(cur, t.dataset.p, t.value); }
    });
    s.addEventListener('click', e => {
      if(e.target.closest('#invAddRow')){
        if(cur.items.length < MAX_ROWS){ cur.items.push(blankItem()); renderSheet(); }
        return;
      }
      const at = e.target.closest('.inv-addtype');
      if(at){
        const nm = addType(); if(!nm) return;
        const tr = at.closest('tr'); if(tr) cur.items[+tr.dataset.i].type = nm;
        renderSheet(); return;
      }
      const del = e.target.closest('[data-del]');
      if(del){
        const i = +del.dataset.del;
        if(cur.items.length > 1) cur.items.splice(i, 1); else cur.items[0] = blankItem();
        renderSheet();
      }
    });
  }

  root.HRSales = {
    init(c){ ctx = c; bind(); },
    // يُستدعى عند فتح التبويب: يحافظ على المسودة المفتوحة عند التنقل بين التبويبات
    render(){ if(!ctx) return; if(!cur) cur = blankInvoice(); renderList(); if(!rendered) renderSheet(); },
    // عند إغلاق التبويب: نبدأ من مسودة جديدة
    reset(){ cur = null; rendered = false; const s = $('invSheet'); if(s) s.innerHTML = ''; },
    _calc: calcAll, _tafqeet: tafqeet, _num: num
  };
})(typeof window !== 'undefined' ? window : globalThis);
