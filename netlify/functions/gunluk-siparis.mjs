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
  const productOf = (s) => db.products.find((p) => p.id === s.productId) || db.products[0];
  const qtyOf = (s) => {
    const o = db.orders[date];
    if (o && o[s.id] !== undefined) return o[s.id];
    return s.qty;
  };

  const byProduct = {};
  db.schools.forEach((s) => {
    const p = productOf(s);
    const q = qtyOf(s);
    if (!byProduct[p.id]) byProduct[p.id] = { name: p.name, qty: 0, money: 0 };
    byProduct[p.id].qty += q;
    byProduct[p.id].money += q * p.price;
  });

  const schoolLines = db.schools.map((s) => `${s.name}: ${qtyOf(s)} adet (${productOf(s).name})`).join("\n");
  const productLines = Object.values(byProduct).map((p) => `${p.name}: ${p.qty} adet — ${tl(p.money)}`).join("\n");

  return `Okul Ekmek Siparişi — ${fmtDate(date)}\n\n${schoolLines}\n\nÜrün bazında toplam:\n${productLines}`;
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
