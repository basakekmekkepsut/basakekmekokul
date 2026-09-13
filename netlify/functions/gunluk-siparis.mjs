// Her akşam 18:00 (Türkiye) yarının sipariş listesini Telegram'a gönderir.
// Zamanlama netlify.toml içinde tanımlı.

const FIREBASE_API_KEY = "AIzaSyAcS_cUdnfoHMUiymZ80psB5wdLyhS5vNs";
const PROJECT_ID = "basakekmekokul";

async function getState() {
  // anonim giriş yap (Firestore kuralları auth ister)
  const authRes = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) }
  );
  const auth = await authRes.json();
  if (!auth.idToken) throw new Error("Firebase auth başarısız: " + JSON.stringify(auth));

  const docRes = await fetch(
    `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/state/main`,
    { headers: { Authorization: `Bearer ${auth.idToken}` } }
  );
  const doc = await docRes.json();
  const json = doc?.fields?.json?.stringValue;
  if (!json) throw new Error("Firestore'da veri bulunamadı");
  return JSON.parse(json);
}

function tomorrowStr() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function fmtDate(s) {
  return new Date(s + "T00:00:00").toLocaleDateString("tr-TR", {
    day: "2-digit", month: "long", weekday: "long", timeZone: "Europe/Istanbul",
  });
}

function tl(n) {
  return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ₺";
}

function buildMessage(db) {
  const date = tomorrowStr();
  const dow = new Date(date + "T00:00:00").getDay();
  const productOf = (ln) => db.products.find((p) => p.id === ln.productId) || db.products[0];
  const qtyOf = (ln) => {
    const o = db.orders[date];
    if (o && o[ln.id] !== undefined) return o[ln.id];
    if (ln.active === false) return 0;
    const days = Array.isArray(ln.days) ? ln.days
      : (Array.isArray(db.deliveryDays) ? db.deliveryDays : [1, 2, 3, 4, 5]);
    return days.includes(dow) ? ln.qty : 0;
  };

  const byProduct = {};
  const schoolLines = [];
  db.schools.forEach((s) => {
    (s.lines || []).forEach((ln) => {
      const q = qtyOf(ln);
      if (!q) return;
      const p = productOf(ln);
      schoolLines.push(`${s.name}: ${q} adet (${p.name})`);
      if (!byProduct[p.id]) byProduct[p.id] = { name: p.name, qty: 0, money: 0 };
      byProduct[p.id].qty += q;
      byProduct[p.id].money += q * p.price;
    });
  });

  if (!schoolLines.length) return `Ekmek Siparişi — ${fmtDate(date)}\n\nYarın için sipariş yok.`;

  const productLines = Object.values(byProduct).map((p) => `${p.name}: ${p.qty} adet`).join("\n");
  return `Ekmek Siparişi — ${fmtDate(date)}\n\n${schoolLines.join("\n")}\n\nÜrün bazında toplam:\n${productLines}`;
}

export default async () => {
  try {
    const db = await getState();
    const tg = db.telegram;
    if (!tg || !tg.token || !tg.chatId) {
      return new Response("Telegram ayarları eksik, gönderilmedi.", { status: 200 });
    }

    const text = buildMessage(db);
    const res = await fetch(`https://api.telegram.org/bot${tg.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: tg.chatId, text }),
    });
    const data = await res.json();

    if (!data.ok) return new Response("Telegram hatası: " + (data.description || ""), { status: 500 });
    return new Response("Gönderildi.", { status: 200 });
  } catch (e) {
    return new Response("Hata: " + e.message, { status: 500 });
  }
};

export const config = {
  // 15:00 UTC = 18:00 Türkiye saati
  schedule: "0 15 * * *",
};
