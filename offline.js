// =============================================
// js/offline.js — Cola offline (IndexedDB) y banner de conexión
// =============================================
// Lógica migrada tal cual del app.js monolítico original (líneas ~33-145),
// sin cambios de comportamiento. Cuando no hay internet, los registros de
// "Cargas" se guardan localmente y se sincronizan solos al volver la señal.

const IDB_NAME    = "FuelControlOffline";
const IDB_VERSION = 1;
const IDB_STORE   = "pendingRecords";

function abrirIDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE, { keyPath: "localId", autoIncrement: true });
      }
    };
    req.onsuccess = e => res(e.target.result);
    req.onerror   = e => rej(e.target.error);
  });
}

export async function guardarEnCola(record) {
  const db    = await abrirIDB();
  const tx    = db.transaction(IDB_STORE, "readwrite");
  const store = tx.objectStore(IDB_STORE);
  // creadoEn como ISO string porque Timestamp de Firebase no se serializa en IDB
  const recordIDB = { ...record, creadoEn: new Date().toISOString(), _offline: true };
  return new Promise((res, rej) => {
    const req = store.add(recordIDB);
    req.onsuccess = () => res(req.result);
    req.onerror   = e => rej(e.target.error);
  });
}

export async function leerCola() {
  const db    = await abrirIDB();
  const tx    = db.transaction(IDB_STORE, "readonly");
  const store = tx.objectStore(IDB_STORE);
  return new Promise((res, rej) => {
    const req = store.getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = e => rej(e.target.error);
  });
}

export async function eliminarDeCola(localId) {
  const db    = await abrirIDB();
  const tx    = db.transaction(IDB_STORE, "readwrite");
  const store = tx.objectStore(IDB_STORE);
  return new Promise((res, rej) => {
    const req = store.delete(localId);
    req.onsuccess = () => res();
    req.onerror   = e => rej(e.target.error);
  });
}

// Intenta subir todos los registros pendientes en IDB a Firestore
export async function sincronizarCola() {
  if (!navigator.onLine || !window.firebaseDB) return;
  let pendientes;
  try { pendientes = await leerCola(); } catch (e) { return; }
  if (!pendientes.length) return;

  actualizarBannerConexion(); // refresca el contador en el banner
  for (const item of pendientes) {
    try {
      const { localId, _offline, creadoEn, ...record } = item;
      // Restaurar Timestamp de Firebase
      record.creadoEn = window.fbTimestamp
        ? window.fbTimestamp.fromDate(new Date(creadoEn))
        : new Date(creadoEn);

      const docRef = window.fbDoc(window.fbCollection(window.firebaseDB, "registros"));
      await window.fbSetDoc(docRef, record);
      await eliminarDeCola(localId);
      console.log(`✅ Sincronizado registro offline: ${record.eco} — ${record.fecha}`);
    } catch (e) {
      console.warn("No se pudo sincronizar registro offline:", e.message);
    }
  }
  actualizarBannerConexion();

  // Refrescamos historial si está visible. Import dinámico para evitar
  // un ciclo de imports offline.js <-> historial.js (historial.js no
  // necesita nada de offline.js, pero sí al revés en este único punto).
  if (document.getElementById("content-historial")?.classList.contains("active")) {
    const { loadHistory } = await import("./historial.js");
    loadHistory();
  }
}

/* --- BANNER DE ESTADO DE CONEXIÓN --- */
export function actualizarBannerConexion() {
  let banner = document.getElementById("banner-conexion");
  if (!banner) return;

  leerCola().then(pendientes => {
    const n = pendientes.length;
    if (!navigator.onLine) {
      banner.style.display = "flex";
      banner.style.background = "var(--red, #e8320a)";
      banner.textContent = "📵 Sin conexión — los registros se guardarán localmente";
    } else if (n > 0) {
      banner.style.display = "flex";
      banner.style.background = "var(--orange, #e8620a)";
      banner.textContent = `🔄 Sincronizando ${n} registro${n > 1 ? "s" : ""} offline...`;
    } else {
      banner.style.display = "none";
    }
  }).catch(() => {
    banner.style.display = "none";
  });
}

// Escucha cambios de conectividad
window.addEventListener("online",  () => { actualizarBannerConexion(); sincronizarCola(); });
window.addEventListener("offline", () => actualizarBannerConexion());
