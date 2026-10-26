// تبويب المبيعات: فاتورة مبيعات ضريبية على ورق شركة فخر الجزيرة (نفس خلفية العقود: اللوجو + العلامة المائية).
// الملف مستقل: يتلقى من app.js عبر HRSales.init({...}) دوال القراءة والحفظ فقط.
(function(root){
  'use strict';

  const MAX_ROWS = 9;                       // أقصى عدد بنود يتسع له الورق A4 بدون التداخل مع الفوتر
  const DEFAULT_CR = '4031263286';          // السجل التجاري المذكور في نص عقود الشركة (قابل للتعديل في الفاتورة)
  const DEFAULT_COMPANY = 'شركة فخر الجزيرة للحراسات الأمنية';

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
  // الفترة العامة للفاتورة: من بداية التنفيذ إلى نهايته (شامل اليومين) + عدد أيام شهر البداية
  function periodInfo(inv){
    const a = parseD(inv.supply), b = parseD(inv.supplyEnd);
    const monthDays = a != null ? new Date(Date.UTC(new Date(a).getUTCFullYear(), new Date(a).getUTCMonth() + 1, 0)).getUTCDate() : 30;
    const days = (a != null && b != null && b >= a) ? Math.round((b - a) / 86400000) + 1 : 0;
    return { days, monthDays, ok: days > 0 };
  }
  // أيام البند: ما كتبته يدويًا إن وُجد، وإلا أيام الفترة العامة
  function itemDays(it, P){
    const v = String(it.days == null ? '' : it.days).trim();
    return v !== '' ? num(v) : P.days;
  }
  function calcRow(it, P){
    const qty = num(it.qty), price = num(it.price), disc = num(it.disc), pct = num(it.vatPct);
    const days = itemDays(it, P);
    const factor = days > 0 ? (days === P.monthDays ? 1 : days / P.monthDays) : 1;
    const gross = r2(qty * price * factor);
    const total = r2(gross - disc);
    const vat = r2(total * pct / 100);
    return { gross, disc, total, vat, net: r2(total + vat), pct, days, factor, empty: !gross && !disc };
  }
  function calcAll(inv){
    const P = periodInfo(inv);
    const rows = (inv.items || []).map(it => calcRow(it, P));
    const sum = k => r2(rows.reduce((a, r) => a + r[k], 0));
    const pcts = [...new Set(rows.filter(r => !r.empty).map(r => r.pct))];
    return { rows, P, gross: sum('gross'), disc: sum('disc'), total: sum('total'), vat: sum('vat'), net: sum('net'),
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

  // ---------- مصنع المستند: نفس الشاشة للفاتورة ولأمر البيع (يختلفان في الإعدادات فقط) ----------
  function makeDoc(cfg){
    let cur = null;        // المستند المفتوح الآن (مسودة في الذاكرة حتى الحفظ)
    let rendered = false;
    let bound = false;
    const $ = k => document.getElementById(cfg.id[k]);

  // ---------- نموذج الفاتورة ----------
  const blankItem = () => ({ code: '', type: '', qty: '', price: '', days: '', disc: '', vatPct: '15' });
  const kindOf = i => i.kind || 'invoice';
  const all = () => ctx.getInvoices();
  const mine = () => all().filter(i => kindOf(i) === cfg.kind);
  function nextNo(){
    let max = 0;
    mine().forEach(i => {
      const m = new RegExp('^' + cfg.prefix + '(\\d+)$', 'i').exec(String(i.no || '').trim());
      if(m) max = Math.max(max, parseInt(m[1], 10));
    });
    return cfg.prefix + String(max + 1).padStart(5, '0');
  }
  function blankInvoice(){
    const list = mine();
    const last = list.length ? list[list.length - 1] : null;
    const st = ctx.getSettings() || {};
    const seller = last && last.seller ? clone(last.seller) : {
      name: st.company || DEFAULT_COMPANY, branch: '', bno: '', addno: '', street: '', city: 'مكة المكرمة',
      area: '', country: 'السعودية', postal: '', vat: '', cr: st.cr || DEFAULT_CR
    };
    return {
      id: '', kind: cfg.kind, no: nextNo(), date: '', supply: '', supplyEnd: '', projectId: '', seller,
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

  // ---------- شاشة الإدخال (فوق الفاتورة) ----------
  function fld(path, label, val, o){
    o = o || {};
    const inp = o.select ? `<select data-p="${path}"${o.proj ? ' data-proj="1"' : ''}>${o.select}</select>`
      : `<input${o.type ? ` type="${o.type}"` : ''} data-p="${path}" value="${esc(val)}"${o.ltr ? ' dir="ltr"' : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}>`;
    return `<div class="field"><label>${label}</label>${inp}</div>`;
  }
  function projectOptions(val){
    const list = [...new Set((ctx.getProjects() || []).map(p => p && p.name ? String(p.name).trim() : '').filter(Boolean))];
    if(val && !list.includes(val)) list.push(val);
    return `<option value="">— اختر العميل / المشروع —</option>` + list.map(n => `<option value="${esc(n)}"${n === val ? ' selected' : ''}>${esc(n)}</option>`).join('');
  }
  function typeOptions(val){
    return `<option value="">— النوع —</option>` + allTypes([val]).map(t => `<option value="${esc(t)}"${t === val ? ' selected' : ''}>${esc(t)}</option>`).join('');
  }
  function formItemRow(it, i){
    const n = (f, ph) => `<td><input class="inv-fi" inputmode="decimal" data-p="items.${i}.${f}" value="${esc(it[f])}"${ph ? ' placeholder=""' : ''}></td>`;
    return `<tr data-i="${i}">
      <td><input class="inv-fi" data-p="items.${i}.code" value="${esc(it.code)}"></td>
      <td class="inv-ftype"><select data-p="items.${i}.type">${typeOptions(it.type)}</select><button type="button" class="btn btn-sm inv-addtype" title="إضافة نوع جديد">+</button></td>
      ${n('qty')}${n('price')}${n('days')}${n('disc')}${n('vatPct')}
      <td class="mono inv-fcalc" data-fc="total"></td><td class="mono inv-fcalc" data-fc="net"></td>
      <td><button type="button" class="btn btn-sm btn-danger" data-del="${i}" title="حذف البند">✕</button></td></tr>`;
  }
  function formHtml(){
    const inv = cur, C = inv.customer, S = inv.seller;
    const cf = k => CUSTOMER_FIELDS.find(x => x[0] === k);
    return `
      <h3>${cfg.formTitle}</h3>
      <p class="inv-form-hint">كل الإدخالات هنا فقط — والفاتورة بالأسفل تتحدّث تلقائيًا ولا تحتاج تعديل.</p>
      <h4 class="inv-fh">بيانات الفاتورة</h4>
      <div class="field-grid">
        ${fld('no', cfg.noLabel, inv.no, { ltr: true })}
        ${fld('date', cfg.dateLabel, inv.date, { type: 'date', ltr: true })}
        ${fld('supply', 'بداية التنفيذ', inv.supply, { type: 'date', ltr: true })}
        ${fld('supplyEnd', 'نهاية التنفيذ', inv.supplyEnd, { type: 'date', ltr: true })}
        <div class="field"><label>الأيام المستحقة (من التاريخين)</label><div class="inv-days-box" data-fc="days">—</div></div>
        ${fld('iban', 'رقم الحساب الدولي (IBAN)', inv.iban, { ltr: true, ph: 'SA…' })}
      </div>
      <h4 class="inv-fh">العميل <small>(من تبويب المشاريع)</small></h4>
      <div class="field-grid">
        ${fld('customer.name', 'اسم العميل / المشروع', C.name, { select: projectOptions(C.name), proj: true })}
        ${['cr','vat','bno','addno','street','city','area','country','postal'].map(k => fld('customer.' + k, cf(k)[1], C[k] || '', { ltr: ['vat','cr','postal','bno','addno'].includes(k) })).join('')}
      </div>
      <h4 class="inv-fh">البنود</h4>
      <div class="table-wrap"><table class="inv-form-items">
        <thead><tr><th>الرمز</th><th>النوع</th><th>العدد</th><th>السعر</th><th>الأيام</th><th>الخصم</th><th>% ضريبة</th><th>الإجمالي</th><th>الصافي</th><th></th></tr></thead>
        <tbody>${inv.items.map(formItemRow).join('')}</tbody>
      </table></div>
      <div class="inv-addrow"><button type="button" class="btn btn-sm" id="${cfg.id.addRow}">+ إضافة بند</button><small id="${cfg.id.rowsNote}"></small></div>
      <details class="inv-seller"><summary>بيانات البائع (الشركة)</summary>
        <div class="field-grid">${SELLER_FIELDS.map(([k, ar]) => fld('seller.' + k, ar, S[k] || '', { ltr: ['vat','cr','postal','bno','addno'].includes(k) })).join('')}</div>
      </details>`;
  }
  function renderForm(){
    const f = $('form'); if(!f) return;
    f.innerHTML = formHtml();
    refreshForm();
  }
  // يحدّث الخلايا المحسوبة وملاحظات الإدخال فقط (بدون إعادة بناء الحقول حتى لا يضيع المؤشر)
  function refreshForm(){
    const f = $('form'); if(!f || !cur) return;
    const T = calcAll(cur);
    const put = (el, v) => { if(el) el.textContent = v; };
    put(f.querySelector('.inv-days-box'), T.P.ok ? T.P.days + ' يوم' : '—');
    cur.items.forEach((it, i) => {
      const tr = f.querySelector(`tr[data-i="${i}"]`); if(!tr) return;
      const r = T.rows[i];
      put(tr.querySelector('[data-fc="total"]'), r.empty ? '' : money(r.total));
      put(tr.querySelector('[data-fc="net"]'), r.empty ? '' : money(r.net));
      const d = tr.querySelector('[data-p$=".days"]'); if(d) d.placeholder = T.P.ok ? String(T.P.days) : 'تلقائي';
    });
    const add = $('addRow'), note = $('rowsNote');
    if(add) add.disabled = cur.items.length >= MAX_ROWS;
    if(note) note.textContent = cur.items.length >= MAX_ROWS ? `الحد الأقصى ${MAX_ROWS} بنود في الصفحة الواحدة` : '';
  }

  // ---------- الفاتورة نفسها (عرض فقط) ----------
  function srow(ar, en, val, ltr){
    return `<div class="inv-row"><span class="inv-ar">${ar}</span><span class="inv-val${ltr ? ' inv-ltr' : ''}">${esc(val)}</span><span class="inv-en">${en}</span></div>`;
  }
  function spanel(titleAr, titleEn, fields, obj){
    return `<div class="inv-panel"><div class="inv-panel-h"><span>${titleAr}</span><span class="inv-en-h">${titleEn}</span></div>` +
      fields.map(([k, ar, en]) => srow(ar, en, obj[k] || '', ['vat','cr','postal','bno','addno'].includes(k))).join('') + '</div>';
  }
  function sheetHtml(){
    const inv = cur, T = calcAll(inv);
    const shown = inv.items.map((it, i) => ({ it, r: T.rows[i] })).filter(x => !x.r.empty || x.it.type || x.it.code);
    const rowsHtml = shown.map(({ it, r }) => `<tr>
      <td>${esc(it.code)}</td><td>${esc(it.type)}</td><td class="inv-ltr">${esc(it.qty)}</td><td class="inv-ltr">${esc(it.price)}</td>
      <td class="inv-ltr">${r.days > 0 ? esc(String(Math.round(r.days * 100) / 100)) : ''}</td><td class="inv-ltr">${esc(it.disc)}</td>
      <td class="inv-calc">${r.empty ? '' : money(r.total)}</td><td class="inv-ltr">${esc(it.vatPct)}</td>
      <td class="inv-calc">${r.empty ? '' : money(r.vat)}</td><td class="inv-calc inv-net">${r.empty ? '' : money(r.net)}</td></tr>`).join('');
    return `
      <div class="inv-title"><b>${cfg.titleAr}</b><span>${cfg.titleEn}</span></div>
      <div class="inv-meta">
        <div class="inv-meta-col">${srow(cfg.noLabel, cfg.noEn, inv.no, true)}${srow(cfg.dateLabel, 'Date', inv.date, true)}</div>
        <div class="inv-meta-col">${srow('بداية التنفيذ', 'Start', inv.supply, true)}${srow('نهاية التنفيذ', 'End', inv.supplyEnd, true)}</div>
      </div>
      <div class="inv-panels">
        ${spanel('بيانات البائع', 'Seller Info', SELLER_FIELDS, inv.seller)}
        ${spanel('بيانات العميل', 'Customer Info', CUSTOMER_FIELDS, inv.customer)}
      </div>
      <table class="inv-items">
        <thead><tr>
          <th>الرمز<small>Item Code</small></th><th>النوع<small>Type</small></th><th>العدد<small>QTY</small></th>
          <th>السعر<small>PRICE</small></th><th>الأيام<small>Days</small></th><th>الخصم<small>Disc.</small></th><th>السعر الإجمالي<small>Total Price</small></th>
          <th>% ضريبة<small>VAT %</small></th><th>قيمة الضريبة<small>VAT</small></th><th>الصافي<small>Net Price</small></th>
        </tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      <div class="inv-sum">
        <div class="inv-totals">
          <div class="inv-trow"><span class="inv-ar">الاجمالي</span><span class="inv-en">Amount</span><b>${money(T.gross)}</b></div>
          <div class="inv-trow"><span class="inv-ar">الخصم</span><span class="inv-en">Discount</span><b>${money(T.disc)}</b></div>
          <div class="inv-trow"><span class="inv-ar">الضرائب</span><span class="inv-en">VAT ${T.pct == null ? '' : T.pct + ' '}%</span><b>${money(T.vat)}</b></div>
          <div class="inv-trow inv-trow-net"><span class="inv-ar">الصافي</span><span class="inv-en">Net Amount</span><b>${money(T.net)}</b></div>
        </div>
        ${cfg.qr ? `<div class="inv-qr">${qrSvg(zatcaPayload(inv, T))}</div>` : ''}
      </div>
      <div class="inv-words">${esc(tafqeet(T.net))}</div>
      <div class="inv-iban"><span class="inv-iban-l">رقم الحساب الدولي (IBAN)</span><span class="inv-val inv-ltr inv-iban-v">${esc(inv.iban)}</span><span class="inv-iban-note">${cfg.ibanNote}</span></div>
      <div class="inv-sign"><span>المستلم</span></div>`;
  }
  function renderSheet(){ const s = $('sheet'); if(!s || !cur) return; s.innerHTML = sheetHtml(); rendered = true; }
  function renderAll(){ renderForm(); renderSheet(); }
  function growAll(){}

  function renderList(){
    const body = $('listBody'); if(!body) return;
    const list = [...mine()].sort((a, b) => String(b.no).localeCompare(String(a.no)));
    body.innerHTML = list.length ? list.map(inv => {
      const T = calcAll(inv);
      return `<tr${cur && cur.id === inv.id ? ' class="inv-active"' : ''}>
        <td class="mono">${esc(inv.no)}</td><td class="mono">${esc(inv.date)}</td><td>${esc(inv.customer && inv.customer.name)}</td>
        <td class="mono">${money(T.net)}</td>
        <td><button type="button" class="btn btn-sm" data-inv-open="${esc(inv.id)}">فتح</button>
            <button type="button" class="btn btn-sm" data-inv-copy="${esc(inv.id)}">نسخ</button>
            <button type="button" class="btn btn-sm btn-danger" data-inv-del="${esc(inv.id)}">حذف</button></td></tr>`;
    }).join('') : `<tr><td colspan="5" class="empty-note">${cfg.emptyList}</td></tr>`;

  }

  // ---------- عمليات ----------
  function newInvoice(){ cur = blankInvoice(); renderAll(); renderList(); }
  function openInvoice(id, asCopy){
    const inv = all().find(x => x.id === id); if(!inv) return;
    cur = normalize(inv);
    if(asCopy){ cur.id = ''; cur.no = nextNo(); cur.date = ''; cur.supply = ''; cur.supplyEnd = ''; }
    renderAll(); renderList();
    const w = $('form'); if(w) w.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function save(){
    if(!cur) return;
    if(!String(cur.customer.name || '').trim()){ ctx.toast('اكتب اسم العميل أولاً'); return; }
    if(!String(cur.no || '').trim()){ ctx.toast(cfg.noMsg); return; }
    if(!String(cur.date || '').trim()){ ctx.toast(cfg.dateMsg); return; }
    const list = all();
    if(mine().some(x => x.id !== cur.id && String(x.no) === String(cur.no))){ ctx.toast(cfg.dupMsg); return; }
    const rec = clone(cur); rec.updatedAt = new Date().toISOString();
    rec.kind = cfg.kind;
    if(!rec.id) rec.id = (cfg.kind === 'order' ? 'ord' : 'inv') + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const i = list.findIndex(x => x.id === rec.id);
    if(i >= 0) list[i] = rec; else list.push(rec);
    cur.id = rec.id;
    ctx.save(cfg.savedMsg);
    renderList();
  }
  function remove(id){
    if(!confirm(cfg.delConfirm)) return;
    const list = all(), i = list.findIndex(x => x.id === id); if(i < 0) return;
    list.splice(i, 1);
    ctx.save(cfg.delMsg);
    if(cur && cur.id === id){ cur = blankInvoice(); renderAll(); }
    renderList();
  }
  // اختيار العميل من المشاريع: ترحيل بياناته وبنود الإيرادات (العدد × الإيراد للفرد) — قابلة للتعديل بعد الترحيل
  function fillFromProject(name){
    const nm = String(name || '').trim();
    const C = cur.customer;
    if(!nm){ cur.projectId = ''; return; }
    const p = (ctx.getProjects() || []).find(x => String(x.name || '').trim() === nm);
    C.name = nm;
    if(!p){ renderAll(); return; }
    cur.projectId = p.id || '';
    C.cr = p.cr || ''; C.vat = p.vatNo || ''; C.street = p.address || ''; C.city = p.region || C.city || '';
    const old = [...mine()].reverse().find(x => x.customer && String(x.customer.name || '').trim() === nm);
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
    renderAll();
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
    document.title = cfg.printTitle + (cur.no || '');
    document.body.classList.add(cfg.printClass);
    growAll();
    const done = () => {
      document.body.classList.remove(cfg.printClass); st.remove(); document.title = oldTitle;
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  }

  function bind(){
    if(bound) return; bound = true;
    $('newBtn')?.addEventListener('click', newInvoice);
    $('saveBtn')?.addEventListener('click', save);
    $('printBtn')?.addEventListener('click', print);
    $('listBody')?.addEventListener('click', e => {
      const o = e.target.closest('[data-inv-open]'), c = e.target.closest('[data-inv-copy]'), d = e.target.closest('[data-inv-del]');
      if(o) openInvoice(o.dataset.invOpen);
      else if(c) openInvoice(c.dataset.invCopy, true);
      else if(d) remove(d.dataset.invDel);
    });
    const f = $('form'); if(!f) return;
    f.addEventListener('input', e => {
      const t = e.target, p = t.dataset && t.dataset.p;
      if(!p || !cur || t.tagName === 'SELECT') return;
      setPath(cur, p, t.value);
      refreshForm(); renderSheet();
    });
    f.addEventListener('change', e => {
      const t = e.target, p = t.dataset && t.dataset.p;
      if(!p || !cur || t.tagName !== 'SELECT') return;
      setPath(cur, p, t.value);
      if(t.dataset.proj) fillFromProject(t.value); else { refreshForm(); renderSheet(); }
    });
    f.addEventListener('click', e => {
      if(e.target.closest('#' + cfg.id.addRow)){
        if(cur.items.length < MAX_ROWS){ cur.items.push(blankItem()); renderAll(); }
        return;
      }
      const at = e.target.closest('.inv-addtype');
      if(at){
        const nm = addType(); if(!nm) return;
        const tr = at.closest('tr'); if(tr) cur.items[+tr.dataset.i].type = nm;
        renderAll(); return;
      }
      const del = e.target.closest('[data-del]');
      if(del){
        const i = +del.dataset.del;
        if(cur.items.length > 1) cur.items.splice(i, 1); else cur.items[0] = blankItem();
        renderAll();
      }
    });
  }


  const api = {
    bind, render(){ if(!ctx) return; if(!cur) cur = blankInvoice(); renderList(); if(!rendered) renderAll(); },
    reset(){ cur = null; rendered = false; const s = $('sheet'); if(s) s.innerHTML = ''; const f = $('form'); if(f) f.innerHTML = ''; },
    open(id, asCopy){ openInvoice(id, asCopy); }
  };
  return api;
  }

  const CFG = {
    invoice: {
      kind: 'invoice', prefix: 'INV-MAK-', titleAr: 'فاتورة مبيعات ضريبية', titleEn: 'Tax Invoice', qr: true,
      noLabel: 'رقم الفاتورة', noEn: 'Inv.No', dateLabel: 'تاريخ الفاتورة', formTitle: 'إدخال الفاتورة',
      ibanNote: 'نرجو تحويل المبلغ المستحق على حساب الايبان الظاهر في الفاتورة',
      savedMsg: 'تم حفظ الفاتورة', delMsg: 'تم حذف الفاتورة', delConfirm: 'حذف هذه الفاتورة نهائياً؟',
      dupMsg: 'رقم الفاتورة مستخدم في فاتورة أخرى', noMsg: 'رقم الفاتورة مطلوب', dateMsg: 'أدخل تاريخ الفاتورة',
      emptyList: 'لا توجد فواتير محفوظة بعد', printTitle: 'فاتورة-', printClass: 'inv-printing',
      id: { sheet: 'invSheet', form: 'invForm', listBody: 'invListBody', addRow: 'invAddRow', rowsNote: 'invRowsNote', newBtn: 'newInvoiceBtn', saveBtn: 'saveInvoiceBtn', printBtn: 'printInvoiceBtn' }
    },
    order: {
      kind: 'order', prefix: 'SO-MAK-', titleAr: 'أمر بيع', titleEn: 'Sales Order', qr: false,
      noLabel: 'رقم الأمر', noEn: 'Order No', dateLabel: 'تاريخ الأمر', formTitle: 'إدخال أمر البيع',
      ibanNote: 'نرجو تحويل المبلغ المستحق على حساب الايبان الظاهر في أمر البيع',
      savedMsg: 'تم حفظ أمر البيع', delMsg: 'تم حذف أمر البيع', delConfirm: 'حذف أمر البيع هذا نهائياً؟',
      dupMsg: 'رقم الأمر مستخدم في أمر آخر', noMsg: 'رقم الأمر مطلوب', dateMsg: 'أدخل تاريخ الأمر',
      emptyList: 'لا توجد أوامر بيع محفوظة بعد', printTitle: 'أمر-بيع-', printClass: 'ord-printing',
      id: { sheet: 'ordSheet', form: 'ordForm', listBody: 'ordListBody', addRow: 'ordAddRow', rowsNote: 'ordRowsNote', newBtn: 'newOrderBtn', saveBtn: 'saveOrderBtn', printBtn: 'printOrderBtn' }
    }
  };
  let inv = null, ord = null, allBound = false;
  const invKind = i => i.kind || 'invoice';

  // ---------- تبويب «كل الفواتير» ----------
  function renderAllInvoices(){
    const body = document.getElementById('allInvListBody'); if(!body || !ctx) return;
    const q = String((document.getElementById('allInvSearch') || {}).value || '').trim().toLowerCase();
    const list = ctx.getInvoices().filter(i => invKind(i) === 'invoice')
      .filter(i => !q || [i.no, i.date, i.customer && i.customer.name].join(' ').toLowerCase().includes(q))
      .sort((a, b) => String(b.no).localeCompare(String(a.no)));
    let sum = 0;
    body.innerHTML = list.length ? list.map(x => {
      const T = calcAll(x); sum += T.net;
      return `<tr><td class="mono">${esc(x.no)}</td><td class="mono">${esc(x.date)}</td><td>${esc(x.customer && x.customer.name)}</td>
        <td class="mono">${esc(x.supply || '')}${x.supplyEnd ? ' → ' + esc(x.supplyEnd) : ''}</td><td class="mono">${money(T.vat)}</td><td class="mono"><b>${money(T.net)}</b></td>
        <td><div class="row-actions"><button type="button" class="btn btn-sm btn-primary" data-all-edit="${esc(x.id)}">تعديل</button>
        <button type="button" class="btn btn-sm" data-all-copy="${esc(x.id)}">نسخ</button>
        <button type="button" class="btn btn-sm btn-danger" data-all-del="${esc(x.id)}">حذف</button></div></td></tr>`;
    }).join('') : '<tr><td colspan="7" class="empty-note">لا توجد فواتير محفوظة</td></tr>';
    const t = document.getElementById('allInvTotal');
    if(t) t.textContent = list.length ? `${list.length} فاتورة — إجمالي الصافي: ${money(sum)} ر.س` : '';
  }
  function bindAll(){
    if(allBound) return; allBound = true;
    document.getElementById('allInvSearch')?.addEventListener('input', renderAllInvoices);
    document.getElementById('allInvListBody')?.addEventListener('click', e => {
      const ed = e.target.closest('[data-all-edit]'), cp = e.target.closest('[data-all-copy]'), dl = e.target.closest('[data-all-del]');
      const go = (id, copy) => { if(root.switchView) root.switchView('sales'); inv.open(id, copy); };
      if(ed) go(ed.dataset.allEdit, false);
      else if(cp) go(cp.dataset.allCopy, true);
      else if(dl){
        if(!confirm('حذف هذه الفاتورة نهائياً؟')) return;
        const l = ctx.getInvoices(), i = l.findIndex(x => x.id === dl.dataset.allDel); if(i < 0) return;
        l.splice(i, 1); ctx.save('تم حذف الفاتورة'); renderAllInvoices();
      }
    });
  }

  root.HRSales = {
    init(c){ ctx = c; inv = makeDoc(CFG.invoice); ord = makeDoc(CFG.order); inv.bind(); ord.bind(); bindAll(); },
    // يُستدعى عند فتح التبويب: يحافظ على المسودة المفتوحة عند التنقل بين التبويبات
    render(){ inv && inv.render(); },
    renderOrder(){ ord && ord.render(); },
    renderAll: renderAllInvoices,
    // عند إغلاق التبويب: نبدأ من مسودة جديدة
    reset(){ inv && inv.reset(); },
    resetOrder(){ ord && ord.reset(); },
    _calc: calcAll, _tafqeet: tafqeet, _num: num
  };
})(typeof window !== 'undefined' ? window : globalThis);
