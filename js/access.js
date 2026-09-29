// شاشة إدارة المستخدمين والصلاحيات (للمدير فقط).
// المستخدمون يُنشؤون في Firebase Authentication، وصلاحياتهم تُحفظ في hr_users/{uid}.
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { collection, getDocs, getDoc, doc, setDoc, updateDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let users = [];
let editingUid = null;

function msg(text, kind){
  const el = document.getElementById('usersMsg');
  if(!el) return;
  el.textContent = text || '';
  el.style.color = kind === 'err' ? '#e25555' : (kind === 'ok' ? '#2e9e5b' : '');
}

// كتالوج الصلاحيات يُبنى من القائمة الجانبية نفسها، فأي تبويب جديد يظهر تلقائياً
function buildCatalog(){
  const groups = [];
  const seen = new Set();
  const labelOf = a => (a.querySelector('span')?.textContent || a.textContent || '').trim();
  const push = (title, links) => {
    const items = [];
    links.forEach(a => {
      const key = window.HRAuth.keyOf(a);
      if(key === 'users' || seen.has(key)) return;
      seen.add(key);
      items.push({ key, label: labelOf(a) });
    });
    if(items.length) groups.push({ title, items });
  };
  push('عام', [...document.querySelectorAll('#navlist > .navlink[data-view]')]);
  document.querySelectorAll('#navlist .nav-group').forEach(g => {
    if(g.hasAttribute('data-admin-only')) return;
    const title = (g.querySelector('.nav-group-toggle span')?.textContent || '').trim();
    push(title, [...g.querySelectorAll('.nav-child[data-view]')]);
  });
  return groups;
}

function permsHtml(){
  return buildCatalog().map(g => `
    <fieldset class="u-perm-group" style="border:1px solid var(--line,rgba(128,128,128,.3));border-radius:10px;padding:10px 14px;margin:0 0 10px">
      <legend style="padding:0 6px;font-weight:700">${esc(g.title)}</legend>
      <div style="display:flex;flex-wrap:wrap;gap:8px 22px">
        ${g.items.map(i => `<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" class="u-perm" value="${esc(i.key)}"> ${esc(i.label)}</label>`).join('')}
      </div>
    </fieldset>`).join('');
}

function formHtml(){
  return `
  <div class="card section-card" style="margin-bottom:16px">
    <h3 id="uFormTitle">إضافة مستخدم جديد</h3>
    <form id="userForm" autocomplete="off">
      <div class="field-grid">
        <div class="field"><label>الاسم</label><input id="u_name" placeholder="اسم المستخدم"></div>
        <div class="field"><label>البريد الإلكتروني <span class="req">*</span></label><input id="u_email" type="email" required placeholder="user@example.com"></div>
        <div class="field" id="u_pass_wrap"><label>كلمة المرور <span class="req">*</span></label><input id="u_pass" type="text" minlength="6" autocomplete="new-password" placeholder="6 أحرف على الأقل"></div>
        <div class="field"><label>نوع الحساب</label>
          <select id="u_role"><option value="user">مستخدم بصلاحيات محددة</option><option value="admin">مدير (كل الصلاحيات + إدارة المستخدمين)</option></select>
        </div>
      </div>
      <div id="u_fin_wrap" style="margin-top:12px">
        <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer"><input type="checkbox" id="u_finance" style="margin-top:4px">
          <span><b>صلاحية البيانات المالية</b><br><small>الرواتب والبدلات، الحسابات البنكية والآيبان، أسعار وتكاليف المشاريع، مسيرات الرواتب، حسابات المشاريع، ومبالغ التغطيات. بدونها لا تصل هذه البيانات لجهازه أصلاً (محمية بقواعد قاعدة البيانات)، وتُخفى شاشتا «حسابات المشاريع» و«تقارير الرواتب».</small></span>
        </label>
      </div>
      <div id="u_perms_wrap" style="margin-top:12px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
          <b>التبويبات المسموحة</b>
          <button type="button" class="btn btn-sm" id="u_all">تحديد الكل</button>
          <button type="button" class="btn btn-sm" id="u_none">إلغاء الكل</button>
        </div>
        ${permsHtml()}
      </div>
      <div class="action-row" style="margin-top:12px">
        <button class="btn btn-primary" type="submit" id="u_submit">إنشاء المستخدم</button>
        <button class="btn" type="button" id="u_cancel" style="display:none">إلغاء التعديل</button>
      </div>
      <div id="usersMsg" class="field-note" role="status"></div>
    </form>
  </div>
  <div class="card section-card">
    <h3>المستخدمون</h3>
    <div class="table-wrap"><table class="payroll-table"><thead><tr><th>الاسم</th><th>البريد</th><th>النوع</th><th>الصلاحيات</th><th>المالية</th><th>الحالة</th><th>إجراءات</th></tr></thead>
    <tbody id="usersBody"><tr><td colspan="7">جاري التحميل...</td></tr></tbody></table></div>
  </div>${backupHtml()}`;
}

function setRoleUi(){
  const isAdmin = document.getElementById('u_role').value === 'admin';
  document.getElementById('u_perms_wrap').style.display = isAdmin ? 'none' : '';
  document.getElementById('u_fin_wrap').style.display = isAdmin ? 'none' : '';
}
function checkedViews(){ return [...document.querySelectorAll('.u-perm:checked')].map(c => c.value); }
function setChecked(views){ document.querySelectorAll('.u-perm').forEach(c => c.checked = views.includes(c.value)); }

function resetForm(){
  editingUid = null;
  document.getElementById('userForm').reset();
  document.getElementById('u_email').readOnly = false;
  document.getElementById('u_pass_wrap').style.display = '';
  document.getElementById('u_pass').required = true;
  document.getElementById('uFormTitle').textContent = 'إضافة مستخدم جديد';
  document.getElementById('u_submit').textContent = 'إنشاء المستخدم';
  document.getElementById('u_cancel').style.display = 'none';
  document.getElementById('u_finance').checked = false;
  setChecked([]); setRoleUi();
}

async function loadUsers(){
  const body = document.getElementById('usersBody');
  try{
    const snap = await getDocs(collection(window.FB.firestore, 'hr_users'));
    users = snap.docs.map(d => ({ uid: d.id, ...d.data() }));
    users.sort((a, b) => String(a.email || '').localeCompare(String(b.email || '')));
    const me = window.HRAuth.user?.uid;
    body.innerHTML = users.map(u => `
      <tr>
        <td>${esc(u.name || '—')}</td>
        <td dir="ltr" style="text-align:right">${esc(u.email || '')}</td>
        <td>${u.role === 'admin' ? '<span class="pill pill-blue">مدير</span>' : '<span class="pill pill-gray">مستخدم</span>'}</td>
        <td>${u.role === 'admin' ? 'الكل' : (u.views || []).length + ' تبويب'}</td>
        <td>${(u.role === 'admin' || u.finance) ? '<span class="pill pill-blue">مسموحة</span>' : '<span class="pill pill-gray">محجوبة</span>'}</td>
        <td>${u.disabled ? '<span class="pill pill-danger">موقوف</span>' : '<span class="pill pill-blue">نشط</span>'}</td>
        <td><div class="row-actions">
          <button class="btn btn-sm" data-u-edit="${esc(u.uid)}">تعديل</button>
          ${u.uid === me ? '' : `<button class="btn btn-sm" data-u-toggle="${esc(u.uid)}">${u.disabled ? 'تفعيل' : 'إيقاف'}</button>`}
          <button class="btn btn-sm" data-u-reset="${esc(u.uid)}">إعادة تعيين كلمة المرور</button>
          ${u.uid === me ? '' : `<button class="btn btn-sm btn-danger" data-u-del="${esc(u.uid)}">حذف</button>`}
        </div></td>
      </tr>`).join('') || '<tr><td colspan="7">لا يوجد مستخدمون.</td></tr>';
  }catch(err){
    console.error(err);
    body.innerHTML = '<tr><td colspan="7">تعذر تحميل المستخدمين. تأكد من نشر firestore.rules.</td></tr>';
  }
}

async function createAuthUser(email, password){
  // نستخدم نسخة Firebase ثانوية حتى لا يتم تسجيل خروج المدير الحالي
  const secondary = initializeApp(window.FB.app.options, 'secondary-' + Date.now());
  try{
    const cred = await createUserWithEmailAndPassword(getAuth(secondary), email, password);
    const uid = cred.user.uid;
    await signOut(getAuth(secondary));
    return uid;
  }finally{
    await deleteApp(secondary).catch(() => {});
  }
}

const AUTH_ERRORS = {
  'auth/email-already-in-use': 'هذا البريد مسجل بالفعل.',
  'auth/invalid-email': 'صيغة البريد غير صحيحة.',
  'auth/weak-password': 'كلمة المرور ضعيفة (6 أحرف على الأقل).',
  'permission-denied': 'لا تملك صلاحية تنفيذ هذا الإجراء.'
};

async function onSubmit(ev){
  ev.preventDefault();
  const name = document.getElementById('u_name').value.trim();
  const email = document.getElementById('u_email').value.trim();
  const password = document.getElementById('u_pass').value;
  const role = document.getElementById('u_role').value;
  const views = role === 'admin' ? [] : checkedViews();
  const finance = role === 'admin' ? true : document.getElementById('u_finance').checked;
  if(role === 'user' && !views.length){ msg('اختر تبويباً واحداً على الأقل.', 'err'); return; }
  const btn = document.getElementById('u_submit');
  btn.disabled = true; msg('جاري الحفظ...');
  try{
    const fs = window.FB.firestore;
    if(editingUid){
      if(editingUid === window.HRAuth.user?.uid && role !== 'admin'){ msg('لا يمكنك إزالة صلاحية المدير من حسابك.', 'err'); return; }
      await updateDoc(doc(fs, 'hr_users', editingUid), { name, role, views, finance, updatedAt: new Date().toISOString() });
      msg('تم تحديث المستخدم.', 'ok');
    }else{
      const uid = await createAuthUser(email, password);
      await setDoc(doc(fs, 'hr_users', uid), {
        email, name, role, views, finance, disabled: false,
        createdAt: new Date().toISOString(), createdBy: window.HRAuth.user?.email || ''
      });
      msg('تم إنشاء المستخدم. يمكنه الدخول الآن بالبريد وكلمة المرور.', 'ok');
    }
    resetForm();
    await loadUsers();
  }catch(err){
    console.error(err);
    msg(AUTH_ERRORS[err.code] || ('حدث خطأ: ' + (err.message || err.code)), 'err');
  }finally{
    btn.disabled = false;
  }
}

async function onTableClick(ev){
  const t = ev.target.closest('button'); if(!t) return;
  const fs = window.FB.firestore;
  try{
    if(t.dataset.uEdit){
      const u = users.find(x => x.uid === t.dataset.uEdit); if(!u) return;
      editingUid = u.uid;
      document.getElementById('u_name').value = u.name || '';
      document.getElementById('u_email').value = u.email || '';
      document.getElementById('u_email').readOnly = true;
      document.getElementById('u_pass_wrap').style.display = 'none';
      document.getElementById('u_pass').required = false;
      document.getElementById('u_role').value = u.role === 'admin' ? 'admin' : 'user';
      setChecked(u.views || []);
      document.getElementById('u_finance').checked = !!u.finance;
      setRoleUi();
      document.getElementById('uFormTitle').textContent = 'تعديل صلاحيات: ' + (u.email || '');
      document.getElementById('u_submit').textContent = 'حفظ التعديلات';
      document.getElementById('u_cancel').style.display = '';
      document.getElementById('userForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    }else if(t.dataset.uToggle){
      const u = users.find(x => x.uid === t.dataset.uToggle); if(!u) return;
      await updateDoc(doc(fs, 'hr_users', u.uid), { disabled: !u.disabled });
      await loadUsers();
    }else if(t.dataset.uReset){
      const u = users.find(x => x.uid === t.dataset.uReset); if(!u?.email) return;
      await sendPasswordResetEmail(window.FB.auth, u.email);
      msg('تم إرسال رابط إعادة تعيين كلمة المرور إلى ' + u.email, 'ok');
    }else if(t.dataset.uDel){
      const u = users.find(x => x.uid === t.dataset.uDel); if(!u) return;
      if(!confirm('حذف صلاحيات المستخدم ' + (u.email || '') + '؟ لن يستطيع الدخول للنظام بعد ذلك.')) return;
      await deleteDoc(doc(fs, 'hr_users', u.uid));
      await loadUsers();
    }
  }catch(err){
    console.error(err);
    msg(AUTH_ERRORS[err.code] || ('حدث خطأ: ' + (err.message || err.code)), 'err');
  }
}

// ===== النسخ الاحتياطي والاسترجاع (للمدير فقط) =====
const DOC_LIMIT = 1048576; // الحد الأقصى لمستند Firestore الواحد (1 MiB)
const fmtKB = n => Math.round(n / 1024).toLocaleString('en-US') + ' KB';
const bytesOf = o => new Blob([JSON.stringify(o ?? null)]).size;

function bkMsg(text, kind){
  const el = document.getElementById('bk_msg');
  if(!el) return;
  el.textContent = text || '';
  el.style.color = kind === 'err' ? '#e25555' : (kind === 'ok' ? '#2e9e5b' : '');
}

function backupHtml(){
  return `
  <div class="card section-card" style="margin-top:16px">
    <h3>النسخ الاحتياطي والاسترجاع</h3>
    <p class="field-note">ينزّل ملف JSON فيه كل بيانات النظام: العامة والمالية وملفات الموظفين وقائمة المستخدمين. الملف يحتوي رواتب وآيبانات وهويات، فاحفظه في مكان آمن ولا ترفعه على GitHub. يُنصح بنسخة أسبوعية على الأقل، وقبل أي تعديل كبير.</p>
    <div class="action-row" style="display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:10px 0">
      <label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="bk_files" checked> تضمين ملفات الموظفين (قد يكبر حجم الملف)</label>
      <button class="btn btn-primary" type="button" id="bk_download">تنزيل نسخة احتياطية</button>
      <button class="btn" type="button" id="bk_restore_btn">استرجاع من ملف</button>
      <input type="file" id="bk_restore_file" accept=".json,application/json" style="display:none">
    </div>
    <div id="bk_meter" class="field-note">جاري قياس حجم البيانات...</div>
    <div id="bk_msg" class="field-note" role="status"></div>
  </div>`;
}

async function readAllForBackup(includeFiles){
  const fs = window.FB.firestore;
  const out = {
    format: 'hr-backup', version: 1,
    createdAt: new Date().toISOString(),
    projectId: window.FB.app.options.projectId || '',
    createdBy: window.HRAuth.user?.email || '',
    docs: {}
  };
  const g = await getDoc(doc(fs, 'hr_system', 'main'));
  out.docs.general = g.exists() ? g.data() : null;
  const f = await getDoc(doc(fs, 'hr_finance', 'main'));
  out.docs.finance = f.exists() ? f.data() : null;
  const u = await getDocs(collection(fs, 'hr_users'));
  out.docs.users = u.docs.map(d => ({ id: d.id, data: d.data() }));
  if(includeFiles){
    const e = await getDocs(collection(fs, 'hr_system', 'main', 'employee_files'));
    out.docs.employeeFiles = e.docs.map(d => ({ id: d.id, data: d.data() }));
  }
  return out;
}

function downloadJson(obj, name){
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const stampName = tag => `hr-backup${tag ? '-' + tag : ''}-${(window.FB.app.options.projectId || 'project')}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`;

async function onBackupDownload(){
  const btn = document.getElementById('bk_download');
  btn.disabled = true; bkMsg('جاري تجهيز النسخة الاحتياطية...');
  try{
    const inc = document.getElementById('bk_files').checked;
    const data = await readAllForBackup(inc);
    downloadJson(data, stampName(''));
    const nEmp = Array.isArray(data.docs.general?.employees) ? data.docs.general.employees.length : 0;
    bkMsg(`تم تنزيل النسخة: ${nEmp} موظف، ${(data.docs.employeeFiles || []).length} ملف مرفق. احفظ الملف في مكان آمن.`, 'ok');
  }catch(err){
    console.error(err);
    bkMsg('تعذر إنشاء النسخة الاحتياطية: ' + (err.code || err.message), 'err');
  }finally{ btn.disabled = false; }
}

async function onRestoreFile(ev){
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if(!file) return;
  try{
    let b;
    try{ b = JSON.parse(await file.text()); }catch(e){ bkMsg('الملف غير صالح (ليس JSON سليماً).', 'err'); return; }
    const g = b && b.docs && b.docs.general, f = b && b.docs && b.docs.finance;
    if(!b || b.format !== 'hr-backup' || !g){ bkMsg('هذا الملف ليس نسخة احتياطية من هذا النظام.', 'err'); return; }
    if(g.schema !== 2 || 'payrollRecords' in g || 'projectAccounts' in g){ bkMsg('نسق الملف غير مدعوم. استخدم نسخة تم تنزيلها من هذه الشاشة.', 'err'); return; }
    const nEmp = Array.isArray(g.employees) ? g.employees.length : 0;
    const nFiles = (b.docs.employeeFiles || []).length;
    const summary = `سيتم استبدال بيانات النظام الحالية بمحتوى النسخة:\n- تاريخ النسخة: ${b.createdAt || '؟'}\n- المشروع: ${b.projectId || '؟'}\n- الموظفون: ${nEmp}\n- ملفات الموظفين: ${nFiles}\n- البيانات المالية: ${f ? 'موجودة' : 'غير موجودة'}\n\nلن تتأثر حسابات المستخدمين وصلاحياتهم.\nسيتم تنزيل نسخة من الوضع الحالي تلقائياً قبل الاستبدال.\n\nاكتب كلمة: استرجاع   للتأكيد`;
    const answer = prompt(summary);
    if(!answer || answer.trim() !== 'استرجاع'){ bkMsg('تم إلغاء الاسترجاع.'); return; }

    bkMsg('جاري أخذ نسخة أمان من الوضع الحالي...');
    const current = await readAllForBackup(true);
    downloadJson(current, stampName('BEFORE-RESTORE'));

    bkMsg('جاري الاسترجاع...');
    const fs = window.FB.firestore;
    if(f) await setDoc(doc(fs, 'hr_finance', 'main'), f);
    await setDoc(doc(fs, 'hr_system', 'main'), g);
    for(const item of (b.docs.employeeFiles || [])){
      await setDoc(doc(fs, 'hr_system', 'main', 'employee_files', item.id), item.data);
    }
    bkMsg('تم الاسترجاع بنجاح. جاري إعادة تحميل الصفحة...', 'ok');
    setTimeout(() => location.reload(), 1500);
  }catch(err){
    console.error(err);
    bkMsg('فشل الاسترجاع: ' + (err.code || err.message) + '. نسخة الأمان التي نُزّلت تحفظ وضعك السابق.', 'err');
  }
}

async function renderMeter(){
  const el = document.getElementById('bk_meter');
  if(!el) return;
  try{
    const fs = window.FB.firestore;
    const [g, f, e] = await Promise.all([
      getDoc(doc(fs, 'hr_system', 'main')),
      getDoc(doc(fs, 'hr_finance', 'main')),
      getDocs(collection(fs, 'hr_system', 'main', 'employee_files'))
    ]);
    const gs = g.exists() ? bytesOf(g.data()) : 0;
    const fsz = f.exists() ? bytesOf(f.data()) : 0;
    let filesTotal = 0; e.docs.forEach(d => { filesTotal += bytesOf(d.data()); });
    const line = (label, n) => {
      const pct = n / DOC_LIMIT * 100;
      const color = pct >= 90 ? '#e25555' : (pct >= 70 ? '#d9822b' : '#2e9e5b');
      return `<div>${label}: <b style="color:${color}">${fmtKB(n)}</b> من 1,024 KB (${pct.toFixed(0)}%)</div>`;
    };
    const worst = Math.max(gs, fsz) / DOC_LIMIT;
    el.innerHTML = `<b>حجم البيانات (تقريبي):</b>` + line('البيانات العامة', gs) + line('البيانات المالية', fsz)
      + `<div>ملفات الموظفين: ${e.size} ملف (${fmtKB(filesTotal)})</div>`
      + (worst >= 0.7 ? `<div style="color:#d9822b;margin-top:6px"><b>تنبيه:</b> أحد المستندين اقترب من الحد الأقصى في Firestore (1 MB). عند تجاوزه يفشل الحفظ في السحابة. خذ نسخة احتياطية الآن وتواصل مع المطوّر لتقسيم البيانات.</div>` : '');
  }catch(err){
    console.error(err);
    el.textContent = 'تعذر قياس حجم البيانات.';
  }
}

async function render(){
  const root = document.getElementById('usersRoot');
  if(!root) return;
  if(!window.HRAuth?.isAdmin()){ root.innerHTML = '<div class="card section-card" style="padding:24px">هذه الشاشة للمدير فقط.</div>'; return; }
  root.innerHTML = formHtml();
  document.getElementById('userForm').addEventListener('submit', onSubmit);
  document.getElementById('u_role').addEventListener('change', setRoleUi);
  document.getElementById('u_all').onclick = () => document.querySelectorAll('.u-perm').forEach(c => c.checked = true);
  document.getElementById('u_none').onclick = () => document.querySelectorAll('.u-perm').forEach(c => c.checked = false);
  document.getElementById('u_cancel').onclick = resetForm;
  document.getElementById('usersBody').addEventListener('click', onTableClick);
  setRoleUi();
  document.getElementById('bk_download').onclick = onBackupDownload;
  document.getElementById('bk_restore_btn').onclick = () => document.getElementById('bk_restore_file').click();
  document.getElementById('bk_restore_file').addEventListener('change', onRestoreFile);
  renderMeter();
  await loadUsers();
}

window.HRUsers = { render };
