const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DB = path.join(__dirname, 'visits.json');

app.set('trust proxy', 1); // عدّلها حسب إعدادات الاستضافة
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function readVisits(){ try{return JSON.parse(fs.readFileSync(DB,'utf8'));}catch{return [];} }
function saveVisits(rows){ fs.writeFileSync(DB, JSON.stringify(rows,null,2)); }

app.post('/api/visit', async (req,res)=>{
  try {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
    let geo = {};
    // خدمة تحديد المدينة من IP؛ النتيجة تقريبية وقد تكون غير متاحة لبعض الشبكات.
    if (ip && ip !== '::1' && ip !== '127.0.0.1') {
      const r = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
      if (r.ok) geo = await r.json();
    }
    const ua = req.get('user-agent') || '';
    const device = /Android|iPhone|iPad|Mobile/i.test(ua) ? 'هاتف' : 'كمبيوتر/جهاز آخر';
    const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'غير معروف';
    const rows = readVisits();
    rows.push({
      time: new Date().toISOString(),
      city: geo.city || 'غير متاحة',
      region: geo.region || '',
      country: geo.country_name || 'غير معروف',
      device, browser
    });
    saveVisits(rows);
    res.json({ok:true});
  } catch(e) { res.status(200).json({ok:false}); }
});

function auth(req,res,next){
  if (!ADMIN_PASSWORD) return res.status(503).send('عيّن ADMIN_PASSWORD بمتغيرات البيئة أولاً.');
  const header = req.headers.authorization || '';
  const encoded = header.startsWith('Basic ') ? header.slice(6) : '';
  let pass = '';
  try { pass = Buffer.from(encoded,'base64').toString().split(':').slice(1).join(':'); } catch {}
  if (pass !== ADMIN_PASSWORD) { res.set('WWW-Authenticate','Basic realm="Gojo stats"'); return res.status(401).send('Unauthorized'); }
  next();
}
app.get('/dashboard', auth, (req,res)=>{
  const rows = readVisits().slice().reverse();
  const cities = new Set(rows.map(x=>x.city).filter(x=>x!=='غير متاحة'));
  const countries = new Set(rows.map(x=>x.country).filter(x=>x!=='غير معروف'));
  const esc = s => String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  res.send(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>إحصائيات غوجو</title>
  <style>body{background:#090611;color:#eee;font-family:Tahoma,Arial;padding:24px}h1{color:#d9b5ff}.cards{display:flex;gap:12px;flex-wrap:wrap}.card{background:#1b1427;border:1px solid #7042a8;padding:18px;border-radius:14px;min-width:130px}table{width:100%;border-collapse:collapse;margin-top:22px}td,th{padding:12px;border-bottom:1px solid #443653;text-align:right}small{color:#c5b4d8}</style>
  <h1>إحصائيات زيارات غوجو</h1><div class="cards"><div class="card">الزيارات<br><b>${rows.length}</b></div><div class="card">المدن التقريبية<br><b>${cities.size}</b></div><div class="card">الدول<br><b>${countries.size}</b></div></div>
  <p><small>الموقع تقريبي من IP، وقد يكون غير دقيق. لا يتم عرض أو تخزين IP الخام.</small></p>
  <table><tr><th>الوقت</th><th>المدينة</th><th>الدولة</th><th>الجهاز</th><th>المتصفح</th></tr>
  ${rows.map(x=>`<tr><td>${esc(new Date(x.time).toLocaleString('ar-IQ'))}</td><td>${esc(x.city)} ${esc(x.region)}</td><td>${esc(x.country)}</td><td>${esc(x.device)}</td><td>${esc(x.browser)}</td></tr>`).join('')}
  </table></html>`);
});
app.listen(PORT,()=>console.log(`Gojo app running on ${PORT}`));
