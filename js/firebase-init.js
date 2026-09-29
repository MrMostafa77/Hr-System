// Firebase Authentication + Firestore bootstrap.
// No npm/build step is required; this project is static and GitHub/Firebase Hosting ready.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot, writeBatch } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig, APP_CHECK_SITE_KEY } from './firebase-config.js';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';

const app = initializeApp(firebaseConfig);
// App Check اختياري: يُفعَّل فقط لو وُضع مفتاح في firebase-config.js
if(APP_CHECK_SITE_KEY){
  try{
    const ac = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-app-check.js');
    ac.initializeAppCheck(app, { provider: new ac.ReCaptchaV3Provider(APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
  }catch(e){ console.warn('App Check init failed:', e); }
}
const auth = getAuth(app);
const firestore = getFirestore(app);
const storage = getStorage(app);
const stateRef = doc(firestore, 'hr_system', 'main');
const financeRef = doc(firestore, 'hr_finance', 'main');        // بيانات مالية (رواتب/بنوك/أسعار/مسيرات...) - بصلاحية finance فقط
const backupRef = doc(firestore, 'hr_finance', 'backup_v1');    // نسخة احتياطية من الوثيقة القديمة قبل التقسيم

// ===== تقسيم البيانات العامة / المالية =====
const canFin = () => { const p = window.HRAuth?.profile; return !!p && (p.role === 'admin' || p.finance === true || p.legacy === true); };
const isSingle = () => !!window.HRAuth?.profile?.legacy; // قواعد Firestore القديمة (قبل النشر): وثيقة واحدة كما كان
const stable = v => Array.isArray(v) ? '[' + v.map(stable).join(',') + ']'
  : (v && typeof v === 'object') ? '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}'
  : JSON.stringify(v === undefined ? null : v);
const stamp = o => ({ ...o, updatedAt: new Date().toISOString() });
const stripStamp = o => { const { updatedAt, ...rest } = o || {}; return rest; };
const emptyFinance = () => ({ schema: 2, employees: {}, projects: {}, coverage: {}, contracts: {}, payrollRecords: {}, projectAccounts: [] });
const sig = { general: null, finance: null };   // آخر محتوى كُتب/قُرئ لتفادي الكتابة المكررة


window.FB = {
  app, auth, firestore, storage,
  // ملفات الموظفين تُخزَّن الآن كـ base64 داخل مستند Firestore خاص بكل ملف
  // (مستقل عن مستند حالة النظام الرئيسي)، بدل رفعها لـ Cloud Storage —
  // لأن Storage يتطلب ترقية الحساب لخطة Blaze، بينما Firestore يعمل مجاناً.
  saveEmployeeFileData: async (employeeId, fileKey, payload) => {
    if(!auth.currentUser) throw new Error('AUTH_REQUIRED');
    const ref = doc(firestore, 'hr_system', 'main', 'employee_files', employeeId+'__'+fileKey);
    await setDoc(ref, { ...payload, updatedAt: new Date().toISOString() });
    return { name: payload.name, type: payload.type || '', size: payload.size || 0, key: fileKey, uploadedAt: new Date().toISOString() };
  },
  getEmployeeFileData: async (employeeId, fileKey) => {
    const ref = doc(firestore, 'hr_system', 'main', 'employee_files', employeeId+'__'+fileKey);
    const snap = await getDoc(ref);
    return snap.exists() ? snap.data() : null;
  },
  deleteEmployeeFileData: async (employeeId, fileKey) => {
    const ref = doc(firestore, 'hr_system', 'main', 'employee_files', employeeId+'__'+fileKey);
    await deleteDoc(ref);
  },
  // الدوال التالية (Storage) لا تزال موجودة للتوافق مع أي ملفات قديمة رُفعت
  // بالطريقة السابقة قبل هذا التعديل فقط.
  uploadEmployeeFile: async (employeeId, fileKey, file) => {
    if(!auth.currentUser) throw new Error('AUTH_REQUIRED');
    const safeName = String(file.name || 'file').replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120);
    const path = `employee-files/${auth.currentUser.uid}/${employeeId}/${fileKey}/${Date.now()}_${safeName}`;
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file, {contentType:file.type || 'application/octet-stream', customMetadata:{employeeId, fileKey}});
    const url = await getDownloadURL(storageRef);
    return {path, url, name:file.name, type:file.type || '', size:file.size || 0, uploadedAt:new Date().toISOString()};
  },
  deleteEmployeeFile: async (path) => {
    if(!path) return;
    await deleteObject(ref(storage, path));
  },
  hydrateState: async (fallbackState) => {
    const S = window.HRSplit;
    if(isSingle()){
      const snap = await getDoc(stateRef);
      if (snap.exists()) return snap.data();
      await setDoc(stateRef, { ...fallbackState, updatedAt: new Date().toISOString() });
      return fallbackState;
    }
    const snap = await getDoc(stateRef);
    if(!snap.exists()){
      const { general, finance } = S.split(fallbackState);
      await setDoc(stateRef, stamp(general)); sig.general = stable(general);
      if(canFin()){ await setDoc(financeRef, stamp(finance)); sig.finance = stable(finance); return fallbackState; }
      return S.merge(general, null);
    }
    const data = snap.data();
    if(S.isLegacy(data)){
      // وثيقة بالنسق القديم (كل البيانات داخل main): الترحيل يقوم به مدير/صاحب صلاحية مالية فقط
      if(!canFin()) throw new Error('MIGRATION_REQUIRED');
      const legacy = stripStamp(data);
      const { general, finance } = S.split(legacy);
      try{ await setDoc(backupRef, { ...data, backupAt: new Date().toISOString(), note: 'نسخة احتياطية قبل تقسيم البيانات إلى عام/مالي' }); }
      catch(err){ console.warn('تعذر حفظ النسخة الاحتياطية (قد يكون الحجم كبيراً):', err); }
      await setDoc(financeRef, stamp(finance));   // المالية أولاً حتى لا تضيع أي بيانات
      await setDoc(stateRef, stamp(general));
      sig.general = stable(general); sig.finance = stable(finance);
      return S.merge(general, finance);
    }
    const general = stripStamp(data);
    sig.general = stable(general);
    if(!canFin()) return S.merge(general, null);
    const fsnap = await getDoc(financeRef);
    const finance = fsnap.exists() ? stripStamp(fsnap.data()) : emptyFinance();
    sig.finance = stable(finance);
    return S.merge(general, finance);
  },
  saveState: async (state) => {
    const S = window.HRSplit;
    if(isSingle()) return setDoc(stateRef, { ...state, updatedAt: new Date().toISOString() });
    const { general, finance } = S.split(state);
    const gs = stable(general);
    if(gs !== sig.general){ await setDoc(stateRef, stamp(general)); sig.general = gs; }
    // من لا يملك صلاحية المالية لا يكتب وثيقة المالية أبداً (وبياناته أصلاً لا تحتوي الحقول المالية)
    if(canFin()){
      const fs = stable(finance);
      if(fs !== sig.finance){ await setDoc(financeRef, stamp(finance)); sig.finance = fs; }
    }
  },
  startRealtimeSync: (callback) => {
    const S = window.HRSplit;
    if(isSingle()) return onSnapshot(stateRef, snap => callback(snap.exists() ? snap.data() : null), err => console.error('Firestore realtime sync failed:', err));
    const needFin = canFin();
    const cache = { general: null, finance: null, gReady: false, fReady: !needFin };
    const emit = () => {
      if(!cache.gReady || !cache.fReady || !cache.general) return;
      callback(S.merge(cache.general, needFin ? (cache.finance || emptyFinance()) : null));
    };
    const u1 = onSnapshot(stateRef, snap => {
      cache.gReady = true;
      const d = snap.exists() ? snap.data() : null;
      if(d && S.isLegacy(d)){ cache.general = null; return; }   // بانتظار الترحيل؛ لا نطبّق نسقاً قديماً
      cache.general = d ? stripStamp(d) : null;
      if(cache.general) sig.general = stable(cache.general);
      emit();
    }, err => console.error('Firestore realtime sync failed:', err));
    let u2 = () => {};
    if(needFin){
      u2 = onSnapshot(financeRef, snap => {
        cache.fReady = true;
        cache.finance = snap.exists() ? stripStamp(snap.data()) : null;
        sig.finance = stable(cache.finance || emptyFinance());
        emit();
      }, err => console.error('Firestore finance sync failed:', err));
    }
    return () => { u1(); u2(); };
  }
};

function ensureLoginUI(){
  if(document.getElementById('firebaseLogin')) return;
  const box=document.createElement('div');
  box.id='firebaseLogin';
  box.innerHTML=`
    <div class="firebase-login-card">
      <div class="firebase-login-mark">HR</div>
      <div class="firebase-login-kicker">HR MANAGEMENT SYSTEM</div>
      <h2>تسجيل الدخول</h2>
      <p>أدخل بيانات حساب Firebase للوصول إلى النظام.</p>
      <form id="firebaseLoginForm" autocomplete="on">
        <label>البريد الإلكتروني<input id="firebaseEmail" type="email" autocomplete="username" required placeholder="البريد الإلكتروني"></label>
        <label>كلمة المرور<input id="firebasePassword" type="password" autocomplete="current-password" required placeholder="كلمة المرور"></label>
        <button class="btn btn-primary firebase-login-btn" type="submit">دخول</button>
        <div id="firebaseLoginError" class="firebase-login-error" role="alert"></div>
      </form>
    </div>`;
  document.body.appendChild(box);
  const form=document.getElementById('firebaseLoginForm');
  form.addEventListener('submit', async e=>{
    e.preventDefault();
    const email=document.getElementById('firebaseEmail').value.trim();
    const password=document.getElementById('firebasePassword').value;
    const err=document.getElementById('firebaseLoginError');
    const btn=form.querySelector('button[type=submit]');
    err.textContent=''; btn.disabled=true; btn.textContent='جارٍ الدخول...';
    try{ await signInWithEmailAndPassword(auth,email,password); }
    catch(ex){
      const map={
        'auth/invalid-credential':'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
        'auth/invalid-email':'صيغة البريد الإلكتروني غير صحيحة.',
        'auth/user-disabled':'هذا الحساب معطّل.',
        'auth/too-many-requests':'تمت محاولات كثيرة. حاول مرة أخرى لاحقاً.',
        'auth/network-request-failed':'تعذر الاتصال بالإنترنت.'
      };
      err.textContent=map[ex?.code]||'تعذر تسجيل الدخول. تحقق من إعدادات Firebase.';
    } finally { btn.disabled=false; btn.textContent='دخول'; }
  });
}

function showLogin(){
  ensureLoginUI();
  document.body.classList.add('firebase-locked');
  document.getElementById('firebaseLogin').classList.add('show');
}
function installUserBar(user){
  const side=document.querySelector('.side-bottom')||document.querySelector('.sidebar-foot');
  if(!side || document.getElementById('firebaseUserBar')) return;
  const wrap=document.createElement('div');
  wrap.id='firebaseUserBar'; wrap.className='firebase-user-bar';
  wrap.innerHTML='<span id="firebaseUserEmail"></span><button type="button" id="firebaseLogoutBtn" class="btn btn-sm">خروج</button>';
  side.parentNode.insertBefore(wrap,side);
  document.getElementById('firebaseLogoutBtn').onclick=window.firebaseSignOut;
}
function showApp(user){
  ensureLoginUI();
  document.body.classList.remove('firebase-locked');
  document.getElementById('firebaseLogin').classList.remove('show');
  installUserBar(user);
  const badge=document.getElementById('firebaseUserEmail');
  if(badge) badge.textContent=user?.email||'';
}
window.firebaseSignOut=async()=>{ await signOut(auth); location.reload(); };

// تحميل صلاحيات المستخدم من hr_users/{uid}.
// أول مستخدم يسجل دخوله بعد تفعيل النظام يصبح مديراً تلقائياً (مرة واحدة فقط عبر hr_meta/access).
async function loadProfile(user){
  const meRef = doc(firestore,'hr_users',user.uid);
  const markerRef = doc(firestore,'hr_meta','access');
  try{
    const snap = await getDoc(meRef);
    if(snap.exists()) return { ...snap.data() };
    const marker = await getDoc(markerRef);
    if(!marker.exists()){
      const now = new Date().toISOString();
      const profile = { email:user.email||'', name:'', role:'admin', views:[], disabled:false, createdAt:now };
      const batch = writeBatch(firestore);
      batch.set(meRef, profile);
      batch.set(markerRef, { firstAdminUid:user.uid, createdAt:now });
      await batch.commit();
      return profile;
    }
    return { role:'none' };
  }catch(err){
    console.warn('تعذر قراءة صلاحيات المستخدم (هل نُشرت firestore.rules الجديدة؟):', err);
    if(err && err.code==='permission-denied') return { role:'user', legacy:true, views:[] };
    throw err;
  }
}

window.firebaseUserReady = new Promise(resolve=>{
  let resolved=false;
  onAuthStateChanged(auth, async user=>{
    if(!user){ showLogin(); return; }
    let profile;
    try{ profile = await loadProfile(user); }
    catch(err){ profile = { role:'none', error:true }; }
    if(profile.role==='none' || profile.disabled){
      const why = profile.disabled ? 'هذا الحساب موقوف. تواصل مع مدير النظام.'
        : (profile.error ? 'تعذر التحقق من صلاحيات الحساب. حاول مرة أخرى.' : 'هذا الحساب غير مصرح له بدخول النظام. تواصل مع مدير النظام.');
      await signOut(auth).catch(()=>{});
      showLogin();
      const errEl=document.getElementById('firebaseLoginError'); if(errEl) errEl.textContent=why;
      return;
    }
    showApp(user);
    document.getElementById('hrLegacyBanner')?.remove();
    if(profile.legacy){
      const bar=document.createElement('div'); bar.id='hrLegacyBanner';
      bar.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;background:#b42318;color:#fff;padding:10px 16px;text-align:center;font-weight:700;font-size:14px';
      bar.textContent='قواعد Firestore الجديدة غير منشورة، لذلك الصلاحيات وقسم "إدارة النظام" غير مفعّلين. نفّذ: firebase deploy --only firestore:rules ثم حدّث الصفحة.';
      document.body.appendChild(bar);
    }
    window.HRAuth?.setSession(profile,user);
    if(!resolved){resolved=true;resolve(user);}
  });
});

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',ensureLoginUI,{once:true});
else ensureLoginUI();
