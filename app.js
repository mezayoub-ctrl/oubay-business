const DB_NAME = "oubay-business-db";
const STORE = "records";
let db;
let records = [];
let deferredPrompt = null;

const $ = (id) => document.getElementById(id);
const typeNames = { supplier: "مصنع / مورد / تاجر جملة", shop: "تاجر تجزئة / محل", driver: "سائق / موزع" };

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const database = req.result;
      if (!database.objectStoreNames.contains(STORE)) {
        const store = database.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("type", "type", { unique: false });
        store.createIndex("name", "name", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function getAll() {
  return requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
}
async function saveRecord(record) {
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).put(record);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
async function addRecord(record) {
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).add(record);
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
async function deleteRecord(id) {
  const tx = db.transaction(STORE, "readwrite");
  tx.objectStore(STORE).delete(Number(id));
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
  });
}
async function refresh() {
  records = await getAll();
  renderStats();
  renderRecords();
}
function renderStats() {
  $("count-suppliers").textContent = records.filter(r => r.type === "supplier").length;
  $("count-shops").textContent = records.filter(r => r.type === "shop").length;
  $("count-drivers").textContent = records.filter(r => r.type === "driver").length;
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
}
function renderRecords() {
  const query = $("searchInput").value.trim().toLowerCase();
  const type = $("filterType").value;
  const filtered = records.filter(r => {
    const matchesType = type === "all" || r.type === type;
    const haystack = [r.name, r.category, r.phone, r.location, r.address, r.notes, typeNames[r.type]].join(" ").toLowerCase();
    return matchesType && haystack.includes(query);
  }).sort((a,b) => b.createdAt - a.createdAt);
  const list = $("recordsList");
  if (!filtered.length) {
    list.innerHTML = `<div class="empty">${records.length ? "لا توجد نتائج مطابقة للبحث." : "لا توجد سجلات بعد. أضف أول سجل من النموذج أعلاه."}</div>`;
    return;
  }
  list.innerHTML = filtered.map(r => `
    <article class="record">
      <div class="record-top">
        <div><h3>${escapeHTML(r.name)}</h3><div class="record-meta"><span>${escapeHTML(typeNames[r.type] || "")}</span><span>•</span><span>${escapeHTML(r.category || "دون تخصص")}</span></div></div>
        <span class="tag">${escapeHTML(r.location || "دون منطقة")}</span>
      </div>
      <div class="record-meta">${r.phone ? `<span>☎ ${escapeHTML(r.phone)}</span>` : ""}${r.address ? `<span>⌖ ${escapeHTML(r.address)}</span>` : ""}${r.credit ? `<span class="tag gold">يتعامل بالدين</span>` : ""}</div>
      ${r.notes ? `<div class="record-notes">${escapeHTML(r.notes)}</div>` : ""}
      <div class="record-actions">
        ${r.phone ? `<a class="secondary-btn" style="text-decoration:none;padding:6px 10px" href="tel:${encodeURIComponent(r.phone)}">اتصال</a>` : ""}
        <button class="small-btn" data-edit="${r.id}" type="button">تعديل</button>
        <button class="small-btn delete" data-delete="${r.id}" type="button">حذف</button>
      </div>
    </article>`).join("");
}
function resetForm() {
  $("recordForm").reset();
  $("formMessage").textContent = "";
  $("recordForm").dataset.editId = "";
  $("recordForm").querySelector(".primary-btn").textContent = "＋ حفظ السجل";
}
$("recordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const editId = $("recordForm").dataset.editId;
  const previous = editId ? records.find(r => r.id === Number(editId)) : null;
  const record = {
    ...(previous || {}),
    type: $("recordType").value,
    name: $("name").value.trim(),
    category: $("category").value,
    phone: $("phone").value.trim(),
    location: $("location").value.trim(),
    address: $("address").value.trim(),
    notes: $("notes").value.trim(),
    credit: $("credit").checked,
    createdAt: previous?.createdAt || Date.now(),
    updatedAt: Date.now()
  };
  if (!record.name) return;
  try {
    if (editId) await saveRecord(record); else await addRecord(record);
    resetForm();
    $("formMessage").textContent = editId ? "تم تحديث السجل." : "تم حفظ السجل على هذا الجهاز.";
    await refresh();
  } catch (error) {
    $("formMessage").textContent = "تعذر حفظ السجل. حاول مرة أخرى.";
  }
});
$("recordsList").addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");
  if (editButton) {
    const r = records.find(item => item.id === Number(editButton.dataset.edit));
    if (!r) return;
    $("recordType").value = r.type; $("name").value = r.name; $("category").value = r.category || "أخرى";
    $("phone").value = r.phone || ""; $("location").value = r.location || ""; $("address").value = r.address || "";
    $("notes").value = r.notes || ""; $("credit").checked = Boolean(r.credit);
    $("recordForm").dataset.editId = String(r.id);
    $("recordForm").querySelector(".primary-btn").textContent = "حفظ التعديلات";
    $("recordForm").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  if (deleteButton) {
    const r = records.find(item => item.id === Number(deleteButton.dataset.delete));
    if (r && confirm(`هل تريد حذف السجل «${r.name}»؟`)) {
      await deleteRecord(r.id); await refresh();
    }
  }
});
$("searchInput").addEventListener("input", renderRecords);
$("filterType").addEventListener("change", renderRecords);

$("exportBtn").addEventListener("click", async () => {
  try {
    const payload = { app: "OUBAY BUSINESS", version: 1, exportedAt: new Date().toISOString(), records: await getAll() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `oubay-business-backup-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    $("backupMessage").textContent = "تم تجهيز ملف النسخة الاحتياطية.";
  } catch { $("backupMessage").textContent = "تعذر إنشاء النسخة الاحتياطية."; }
});
$("importFile").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || !Array.isArray(parsed.records)) throw new Error("invalid");
    if (!confirm(`سيتم استبدال السجلات الحالية بعدد ${parsed.records.length} سجلًا. هل تريد المتابعة؟`)) {
      event.target.value = ""; return;
    }
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.clear();
    parsed.records.forEach(r => {
      if (r && typeof r.name === "string" && ["supplier","shop","driver"].includes(r.type)) {
        const copy = { ...r };
        delete copy.id;
        store.add(copy);
      }
    });
    await new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); });
    await refresh();
    $("backupMessage").textContent = "تم استرجاع النسخة الاحتياطية بنجاح.";
  } catch {
    $("backupMessage").textContent = "لم يتم الاسترجاع: الملف غير صالح أو حدث خطأ.";
  } finally { event.target.value = ""; }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault(); deferredPrompt = event; $("installBtn").classList.remove("hidden");
});
$("installBtn").addEventListener("click", async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; $("installBtn").classList.add("hidden");
});
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
(async () => {
  try { db = await openDB(); await refresh(); }
  catch { $("formMessage").textContent = "المتصفح لا يدعم التخزين المحلي المطلوب أو أن الصفحة فُتحت بطريقة غير مناسبة. افتحها من استضافة HTTPS."; }
})();
