// إعدادات Firebase الخاصة بكل عميل/نسخة. عند تسليم النظام لشركة جديدة، غيّر هذا الملف فقط
// (من Firebase Console > Project settings > Your apps > Web app).
// ملاحظة: هذه القيم عامة بطبيعتها ولا تُعتبر أسراراً؛ الحماية الحقيقية في firestore.rules.
export const firebaseConfig = {
  apiKey: 'AIzaSyCnUTSCdtYjQg-OIH8D9GwdKjcow_LTK-k',
  authDomain: 'mostafa-s-myth-hr.firebaseapp.com',
  projectId: 'mostafa-s-myth-hr',
  storageBucket: 'mostafa-s-myth-hr.firebasestorage.app',
  messagingSenderId: '518432597475',
  appId: '1:518432597475:web:890fe91da72c7ea1aeecd6'
};

// اختياري: مفتاح reCAPTCHA v3 لتفعيل Firebase App Check (يمنع الطلبات القادمة من خارج تطبيقك).
// اتركه فارغاً لتعطيله. الخطوات في DEPLOY_NEW_CLIENT_AR.md.
export const APP_CHECK_SITE_KEY = '';
