// نظام الصلاحيات: يحدد أي التبويبات يستطيع المستخدم فتحها.
// الملف يُحمَّل قبل app.js، ويتم ضبط profile بعد تسجيل الدخول من firebase-init.js.
(function(){
  'use strict';
  const REPORTS = ['payroll','employees','projects','coverage'];
  // شاشات ليس لها رابط في القائمة الجانبية وتتبع صلاحية شاشة أخرى
  // شاشات تعتمد كلياً على بيانات مالية: لا تُفتح إلا لمن لديه صلاحية المالية
  const FIN_ONLY = ['projectaccounts','reports:payroll'];
  const ALIASES = { employees:['add','all-employees'], allprojects:['projects'], 'commencement-list':['commencements'] };

  const HRAuth = {
    profile: null,   // {role:'admin'|'user', views:[...], disabled, legacy}
    user: null,

    isAdmin(){ return !!this.profile && this.profile.role === 'admin'; },
    canFinance(){ const p = this.profile; return !!p && (p.role === 'admin' || p.finance === true || p.legacy === true); },

    // مفتاح الصلاحية لعنصر في القائمة (التقارير لكل نوع مفتاح مستقل)
    keyOf(el){
      const v = el.dataset.view;
      return v === 'reports' ? 'reports:' + (el.dataset.report || 'payroll') : v;
    },
    hasKey(key){
      if(this.isAdmin()) return true;
      if(!this.profile) return false;
      if(key === 'users') return false;
      if(FIN_ONLY.includes(key) && !this.canFinance()) return false;
      if(this.profile.legacy) return true; // قواعد Firestore لم تُنشر بعد: وصول كامل مؤقتاً
      return (this.profile.views || []).includes(key);
    },
    canView(view){
      if(view === 'users') return this.isAdmin();
      if(this.isAdmin()) return true;
      if(view === 'reports') return REPORTS.some(r => this.hasKey('reports:' + r));
      return (ALIASES[view] || [view]).some(k => this.hasKey(k));
    },
    canReport(r){ return this.hasKey('reports:' + r); },
    firstReport(){ return REPORTS.find(r => this.canReport(r)) || null; },
    firstAllowed(){
      for(const a of document.querySelectorAll('.navlink[data-view]')){
        if(a.dataset.view === 'users') continue;
        if(this.hasKey(this.keyOf(a))) return { view: a.dataset.view, report: a.dataset.report || null };
      }
      return null;
    },

    setSession(profile, user){
      this.profile = profile;
      this.user = user;
      this.apply();
    },

    // إخفاء الروابط/الأزرار غير المسموحة + نقل المستخدم لأول شاشة مسموحة لو كان على شاشة ممنوعة
    apply(){
      if(!this.profile) return;
      const self = this;
      document.querySelectorAll('[data-view]').forEach(el => {
        if(el.classList.contains('nav-group-toggle')) return;
        const v = el.dataset.view;
        const ok = v === 'reports' ? self.hasKey(self.keyOf(el)) : self.canView(v);
        el.style.display = ok ? '' : 'none';
      });
      document.querySelectorAll('[data-quick-view]').forEach(el => {
        el.style.display = self.canView(el.dataset.quickView) ? '' : 'none';
      });
      document.querySelectorAll('.nav-group').forEach(g => {
        const any = [...g.querySelectorAll('.nav-child')].some(a => a.style.display !== 'none');
        g.style.display = any ? '' : 'none';
      });
      document.querySelectorAll('[data-admin-only]').forEach(el => {
        if(!self.isAdmin()) el.style.display = 'none';
      });

      const note = document.getElementById('noAccessNote');
      const first = this.firstAllowed();
      if(!first && !this.isAdmin()){
        document.querySelectorAll('main > section[id^="view-"]').forEach(s => s.style.display = 'none');
        if(!note){
          const d = document.createElement('div');
          d.id = 'noAccessNote'; d.className = 'card section-card';
          d.style.cssText = 'padding:28px;text-align:center;margin:24px';
          d.textContent = 'لا توجد شاشات مفعّلة لحسابك. تواصل مع مدير النظام لمنحك الصلاحيات.';
          document.querySelector('main')?.appendChild(d);
        }
        return;
      }
      if(note) note.remove();

      const visible = [...document.querySelectorAll('main > section[id^="view-"]')]
        .find(s => getComputedStyle(s).display !== 'none');
      const cur = visible ? visible.id.replace('view-', '') : 'dashboard';
      if(!this.canView(cur) && first && typeof window.switchView === 'function'){
        if(first.report) window.currentReport = first.report;
        try{ window.switchView(first.view); }catch(e){ console.error(e); }
      }
    }
  };
  window.HRAuth = HRAuth;
})();
