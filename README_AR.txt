HR Management System — GitHub + Firebase

البنية:
- index.html: الواجهة الرئيسية.
- css/style.css: جميع التنسيقات.
- js/app.js: منطق النظام.
- js/data.js: البيانات الابتدائية المحلية.
- js/firebase-init.js: تسجيل الدخول وFirestore والمزامنة اللحظية.
- data/hr_system.json: نسخة بيانات البداية.
- firestore.rules: السماح للمستخدمين المسجلين فقط بالقراءة والكتابة.
- firebase.json: إعداد Firebase Hosting.

التشغيل على GitHub Pages:
1. ارفع محتويات المشروع إلى Repository.
2. فعّل GitHub Pages من الفرع والمجلد المطلوبين.
3. في Firebase Authentication > Settings > Authorized domains أضف نطاق GitHub Pages.
4. فعّل Authentication بطريقة Email/Password وأنشئ المستخدمين.
5. أنشئ Firestore Database.
6. انشر قواعد firestore.rules أو ضعها يدويًا في Firestore Rules.

التشغيل على Firebase Hosting:
- firebase login
- firebase init hosting firestore
- firebase deploy

مهم:
- بيانات التطبيق المشتركة أصبحت في Firestore داخل hr_system/main.
- أي تعديل محفوظ في النظام يتم إرساله إلى Firestore، وأي مستخدم آخر مسجل الدخول يستقبل التعديل لحظيًا عبر onSnapshot.
- localStorage يعمل كذاكرة مؤقتة/نسخة انتقالية للحفاظ على البيانات القديمة عند أول تشغيل.
