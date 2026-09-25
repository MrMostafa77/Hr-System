// Firebase Authentication + Firestore bootstrap.
// No npm/build step is required; this project is static and GitHub/Firebase Hosting ready.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, deleteDoc, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: 'AIzaSyCnUTSCdtYjQg-OIH8D9GwdKjcow_LTK-k',
  authDomain: 'mostafa-s-myth-hr.firebaseapp.com',
  projectId: 'mostafa-s-myth-hr',
  storageBucket: 'mostafa-s-myth-hr.firebasestorage.app',
  messagingSenderId: '518432597475',
  appId: '1:518432597475:web:890fe91da72c7ea1aeecd6'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const firestore = getFirestore(app);
const storage = getStorage(app);
const stateRef = doc(firestore, 'hr_system', 'main');

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
    const snap = await getDoc(stateRef);
    if (snap.exists()) return snap.data();
    await setDoc(stateRef, { ...fallbackState, updatedAt: new Date().toISOString() });
    return fallbackState;
  },
  saveState: async (state) => setDoc(stateRef, { ...state, updatedAt: new Date().toISOString() }),
  startRealtimeSync: (callback) => onSnapshot(stateRef, snap => callback(snap.exists() ? snap.data() : null), err => console.error('Firestore realtime sync failed:', err))
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
  const side=document.querySelector('.side-bottom');
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

window.firebaseUserReady = new Promise(resolve=>{
  let resolved=false;
  onAuthStateChanged(auth,user=>{
    if(user){ showApp(user); if(!resolved){resolved=true;resolve(user);} }
    else showLogin();
  });
});

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',ensureLoginUI,{once:true});
else ensureLoginUI();
