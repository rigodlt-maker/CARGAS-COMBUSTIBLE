// =============================================
// app.js — FuelControl PWA (Actualizado con Login por Alias)
// =============================================

/* --- REGISTRO DEL SERVICE WORKER (requisito para poder "Instalar app") --- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(err => {
      console.error("No se pudo registrar el Service Worker:", err);
    });
  });
}

/* --- INSTALAR COMO APP (botón "📲 Instalar") --- */
let deferredInstallPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById("btn-install")?.classList.remove("hidden");
});
async function installApp() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById("btn-install")?.classList.add("hidden");
}
window.addEventListener("appinstalled", () => {
  document.getElementById("btn-install")?.classList.add("hidden");
});

/* ─────────────────────────────────────────────────────────────────
   COLA OFFLINE — IndexedDB
   Cuando no hay internet, los registros se guardan localmente y se
   sincronizan automáticamente cuando vuelve la conexión.
───────────────────────────────────────────────────────────────── */
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

async function guardarEnCola(record) {
  const db    = await abrirIDB();
  const tx     = db.transaction(IDB_STORE, "readwrite");
  const store = tx.objectStore(IDB_STORE);
  // creadoEn como ISO string porque Timestamp de Firebase no se serializa en IDB
  const recordIDB = { ...record, creadoEn: new Date().toISOString(), _offline: true };
  return new Promise((res, rej) => {
    const req = store.add(recordIDB);
    req.onsuccess = () => res(req.result);
    req.onerror   = e => rej(e.target.error);
  });
}

async function leerCola() {
  const db    = await abrirIDB();
  const tx    = db.transaction(IDB_STORE, "readonly");
  const store = tx.objectStore(IDB_STORE);
  return new Promise((res, rej) => {
    const req = store.getAll();
    req.onsuccess = () => res(req.result);
    req.onerror   = e => rej(e.target.error);
  });
}

async function eliminarDeCola(localId) {
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
async function sincronizarCola() {
  if (!navigator.onLine || !window.firebaseDB) return;
  let pendientes;
  try { pendientes = await leerCola(); } catch(e) { return; }
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
    } catch(e) {
      console.warn("No se pudo sincronizar registro offline:", e.message);
    }
  }
  actualizarBannerConexion();
  // Refrescamos historial si está visible
  if (document.getElementById("content-historial")?.classList.contains("active")) loadHistory();
}

/* --- BANNER DE ESTADO DE CONEXIÓN --- */
function actualizarBannerConexion() {
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

async function loadFirebase() {
  const { initializeApp }    = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js");
  const { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js");
  const { getFirestore, collection, addDoc, getDocs, getDoc, query, where, orderBy, Timestamp, limit, doc, updateDoc, setDoc } = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js");

  const firebaseConfig = {
    apiKey:            "AIzaSyCeIsd_BrHKbAY1HrYb3HL4vG4cpadUTuU",
    authDomain:        "cargas-7bf25.firebaseapp.com",
    projectId:         "cargas-7bf25",
    storageBucket:     "cargas-7bf25.firebasestorage.app",
    messagingSenderId: "1058286419136",
    appId:             "1:1058286419136:web:14246dae0c214429fe0125"
  };

  const app  = initializeApp(firebaseConfig);
  window.firebaseAuth = getAuth(app);
  window.firebaseDB   = getFirestore(app);
  window.fbSignIn     = signInWithEmailAndPassword;
  window.fbSignOut    = signOut;
  window.fbAuthChanged= onAuthStateChanged;
  window.fbCollection = collection;
  window.fbAddDoc     = addDoc;
  window.fbGetDocs    = getDocs;
  window.fbGetDoc     = getDoc;       
  window.fbQuery      = query;
  window.fbWhere      = where;
  window.fbOrderBy    = orderBy;
  window.fbTimestamp  = Timestamp;
  window.fbLimit      = limit;
  window.fbDoc        = doc;
  window.fbUpdateDoc  = updateDoc;
  window.fbSetDoc     = setDoc;

  initAuth();
}

/* --- VARIABLES GLOBALES --- */
let currentUser = null;
let currentStep = 1;
let isAdmin = false;
let isMaster = false;

let dataFotos = { ini: null, fin: null, ticket: null, pend: null, horo: null };
let estadoFotos = { ini: false, fin: false, ticket: false, pend: false, horo: false };

const catalogoEquipos = [
  { "maquinaria": "CAMION ARTICULADO", "marca": "CAT", "modelo": "745", "interno": "CAT-745-001" },
  { "maquinaria": "CAMION ARTICULADO", "marca": "SANY", "modelo": "SAT40C", "interno": "SANY-SAT40C-002" },
  { "maquinaria": "CAMION ARTICULADO", "marca": "SANY", "modelo": "SAT40C", "interno": "SANY-SAT40C-003" },
  { "maquinaria": "CARGADOR FRONTAL", "marca": "KOMATSU", "modelo": "WA600", "interno": "CFN-600-001" },
  { "maquinaria": "EXCAVADORA", "marca": "CAT", "modelo": "320ELRR", "interno": "EHO-320-E-007" },
  { "maquinaria": "EXCAVADORA", "marca": "CAT", "modelo": "385 BL", "interno": "EHO-385-001" },
  { "maquinaria": "EXCAVADORA", "marca": "KOMATSU", "modelo": "PC450-LC8", "interno": "EHO-450-010" },
  { "maquinaria": "EXCAVADORA", "marca": "KOMATSU", "modelo": "PC500 LC-10M0", "interno": "PC500 LC-013" },
  { "maquinaria": "EXCAVADORA", "marca": "SANY", "modelo": "SY550HD", "interno": "R-EHO-550-003" },
  { "maquinaria": "EXCAVADORA", "marca": "SANY", "modelo": "SY500H", "interno": "R-EHO-500-X" },
  { "maquinaria": "GRÚA", "marca": "LINKBELT", "modelo": "LS138", "interno": "GDO-138-X" },
  { "maquinaria": "MOTOCONFORMADORA", "marca": "SANY", "modelo": "SMG200C-8", "interno": "R-MOT-200-001" },
  { "maquinaria": "MOTOCONFORMADORA", "marca": "SANY", "modelo": "SMG200C-8", "interno": "R-MOT-200-002" },
  { "maquinaria": "RETROEXCAVADORA", "marca": "JOHN DEERE", "modelo": "310L", "interno": "RHN-310-001" },
  { "maquinaria": "TRACTOR DE ORUGAS", "marca": "KOMATSU", "modelo": "D65EX-16", "interno": "R-TRO-D6-001" },
  { "maquinaria": "VIBROCOMPACTADOR", "marca": "CAT", "modelo": "CS11GC", "interno": "VCM-S11-001" },
  { "maquinaria": "CAMION ARTICULADO", "marca": "KOMATSU", "modelo": "HM400-3M0", "interno": "HM400-04" },
  { "maquinaria": "CARGADOR FRONTAL", "marca": "CAT", "modelo": "980K", "interno": "980K-001" },
  { "maquinaria": "CARGADOR FRONTAL", "marca": "CAT", "modelo": "980K", "interno": "980K-002" },
  { "maquinaria": "EXCAVADORA", "marca": "CAT", "modelo": "352", "interno": "R-EHO-352-005" },
  { "maquinaria": "EXCAVADORA", "marca": "CAT", "modelo": "352", "interno": "CAT-352-006" },
  { "maquinaria": "EXCAVADORA", "marca": "CAT", "modelo": "336", "interno": "R-EHO-336-018" },
  { "maquinaria": "EXCAVADORA", "marca": "CAT", "modelo": "336", "interno": "R-EHO-336-019" },
  { "maquinaria": "EXCAVADORA", "marca": "CAT", "modelo": "349 FL", "interno": "CAT 349FL-012" },
  { "maquinaria": "EXCAVADORA", "marca": "CAT", "modelo": "336-E", "interno": "336E-016" },
  { "maquinaria": "EXCAVADORA", "marca": "JCB", "modelo": "JS385LC HD", "interno": "JS385-LC-009" },
  { "maquinaria": "EXCAVADORA", "marca": "JCB", "modelo": "JS385LC HD", "interno": "JS385-LC-011" },
  { "maquinaria": "EXCAVADORA", "marca": "JCB", "modelo": "JS385LC HD", "interno": "JS385-LC-014" },
  { "maquinaria": "EXCAVADORA", "marca": "JCB", "modelo": "JS385LC HD", "interno": "JS385-LC-015" },
  { "maquinaria": "EXCAVADORA", "marca": "KOMATSU", "modelo": "500 LC", "interno": "R-EHO-500-008" },
  { "maquinaria": "EXCAVADORA", "marca": "KOMATSU", "modelo": "PC490", "interno": "R-EHO-490-017" },
  { "maquinaria": "TRACTOR DE ORUGAS", "marca": "CAT", "modelo": "D8", "interno": "CAT-D8-X" }
].map(e => ({
  maquinaria: (e.maquinaria || "").trim(),
  marca:      (e.marca      || "").trim(),
  modelo:     (e.modelo     || "").trim(),
  interno:    (e.interno    || "").trim()
}));

/* --- INIT --- */
cargarSelectorEquipos("f-eco");
cargarSelectorEquipos("edit-eco");
document.getElementById("f-fecha").value = new Date().toISOString().split("T")[0];
document.getElementById("hist-fecha").value = new Date().toISOString().split("T")[0];
document.getElementById("f-horometro").addEventListener("input", updateHorometroBadge);
loadFirebase();

function cargarSelectorEquipos(targetId) {
  const select = document.getElementById(targetId);
  if (!select) return;
  select.innerHTML = '<option value="">Selecciona el # ECO...</option>';
  catalogoEquipos.forEach(e => {
    const opt = document.createElement("option");
    opt.value = e.interno; opt.textContent = `${e.interno} - ${e.maquinaria}`;
    select.appendChild(opt);
  });
}

function autoCompletarEquipo() {
  const eco = document.getElementById("f-eco").value;
  const eq = catalogoEquipos.find(e => e.interno === eco);
  if (eq) {
    document.getElementById("f-maquinaria").value = eq.maquinaria;
    document.getElementById("f-marca").value = eq.marca;
    document.getElementById("f-modelo").value = eq.modelo;
  } else {
    document.getElementById("f-maquinaria").value = "";
    document.getElementById("f-marca").value = "";
    document.getElementById("f-modelo").value = "";
  }
}

function autoCompletarEquipoEdit() {
  const eco = document.getElementById("edit-eco").value;
  const eq = catalogoEquipos.find(e => e.interno === eco);
  document.getElementById("edit-maquinaria").value = eq?.maquinaria || "";
}

/* --- AUTH Y ROLES --- */
function initAuth() {
  window.fbAuthChanged(window.firebaseAuth, async (user) => {
    if (user) {
      const authData = await checkWhitelist(user.email);
      if (!authData.allowed) {
        showLoginError("Usuario no autorizado o inactivo.");
        await window.fbSignOut(window.firebaseAuth);
        return;
      }
      currentUser = user;
      
      // Mostrar solo el alias en la barra superior
      let displayUser = user.email;
      if(displayUser.endsWith("@grupoindi.com")) {
        displayUser = displayUser.replace("@grupoindi.com", "");
      }
      document.getElementById("header-user").textContent = displayUser;

      isAdmin = (authData.rol === 'admin' || authData.rol === 'master');
      isMaster = (authData.rol === 'master');
      if (isAdmin) document.getElementById("tab-pendientes").classList.remove("hidden");
      if (isMaster) document.getElementById("tab-usuarios").classList.remove("hidden");

      showScreen("app");
      // Intentar sincronizar registros offline que quedaron pendientes
      actualizarBannerConexion();
      setTimeout(sincronizarCola, 1500); // pequeño delay para que Firebase esté listo
    } else {
      currentUser = null; showScreen("login");
    }
  });
}

async function checkWhitelist(email) {
  try {
    const col = window.fbCollection(window.firebaseDB, "whitelist");
    const q = window.fbQuery(col, window.fbWhere("email", "==", email.toLowerCase()));
    const snap = await window.fbGetDocs(q);
    if (snap.empty) return { allowed: false };
    const data = snap.docs[0].data();
    if (data.activo === false) return { allowed: false };
    return { allowed: true, rol: data.rol || 'capturista' };
  } catch (e) { return { allowed: false }; }
}

async function handleLogin() {
  // Ahora capturamos el alias (ej. operador1)
  const username = document.getElementById("login-username").value.trim().toLowerCase();
  const pw = document.getElementById("login-password").value;
  
  if(!username || !pw) return showLoginError("Ingresa usuario y contraseña.");
  
  // Le agregamos el dominio ficticio por detrás
  const fakeEmail = `${username}@grupoindi.com`;

  try { await window.fbSignIn(window.firebaseAuth, fakeEmail, pw); }
  catch(e) { showLoginError("Usuario o contraseña incorrectos."); }
}

async function handleLogout() { await window.fbSignOut(window.firebaseAuth); location.reload(); }
function showLoginError(msg) { document.getElementById("login-error").textContent = msg; document.getElementById("login-error").classList.remove("hidden"); }
function togglePassword() { const p = document.getElementById("login-password"); p.type = p.type==="password"?"text":"password"; }

function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => {
    s.classList.toggle("active", s.id === `screen-${name}`);
    s.classList.toggle("hidden", s.id !== `screen-${name}`);
  });
}
function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.id === `tab-${name}`));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === `content-${name}`));
  if (name === "historial") loadHistory();
  if (name === "pendientes" && isAdmin) loadPendientes();
  if (name === "usuarios" && isMaster) loadUsuarios();
}

/* --- LOGICA DE FORMULARIO --- */
function setHorometroMode(sinHoro) {
  document.getElementById("chk-sin-horometro").checked = sinHoro;

  document.getElementById("btn-sin-horometro").classList.toggle("active", sinHoro);
  document.getElementById("btn-con-horometro").classList.toggle("active", !sinHoro);

  const input = document.getElementById("f-horometro");
  input.disabled = sinHoro;

  // Mostrar u ocultar la sección de foto del horómetro
  document.getElementById("horo-foto-section").style.display = sinHoro ? "none" : "block";

  if (sinHoro) {
    input.value = "";
    document.getElementById("horometro-badge").textContent = "N/A";
    // Limpiar foto si se cambia a "Sin horómetro"
    dataFotos.horo = null;
    estadoFotos.horo = false;
    document.getElementById("preview-box-horo")?.classList.add("hidden");
    document.getElementById("ok-horo")?.classList.add("hidden");
    document.getElementById("btn-cam-horo")?.classList.remove("hidden");
    const imgHoro = document.getElementById("img-horo");
    if (imgHoro) imgHoro.src = "";
  } else {
    document.getElementById("horometro-badge").textContent = "— h";
  }
}

// Se mantiene por compatibilidad si algo más en tu código llama a toggleHorometro()
function toggleHorometro() {
  const sinHoro = document.getElementById("chk-sin-horometro").checked;
  setHorometroMode(sinHoro);
}
function updateHorometroBadge() {
  const val = document.getElementById("f-horometro").value;
  if(!val) return document.getElementById("horometro-badge").textContent="— h";
  const lastDigit = parseInt(val.toString().slice(-1)) || 0;
  const hours = Math.floor(val / 10);
  document.getElementById("horometro-badge").textContent = `${hours}h ${lastDigit*6 > 0 ? lastDigit*6+"m" : ""}`;
}
function toggleTicket() {
  const isChecked = document.getElementById("chk-ticket-despues").checked;
  document.getElementById("ticket-section").style.display = isChecked ? "none" : "block";
}

/* --- COMPRESIÓN DE IMÁGENES (con control de tamaño máximo) ---
   Firestore rechaza documentos de más de ~1 MiB. En vez de fijar una sola
   calidad/ancho "a ojo" (que puede no bastar con fotos muy detalladas o con
   poca luz), comprimimos de forma adaptativa: probamos combinaciones de
   ancho/calidad cada vez más agresivas hasta quedar por debajo de un tamaño
   objetivo en bytes, o hasta agotar los intentos. */

// Tamaño aproximado en bytes de un dataURL base64 (sin el prefijo "data:image/...;base64,")
function tamanoBase64Bytes(dataUrl) {
  if (!dataUrl) return 0;
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil(base64.length * 0.75);
}

function compressImageToTarget(dataUrl, targetBytes, callback) {
  const img = new Image();
  img.onload = () => {
    // De más detalle a menos. Los últimos escalones son agresivos a propósito:
    // es mejor una foto chica pero legible que un registro que no se puede guardar.
    const intentos = [
      { maxWidth: 900, quality: 0.6 },
      { maxWidth: 800, quality: 0.5 },
      { maxWidth: 700, quality: 0.45 },
      { maxWidth: 600, quality: 0.4 },
      { maxWidth: 500, quality: 0.35 },
      { maxWidth: 400, quality: 0.3 }
    ];

    let i = 0;
    const probar = () => {
      const { maxWidth, quality } = intentos[Math.min(i, intentos.length - 1)];
      let width = img.width, height = img.height;
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const resultado = canvas.toDataURL("image/jpeg", quality);

      if (tamanoBase64Bytes(resultado) <= targetBytes || i === intentos.length - 1) {
        callback(resultado);
      } else {
        i++;
        probar();
      }
    };
    probar();
  };
  img.onerror = () => callback(dataUrl);
  img.src = dataUrl;
}

// Tamaño objetivo por tipo de foto. Los tickets suelen llevar texto impreso
// pequeño, así que les dejamos un poco más de margen que a las fotos de bomba
// (donde solo hace falta leer el dígito del contador).
const TARGET_BYTES_FOTO = { ini: 140 * 1024, fin: 140 * 1024, ticket: 220 * 1024, pend: 220 * 1024, horo: 140 * 1024 };

// Límite de seguridad para la suma de las fotos de un registro. Lo dejamos con
// margen real bajo el límite duro de Firestore (~1 MiB ≈ 1048576 bytes) para
// cubrir el resto de los campos del documento.
const LIMITE_TOTAL_FOTOS_BYTES = 850 * 1024;

function validarTamanoFotos(...fotos) {
  let total = 0;
  fotos.forEach(f => { if (f) total += tamanoBase64Bytes(f); });
  return { ok: total <= LIMITE_TOTAL_FOTOS_BYTES, totalKB: Math.round(total / 1024) };
}

/* --- FOTOS SURTIDOR Y TICKET --- */
function previewSurtidor(event, tipo) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    compressImageToTarget(e.target.result, TARGET_BYTES_FOTO[tipo], (dataUrl) => {
      document.getElementById(`img-${tipo}`).src = dataUrl;
      document.getElementById(`preview-box-${tipo}`).classList.remove("hidden");
      document.getElementById(`btn-cam-${tipo}`).classList.add("hidden");
      document.getElementById(`ok-${tipo}`).classList.add("hidden");
      window[`_pending_${tipo}`] = dataUrl;
    });
  };
  reader.readAsDataURL(file);
}

function aceptarSurtidor(tipo) {
  if (!window[`_pending_${tipo}`]) return;

  dataFotos[tipo] = window[`_pending_${tipo}`];
  estadoFotos[tipo] = true;

  document.getElementById(`preview-box-${tipo}`).classList.add("hidden");
  document.getElementById(`btn-cam-${tipo}`).classList.remove("hidden");
  document.getElementById(`ok-${tipo}`).classList.remove("hidden");

  if (tipo === "pend") {
    document.getElementById("btn-save-pend").style.display = "block";
  }
}

/* --- NAVEGACION Y VALIDACION --- */
function goStep(n) {
  if (n > currentStep && !validateStep(currentStep)) return;
  currentStep = n;
  for (let i=1; i<=4; i++) {
    document.getElementById(`panel-step-${i}`)?.classList.toggle("active", i === n);
    document.getElementById(`step-dot-${i}`)?.classList.toggle("active", i === n);
    document.getElementById(`step-line-${i}`)?.classList.toggle("active", i === n);
  }
  if (n === 4) buildSummary();
}

function validateStep(step) {
  if(step === 1) {
    if(!document.getElementById("f-eco").value) { alert("Selecciona el ECO"); return false; }
    if(!document.getElementById("chk-sin-horometro").checked) {
      if(!document.getElementById("f-horometro").value) { alert("Falta horómetro"); return false; }
      if(!estadoFotos.horo) { alert("❌ Debes tomar y CONFIRMAR la foto del horómetro."); return false; }
    }
    return true;
  }
  if(step === 2) {
    const tipo = document.querySelector('input[name="tipo-combustible"]:checked');
    if(!tipo) { alert("Selecciona Diésel o Gasolina"); return false; }
    if(!document.getElementById("f-litros").value) { alert("Faltan litros"); return false; }
    const ci = parseFloat(document.getElementById("f-cuenta-inicial").value);
    if (isNaN(ci) || ci !== 0) { alert("❌ La cuenta litros inicial debe ser 0."); return false; }
    if(!document.getElementById("f-cuenta-final").value) { alert("Falta cuenta final"); return false; }
    // FIX: validar que cuenta final sea mayor a cuenta inicial
    const cf = parseFloat(document.getElementById("f-cuenta-final").value);
    if (isNaN(cf) || cf <= ci) { alert("❌ La cuenta final debe ser mayor que la cuenta inicial (0)."); return false; }
    // FIX: validar que litros capturados coincidan aproximadamente con la diferencia del contador
    const difContador = cf - ci;
    const litrosForm = parseFloat(document.getElementById("f-litros").value);
    if (Math.abs(difContador - litrosForm) > 5) {
      if (!confirm(`⚠️ Los litros capturados (${litrosForm} L) difieren de la diferencia del contador (${difContador.toFixed(1)} L).\n\n¿Deseas continuar de todas formas?`)) return false;
    }
    if(!estadoFotos.ini) { alert("❌ Debes tomar y CONFIRMAR la foto Inicial."); return false; }
    if(!estadoFotos.fin) { alert("❌ Debes tomar y CONFIRMAR la foto Final."); return false; }
    return true;
  }
  if(step === 3) {
    if(!document.getElementById("chk-ticket-despues").checked) {
      if(!document.getElementById("f-ticket").value) { alert("Ingresa el # de Ticket"); return false; }
      if(!estadoFotos.ticket) { alert("❌ Debes tomar y CONFIRMAR la foto del Ticket."); return false; }
    }
    return true;
  }
  return true;
}

function buildSummary() {
  const isPendiente = document.getElementById("chk-ticket-despues").checked;
  const eco        = document.getElementById("f-eco").value;
  const maquinaria = document.getElementById("f-maquinaria").value;
  const marca      = document.getElementById("f-marca").value;
  const modelo     = document.getElementById("f-modelo").value;
  const fecha      = document.getElementById("f-fecha").value;
  const litros     = document.getElementById("f-litros").value;
  const cuentaIni  = document.getElementById("f-cuenta-inicial").value;
  const cuentaFin  = document.getElementById("f-cuenta-final").value;
  const horometro  = document.getElementById("chk-sin-horometro").checked
                     ? "Sin horómetro"
                     : (document.getElementById("f-horometro").value || "—");
  const tipoComb   = document.querySelector('input[name="tipo-combustible"]:checked')?.value || "—";
  const ticket     = isPendiente ? "⏳ Pendiente" : (document.getElementById("f-ticket").value || "—");

  // Verificación rápida de fotos confirmadas
  const chkIni    = estadoFotos.ini    ? "✅" : "❌";
  const chkFin    = estadoFotos.fin    ? "✅" : "❌";
  const chkTicket = isPendiente ? "—" : (estadoFotos.ticket ? "✅" : "❌");

  const html = `
    <div class="summary-row"><span class="summary-key">Fecha</span><span class="summary-val">${fecha}</span></div>
    <div class="summary-row"><span class="summary-key">ECO</span><span class="summary-val highlight">${eco}</span></div>
    <div class="summary-row"><span class="summary-key">Maquinaria</span><span class="summary-val">${maquinaria}</span></div>
    <div class="summary-row"><span class="summary-key">Marca / Modelo</span><span class="summary-val">${marca} ${modelo}</span></div>
    <div class="summary-row"><span class="summary-key">Combustible</span><span class="summary-val">${tipoComb}</span></div>
    <div class="summary-row"><span class="summary-key">Litros cargados</span><span class="summary-val highlight">${litros} L</span></div>
    <div class="summary-row"><span class="summary-key">Contador Ini → Fin</span><span class="summary-val">${cuentaIni} → ${cuentaFin}</span></div>
    <div class="summary-row"><span class="summary-key">Horómetro</span><span class="summary-val">${horometro}</span></div>
    <div class="summary-row"><span class="summary-key">Ticket</span><span class="summary-val">${ticket}</span></div>
    <div class="summary-row"><span class="summary-key">Foto Inicial</span><span class="summary-val">${chkIni} Confirmada</span></div>
    <div class="summary-row"><span class="summary-key">Foto Final</span><span class="summary-val">${chkFin} Confirmada</span></div>
    <div class="summary-row"><span class="summary-key">Foto Ticket</span><span class="summary-val">${chkTicket}${isPendiente ? " (se adjunta después)" : " Confirmada"}</span></div>
  `;
  document.getElementById("summary-card").innerHTML = html;
}

/* --- CALCULO RENDIMIENTO L/H --- */
// FIX: Se agrega excludeDocId para que al editar un registro viejo no se compare
// consigo mismo (traía el registro MÁS RECIENTE aunque fuera el propio).
async function getRendimiento(ecoActual, horoRawActual, litrosActuales, excludeDocId = null) {
  // Sin horómetro actual no se puede calcular diferencia de horas
  if (!horoRawActual) return "N/A";
  try {
    const col = window.fbCollection(window.firebaseDB, "registros");
    const q = window.fbQuery(
  col,
  window.fbWhere("eco", "==", ecoActual),
  window.fbOrderBy("horometroRaw", "desc"),
  window.fbLimit(10)
);
    const snap = await window.fbGetDocs(q);
    if (snap.empty) return "Primer Registro";

    // Convertir horómetro "corrido" a horas decimales
    // Formato: los dígitos excepto el último = horas, el último = décimas (cada una = 6 min)
    function horoADecimal(raw) {
      return Math.floor(raw / 10) + (raw % 10) / 10;
    }

    const horoActualDec = horoADecimal(horoRawActual);

    // Buscamos el registro anterior más reciente del mismo ECO
    // que tenga horómetro válido y sea distinto al que estamos editando
    for (const docSnap of snap.docs) {
      if (excludeDocId && docSnap.id === excludeDocId) continue;

      const prev = docSnap.data();
      if (!prev.horometroRaw) continue;

      const horoPrevDec = horoADecimal(prev.horometroRaw);
      const horasTrabajadas = horoActualDec - horoPrevDec;

      // El horómetro actual debe ser mayor al anterior (sanidad)
      if (horasTrabajadas <= 0) continue;

      // ✅ CLAVE: el rendimiento usa los LITROS DEL REGISTRO ANTERIOR
      // (lo que consumió la máquina entre esa carga y la carga actual)
      const litrosPrevios = prev.litros;
      if (!litrosPrevios || litrosPrevios <= 0) continue;

      return (litrosPrevios / horasTrabajadas).toFixed(2);
    }

    return "Primer Registro";
  } catch (e) {
    return "N/A";
  }
}

/* --- RESET DEL FORMULARIO (reemplaza location.reload para no cerrar sesión) --- */
function resetFormulario() {
  // Limpiar estado de fotos
  dataFotos   = { ini: null, fin: null, ticket: null, pend: null };
  estadoFotos = { ini: false, fin: false, ticket: false, pend: false };
  currentStep = 1;

  // Campos del formulario
  document.getElementById("f-eco").value = "";
  document.getElementById("f-maquinaria").value = "";
  document.getElementById("f-marca").value = "";
  document.getElementById("f-modelo").value = "";
  document.getElementById("f-horometro").value = "";
  document.getElementById("f-litros").value = "";
  document.getElementById("f-cuenta-inicial").value = "";
  document.getElementById("f-cuenta-final").value = "";
  document.getElementById("f-ticket").value = "";
  document.getElementById("horometro-badge").textContent = "— h";
  document.getElementById("chk-sin-horometro").checked = false;
  document.getElementById("chk-ticket-despues").checked = false;
  document.getElementById("ticket-section").style.display = "block";
  document.querySelector('input[name="tipo-combustible"]:checked') &&
    (document.querySelector('input[name="tipo-combustible"]:checked').checked = false);

 // Resetear UI de fotos
  ["ini", "fin", "ticket", "horo"].forEach(tipo => {
    document.getElementById(`preview-box-${tipo}`)?.classList.add("hidden");
    document.getElementById(`ok-${tipo}`)?.classList.add("hidden");
    document.getElementById(`btn-cam-${tipo}`)?.classList.remove("hidden");
    const img = document.getElementById(`img-${tipo}`);
    if (img) img.src = "";
  });

  // Restaurar sección de foto del horómetro
  const horoSection = document.getElementById("horo-foto-section");
  if (horoSection) horoSection.style.display = "block";

  // Volver al paso 1
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`panel-step-${i}`)?.classList.toggle("active", i === 1);
    document.getElementById(`step-dot-${i}`)?.classList.toggle("active", i === 1);
    document.getElementById(`step-line-${i}`)?.classList.toggle("active", i === 1);
  }

  // Fecha de hoy de nuevo
  document.getElementById("f-fecha").value = new Date().toISOString().split("T")[0];
}

/* --- GUARDAR A FIREBASE --- */
async function handleSubmit() {
  showLoading("Guardando en base de datos...");
  try {
    const eco = document.getElementById("f-eco").value;
    const sinHoro = document.getElementById("chk-sin-horometro").checked;
    const horoRaw = sinHoro ? null : parseFloat(document.getElementById("f-horometro").value);
    const litros = parseFloat(document.getElementById("f-litros").value);
    const isPendiente = document.getElementById("chk-ticket-despues").checked;

    const rendimiento = await getRendimiento(eco, horoRaw, litros);
const docRef = window.fbDoc(window.fbCollection(window.firebaseDB, "registros"));

    const record = {
      fecha: document.getElementById("f-fecha").value,
      eco: eco,
      maquinaria: document.getElementById("f-maquinaria").value,
      litros: litros,
      horometroRaw: horoRaw,
      rendimiento: rendimiento,
      status: isPendiente ? "pendiente" : "completado",
      ticket: isPendiente ? "PENDIENTE" : document.getElementById("f-ticket").value,
      fotoInicial: dataFotos.ini,
      fotoFinal: dataFotos.fin,
      fotoTicket: isPendiente ? null : dataFotos.ticket,
      fotoHorometro: dataFotos.horo || null,
      usuario: currentUser.email,
      conciliado: false,
      creadoEn: window.fbTimestamp.now()
    };

    // 1. INTENTAR GUARDAR EN FIREBASE; si no hay internet, guardar en cola offline
    try {
      await window.fbSetDoc(docRef, record);
    } catch (firebaseErr) {
      if (!navigator.onLine || firebaseErr.code === "unavailable" || firebaseErr.message.includes("offline")) {
        // SIN INTERNET — guardar localmente
        await guardarEnCola(record);
        actualizarBannerConexion();
        hideLoading();
        alert("📵 Sin conexión — el registro se guardó localmente y se subirá automáticamente cuando vuelva internet.");
        resetFormulario();
        switchTab("historial");
        return;
      }
      // Error real de Firebase (permisos, etc.) — propagar
      throw firebaseErr;
    }

    // 2. SOLO SI FIREBASE GUARDÓ CON ÉXITO, GENERAMOS EL PDF
    if(!isPendiente) {
      showLoading("Datos guardados. Generando PDF...");
      const pdfDoc = await generateTicketPDF(record);
      pdfDoc.save(`FuelControl_${eco}_${record.ticket}.pdf`);
    }

    hideLoading();
    alert(isPendiente ? "Guardado como PENDIENTE. (No se generó PDF aún)" : "Guardado con éxito en la nube y PDF descargado.");
    // FIX: en lugar de location.reload() (que cierra sesión en Android),
    // reseteamos el formulario y navegamos al historial para ver el registro recién creado.
    resetFormulario();
    switchTab("historial");

  } catch(e) { 
    hideLoading(); 
    // Si no hay internet o no tiene permisos, salta directo aquí y NO descarga PDF.
    alert("❌ Error al subir a Firebase. Revisa tu conexión a internet o tus permisos. Detalle: " + e.message); 
  }
}
/* --- CACHÉ DE REGISTROS --- */
window._historialCache = {};
window._pendientesCache = {};
function _getRegistroCache(id) {
  return (window._historialCache && window._historialCache[id]) ||
         (window._pendientesCache && window._pendientesCache[id]) || null;
}

/* --- PENDIENTES (ADMIN) --- */
async function loadPendientes() {
  const list = document.getElementById("pendientes-list");
  list.innerHTML = "Cargando pendientes...";
  try {
    const q = window.fbQuery(
      window.fbCollection(window.firebaseDB, "registros"),
      window.fbWhere("status", "==", "pendiente")
    );
    const snap = await window.fbGetDocs(q);

    window._pendientesCache = {};
    if(snap.empty) { list.innerHTML = "<p>No hay tickets pendientes.</p>"; return; }

    list.innerHTML = "";
    snap.forEach(docSnap => {
      const d = docSnap.data();
      window._pendientesCache[docSnap.id] = d;
      const esConciliado = d.conciliado === true;

      if (esConciliado) {
        list.innerHTML += `
          <div class="history-card" style="border-left: 4px solid var(--blue); cursor:default;">
            <div class="hc-header"><span>${d.eco}</span><span>${d.fecha}</span></div>
            <p style="color:var(--blue); font-size:12px; margin-top:5px;">🔒 Conciliado sin ticket • ${d.litros} L</p>
            <div style="display:flex; gap:8px; margin-top:8px;">
              <button class="btn btn-outline btn-sm" onclick="descargarPDFDesdeCache('${docSnap.id}')">📥 Descargar PDF</button>
            </div>
          </div>
        `;
      } else {
        list.innerHTML += `
          <div class="history-card" style="border-left: 4px solid var(--orange); cursor:pointer;" onclick="abrirPendiente('${docSnap.id}')">
            <div class="hc-header"><span>${d.eco}</span><span>${d.fecha}</span></div>
            <p style="color:var(--orange); font-size:12px; margin-top:5px;">Falta Ticket • ${d.litros} L</p>
            <div style="display:flex; gap:8px; margin-top:8px;">
              <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); descargarPDFDesdeCache('${docSnap.id}')">📥 Descargar PDF</button>
            </div>
          </div>
        `;
      }
    });
  } catch(e) {
    list.innerHTML = `<p style="color:var(--red);">❌ Error al cargar pendientes: ${e.message}</p>`;
    console.error("loadPendientes error:", e);
  }
}

let docPendienteActual = null;
function abrirPendiente(id) {
  const d = _getRegistroCache(id);
  docPendienteActual = id;
  document.getElementById("pend-eco").textContent = d ? `${d.eco} (${d.litros} L) - ${d.fecha}` : id;
  document.getElementById("pend-ticket-input").value = "";
  estadoFotos.pend = false;
  dataFotos.pend = null;
  document.getElementById("ok-pend").classList.add("hidden");
  document.getElementById("btn-cam-pend").classList.remove("hidden");
  document.getElementById("preview-box-pend").classList.add("hidden");
  document.getElementById("btn-save-pend").style.display = "none";
  document.getElementById("modal-pendiente").classList.remove("hidden");
}

function cerrarModalPendiente() {
  document.getElementById("modal-pendiente").classList.add("hidden");
}

function refrescarListaActual() {
  if (document.getElementById("content-historial").classList.contains("active")) loadHistory();
  if (isAdmin && document.getElementById("content-pendientes").classList.contains("active")) loadPendientes();
}

async function guardarPendiente() {
  const ticketVal = document.getElementById("pend-ticket-input").value.trim();
  if(!ticketVal) return alert("Ingresa el número de ticket definitivo.");
  if(!estadoFotos.pend) return alert("❌ Debes tomar y CONFIRMAR la foto del Ticket.");

  showLoading("Cerrando registro y generando PDF...");
  try {
    const docRef = window.fbDoc(window.firebaseDB, "registros", docPendienteActual);
    await window.fbUpdateDoc(docRef, {
      ticket: ticketVal,
      fotoTicket: dataFotos.pend,
      status: "completado"
    });

    const docSnap = await window.fbGetDoc(window.fbDoc(window.firebaseDB, "registros", docPendienteActual));
    const record = docSnap.data();

    record.fotoTicket = dataFotos.pend;
    record.ticket = ticketVal;

    const docPDF = await generateTicketPDF(record);
    docPDF.save(`FuelControl_${record.eco}_${ticketVal}.pdf`);

    hideLoading();
    alert("Ticket adjuntado y PDF generado.");
    cerrarModalPendiente();
    refrescarListaActual();
  } catch(e) { hideLoading(); alert("Error: " + e.message); }
}

/* --- EDITAR REGISTRO (Admin General y Admin Maestro) --- */
function abrirEditar(id) {
  const d = _getRegistroCache(id);
  if (!d) return alert("No se encontró el registro.");
  document.getElementById("edit-error").classList.add("hidden");
  document.getElementById("edit-id").value = id;
  document.getElementById("edit-fecha").value = d.fecha || "";
  document.getElementById("edit-eco").value = d.eco || "";
  autoCompletarEquipoEdit();
  document.getElementById("edit-litros").value = d.litros ?? "";
  document.getElementById("edit-horometro").value = d.horometroRaw ?? "";
  document.getElementById("edit-ticket").value = (d.ticket === "PENDIENTE" ? "" : d.ticket) || "";
  document.getElementById("modal-editar").classList.remove("hidden");
}

function cerrarModalEditar() {
  document.getElementById("modal-editar").classList.add("hidden");
}

async function guardarEdicion() {
  const errBox = document.getElementById("edit-error");
  errBox.classList.add("hidden");

  const id = document.getElementById("edit-id").value;
  const eco = document.getElementById("edit-eco").value;
  const fecha = document.getElementById("edit-fecha").value;
  const litros = parseFloat(document.getElementById("edit-litros").value);
  const horoVal = document.getElementById("edit-horometro").value;
  const horoRaw = horoVal !== "" ? parseFloat(horoVal) : null;
  const ticket = document.getElementById("edit-ticket").value.trim();

  if (!eco || !fecha || isNaN(litros)) {
    errBox.textContent = "Completa ECO, fecha y litros.";
    errBox.classList.remove("hidden");
    return;
  }

  showLoading("Guardando cambios...");
  try {
    const eq = catalogoEquipos.find(e => e.interno === eco);
    // FIX: pasamos el id del doc actual para excluirlo del cálculo de rendimiento
    const rendimiento = await getRendimiento(eco, horoRaw, litros, id);
    const original = _getRegistroCache(id);

    await window.fbUpdateDoc(window.fbDoc(window.firebaseDB, "registros", id), {
      eco, fecha, litros,
      maquinaria: eq ? eq.maquinaria : "",
      horometroRaw: horoRaw,
      rendimiento,
      ticket: ticket || original?.ticket || ""
    });

    hideLoading();
    cerrarModalEditar();
    refrescarListaActual();
  } catch (e) {
    hideLoading();
    errBox.textContent = "Error: " + e.message;
    errBox.classList.remove("hidden");
  }
}

/* --- CONCILIAR (solo Admin Maestro) --- */
async function conciliarRegistro(id) {
  if (!confirm("¿Conciliar este registro?\n\nYa no se podrá editar ni subir el ticket después. Esta acción es para administradores maestros.")) return;
  showLoading("Conciliando registro...");
  try {
    await window.fbUpdateDoc(window.fbDoc(window.firebaseDB, "registros", id), { conciliado: true });
    hideLoading();
    refrescarListaActual();
  } catch (e) { hideLoading(); alert("Error: " + e.message); }
}

/* --- HISTORIAL --- */
async function loadHistory() {
  const list = document.getElementById("history-list");
  const fechaInput = document.getElementById("hist-fecha");
  if (!fechaInput.value) fechaInput.value = new Date().toISOString().split("T")[0];
  const fecha = fechaInput.value;

  list.innerHTML = "Cargando...";
  try {
    const col = window.fbCollection(window.firebaseDB, "registros");
    const q = window.fbQuery(col, window.fbWhere("fecha", "==", fecha));
    const snap = await window.fbGetDocs(q);

    window._historialCache = {};
    if (snap.empty) { list.innerHTML = "<p>No hay registros para esta fecha.</p>"; return; }

    list.innerHTML = "";
    snap.forEach(docSnap => {
      const d = docSnap.data();
      window._historialCache[docSnap.id] = d;

      const esPendiente = d.status === "pendiente";
      const esConciliado = d.conciliado === true;
      const colorEstatus = esConciliado ? "var(--blue)" : (esPendiente ? "var(--orange)" : "var(--green)");
      const txtEstatus = esConciliado ? "🔒 Conciliado" : (esPendiente ? "⏳ Pendiente" : "✅ Completado");

      let botones = `<button class="btn btn-outline btn-sm" onclick="descargarPDFDesdeCache('${docSnap.id}')">📥 Descargar PDF</button>`;
      if (!esConciliado) {
        if (esPendiente) {
          botones += `<button class="btn btn-outline btn-sm" onclick="abrirPendiente('${docSnap.id}')">📷 Subir Ticket</button>`;
        }
        if (isAdmin) {
          botones += `<button class="btn btn-ghost btn-sm" onclick="abrirEditar('${docSnap.id}')">✏️ Editar</button>`;
        }
        if (isMaster) {
          botones += `<button class="btn btn-ghost btn-sm" style="color:var(--blue); border:1px solid var(--blue);" onclick="conciliarRegistro('${docSnap.id}')">🔒 Conciliar</button>`;
        }
      }

      list.innerHTML += `
        <div class="history-card" style="cursor:default; ${esPendiente && !esConciliado ? 'border-left:4px solid var(--orange);' : ''}">
          <div class="hc-header"><span>${d.eco}</span><span style="color:${colorEstatus};">${txtEstatus}</span></div>
          <p style="color:var(--text-muted); font-size:12px; margin-top:5px;">
            ${d.maquinaria || ""} • ${d.litros} L • Rend: ${d.rendimiento ?? "N/A"} L/h • Ticket: ${d.ticket || "—"}
          </p>
          ${botones ? `<div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">${botones}</div>` : ""}
        </div>
      `;
    });
  } catch (e) {
    list.innerHTML = `<p style="color:var(--red);">❌ Error al cargar historial: ${e.message}</p>`;
    console.error("loadHistory error:", e);
  }
}

/* --- USUARIOS Y ROLES (solo Admin Maestro) --- */
async function loadUsuarios() {
  const list = document.getElementById("usuarios-list");
  list.innerHTML = "Cargando usuarios...";
  try {
    const snap = await window.fbGetDocs(window.fbCollection(window.firebaseDB, "whitelist"));
    window._usuariosCache = {};
    if (snap.empty) { list.innerHTML = "<p>No hay usuarios registrados.</p>"; return; }

    const rolLabels = { master: "🔑 Admin Maestro", admin: "🛡️ Admin General", capturista: "👷 Capturista", operador: "👷 Capturista" };

    list.innerHTML = "";
    snap.forEach(docSnap => {
      const d = docSnap.data();
      window._usuariosCache[docSnap.id] = d;
      const activo = d.activo !== false;
      
      // Limpiar correo falso en lista para que se vea solo el alias
      let displayAlias = d.email || "";
      if (displayAlias.endsWith("@grupoindi.com")) {
        displayAlias = displayAlias.replace("@grupoindi.com", "");
      }

      list.innerHTML += `
        <div class="history-card" style="cursor:pointer;" onclick="abrirUsuario('${docSnap.id}')">
          <div class="hc-header"><span>${d.nombre || displayAlias}</span><span style="color:${activo ? 'var(--green)' : 'var(--red)'};">${activo ? '✅ Activo' : '⛔ Inactivo'}</span></div>
          <p style="color:var(--text-muted); font-size:12px; margin-top:5px;">Alias: ${displayAlias} • ${rolLabels[d.rol] || "👷 Capturista"}</p>
        </div>
      `;
    });
  } catch (e) {
    list.innerHTML = `<p style="color:var(--red);">❌ Error al cargar usuarios: ${e.message}</p>`;
    console.error("loadUsuarios error:", e);
  }
}

function abrirUsuario(docId) {
  document.getElementById("usuario-error").classList.add("hidden");
  const u = docId ? window._usuariosCache?.[docId] : null;

  document.getElementById("usuario-modal-title").textContent = docId ? "Editar usuario" : "Nuevo usuario";
  document.getElementById("usuario-doc-id").value = docId || "";
  
  // Limpiar el @grupoindi.com del input si ya existe un usuario
  let displayUser = u?.email || "";
  if (displayUser.endsWith("@grupoindi.com")) {
    displayUser = displayUser.replace("@grupoindi.com", "");
  }

  document.getElementById("usuario-email").value = displayUser;
  document.getElementById("usuario-email").disabled = !!docId; // No dejar cambiar el alias de un usuario ya creado
  document.getElementById("usuario-nombre").value = u?.nombre || "";
  document.getElementById("usuario-rol").value = u?.rol || "capturista";
  document.getElementById("usuario-activo").checked = u ? (u.activo !== false) : true;

  document.getElementById("modal-usuario").classList.remove("hidden");
}

function cerrarModalUsuario() {
  document.getElementById("modal-usuario").classList.add("hidden");
}

async function guardarUsuario() {
  const errBox = document.getElementById("usuario-error");
  errBox.classList.add("hidden");

  const docId = document.getElementById("usuario-doc-id").value;
  const usernameInput = document.getElementById("usuario-email").value.trim().toLowerCase();
  const nombre = document.getElementById("usuario-nombre").value.trim();
  const rol = document.getElementById("usuario-rol").value;
  const activo = document.getElementById("usuario-activo").checked;

  if (!usernameInput) { errBox.textContent = "Ingresa un alias / usuario."; errBox.classList.remove("hidden"); return; }
  if (!nombre) { errBox.textContent = "Ingresa el nombre del usuario."; errBox.classList.remove("hidden"); return; }

  // Aquí creamos el correo falso que va a parar a la Base de Datos
  const fakeEmail = usernameInput.includes("@") ? usernameInput : `${usernameInput}@grupoindi.com`;

  showLoading("Guardando usuario...");
  try {
    if (docId) {
      await window.fbUpdateDoc(window.fbDoc(window.firebaseDB, "whitelist", docId), { nombre, rol, activo });
    } else {
      await window.fbSetDoc(window.fbDoc(window.firebaseDB, "whitelist", fakeEmail), { email: fakeEmail, nombre, rol, activo });
    }
    hideLoading();
    cerrarModalUsuario();
    loadUsuarios();
  } catch (e) {
    hideLoading();
    errBox.textContent = "Error: " + e.message;
    errBox.classList.remove("hidden");
  }
}

/* --- EXPORTAR EXCEL (XLSX) --- */
async function exportExcel() {
  showLoading("Generando Excel...");
  try {
    // Cargar SheetJS desde CDN si aún no está disponible
    if (!window.XLSX) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
        s.onload = res;
        s.onerror = () => rej(new Error("No se pudo cargar la librería de Excel."));
        document.head.appendChild(s);
      });
    }

    const col = window.fbCollection(window.firebaseDB, "registros");
    const snap = await window.fbGetDocs(col);

    if (snap.empty) { hideLoading(); alert("No hay registros para exportar."); return; }

   const headers = ["# Economico", "Fecha Carga", "Horometro Inicial", "Carga (Litros)", "Combustible", "Ticket"];
    const filas = [headers];

    snap.forEach(docSnap => {
      const d = docSnap.data();

      // Horómetro con último dígito como decimal. Si no tiene horómetro → 0
      let horoDecimal = 0;
      if (typeof d.horometroRaw === "number") {
        const horas = Math.floor(d.horometroRaw / 10);
        const decimas = d.horometroRaw % 10;
        horoDecimal = parseFloat(`${horas}.${decimas}`);
      }

      filas.push([
        d.eco || "",
        d.fecha || "",
        horoDecimal,
        typeof d.litros === "number" ? d.litros : (parseFloat(d.litros) || ""),
        d.tipoCombustible || "",
        d.ticket || ""
      ]);
    });

    const ws = window.XLSX.utils.aoa_to_sheet(filas);

    ws["!cols"] = [
      { wch: 18 }, // # Economico
      { wch: 14 }, // Fecha Carga
      { wch: 18 }, // Horometro Inicial
      { wch: 14 }, // Carga (Litros)
      { wch: 12 }, // Combustible
      { wch: 14 }, // Ticket
    ];

    // Encabezados en negrita
    const rangoEncabezado = window.XLSX.utils.decode_range(ws["!ref"]);
    for (let c = rangoEncabezado.s.c; c <= rangoEncabezado.e.c; c++) {
      const celda = ws[window.XLSX.utils.encode_cell({ r: 0, c })];
      if (celda) celda.s = { font: { bold: true } };
    }

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Registros");

    window.XLSX.writeFile(wb, `FuelControl_Export_${new Date().toISOString().split("T")[0]}.xlsx`);

    hideLoading();
  } catch (e) {
    hideLoading();
    alert("Error al exportar: " + e.message);
  }
}

/* --- GENERAR PDF MAESTRO CON 3 FOTOS Y RENDIMIENTO --- */
async function generateTicketPDF(record) {
  if (!window.jspdf) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = res; document.head.appendChild(s);
    });
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "in", format: "letter" });

  const pageW = 8.5, pageH = 11, margin = 0.4;
  const contentW = pageW - margin * 2;

  const headerH = 1.4;
  doc.setFillColor(28, 33, 40); doc.rect(0, 0, pageW, headerH, "F");
  doc.setTextColor(232, 98, 10); doc.setFontSize(15); doc.setFont("helvetica", "bold");
  doc.text("FuelControl — Evidencia de Carga", margin, 0.35);

  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(200, 200, 200);
  doc.text(`ECO: ${record.eco}   |   Maquinaria: ${record.maquinaria}`, margin, 0.62);
  doc.text(`Ticket: ${record.ticket}   |   Fecha: ${record.fecha}`, margin, 0.82);

  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
  doc.text(`Carga: ${record.litros} L   |   Rendimiento: ${record.rendimiento} L/h`, margin, 1.08);

  const gap = 0.2;
  const halfW = (contentW - gap) / 2;
  const maxHTop = 4.6;
  let y = headerH + 0.35;

  const fotosTop = [
    { label: "Bomba (Inicial)", data: record.fotoInicial, x: margin },
    { label: "Bomba (Final)",   data: record.fotoFinal,   x: margin + halfW + gap }
  ];

  // Si existe foto del horómetro, la añadimos como fila completa antes del ticket
  const tieneHoroFoto = !!record.fotoHorometro;

  // Placeholder reutilizable para cuando una foto no existe (registro viejo,
  // pendiente sin cerrar, error de carga, etc.) — así el PDF nunca truena.
  function dibujarPlaceholder(x, yPos, w, h, texto) {
    doc.setDrawColor(210, 210, 210);
    doc.setFillColor(245, 245, 245);
    doc.rect(x, yPos, w, h, "FD");
    doc.setTextColor(150, 150, 150); doc.setFontSize(9); doc.setFont("helvetica", "italic");
    doc.text(texto, x + w / 2, yPos + h / 2, { align: "center" });
  }

  let maxBottomY = y;
  fotosTop.forEach(f => {
    doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(f.label, f.x, y - 0.06);

    if (!f.data) {
      const hPlaceholder = 2.2;
      dibujarPlaceholder(f.x, y, halfW, hPlaceholder, "Foto no disponible");
      maxBottomY = Math.max(maxBottomY, y + hPlaceholder);
      return;
    }

    let props;
    try { props = doc.getImageProperties(f.data); }
    catch (err) {
      const hPlaceholder = 2.2;
      dibujarPlaceholder(f.x, y, halfW, hPlaceholder, "Foto inválida o corrupta");
      maxBottomY = Math.max(maxBottomY, y + hPlaceholder);
      return;
    }

    let w = halfW, h = (props.height * w) / props.width;
    if (h > maxHTop) { h = maxHTop; w = (props.width * h) / props.height; }

    doc.addImage(f.data, "JPEG", f.x, y, w, h);
    maxBottomY = Math.max(maxBottomY, y + h);
  });

  let yDespuesFotos = maxBottomY + 0.4;

  // --- FOTO HORÓMETRO (fila completa, debajo de las fotos de bomba) ---
  if (tieneHoroFoto) {
    doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text("Horómetro", margin, yDespuesFotos - 0.06);

    let horoProps;
    try { horoProps = doc.getImageProperties(record.fotoHorometro); } catch(e) { horoProps = null; }

    if (horoProps) {
      const maxHHoro = 2.8;
      let hw = contentW * 0.55, hh = (horoProps.height * hw) / horoProps.width;
      if (hh > maxHHoro) { hh = maxHHoro; hw = (horoProps.width * hh) / horoProps.height; }
      const hx = margin + (contentW - hw) / 2;
      doc.addImage(record.fotoHorometro, "JPEG", hx, yDespuesFotos, hw, hh);
      yDespuesFotos = yDespuesFotos + hh + 0.4;
    } else {
      dibujarPlaceholder(margin, yDespuesFotos, contentW, 1.2, "Foto de horómetro inválida");
      yDespuesFotos = yDespuesFotos + 1.2 + 0.4;
    }
  }

  const yTicket = yDespuesFotos;
  doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text("Ticket de Carga", margin, yTicket - 0.06);

  if (record.fotoTicket) {
    let props;
    try { props = doc.getImageProperties(record.fotoTicket); }
    catch (err) { props = null; }

    if (props) {
      const maxHTicket = pageH - margin - yTicket;
      let w = contentW, h = (props.height * w) / props.width;
      if (h > maxHTicket) { h = maxHTicket; w = (props.width * h) / props.height; }
      const xTicket = margin + (contentW - w) / 2;
      doc.addImage(record.fotoTicket, "JPEG", xTicket, yTicket, w, h);
    } else {
      dibujarPlaceholder(margin, yTicket, contentW, 1.5, "Foto de ticket inválida o corrupta");
    }
  } else {
    const texto = record.status === "pendiente" ? "Ticket aún pendiente de adjuntar" : "Foto de ticket no disponible";
    dibujarPlaceholder(margin, yTicket, contentW, 1.5, texto);
  }

  return doc;
}

function showLoading(msg="Procesando...") { document.getElementById("loading-text").textContent = msg; document.getElementById("loading-overlay").classList.remove("hidden"); }
function hideLoading() { document.getElementById("loading-overlay").classList.add("hidden"); }

// --- FUNCIÓN PARA RE-GENERAR Y DESCARGAR PDF DESDE LA SESIÓN MASTER ---
async function forceDownloadPDF(record) {
  if (!record) { alert("❌ No se encontró el registro para generar el PDF."); return; }
  try {
    showLoading("Generando PDF de respaldo...");

    // generateTicketPDF es async (puede tener que cargar jsPDF primero),
    // así que hay que esperarla. Antes esto regresaba una Promise en vez
    // del documento y pdfDoc.save() tronaba silenciosamente.
    const pdfDoc = await generateTicketPDF(record);

    const ecoSafe = (record.eco || "SIN-ECO").toString().replace(/[\\/:*?"<>|]/g, "-");
    const ticketSafe = (record.ticket && record.ticket !== "PENDIENTE")
      ? record.ticket.toString().replace(/[\\/:*?"<>|]/g, "-")
      : "SIN-TICKET";

    pdfDoc.save(`FuelControl_${ecoSafe}_${ticketSafe}.pdf`);

    hideLoading();
  } catch (error) {
    hideLoading();
    alert("❌ Error al generar el PDF: " + error.message);
  }
}

/* --- DESCARGAR PDF DESDE LAS LISTAS (Historial / Pendientes) ---
   Recupera el registro completo desde la caché que ya llenan loadHistory()
   y loadPendientes(), y dispara la descarga. Así el botón en cada tarjeta
   solo necesita pasar el id del documento, no todo el objeto. */
function descargarPDFDesdeCache(id) {
  const d = _getRegistroCache(id);
  if (!d) { alert("❌ No se encontró el registro en caché. Recarga la lista e intenta de nuevo."); return; }
  forceDownloadPDF(d);
}


/* EXPORTACIONES PARA EL HTML */
window.handleLogin = handleLogin;
window.handleLogout = handleLogout;
window.togglePassword = togglePassword;
window.switchTab = switchTab;
window.goStep = goStep;
window.autoCompletarEquipo = autoCompletarEquipo;
window.toggleHorometro = toggleHorometro;
window.toggleTicket = toggleTicket;
window.previewSurtidor = previewSurtidor;
window.aceptarSurtidor = aceptarSurtidor;
window.handleSubmit = handleSubmit;
window.abrirPendiente = abrirPendiente;
window.cerrarModalPendiente = cerrarModalPendiente;
window.guardarPendiente = guardarPendiente;
window.loadHistory = loadHistory;
window.exportExcel = exportExcel;
window.installApp = installApp;
window.autoCompletarEquipoEdit = autoCompletarEquipoEdit;
window.abrirEditar = abrirEditar;
window.cerrarModalEditar = cerrarModalEditar;
window.guardarEdicion = guardarEdicion;
window.conciliarRegistro = conciliarRegistro;
window.abrirUsuario = abrirUsuario;
window.cerrarModalUsuario = cerrarModalUsuario;
window.guardarUsuario = guardarUsuario;
window.forceDownloadPDF = forceDownloadPDF;
window.descargarPDFDesdeCache = descargarPDFDesdeCache;
window.loadPendientes = loadPendientes;
window.resetFormulario = resetFormulario;
window.sincronizarCola = sincronizarCola;
window.setHorometroMode = setHorometroMode;
