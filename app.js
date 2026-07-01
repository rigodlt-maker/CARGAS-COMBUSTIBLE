// =============================================
// app.js — FuelControl PWA (Actualizado con Login por Alias)
// =============================================

// NOTA IMPORTANTE: este es el único archivo que index.html realmente carga
// (<script type="module" src="app.js">). Los archivos auth.js, nav.js,
// cargas.js, historial.js, offline.js, pdf.js y state.js son una
// reescritura modular que quedó huérfana — index.html nunca los importa.
// roles.js SÍ se reutiliza aquí porque ya implementa correctamente la
// matriz de 5 roles. El resto de la migración a módulos separados se hará
// en un paso posterior, sin riesgo, una vez esté estable la app.

import * as Roles from "./roles.js";

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
   FOTOS EN CLOUD STORAGE (antes iban como base64 dentro del propio
   documento de Firestore — eso funcionaba pero pega contra el límite
   de ~1 MiB por documento y hace los documentos pesados de leer).
   Ahora cada foto se sube a Storage y en Firestore solo se guarda la
   URL de descarga. Se mantiene compatibilidad con registros viejos
   que ya tengan base64 guardado (urlADataURL los detecta y los deja tal cual).
───────────────────────────────────────────────────────────────── */
function esFotoBase64(v) {
  return typeof v === "string" && v.startsWith("data:");
}

function rutaSegura(s) {
  return (s || "SIN-DATO").toString().replace(/[^a-zA-Z0-9_-]/g, "-");
}

// Sube UNA foto (data URL) a Storage y devuelve su URL de descarga.
// Si no hay dato (null/undefined) regresa null sin tocar la red.
async function subirFotoAStorage(dataUrl, carpeta, nombreArchivo) {
  if (!esFotoBase64(dataUrl)) return dataUrl ?? null; // ya es URL o está vacío
  const path = `${carpeta}/${nombreArchivo}_${Date.now()}.jpg`;
  const sref = window.fbStorageRef(window.firebaseStorage, path);
  await window.fbUploadString(sref, dataUrl, "data_url");
  return await window.fbGetDownloadURL(sref);
}

// Sube las 4 fotos de un registro de Carga (las que vengan en base64) y
// devuelve un NUEVO objeto record con esos campos ya como URL de Storage.
// No muta el record original (así el llamador puede seguir usando la
// versión base64 para generar el PDF al instante, sin esperar la red).
async function subirFotosDeRegistro(record) {
  const carpeta = `registros/${rutaSegura(record.fecha)}/${rutaSegura(record.eco)}`;
  const out = { ...record };
  out.fotoInicial   = await subirFotoAStorage(record.fotoInicial,   carpeta, "inicial");
  out.fotoFinal     = await subirFotoAStorage(record.fotoFinal,     carpeta, "final");
  out.fotoTicket    = await subirFotoAStorage(record.fotoTicket,    carpeta, "ticket");
  out.fotoHorometro = await subirFotoAStorage(record.fotoHorometro, carpeta, "horometro");
  return out;
}

/* ─────────────────────────────────────────────────────────────────
   DOCUMENTOS DE MAQUINARIA EN STORAGE (punto 7.2)
   Ruta: maquinaria/{eco}/documentos/{tipo}.pdf — nombre fijo por tipo
   (cada subida nueva sobreescribe la anterior, así siempre se ve/baja
   la versión vigente). Coincide con storage.rules: solo Admin,
   Coordinador y Master pueden escribir ahí; límite 8 MB por archivo.
───────────────────────────────────────────────────────────────── */
function leerArchivoComoDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No se pudo leer el archivo."));
    reader.readAsDataURL(file);
  });
}

// Convierte el valor guardado de un documento (puede ser un booleano
// viejo, undefined, o ya el objeto nuevo) a la forma estándar
// { tiene, url, path, vencimiento, subidoEn, subidoPor }. Así el resto
// del código no necesita preocuparse por datos antiguos.
function normalizarDocumento(valor) {
  if (valor && typeof valor === "object") {
    return {
      tiene: !!valor.tiene,
      url: valor.url || null,
      path: valor.path || null,
      vencimiento: valor.vencimiento || null,
      subidoEn: valor.subidoEn || null,
      subidoPor: valor.subidoPor || null,
    };
  }
  // Compatibilidad con datos viejos donde documentos.X era solo true/false.
  return { tiene: !!valor, url: null, path: null, vencimiento: null, subidoEn: null, subidoPor: null };
}

// Sube un PDF de documento de maquinaria a Storage y devuelve {url, path}.
async function subirDocumentoMaquinaria(file, eco, idSufijo) {
  if (file.type !== "application/pdf") throw new Error("El archivo debe ser un PDF.");
  if (file.size >= 8 * 1024 * 1024) throw new Error("El PDF no debe pesar 8 MB o más.");
  const dataUrl = await leerArchivoComoDataURL(file);
  const path = `maquinaria/${rutaSegura(eco)}/documentos/${idSufijo}.pdf`;
  const sref = window.fbStorageRef(window.firebaseStorage, path);
  await window.fbUploadString(sref, dataUrl, "data_url");
  const url = await window.fbGetDownloadURL(sref);
  return { url, path };
}

// Calcula el estado de vigencia de un documento ya normalizado:
// 'faltante' | 'vencido' | 'porVencer' | 'vigente' | 'sinVencimiento'.
function estadoDocumento(docNorm) {
  if (!docNorm.tiene && !docNorm.url) return "faltante";
  if (!docNorm.vencimiento) return "sinVencimiento";
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const venc = new Date(docNorm.vencimiento + "T00:00:00");
  const diasRestantes = Math.round((venc - hoy) / 86400000);
  if (diasRestantes < 0) return "vencido";
  if (diasRestantes <= DIAS_AVISO_VENCIMIENTO) return "porVencer";
  return "vigente";
}

const ESTADO_DOC_INFO = {
  faltante:       { texto: doc => doc === "permiso" ? "Sin permiso" : "Falta",  color: "var(--text-dim)" },
  vencido:        { texto: () => "Vencido",                                     color: "var(--red)" },
  porVencer:      { texto: () => "Por vencer",                                  color: "var(--orange)" },
  vigente:        { texto: () => "Vigente",                                     color: "var(--green)" },
  sinVencimiento: { texto: () => "Cargado",                                     color: "var(--green)" },
};

// Convierte cualquier campo de foto (URL de Storage o base64 viejo) a un
// data URL utilizable por jsPDF (doc.addImage). Si ya es base64 lo regresa
// tal cual (registros antiguos); si es una URL, la descarga y la convierte.
async function urlADataURL(valor) {
  if (!valor) return null;
  if (esFotoBase64(valor)) return valor;
  try {
    const resp = await fetch(valor);
    const blob = await resp.blob();
    return await new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onloadend = () => res(reader.result);
      reader.onerror = () => rej(new Error("No se pudo leer la foto descargada."));
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.error("urlADataURL: no se pudo descargar la foto desde Storage:", e);
    return null;
  }
}

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

      // Las fotos se guardaron en base64 en IndexedDB (no había internet
      // para subirlas a Storage en su momento). Ahora que sí hay
      // conexión, las subimos y dejamos las URLs en el registro final.
      const recordConFotosEnStorage = await subirFotosDeRegistro(record);

      const docRef = window.fbDoc(window.fbCollection(window.firebaseDB, "registros"));
      await window.fbSetDoc(docRef, recordConFotosEnStorage);
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
  const { initializeApp, deleteApp } = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js");
  const { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, createUserWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js");
  const { getFirestore, collection, addDoc, getDocs, getDoc, query, where, orderBy, Timestamp, limit, doc, updateDoc, setDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js");
  const { getFunctions, httpsCallable } = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-functions.js");
  const { getStorage, ref, uploadString, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-storage.js");

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
  window.fbDeleteDoc  = deleteDoc;

  // --- Cloud Storage (fotos de Cargas/Proveedor y, a futuro, PDFs de Maquinaria) ---
  window.firebaseStorage  = getStorage(app);
  window.fbStorageRef     = ref;
  window.fbUploadString   = uploadString;
  window.fbGetDownloadURL = getDownloadURL;

  // --- Funciones invocables (Cloud Functions con Admin SDK) ---
  // Se usan para operaciones que el SDK de cliente NO puede hacer sobre
  // OTRO usuario (resetear contraseña de alguien más) sin desloguear a
  // quien la está ejecutando. Requiere desplegar functions/index.js
  // (ver función "resetUserPassword" agregada ahí).
  const functions = getFunctions(app);
  window.fbResetUserPassword = httpsCallable(functions, "resetUserPassword");

  // --- Crear usuario nuevo asignándole contraseña directamente (punto 2.1) ---
  // Truco estándar de Firebase: se crea una SEGUNDA app/instancia de Auth
  // SOLO para dar de alta al nuevo usuario, así NO se cierra la sesión de
  // quien está creando el usuario (Admin/Master) en la app principal.
  window.fbCrearUsuarioConPassword = async (email, password) => {
    const secondaryApp = initializeApp(firebaseConfig, "secondary-" + Date.now());
    const secondaryAuth = getAuth(secondaryApp);
    try {
      const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
      return cred.user.uid;
    } finally {
      await signOut(secondaryAuth).catch(() => {});
      await deleteApp(secondaryApp).catch(() => {});
    }
  };

  initAuth();
}

/* --- VARIABLES GLOBALES --- */
let currentUser = null;
let currentStep = 1;
let isAdmin = false;   // true si el rol puede editar registros NO conciliados (Coordinador/Admin/Master)
let isMaster = false;  // true solo si el rol puede conciliar y editar YA conciliado (Master)
let currentRol = null; // 'master' | 'admin' | 'coordinador' | 'residente' | 'visor'

let dataFotos = { ini: null, fin: null, ticket: null, pend: null, horo: null };
let estadoFotos = { ini: false, fin: false, ticket: false, pend: false, horo: false };

// Antes esta lista venía hardcodeada a mano (31 máquinas fijas). Ahora se
// llena dinámicamente desde la colección "maquinaria" de Firestore (ver
// cargarCatalogoEquiposDesdeFirestore más abajo), así que cualquier máquina
// que se agregue desde el panel de Maquinaria aparece automáticamente aquí
// sin tener que tocar código.
let catalogoEquipos = [];

/* --- ZONAS / SUBZONAS Y CATÁLOGO BASE DE TIPOS Y MARCAS (punto 7.1) --- */
const ZONAS_SUBZONAS = {
  "Banco de Materiales": ["Mozomboa Gami", "Mozomboa Lerma", "Mozomboa Porfirio", "Tritura", "El Tajo", "Las Palmas"],
  "Obra": ["Rompeolas", "Acopio Marino", "Acopio Terrestre", "Core Locs"],
};
const TIPOS_MAQUINARIA = [
  "Camión articulado", "Tractor de orugas", "Excavadora", "Retroexcavadora",
  "Vibrocompactador", "Motoconformadora", "Grúa", "Cargador frontal", "Otro",
];
const MARCAS_MAQUINARIA = [
  "Komatsu", "Caterpillar", "Hyundai", "Sany", "Linkbelt", "John Deere", "JCB", "Otro",
];

// --- DOCUMENTOS DE MAQUINARIA (punto 7.2) ---
// idSufijo = sufijo usado en los ids del HTML (maq-doc-{idSufijo}...), ya
// existía "tarjeta" como sufijo histórico aunque el campo en Firestore es
// "tarjetaCirculacion" — se respeta para no romper datos/ids existentes.
const DOCUMENTOS_TIPOS = [
  { campo: "permiso",            idSufijo: "permiso", label: "Permiso" },
  { campo: "factura",            idSufijo: "factura", label: "Factura" },
  { campo: "dc3",                idSufijo: "dc3",      label: "DC3" },
  { campo: "tarjetaCirculacion", idSufijo: "tarjeta",  label: "Tarjeta de circulación" },
  { campo: "poliza",             idSufijo: "poliza",   label: "Póliza" },
];
// Días de anticipación para marcar un documento como "por vencer" (Andon visual).
const DIAS_AVISO_VENCIMIENTO = 30;

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
// Compatibilidad: si en Firestore quedó algún usuario con el rol viejo
// ("capturista" / "operador"), lo tratamos como "residente".
function normalizarRol(rolCrudo) {
  if (rolCrudo === "capturista" || rolCrudo === "operador") return Roles.ROLES.RESIDENTE;
  if (Object.values(Roles.ROLES).includes(rolCrudo)) return rolCrudo;
  return Roles.ROLES.RESIDENTE;
}

function initAuth() {
  window.fbAuthChanged(window.firebaseAuth, async (user) => {
    if (user) {
      const authData = await checkWhitelist(user.email);
      if (!authData.allowed) {
        showLoginError(authData.pendiente
          ? "Tu usuario fue creado pero está pendiente de validación del Master."
          : "Usuario no autorizado o inactivo.");
        await window.fbSignOut(window.firebaseAuth);
        return;
      }
      currentUser = user;
      currentRol  = authData.rol;

      // Mostrar solo el alias en la barra superior
      let displayUser = user.email;
      if(displayUser.endsWith("@grupoindi.com")) {
        displayUser = displayUser.replace("@grupoindi.com", "");
      }
      document.getElementById("header-user").textContent =
        `${displayUser} · ${Roles.ETIQUETAS_ROL[currentRol] || currentRol}`;

      // Gates generales reutilizados en el resto del código (historial/conciliación)
      isAdmin  = Roles.puedeEditarNoConciliado(currentRol);
      isMaster = Roles.puedeConciliar(currentRol);

      // Mostrar/ocultar TODAS las pestañas según la matriz central de roles.js,
      // en vez de ir prendiendo una por una como antes.
      const visibles = Roles.tabsVisibles(currentRol);
      ["cargas","pendientes","historial","usuarios","proveedor","maquinaria","permisos","graficos","resumen"]
        .forEach(tab => {
          document.getElementById(`tab-${tab}`)?.classList.toggle("hidden", !visibles.includes(tab));
        });

      // Pestaña inicial: la primera que el rol tenga permitida.
      switchTab(visibles[0] || "cargas");

      // Refrescar el catálogo de equipos (selects de Cargas/Editar) desde
      // la colección real "maquinaria" de Firestore, ya con sesión iniciada
      // (antes era una lista fija a mano en el código).
      cargarCatalogoEquiposDesdeFirestore();

      showScreen("app");
      // Intentar sincronizar registros offline que quedaron pendientes
      actualizarBannerConexion();
      setTimeout(sincronizarCola, 1500); // pequeño delay para que Firebase esté listo
    } else {
      currentUser = null; currentRol = null; showScreen("login");
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
    const rol = normalizarRol(data.rol);
    const usuario = { activo: data.activo, validado: data.validado, rol };
    if (!Roles.usuarioPuedeOperar(usuario)) {
      return { allowed: false, pendiente: data.activo !== false && data.validado === false };
    }
    return { allowed: true, rol };
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
function switchTab(name, desdePopstate = false) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.id === `tab-${name}`));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === `content-${name}`));
  if (name === "historial") loadHistory();
  if (name === "pendientes") loadPendientes();
  if (name === "usuarios" && Roles.puedeVerPanelUsuarios(currentRol)) loadUsuarios();
  if (name === "proveedor" && Roles.puedeVerProveedor(currentRol)) loadProveedor();
  if (name === "maquinaria" && Roles.puedeVerMaquinaria(currentRol)) loadMaquinaria();
  if (name === "permisos" && Roles.puedeVerPermisos(currentRol)) loadPermisos();
  if (name === "resumen" && Roles.puedeVerResumen(currentRol)) loadResumen();
  if (name === "graficos" && Roles.puedeVerDashboardKPIs(currentRol)) loadDashboard();
  // Solo empujamos historial si NO venimos de Cargas→Cargas (evita
  // entradas duplicadas) y si el cambio fue un click real, no un popstate.
  if (!desdePopstate && name !== "cargas") navPush(`tab-${name}`);
}

/* ─────────────────────────────────────────────────────────────────
   NAVEGACIÓN "ATRÁS" DEL SISTEMA (gesto / botón físico del celular)
   ─────────────────────────────────────────────────────────────────
   Por defecto, una PWA de una sola página no tiene "páginas" que el
   navegador pueda recorrer: el botón/gesto "atrás" del teléfono no
   encuentra historial y termina cerrando la app completa.

   Para evitarlo, cada vez que el usuario entra a un "nivel" navegable
   (un paso del formulario, un modal abierto) empujamos una entrada al
   historial del navegador con history.pushState(). Así, el botón
   "atrás" del sistema dispara un evento popstate que interceptamos
   aquí para cerrar/retroceder SOLO ese nivel, sin salir de la app.
   Si no hay ningún nivel especial abierto, dejamos que el navegador
   haga lo que corresponda (normalmente, salir de la app/pestaña).
───────────────────────────────────────────────────────────────── */
function navPush(nivel) {
  history.pushState({ fuelControlNivel: nivel }, "");
}

// BUG REAL (punto C de observaciones, "se reinicia al dar Cancelar"):
// cerrarModalX(false) primero OCULTA el modal y LUEGO llama a
// history.back() solo para "consumir" la entrada que se había
// empujado al abrirlo. Pero el evento popstate que dispara ese
// history.back() se procesa cuando el modal YA está oculto, así que el
// listener de abajo nunca lo encontraba en su lista de "modales
// abiertos" y caía al siguiente caso (volver a la pestaña Cargas) sin
// importar en qué pestaña/modal estuviera el usuario. Esta bandera le
// avisa al listener "este popstate lo disparé yo mismo al cerrar un
// modal por botón, ignóralo por completo" para que no haga nada más.
let popstateAutoDisparado = false;
function consumirHistorialDeModal() {
  popstateAutoDisparado = true;
  history.back();
}

window.addEventListener("popstate", (e) => {
  if (popstateAutoDisparado) { popstateAutoDisparado = false; return; }

  // ¿Hay un modal abierto? Ciérralo y no hagas nada más.
  const modalesAbiertos = ["modal-pendiente", "modal-editar", "modal-usuario", "modal-proveedor", "modal-maquinaria"]
    .filter(id => !document.getElementById(id)?.classList.contains("hidden"));

  if (modalesAbiertos.length > 0) {
    modalesAbiertos.forEach(id => {
      if (id === "modal-pendiente") cerrarModalPendiente(true);
      if (id === "modal-editar") cerrarModalEditar(true);
      if (id === "modal-usuario") cerrarModalUsuario(true);
      if (id === "modal-proveedor") cerrarModalProveedor(true);
      if (id === "modal-maquinaria") cerrarModalMaquinaria(true);
    });
    return;
  }

  // ¿Estamos en el formulario de Registro y no es el paso 1? Retrocede un paso.
  const enRegistro = document.getElementById("content-cargas")?.classList.contains("active");
  if (enRegistro && currentStep > 1) {
    goStep(currentStep - 1, /*desdePopstate*/ true);
    return;
  }

  // ¿Estamos en otra pestaña que no sea Cargas? Vuelve a Cargas.
  const tabActiva = document.querySelector(".tab-btn.active")?.id;
  if (tabActiva && tabActiva !== "tab-cargas") {
    switchTab("cargas", true);
    return;
  }

  // En cualquier otro caso (ya estamos en Registro paso 1, o en login),
  // no interceptamos: dejamos que el sistema haga lo que corresponda
  // (normalmente, minimizar/cerrar la app), que es el comportamiento
  // esperado cuando ya no queda "a dónde regresar" dentro de la app.
});

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
function goStep(n, desdePopstate = false) {
  if (n > currentStep && !validateStep(currentStep)) return;
  // Si el cambio de paso vino de un avance normal (no del botón "atrás"
  // del sistema), empujamos una entrada al historial para que luego el
  // gesto/botón "atrás" pueda deshacer este avance.
  if (!desdePopstate) navPush(`paso-${n}`);
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
    if(!tipo) { alert("Selecciona el tipo de combustible (Diésel, Magna o Premium)"); return false; }
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
//
// FIX IMPORTANTE: antes esta consulta combinaba where("eco","==",...) con
// orderBy("horometroRaw","desc"), lo cual EXIGE un índice compuesto en
// Firestore. Si ese índice no existía (o aún no terminaba de construirse),
// Firestore lanzaba un error que el catch() de abajo convertía en "N/A"
// SIN avisar nada — el rendimiento se veía simplemente como si no hubiera
// registro anterior, aunque sí existiera. Para no depender de ese índice,
// ahora solo filtramos por "eco" en Firestore y ordenamos por horómetro
// en el cliente (son máximos 30 documentos, así que es barato).
async function getRendimiento(ecoActual, horoRawActual, litrosActuales, excludeDocId = null) {
  // Sin horómetro actual no se puede calcular diferencia de horas
  if (!horoRawActual) return "N/A";
  try {
    const col = window.fbCollection(window.firebaseDB, "registros");
    const q = window.fbQuery(
      col,
      window.fbWhere("eco", "==", ecoActual),
      window.fbLimit(30)
    );
    const snap = await window.fbGetDocs(q);
    if (snap.empty) return "Primer Registro";

    // Convertir horómetro "corrido" a horas decimales.
    // Formato: XXXX.N — los dígitos antes del punto YA son horas completas,
    // y el dígito después del punto son décimas de hora (cada una = 6 min).
    // Es decir, el valor "crudo" YA ES horas decimales tal cual (3421.6 =
    // 3421h 36min = 3421.6 horas decimales); no hace falta ningún ajuste.
    //
    // BUG CORREGIDO: la versión anterior hacía
    //   Math.floor(raw / 10) + (raw % 10) / 10
    // lo cual RECORRÍA el número una posición decimal (dividía todo entre
    // ~10), así que 3421.6 se convertía en 342.16 en vez de 3421.6. Eso
    // dejaba "horasTrabajadas" ~10 veces menor a la real, lo que a su vez
    // disparaba rendimientos (litros/hora) ~10 veces MÁS ALTOS de lo real
    // y hacía que las Alertas Andon por consumo estimado casi siempre
    // fallaran de forma incorrecta.
    function horoADecimal(raw) {
      return parseFloat(raw);
    }

    const horoActualDec = horoADecimal(horoRawActual);

    // Ordenamos los registros del mismo ECO por horómetro descendente
    // (el más alto = el más reciente), igual que antes hacía Firestore.
    const docsOrdenados = snap.docs
      .filter(d => d.data().horometroRaw)
      .sort((a, b) => b.data().horometroRaw - a.data().horometroRaw);

    // Buscamos el registro anterior más reciente del mismo ECO
    // que tenga horómetro válido y sea distinto al que estamos editando
    for (const docSnap of docsOrdenados) {
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
    // FIX: antes este error se tragaba en silencio devolviendo "N/A".
    // Ahora lo dejamos en consola Y en alert (temporal, para diagnóstico)
    // porque en celular casi nadie revisa la consola del navegador.
    console.error("getRendimiento error:", e);
    alert("⚠️ DIAGNÓSTICO RENDIMIENTO — Firestore devolvió un error al buscar el registro anterior:\n\n" + (e.code || "") + " " + e.message + "\n\nPor eso se está mostrando N/A. Avisa a soporte con este mensaje exacto.");
    return "N/A";
  }
}

/* --- ALERTAS ANDON (punto 9) ---
   Dos validaciones independientes, ninguna BLOQUEA el guardado: solo
   advierten y, si el usuario decide continuar, la inconsistencia queda
   impresa como leyenda en el PDF de esa carga (ver generateTicketPDF).

   1) Capacidad del tanque: la carga no puede ser mayor que capacidadTanque
      del catálogo de esa máquina.
   2) Remanente estimado por horómetro: a partir del registro anterior del
      mismo # ECO, calculamos cuántas horas trabajó la máquina desde esa
      carga (horómetro actual − horómetro anterior) y, usando su consumo
      promedio (lt/hr) del catálogo, estimamos cuánto combustible debió
      haber consumido. Si la carga actual es mayor a lo que cabría según
      ese remanente estimado, se marca como sospechosa. */
async function obtenerHorasTrabajadasPrevias(eco, horoRawActual, excludeDocId = null) {
  if (!horoRawActual) return null;
  try {
    const col = window.fbCollection(window.firebaseDB, "registros");
    const q = window.fbQuery(col, window.fbWhere("eco", "==", eco), window.fbLimit(30));
    const snap = await window.fbGetDocs(q);
    if (snap.empty) return null;

    // Mismo cálculo que en getRendimiento() — ver el comentario ahí sobre
    // el bug corregido (antes dividía el horómetro entre ~10 por error).
    function horoADecimal(raw) { return parseFloat(raw); }
    const horoActualDec = horoADecimal(horoRawActual);

    const docsOrdenados = snap.docs
      .filter(d => d.data().horometroRaw)
      .sort((a, b) => b.data().horometroRaw - a.data().horometroRaw);

    for (const docSnap of docsOrdenados) {
      if (excludeDocId && docSnap.id === excludeDocId) continue;
      const prev = docSnap.data();
      if (!prev.horometroRaw) continue;
      const horasTrabajadas = horoActualDec - horoADecimal(prev.horometroRaw);
      if (horasTrabajadas <= 0) continue;
      return horasTrabajadas;
    }
    return null;
  } catch (e) {
    console.error("obtenerHorasTrabajadasPrevias error:", e);
    return null;
  }
}

// Tolerancia para no disparar falsas alarmas por estimaciones (consumo
// promedio y horómetro nunca son exactos al 100%).
const ANDON_TOLERANCIA = 1.10; // 10% de margen

async function verificarAlertasAndon(eco, litros, horoRawActual, excludeDocId = null) {
  const alertas = [];
  const cat = catalogoEquipos.find(e => e.interno === eco);
  if (!cat || !litros) return alertas;

  // 1) Capacidad total del tanque
  if (cat.capacidadTanque && litros > cat.capacidadTanque) {
    alertas.push(
      `La carga (${litros} L) excede la capacidad total del tanque registrada para esta máquina (${cat.capacidadTanque} L).`
    );
  }

  // 2) Remanente estimado según horómetro + consumo promedio del catálogo
  if (cat.capacidadTanque && cat.consumoPromedio && horoRawActual) {
    const horasTrabajadas = await obtenerHorasTrabajadasPrevias(eco, horoRawActual, excludeDocId);
    if (horasTrabajadas !== null) {
      const consumoEstimado = horasTrabajadas * cat.consumoPromedio;
      const remanenteEstimado = Math.max(0, cat.capacidadTanque - consumoEstimado);
      const espacioDisponible = cat.capacidadTanque - remanenteEstimado; // = consumoEstimado, topado a la capacidad
      if (litros > espacioDisponible * ANDON_TOLERANCIA) {
        alertas.push(
          `Según el horómetro (${horasTrabajadas.toFixed(1)} h trabajadas desde la última carga × ${cat.consumoPromedio} L/h de consumo promedio), ` +
          `a esta máquina le quedaban aprox. ${remanenteEstimado.toFixed(1)} L en el tanque. ` +
          `La carga de ${litros} L excede lo esperado (máx. estimado ~${espacioDisponible.toFixed(1)} L).`
        );
      }
    }
  }

  return alertas;
}

/* --- RESET DEL FORMULARIO (reemplaza location.reload para no cerrar sesión) --- */
function resetFormulario() {
  // Limpiar estado de fotos
  dataFotos   = { ini: null, fin: null, ticket: null, pend: null, horo: null };
  estadoFotos = { ini: false, fin: false, ticket: false, pend: false, horo: false };
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
  const sinHoroCheck = document.getElementById("chk-sin-horometro").checked;
  const isPendienteCheck = document.getElementById("chk-ticket-despues").checked;

  // FIX: esta validación existía en el código (validarTamanoFotos) pero
  // nunca se llamaba. Sin ella, un registro con fotos pesadas (poca luz,
  // mucho detalle) podía fallar al guardarse en Firestore (límite ~1 MiB)
  // con un error genérico y confuso para el operador, en vez de avisarle
  // ANTES de intentar guardar para que repita alguna foto más comprimida.
  const fotosAValidar = [dataFotos.ini, dataFotos.fin];
  if (!isPendienteCheck) fotosAValidar.push(dataFotos.ticket);
  if (!sinHoroCheck) fotosAValidar.push(dataFotos.horo);

  const chequeoTamano = validarTamanoFotos(...fotosAValidar);
  if (!chequeoTamano.ok) {
    alert(
      `❌ Las fotos de este registro pesan demasiado (${chequeoTamano.totalKB} KB).\n\n` +
      `Por favor vuelve a tomar alguna de las fotos con menos zoom/detalle ` +
      `y vuelve a intentar guardar.`
    );
    return;
  }

  // --- ALERTAS ANDON (punto 9): se revisan ANTES de mostrar el overlay de
  // "Guardando..." para que el confirm() del navegador no quede oculto
  // detrás del loading. No bloquean el guardado, solo advierten.
  const ecoParaAndon = document.getElementById("f-eco").value;
  const horoRawParaAndon = document.getElementById("chk-sin-horometro").checked
    ? null
    : parseFloat(document.getElementById("f-horometro").value);
  const litrosParaAndon = parseFloat(document.getElementById("f-litros").value);

  const alertasAndon = await verificarAlertasAndon(ecoParaAndon, litrosParaAndon, horoRawParaAndon);
  if (alertasAndon.length) {
    const mensaje =
      "⚠️ ALERTA ANDON — esta carga parece tener una inconsistencia:\n\n" +
      alertasAndon.map(a => "• " + a).join("\n\n") +
      "\n\n¿Estás seguro de que quieres guardar esta carga tal como está?\n" +
      "(Se guardará de todas formas y la inconsistencia quedará impresa en el PDF.)";
    if (!confirm(mensaje)) return;
  }

  showLoading("Guardando en base de datos...");
  try {
    const eco = document.getElementById("f-eco").value;
    const sinHoro = sinHoroCheck;
    const horoRaw = sinHoro ? null : parseFloat(document.getElementById("f-horometro").value);
    const litros = parseFloat(document.getElementById("f-litros").value);
    const isPendiente = isPendienteCheck;

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
      creadoEn: window.fbTimestamp.now(),
      tipoCombustible: document.querySelector('input[name="tipo-combustible"]:checked')?.value || "",
      andonAlertas: alertasAndon, // [] si no hubo inconsistencias, o lista de leyendas a imprimir
    };

    // 1. SUBIR FOTOS A STORAGE (si hay internet). El PDF se genera siempre
    // con las fotos en base64 que ya tenemos en memoria (record), así que
    // no depende de la velocidad de la subida ni de volver a descargarlas.
    let recordParaGuardar;
    try {
      if (!navigator.onLine) throw new Error("Sin conexión");
      recordParaGuardar = await subirFotosDeRegistro(record);
    } catch (uploadErr) {
      // Sin internet o falló la subida de alguna foto — todo se va a la
      // cola offline CON las fotos en base64; se subirán a Storage solas
      // cuando vuelva la conexión (ver sincronizarCola).
      await guardarEnCola(record);
      actualizarBannerConexion();

      if (!isPendiente) {
        try {
          const pdfOffline = await generateTicketPDF(record);
          pdfOffline.save(`FuelControl_${eco}_${record.ticket}.pdf`);
        } catch (pdfErr) {
          console.error("No se pudo generar el PDF en modo offline:", pdfErr);
        }
      }

      hideLoading();
      alert("📵 Sin conexión (o no se pudieron subir las fotos) — el registro se guardó localmente y se sincronizará solo cuando vuelva internet.");
      resetFormulario();
      switchTab("historial");
      return;
    }

    // 2. GUARDAR EN FIRESTORE (ya con las URLs de Storage en vez de base64)
    try {
      await window.fbSetDoc(docRef, recordParaGuardar);
    } catch (firebaseErr) {
      // Las fotos YA se subieron a Storage; si aquí falla (se cayó la
      // conexión justo en este instante), mandamos el registro —ya con
      // URLs— a la cola offline. sincronizarCola no las vuelve a subir
      // porque ya no son base64.
      await guardarEnCola(recordParaGuardar);
      actualizarBannerConexion();
      hideLoading();
      alert("📵 Las fotos se subieron pero no se pudo guardar el registro — se guardó localmente y se reintentará solo cuando vuelva internet.");
      resetFormulario();
      switchTab("historial");
      return;
    }

    // 3. SOLO SI FIREBASE GUARDÓ CON ÉXITO, GENERAMOS EL PDF (con las fotos
    // en base64 que ya teníamos en memoria, sin tener que descargarlas de Storage)
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
  navPush("modal-pendiente");
}

function cerrarModalPendiente(desdePopstate = false) {
  document.getElementById("modal-pendiente").classList.add("hidden");
  if (!desdePopstate) consumirHistorialDeModal();
}

function refrescarListaActual() {
  if (document.getElementById("content-historial").classList.contains("active")) loadHistory();
  if (isAdmin && document.getElementById("content-pendientes").classList.contains("active")) loadPendientes();
}

async function guardarPendiente() {
  const ticketVal = document.getElementById("pend-ticket-input").value.trim();
  if(!ticketVal) return alert("Ingresa el número de ticket definitivo.");
  if(!estadoFotos.pend) return alert("❌ Debes tomar y CONFIRMAR la foto del Ticket.");

  // FIX: misma validación de tamaño que en handleSubmit, ya que aquí
  // también se sube una foto nueva (la del ticket que faltaba).
  const chequeoTamano = validarTamanoFotos(dataFotos.pend);
  if (!chequeoTamano.ok) {
    alert(
      `❌ La foto del ticket pesa demasiado (${chequeoTamano.totalKB} KB).\n\n` +
      `Vuelve a tomarla con menos zoom/detalle e intenta de nuevo.`
    );
    return;
  }

  showLoading("Cerrando registro y generando PDF...");
  try {
    const docRef = window.fbDoc(window.firebaseDB, "registros", docPendienteActual);
    const original = _getRegistroCache(docPendienteActual) || {};
    const fotoTicketUrl = await subirFotoAStorage(
      dataFotos.pend,
      `registros/${rutaSegura(original.fecha)}/${rutaSegura(original.eco)}`,
      "ticket"
    );
    await window.fbUpdateDoc(docRef, {
      ticket: ticketVal,
      fotoTicket: fotoTicketUrl,
      status: "completado"
    });

    const docSnap = await window.fbGetDoc(window.fbDoc(window.firebaseDB, "registros", docPendienteActual));
    const record = docSnap.data();

    // Para el PDF usamos la foto que ya tenemos en memoria (base64), no
    // hace falta volver a descargarla de Storage justo después de subirla.
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
  navPush("modal-editar");
}

function cerrarModalEditar(desdePopstate = false) {
  document.getElementById("modal-editar").classList.add("hidden");
  if (!desdePopstate) consumirHistorialDeModal();
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

/* --- PROVEEDOR (suministro diario de combustible) --- */
let provFotoData = null;
window._provCache = {};

function previewProveedorFoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    compressImageToTarget(e.target.result, 220 * 1024, (comprimida) => {
      provFotoData = comprimida;
      document.getElementById("prov-img-ticket").src = comprimida;
      document.getElementById("prov-preview-box").classList.remove("hidden");
      document.getElementById("prov-ok-ticket").classList.remove("hidden");
    });
  };
  reader.readAsDataURL(file);
}

async function loadProveedor() {
  if (!Roles.puedeVerProveedor(currentRol)) return;
  const list = document.getElementById("proveedor-list");
  const recBox = document.getElementById("prov-reconciliacion");
  const fechaInput = document.getElementById("prov-fecha");
  if (!fechaInput.value) fechaInput.value = new Date().toISOString().split("T")[0];
  const fecha = fechaInput.value;

  document.getElementById("btn-nuevo-proveedor")?.classList.toggle("hidden", !Roles.puedeSubirProveedor(currentRol));

  list.innerHTML = "Cargando...";
  recBox.innerHTML = "";
  try {
    const colProv = window.fbCollection(window.firebaseDB, "proveedor_cargas");
    const qProv = window.fbQuery(colProv, window.fbWhere("fecha", "==", fecha));
    const snapProv = await window.fbGetDocs(qProv);

    const colReg = window.fbCollection(window.firebaseDB, "registros");
    const qReg = window.fbQuery(colReg, window.fbWhere("fecha", "==", fecha));
    const snapReg = await window.fbGetDocs(qReg);

    // --- Conciliación POR TIPO DE COMBUSTIBLE (punto A) ---
    // El proveedor entrega Diésel, Magna o Premium por separado; las cargas
    // a máquinas ahora también capturan exactamente uno de esos 3 valores
    // (antes "Gasolina" era genérico), así que se pueden restar 1 a 1.
    const TIPOS = ["Diésel", "Magna", "Premium"];
    const porTipo = {};
    TIPOS.forEach(t => { porTipo[t] = { proveedor: 0, cargado: 0 }; });
    let otrosProveedor = 0, otrosCargado = 0; // registros viejos con tipo no reconocido

    window._provCache = {};
    const items = [];
    const ticketsDelDia = new Set();
    snapProv.forEach(docSnap => {
      const d = docSnap.data();
      window._provCache[docSnap.id] = d;
      const litros = Number(d.litros) || 0;
      if (porTipo[d.tipoCombustible]) porTipo[d.tipoCombustible].proveedor += litros;
      else otrosProveedor += litros;
      if (d.ticket) ticketsDelDia.add(d.ticket);
      items.push({ id: docSnap.id, ...d });
    });

    snapReg.forEach(docSnap => {
      const d = docSnap.data();
      const litros = Number(d.litros) || 0;
      if (porTipo[d.tipoCombustible]) porTipo[d.tipoCombustible].cargado += litros;
      else otrosCargado += litros;
    });

    const filasTipo = TIPOS.map(t => {
      const { proveedor, cargado } = porTipo[t];
      const diferencia = Math.round((proveedor - cargado) * 100) / 100;
      const hayDescuadre = Math.abs(diferencia) > 0.5;
      if (proveedor === 0 && cargado === 0) return ""; // no mostrar tipos sin movimiento ese día
      return `<div style="display:flex; justify-content:space-between; gap:8px; font-size:12.5px; padding:4px 0; border-bottom:1px solid var(--border);">
        <strong>${t}</strong>
        <span style="${hayDescuadre ? 'color:var(--red);' : 'color:var(--green);'}">
          Proveedor: ${proveedor.toFixed(2)} L · Cargado: ${cargado.toFixed(2)} L · Dif: ${diferencia.toFixed(2)} L ${hayDescuadre ? '⚠️' : '✅'}
        </span>
      </div>`;
    }).join("");

    const avisoLegacy = (otrosProveedor > 0 || otrosCargado > 0)
      ? `<p style="color:var(--text-muted); font-size:11px; margin-top:6px;">ℹ️ Hay ${(otrosProveedor + otrosCargado).toFixed(2)} L con un tipo de combustible no reconocido (datos capturados antes del cambio a Diésel/Magna/Premium).</p>`
      : "";

    recBox.innerHTML = `
      <div class="alert" style="display:flex; flex-direction:column; gap:2px; background:var(--bg-elevated);">
        <strong style="margin-bottom:4px;">Conciliación por tipo de combustible — ${fecha}</strong>
        ${filasTipo || '<span style="color:var(--text-muted); font-size:12.5px;">Sin movimientos de proveedor ni cargas este día.</span>'}
        ${avisoLegacy}
      </div>`;

    document.getElementById("btn-pdf-proveedor")?.classList.toggle("hidden", items.length === 0);

    if (!items.length) { list.innerHTML = "<p>No hay cargas de proveedor para esta fecha.</p>"; return; }

    list.innerHTML = "";
    items.forEach(d => {
      const puedeEditar = Roles.puedeEditarProveedor(currentRol);
      list.innerHTML += `
        <div class="history-card" style="cursor:default;">
          <div class="hc-header"><span>${d.tipoCombustible}</span><span>${Number(d.litros).toFixed(2)} L</span></div>
          <p style="color:var(--text-muted); font-size:12px; margin-top:5px;">
            Ticket: ${d.ticket || "—"} • Precio: $${Number(d.precio || 0).toFixed(2)} • Subido por: ${d.usuario || "—"}
          </p>
          <div style="display:flex; gap:8px; margin-top:8px; flex-wrap:wrap;">
            ${d.fotoTicket ? `<button class="btn btn-outline btn-sm" onclick="descargarFotoProveedor('${d.id}')">📥 Descargar ticket</button>` : ""}
            ${puedeEditar ? `<button class="btn btn-ghost btn-sm" onclick="abrirProveedor('${d.id}')">✏️ Editar</button>` : ""}
          </div>
        </div>`;
    });
  } catch (e) {
    list.innerHTML = `<p style="color:var(--red);">❌ Error al cargar proveedor: ${e.message}</p>`;
    console.error("loadProveedor error:", e);
  }
}

function abrirProveedor(docId) {
  const d = docId ? window._provCache[docId] : null;
  document.getElementById("proveedor-modal-title").textContent = docId ? "Editar carga de proveedor" : "Nueva carga de proveedor";
  document.getElementById("prov-doc-id").value = docId || "";
  document.getElementById("prov-f-fecha").value = d?.fecha || document.getElementById("prov-fecha").value || new Date().toISOString().split("T")[0];
  document.getElementById("prov-f-tipo").value = d?.tipoCombustible || "Magna";
  document.getElementById("prov-f-litros").value = d?.litros ?? "";
  document.getElementById("prov-f-ticket").value = d?.ticket || "";
  document.getElementById("prov-f-precio").value = d?.precio ?? "";
  document.getElementById("proveedor-error").classList.add("hidden");
  provFotoData = d?.fotoTicket || null;
  document.getElementById("prov-img-ticket").src = provFotoData || "";
  document.getElementById("prov-preview-box").classList.toggle("hidden", !provFotoData);
  document.getElementById("prov-ok-ticket").classList.toggle("hidden", !provFotoData);
  document.getElementById("btn-eliminar-proveedor").classList.toggle("hidden", !(docId && Roles.puedeEliminarProveedor(currentRol)));
  document.getElementById("modal-proveedor").classList.remove("hidden");
  navPush("modal-proveedor");
}

function cerrarModalProveedor(desdePopstate = false) {
  document.getElementById("modal-proveedor").classList.add("hidden");
  if (!desdePopstate) consumirHistorialDeModal();
}

async function guardarProveedor() {
  const errBox = document.getElementById("proveedor-error");
  errBox.classList.add("hidden");

  const docId = document.getElementById("prov-doc-id").value;
  const fecha = document.getElementById("prov-f-fecha").value;
  const tipoCombustible = document.getElementById("prov-f-tipo").value;
  const litros = parseFloat(document.getElementById("prov-f-litros").value);
  const ticket = document.getElementById("prov-f-ticket").value.trim();
  const precio = parseFloat(document.getElementById("prov-f-precio").value);

  if (!fecha) { errBox.textContent = "Selecciona la fecha."; errBox.classList.remove("hidden"); return; }
  if (!litros || litros <= 0) { errBox.textContent = "Ingresa los litros suministrados."; errBox.classList.remove("hidden"); return; }
  if (!precio || precio <= 0) { errBox.textContent = "Ingresa el precio por litro."; errBox.classList.remove("hidden"); return; }
  if (provFotoData && tamanoBase64Bytes(provFotoData) > 850 * 1024) {
    errBox.textContent = "La foto del ticket pesa demasiado, vuelve a tomarla."; errBox.classList.remove("hidden"); return;
  }

  showLoading("Guardando carga de proveedor...");
  try {
    const fotoTicketUrl = await subirFotoAStorage(provFotoData, `proveedor/${rutaSegura(fecha)}`, "ticket");
    const data = {
      fecha, tipoCombustible, litros, precio, ticket: ticket || null,
      fotoTicket: fotoTicketUrl,
      usuario: window.firebaseAuth?.currentUser?.email || "—",
    };
    if (docId) {
      await window.fbUpdateDoc(window.fbDoc(window.firebaseDB, "proveedor_cargas", docId), data);
    } else {
      data.creadoEn = window.fbTimestamp.now();
      const docRef = window.fbDoc(window.fbCollection(window.firebaseDB, "proveedor_cargas"));
      await window.fbSetDoc(docRef, data);
    }
    hideLoading();
    cerrarModalProveedor();
    loadProveedor();
  } catch (e) {
    hideLoading();
    errBox.textContent = "Error: " + e.message;
    errBox.classList.remove("hidden");
  }
}

async function eliminarProveedor() {
  if (!Roles.puedeEliminarProveedor(currentRol)) return;
  const docId = document.getElementById("prov-doc-id").value;
  if (!docId) return;
  if (!confirm("¿Eliminar esta carga de proveedor? Esta acción no se puede deshacer.")) return;
  showLoading("Eliminando...");
  try {
    await window.fbDeleteDoc(window.fbDoc(window.firebaseDB, "proveedor_cargas", docId));
    hideLoading();
    cerrarModalProveedor();
    loadProveedor();
  } catch (e) {
    hideLoading();
    alert("Error al eliminar: " + e.message);
  }
}

async function descargarFotoProveedor(docId) {
  const d = window._provCache[docId];
  if (!d?.fotoTicket) return;
  // El atributo download del navegador no funciona de forma confiable con
  // URLs de otro origen (como las de Storage), así que primero la
  // convertimos a data URL y de ahí sí se descarga sin abrir pestaña nueva.
  const dataUrl = await urlADataURL(d.fotoTicket);
  if (!dataUrl) { alert("❌ No se pudo descargar la foto del ticket."); return; }
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `ticket-proveedor-${d.fecha}-${docId}.jpg`;
  a.click();
}

/* --- PDF DE CONCILIACIÓN DE PROVEEDOR DEL DÍA (punto A) ---
   Encabezado con la fecha y TODOS los # de ticket capturados ese día,
   seguido de las fotos de los tickets en bloques de hasta 3 por hoja,
   en formato vertical (una debajo de otra) para que quepan completas. */
async function descargarProveedorPDF() {
  const fecha = document.getElementById("prov-fecha").value;
  const items = Object.entries(window._provCache || {}).map(([id, d]) => ({ id, ...d }));
  if (!items.length) { alert("No hay cargas de proveedor para esta fecha."); return; }

  showLoading("Generando PDF de proveedor...");
  try {
    if (!window.jspdf) {
      await new Promise((res, rej) => {
        const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        s.onload = res;
        s.onerror = () => rej(new Error("No se pudo cargar la librería de PDF (jsPDF)."));
        document.head.appendChild(s);
      });
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "in", format: "letter" });
    const pageW = 8.5, pageH = 11, margin = 0.4;
    const contentW = pageW - margin * 2;

    // --- Encabezado (solo en la primera hoja) ---
    const ticketsTexto = [...new Set(items.map(d => d.ticket).filter(Boolean))].join(", ") || "Sin # de ticket capturado";
    const headerH = 1.5;
    function dibujarEncabezado() {
      doc.setFillColor(28, 33, 40); doc.rect(0, 0, pageW, headerH, "F");
      doc.setTextColor(232, 98, 10); doc.setFontSize(15); doc.setFont("helvetica", "bold");
      doc.text("FuelControl — Conciliación de Proveedor", margin, 0.35);
      doc.setFontSize(9.5); doc.setFont("helvetica", "normal"); doc.setTextColor(200, 200, 200);
      doc.text(`Fecha: ${fecha}`, margin, 0.62);
      const lineasTickets = doc.setFontSize(9.5).splitTextToSize(`# Ticket(s): ${ticketsTexto}`, contentW);
      doc.text(lineasTickets, margin, 0.85);
      doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      const totalLitros = items.reduce((s, d) => s + (Number(d.litros) || 0), 0);
      doc.text(`Total suministrado: ${totalLitros.toFixed(2)} L  (${items.length} carga${items.length > 1 ? "s" : ""})`, margin, 0.85 + lineasTickets.length * 0.16 + 0.15);
    }
    dibujarEncabezado();

    // --- Fotos: hasta 3 por hoja, apiladas verticalmente ---
    const fotosData = await Promise.all(items.map(async d => ({
      d, data: await urlADataURL(d.fotoTicket),
    })));

    const yInicio1 = headerH + 0.25;
    const gap = 0.2;
    let pagina = 0;
    for (let i = 0; i < fotosData.length; i += 3) {
      const grupo = fotosData.slice(i, i + 3);
      if (pagina > 0) { doc.addPage(); }
      const yTop = pagina === 0 ? yInicio1 : margin;
      const alturaDisponible = pageH - margin - yTop;
      const espacioLabel = 0.22;
      const altoCaja = (alturaDisponible - espacioLabel * grupo.length - gap * (grupo.length - 1)) / grupo.length;

      let yCursor = yTop;
      grupo.forEach(({ d, data }) => {
        doc.setTextColor(0, 0, 0); doc.setFont("helvetica", "bold"); doc.setFontSize(9.5);
        doc.text(`Ticket: ${d.ticket || "—"}   |   ${d.tipoCombustible}   |   ${Number(d.litros).toFixed(2)} L   |   $${Number(d.precio || 0).toFixed(2)}/L`, margin, yCursor + espacioLabel - 0.06);

        const yCaja = yCursor + espacioLabel;
        if (data) {
          let props;
          try { props = doc.getImageProperties(data); } catch (e) { props = null; }
          if (props) {
            let dw = contentW, dh = (props.height * dw) / props.width;
            if (dh > altoCaja) { dh = altoCaja; dw = (props.width * dh) / props.height; }
            const dx = margin + (contentW - dw) / 2;
            doc.setDrawColor(225, 225, 225);
            doc.rect(margin, yCaja, contentW, altoCaja);
            doc.addImage(data, "JPEG", dx, yCaja, dw, dh);
          }
        } else {
          doc.setDrawColor(210, 210, 210); doc.setFillColor(245, 245, 245);
          doc.rect(margin, yCaja, contentW, altoCaja, "FD");
          doc.setTextColor(150, 150, 150); doc.setFontSize(9); doc.setFont("helvetica", "italic");
          doc.text("Foto no disponible", margin + contentW / 2, yCaja + altoCaja / 2, { align: "center" });
        }
        yCursor += espacioLabel + altoCaja + gap;
      });
      pagina++;
    }

    doc.save(`Proveedor_${fecha}.pdf`);
    hideLoading();
  } catch (e) {
    hideLoading();
    alert("❌ Error al generar el PDF: " + e.message);
  }
}

/* --- USUARIOS Y ROLES (Master, Admin, Coordinador según roles.js) --- */
async function loadUsuarios() {
  const list = document.getElementById("usuarios-list");
  list.innerHTML = "Cargando usuarios...";
  try {
    const snap = await window.fbGetDocs(window.fbCollection(window.firebaseDB, "whitelist"));
    window._usuariosCache = {};
    if (snap.empty) { list.innerHTML = "<p>No hay usuarios registrados.</p>"; return; }

    let todos = [];
    snap.forEach(docSnap => {
      const d = { ...docSnap.data(), _id: docSnap.id };
      window._usuariosCache[docSnap.id] = d;
      todos.push(d);
    });

    // Filtrado según rango del usuario que está viendo la lista (roles.js).
    const visibles = Roles.filtraUsuariosVisibles(currentRol, todos);

    // Botón "+ Nuevo usuario" solo si el rol puede crear (Master/Admin).
    document.getElementById("btn-nuevo-usuario")?.classList.toggle("hidden", !Roles.puedeCrearUsuarios(currentRol));

    if (visibles.length === 0) { list.innerHTML = "<p>No hay usuarios para mostrar.</p>"; return; }

    list.innerHTML = "";
    visibles.forEach(d => {
      const activo = d.activo !== false;
      const pendienteValidacion = d.activo !== false && d.validado === false;

      let displayAlias = d.email || "";
      if (displayAlias.endsWith("@grupoindi.com")) displayAlias = displayAlias.replace("@grupoindi.com", "");

      const etiquetaRol = Roles.ETIQUETAS_ROL[d.rol] || d.rol;
      const estadoTxt = !activo ? "⛔ Inactivo" : (pendienteValidacion ? "🟡 Pendiente de validar" : "✅ Activo");
      const estadoColor = !activo ? "var(--red)" : (pendienteValidacion ? "#d4a017" : "var(--green)");

      list.innerHTML += `
        <div class="history-card" style="cursor:pointer;" onclick="abrirUsuario('${d._id}')">
          <div class="hc-header"><span>${d.nombre || displayAlias}</span><span style="color:${estadoColor};">${estadoTxt}</span></div>
          <p style="color:var(--text-muted); font-size:12px; margin-top:5px;">Alias: ${displayAlias} • ${etiquetaRol}</p>
        </div>
      `;
    });
  } catch (e) {
    list.innerHTML = `<p style="color:var(--red);">❌ Error al cargar usuarios: ${e.message}</p>`;
    console.error("loadUsuarios error:", e);
  }
}

// Opciones de rol disponibles para el usuario actual: nunca puede asignar
// un rango mayor o igual al suyo (excepto Master, que puede todo).
function opcionesRolDisponibles() {
  const miRango = Roles.RANGO[currentRol] || 0;
  return Object.values(Roles.ROLES).filter(r => {
    if (currentRol === Roles.ROLES.MASTER) return true;
    return Roles.RANGO[r] < miRango;
  });
}

function abrirUsuario(docId) {
  document.getElementById("usuario-error").classList.add("hidden");
  const u = docId ? window._usuariosCache?.[docId] : null;

  document.getElementById("usuario-modal-title").textContent = docId ? "Editar usuario" : "Nuevo usuario";
  document.getElementById("usuario-doc-id").value = docId || "";

  let displayUser = u?.email || "";
  if (displayUser.endsWith("@grupoindi.com")) displayUser = displayUser.replace("@grupoindi.com", "");

  document.getElementById("usuario-email").value = displayUser;
  document.getElementById("usuario-email").disabled = !!docId; // el alias no se puede cambiar una vez creado
  document.getElementById("usuario-nombre").value = u?.nombre || "";
  document.getElementById("usuario-activo").checked = u ? (u.activo !== false) : true;

  // Select de rol: solo se muestran rangos que el usuario actual puede asignar.
  const selectRol = document.getElementById("usuario-rol");
  selectRol.innerHTML = opcionesRolDisponibles()
    .map(r => `<option value="${r}">${Roles.ETIQUETAS_ROL[r]}</option>`).join("");
  selectRol.value = u?.rol || Roles.ROLES.RESIDENTE;
  // Si estoy editando un usuario de rango mayor al que yo puedo asignar (no debería listarse, pero por seguridad)
  if (u && !selectRol.value) selectRol.value = u.rol;

  // Contraseña directa: solo aplica al CREAR (punto 2.1). Al editar no se toca aquí.
  const pwGroup = document.getElementById("usuario-password-group");
  pwGroup.classList.toggle("hidden", !!docId);
  document.getElementById("usuario-password").value = "";

  // Restablecer contraseña rápido y Eliminar: solo Master, y solo editando un usuario existente.
  document.getElementById("btn-reset-password").classList.toggle("hidden", !(docId && Roles.puedeCambiarContrasenas(currentRol)));
  document.getElementById("btn-eliminar-usuario").classList.toggle("hidden", !(docId && Roles.puedeEliminarUsuarios(currentRol)));

  document.getElementById("modal-usuario").classList.remove("hidden");
  navPush("modal-usuario");
}

function cerrarModalUsuario(desdePopstate = false) {
  document.getElementById("modal-usuario").classList.add("hidden");
  if (!desdePopstate) consumirHistorialDeModal();
}

async function guardarUsuario() {
  const errBox = document.getElementById("usuario-error");
  errBox.classList.add("hidden");

  const docId = document.getElementById("usuario-doc-id").value;
  const usernameInput = document.getElementById("usuario-email").value.trim().toLowerCase();
  const nombre = document.getElementById("usuario-nombre").value.trim();
  const rol = document.getElementById("usuario-rol").value;
  const activo = document.getElementById("usuario-activo").checked;
  const password = document.getElementById("usuario-password").value;

  if (!usernameInput) { errBox.textContent = "Ingresa un alias / usuario."; errBox.classList.remove("hidden"); return; }
  if (!nombre) { errBox.textContent = "Ingresa el nombre del usuario."; errBox.classList.remove("hidden"); return; }
  if (!docId && (!password || password.length < 6)) {
    errBox.textContent = "Asigna una contraseña de al menos 6 caracteres.";
    errBox.classList.remove("hidden");
    return;
  }

  const fakeEmail = usernameInput.includes("@") ? usernameInput : `${usernameInput}@grupoindi.com`;

  showLoading("Guardando usuario...");
  try {
    if (docId) {
      // Editar usuario existente: no se toca el campo "validado" aquí.
      await window.fbUpdateDoc(window.fbDoc(window.firebaseDB, "whitelist", docId), { nombre, rol, activo });
    } else {
      // Crear usuario nuevo con contraseña directa (punto 2.1).
      await window.fbCrearUsuarioConPassword(fakeEmail, password);
      // Si lo crea un Admin (no Master), queda pendiente de validación (punto 2).
      const validado = currentRol === Roles.ROLES.MASTER;
      await window.fbSetDoc(window.fbDoc(window.firebaseDB, "whitelist", fakeEmail), {
        email: fakeEmail, nombre, rol, activo, validado,
      });
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

// Restablecer contraseña rápido (solo Master) — vía Cloud Function, no
// requiere conocer la contraseña anterior ni desloguea a quien lo ejecuta.
async function resetPasswordUsuario() {
  if (!Roles.puedeCambiarContrasenas(currentRol)) return;
  const docId = document.getElementById("usuario-doc-id").value;
  const u = window._usuariosCache?.[docId];
  if (!u) return;

  const nuevaPw = prompt(`Nueva contraseña para ${u.nombre || u.email} (mínimo 6 caracteres):`);
  if (!nuevaPw) return;
  if (nuevaPw.length < 6) { alert("La contraseña debe tener al menos 6 caracteres."); return; }

  showLoading("Restableciendo contraseña...");
  try {
    await window.fbResetUserPassword({ email: u.email, newPassword: nuevaPw });
    hideLoading();
    alert("Contraseña actualizada.");
  } catch (e) {
    hideLoading();
    alert("Error al restablecer contraseña: " + e.message);
  }
}

// Eliminar usuario (solo Master).
async function eliminarUsuario() {
  if (!Roles.puedeEliminarUsuarios(currentRol)) return;
  const docId = document.getElementById("usuario-doc-id").value;
  const u = window._usuariosCache?.[docId];
  if (!u) return;
  if (!confirm(`¿Eliminar al usuario ${u.nombre || u.email}? Esta acción no se puede deshacer.`)) return;

  showLoading("Eliminando usuario...");
  try {
    await window.fbDeleteDoc(window.fbDoc(window.firebaseDB, "whitelist", docId));
    hideLoading();
    cerrarModalUsuario();
    loadUsuarios();
  } catch (e) {
    hideLoading();
    alert("Error al eliminar usuario: " + e.message);
  }
}

/* --- EXPORTAR EXCEL (XLSX) --- */
// NOTA: la antigua función exportExcel() (de la pestaña "Exportar") se quitó
// de aquí — esa pestaña ya no existe en la app (punto 5.1, se reemplazó por
// "Resumen"). El export general de TODOS los registros que hacía ya no tenía
// ningún botón que la llamara. La exportación a Excel ahora vive en
// descargarConsumosMaquinaria(), por máquina individual (punto 7).

/* --- GENERAR PDF MAESTRO CON 3 FOTOS Y RENDIMIENTO --- */
async function generateTicketPDF(record) {
  // Compatibilidad: las fotos pueden venir como base64 (registros viejos,
  // o el mismo registro recién capturado en memoria) o como URL de Storage
  // (registros nuevos leídos de Firestore). jsPDF solo puede dibujar
  // base64/data URL, así que aquí normalizamos antes de construir el PDF.
  record = {
    ...record,
    fotoInicial:   await urlADataURL(record.fotoInicial),
    fotoFinal:     await urlADataURL(record.fotoFinal),
    fotoTicket:    await urlADataURL(record.fotoTicket),
    fotoHorometro: await urlADataURL(record.fotoHorometro),
  };

  if (!window.jspdf) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = res;
      s.onerror = () => rej(new Error("No se pudo cargar la librería de PDF (jsPDF). Revisa tu conexión a internet."));
      document.head.appendChild(s);
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

  // --- LEYENDA DE ALERTA ANDON (punto 9) ---
  // Si esta carga disparó alguna inconsistencia (capacidad de tanque o
  // remanente estimado por horómetro) y el usuario decidió guardarla de
  // todas formas, lo dejamos impreso en el PDF en un recuadro rojo bien
  // visible, justo debajo del encabezado.
  let andonBannerH = 0;
  if (Array.isArray(record.andonAlertas) && record.andonAlertas.length) {
    const xBanner = margin, yBanner = headerH + 0.08, wBanner = contentW;
    const lineas = record.andonAlertas.flatMap(txt =>
      doc.setFont("helvetica", "bold").setFontSize(8.5).splitTextToSize("⚠ " + txt, wBanner - 0.2)
    );
    andonBannerH = 0.18 + lineas.length * 0.15;
    doc.setFillColor(255, 235, 235);
    doc.setDrawColor(200, 30, 30);
    doc.rect(xBanner, yBanner, wBanner, andonBannerH, "FD");
    doc.setTextColor(170, 20, 20); doc.setFontSize(8.5); doc.setFont("helvetica", "bold");
    doc.text("ALERTA ANDON — INCONSISTENCIA DETECTADA EN ESTA CARGA:", xBanner + 0.1, yBanner + 0.15);
    doc.setFont("helvetica", "normal");
    doc.text(lineas, xBanner + 0.1, yBanner + 0.3);
    andonBannerH += 0.12;
  }

  // Placeholder reutilizable para cuando una foto no existe (registro viejo,
  // pendiente sin cerrar, error de carga, etc.) — así el PDF nunca truena.
  function dibujarPlaceholder(x, yPos, w, h, texto) {
    doc.setDrawColor(210, 210, 210);
    doc.setFillColor(245, 245, 245);
    doc.rect(x, yPos, w, h, "FD");
    doc.setTextColor(150, 150, 150); doc.setFontSize(9); doc.setFont("helvetica", "italic");
    doc.text(texto, x + w / 2, yPos + h / 2, { align: "center" });
  }

  // Dibuja una foto dentro de un cuadro de tamaño fijo (w x h), centrada y
  // sin deformarse (letterbox: se ajusta al lado que limite y se centra).
  function dibujarFotoEnCaja(data, x, yPos, w, h, label, textoFaltante) {
    doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(label, x, yPos - 0.12);

    if (!data) {
      dibujarPlaceholder(x, yPos, w, h, textoFaltante || "Foto no disponible");
      return;
    }
    let props;
    try { props = doc.getImageProperties(data); }
    catch (err) {
      dibujarPlaceholder(x, yPos, w, h, "Foto inválida o corrupta");
      return;
    }

    // Encajar manteniendo proporción dentro de w x h (sin recortar ni deformar)
    let dw = w, dh = (props.height * dw) / props.width;
    if (dh > h) { dh = h; dw = (props.width * dh) / props.height; }
    const dx = x + (w - dw) / 2;
    const dy = yPos + (h - dh) / 2;

    // Marco tenue del tamaño de la caja, para que todas las fotos del
    // mismo bloque se vean alineadas aunque su proporción real varíe.
    doc.setDrawColor(225, 225, 225);
    doc.rect(x, yPos, w, h);
    doc.addImage(data, "JPEG", dx, dy, dw, dh);
  }

  // ═══════════════════════════════════════════════════════════════
  // LAYOUT (según boceto): columna izquierda con cuadros apilados
  // (Bomba Inicial / Bomba Final / Horómetro si aplica), y columna
  // derecha con el Ticket en un rectángulo vertical que ocupa toda
  // la altura disponible de la página.
  // ═══════════════════════════════════════════════════════════════
  const tieneHoroFoto = !!record.fotoHorometro;
  const sinHorometro = record.horometroRaw === null || record.horometroRaw === undefined;

  const gap = 0.25;
  const yInicio = headerH + 0.35 + andonBannerH;
  const yFinPagina = pageH - margin;
  const alturaDisponible = yFinPagina - yInicio;

  // Ancho de columnas: izquierda ~52%, derecha ~48% (el ticket es alargado)
  const colIzqW = contentW * 0.50;
  const colDerW = contentW - colIzqW - gap;
  const xIzq = margin;
  const xDer = margin + colIzqW + gap;

  // Cuántos cuadros van en la columna izquierda: 3 si hay foto de horómetro
  // (variante "Con horómetro" del boceto), 2 si no (variante "Sin horómetro").
  const bloquesIzq = tieneHoroFoto
    ? [
        { label: "Bomba Inicial", data: record.fotoInicial },
        { label: "Bomba Final",   data: record.fotoFinal },
        { label: "Horómetro",     data: record.fotoHorometro }
      ]
    : [
        { label: "Bomba Inicial", data: record.fotoInicial },
        { label: "Bomba Final",   data: record.fotoFinal }
      ];

  // Cada cuadro es CUADRADO. El lado es el ancho de columna, A MENOS que
  // eso no quepa en la altura disponible (p. ej. con 3 bloques apilados);
  // en ese caso se reduce el lado para que los cuadros + sus etiquetas y
  // separaciones siempre entren en la página, sin desbordarse.
  const espacioLabel = 0.3;  // alto reservado para el texto encima de cada cuadro (con aire real, sin tocar la imagen)
  const gapVerticalMin = 0.15;
  const nBloques = bloquesIzq.length;

  const ladoPorAncho = colIzqW;
  const ladoPorAltura =
    (alturaDisponible - espacioLabel * nBloques - gapVerticalMin * (nBloques - 1))
    / nBloques;
  const ladoCuadro = Math.min(ladoPorAncho, ladoPorAltura);

  // Alto real de cada "bloque" (etiqueta + cuadro). El espacio que sobre
  // después de los bloques se reparte como separación extra entre ellos.
  const altoBloque = espacioLabel + ladoCuadro;
  const espacioRestante = alturaDisponible - altoBloque * nBloques;
  const gapVertical = nBloques > 1
    ? Math.max(gapVerticalMin, espacioRestante / (nBloques - 1))
    : 0;

  let yCursorIzq = yInicio;
  bloquesIzq.forEach(b => {
    dibujarFotoEnCaja(b.data, xIzq, yCursorIzq + espacioLabel, ladoCuadro, ladoCuadro, b.label,
      sinHorometro && b.label === "Horómetro" ? "Sin horómetro" : "Foto no disponible");
    yCursorIzq += altoBloque + gapVertical;
  });

  // Columna derecha: el Ticket en un solo rectángulo vertical que ocupa
  // toda la altura disponible (igual que en el boceto), con su propia
  // etiqueta arriba para alinearse visualmente con la columna izquierda.
  dibujarFotoEnCaja(
    record.fotoTicket,
    xDer, yInicio + espacioLabel,
    colDerW, alturaDisponible - espacioLabel,
    "Ticket de Carga",
    record.status === "pendiente" ? "Ticket aún pendiente de adjuntar" : "Foto de ticket no disponible"
  );

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


/* ───────────────────────────── MAQUINARIA (punto 7) ───────────────────────────── */

// Recarga el catálogo real de equipos (usado en los selects de # ECO de
// Cargas y Editar) desde Firestore, en vez de la lista fija que había antes.
// Solo trae máquinas activas, igual que antes hacía la lista a mano.
async function cargarCatalogoEquiposDesdeFirestore() {
  try {
    const col = window.fbCollection(window.firebaseDB, "maquinaria");
    const snap = await window.fbGetDocs(col);
    catalogoEquipos = [];
    snap.forEach(docSnap => {
      const d = docSnap.data();
      if (d.activa === false) return;
      catalogoEquipos.push({
        maquinaria: d.tipo || "",
        marca: d.marca || "",
        modelo: d.modelo || "",
        interno: d.numInterno || d.eco || docSnap.id,
        // Campos para las alertas Andon (punto 9): capacidad real del
        // tanque y consumo promedio histórico de ESTA máquina (lt/hr).
        capacidadTanque: typeof d.capacidadTanque === "number" ? d.capacidadTanque : null,
        consumoPromedio: typeof d.consumoPromedio === "number" ? d.consumoPromedio : null,
      });
    });
    cargarSelectorEquipos("f-eco");
    cargarSelectorEquipos("edit-eco");
  } catch (e) {
    console.error("No se pudo cargar el catálogo de maquinaria:", e);
  }
}

function llenarSelectConOtro(selectId, opciones) {
  const sel = document.getElementById(selectId);
  sel.innerHTML = opciones.map(o => `<option value="${o}">${o}</option>`).join("");
}

// Punto C: si el # ECO está vacío, lo refleja con el # Interno mientras
// el usuario escribe (la mayoría de las máquinas del CSV usan el mismo
// valor para ambos). Si el usuario ya escribió algo distinto en ECO, no
// se le pisa.
function syncEcoConInterno() {
  const ecoInput = document.getElementById("maq-eco");
  if (!ecoInput.value.trim()) {
    ecoInput.value = document.getElementById("maq-num-interno").value;
  }
}

function toggleOtroMaquinaria(campo) {
  const sel = document.getElementById(`maq-${campo}`);
  const otro = document.getElementById(`maq-${campo}-otro`);
  otro.classList.toggle("hidden", sel.value !== "Otro");
}

function poblarSubzonas(subzonaSeleccionada = "") {
  const zona = document.getElementById("maq-zona").value;
  const subSel = document.getElementById("maq-subzona");
  const opciones = ZONAS_SUBZONAS[zona] || [];
  subSel.innerHTML = opciones.map(s => `<option value="${s}">${s}</option>`).join("");
  if (subzonaSeleccionada && opciones.includes(subzonaSeleccionada)) subSel.value = subzonaSeleccionada;
}

window._maquinariaCache = {};

async function loadMaquinaria() {
  const list = document.getElementById("maquinaria-list");
  document.getElementById("btn-nueva-maquina")?.classList.toggle("hidden", !Roles.puedeAgregarMaquinaria(currentRol));
  list.innerHTML = "Cargando...";
  try {
    const col = window.fbCollection(window.firebaseDB, "maquinaria");
    const snap = await window.fbGetDocs(col);

    const buscar = (document.getElementById("maq-f-buscar").value || "").trim().toUpperCase();
    const fZona = document.getElementById("maq-f-zona").value;
    const fProveedor = document.getElementById("maq-f-proveedor").value;
    const fActiva = document.getElementById("maq-f-activa").value;

    window._maquinariaCache = {};
    const zonasSet = new Set();
    const proveedoresSet = new Set();
    const items = [];

    snap.forEach(docSnap => {
      const d = docSnap.data();
      window._maquinariaCache[docSnap.id] = d;
      if (d.zona) zonasSet.add(d.zona);
      if (d.proveedor) proveedoresSet.add(d.proveedor);

      if (buscar && !`${d.eco || ""} ${d.numInterno || ""}`.toUpperCase().includes(buscar)) return;
      if (fZona && d.zona !== fZona) return;
      if (fProveedor && d.proveedor !== fProveedor) return;
      if (fActiva === "activa" && d.activa !== true) return;
      if (fActiva === "inactiva" && d.activa !== false) return;

      items.push({ id: docSnap.id, ...d });
    });

    // Refrescar opciones de los selects de filtro sin perder lo seleccionado
    const zonaActual = fZona, provActual = fProveedor;
    document.getElementById("maq-f-zona").innerHTML =
      `<option value="">Todas las zonas</option>` + [...zonasSet].sort().map(z => `<option value="${z}">${z}</option>`).join("");
    document.getElementById("maq-f-zona").value = zonaActual;
    document.getElementById("maq-f-proveedor").innerHTML =
      `<option value="">Todos los proveedores</option>` + [...proveedoresSet].sort().map(p => `<option value="${p}">${p}</option>`).join("");
    document.getElementById("maq-f-proveedor").value = provActual;

    if (!items.length) { list.innerHTML = "<p>No hay maquinaria que coincida con el filtro.</p>"; return; }

    const puedeEditar = Roles.puedeEditarMaquinaria(currentRol);
    list.innerHTML = "";
    items.sort((a, b) => (a.eco || "").localeCompare(b.eco || "")).forEach(d => {
      const docsOk = DOCUMENTOS_TIPOS.filter(t => normalizarDocumento(d.documentos?.[t.campo]).tiene).length;
      const docsTotal = 5;
      list.innerHTML += `
        <div class="history-card" style="cursor:pointer;" onclick="abrirMaquinaria('${d.id}', 'maquinaria')">
          <div class="hc-header"><span>${d.eco || d.numInterno || "—"}</span><span>${d.activa === false ? "🔴 Inactiva" : "🟢 Activa"}</span></div>
          <p style="color:var(--text-muted); font-size:12px; margin-top:5px;">
            ${d.tipo || "—"} · ${d.marca || ""} ${d.modelo || ""}<br/>
            ${d.zona || "Sin zona"} ${d.subzona ? "· " + d.subzona : ""} · ${d.propiedad || "—"}<br/>
            Docs: ${docsOk}/${docsTotal} ✔ · Consumo prom.: ${d.consumoPromedio ?? "—"} lt/hr
          </p>
        </div>`;
    });
  } catch (e) {
    list.innerHTML = `<p style="color:var(--red);">❌ Error al cargar maquinaria: ${e.message}</p>`;
    console.error("loadMaquinaria error:", e);
  }
}

function abrirMaquinaria(docId, origen = "permisos") {
  const d = docId ? window._maquinariaCache[docId] : null;
  document.getElementById("maquinaria-modal-title").textContent = docId ? "Editar maquinaria" : "Nueva maquinaria";
  document.getElementById("maq-doc-id").value = docId || "";
  document.getElementById("maquinaria-error").classList.add("hidden");

  llenarSelectConOtro("maq-tipo", TIPOS_MAQUINARIA);
  llenarSelectConOtro("maq-marca", MARCAS_MAQUINARIA);
  document.getElementById("maq-zona").innerHTML = Object.keys(ZONAS_SUBZONAS).map(z => `<option value="${z}">${z}</option>`).join("");

  const tipoEnCatalogo = d && TIPOS_MAQUINARIA.includes(d.tipo);
  document.getElementById("maq-tipo").value = tipoEnCatalogo ? d.tipo : "Otro";
  document.getElementById("maq-tipo-otro").value = tipoEnCatalogo ? "" : (d?.tipo || "");
  document.getElementById("maq-tipo-otro").classList.toggle("hidden", !!tipoEnCatalogo);

  const marcaEnCatalogo = d && MARCAS_MAQUINARIA.includes(d.marca);
  document.getElementById("maq-marca").value = marcaEnCatalogo ? d.marca : "Otro";
  document.getElementById("maq-marca-otro").value = marcaEnCatalogo ? "" : (d?.marca || "");
  document.getElementById("maq-marca-otro").classList.toggle("hidden", !!marcaEnCatalogo);

  document.getElementById("maq-modelo").value = d?.modelo || "";
  document.getElementById("maq-eco").value = d?.eco || d?.numInterno || "";
  document.getElementById("maq-num-interno").value = d?.numInterno || "";
  document.getElementById("maq-serie").value = d?.serie || "";
  document.getElementById("maq-fecha-ingreso").value = d?.fechaIngreso || "";
  document.getElementById("maq-fecha-egreso").value = d?.fechaEgreso || "";

  document.getElementById("maq-zona").value = d?.zona || Object.keys(ZONAS_SUBZONAS)[0];
  poblarSubzonas(d?.subzona || "");

  document.getElementById("maq-proveedor").value = d?.proveedor || "";
  document.getElementById("maq-propiedad").value = d?.propiedad || "Propia";
  document.getElementById("maq-capacidad").value = d?.capacidadTanque ?? "";
  document.getElementById("maq-consumo-bajo").value = d?.consumoBajo ?? "";
  document.getElementById("maq-consumo-medio").value = d?.consumoMedio ?? "";
  document.getElementById("maq-consumo-alto").value = d?.consumoAlto ?? "";
  document.getElementById("maq-consumo-promedio").value = d?.consumoPromedio ?? "";
  document.getElementById("maq-activa").checked = d?.activa !== false;

  DOCUMENTOS_TIPOS.forEach(({ campo, idSufijo, label }) => {
    const docNorm = normalizarDocumento(d?.documentos?.[campo]);
    document.getElementById(`maq-doc-${idSufijo}`).checked = docNorm.tiene;
    document.getElementById(`maq-doc-${idSufijo}-file`).value = ""; // nunca se precarga el input file
    document.getElementById(`maq-doc-${idSufijo}-venc`).value = docNorm.vencimiento || "";

    // Ver/descargar el documento YA SUBIDO: el Coordinador solo puede
    // hacerlo con "Permiso" (con botón propio de descarga); Factura, DC3,
    // Tarjeta y Póliza solo las puede ver/descargar Admin o Master, aunque
    // el Coordinador sí las haya subido (punto C de observaciones).
    const link = document.getElementById(`maq-doc-${idSufijo}-link`);
    const puedeVerEsteDoc = Roles.puedeVerDocumentoMaquinaria(currentRol, campo);
    link.href = docNorm.url || "#";
    link.textContent = campo === "permiso" ? "📥 Descargar PDF" : "Ver PDF";
    link.classList.toggle("hidden", !docNorm.url || !puedeVerEsteDoc);

    const estado = estadoDocumento(docNorm);
    const info = ESTADO_DOC_INFO[estado];
    const badge = document.getElementById(`maq-doc-${idSufijo}-estado`);
    badge.textContent = info.texto(campo);
    badge.style.display = "inline-block";
    badge.style.background = "transparent";
    badge.style.border = `1px solid ${info.color}`;
    badge.style.color = info.color;
  });

  document.getElementById("btn-eliminar-maquinaria").classList.toggle("hidden", !(docId && Roles.puedeEliminarMaquinaria(currentRol)));
  document.getElementById("btn-descargar-consumos").classList.toggle("hidden", !docId); // solo tiene sentido en máquinas ya existentes

  // Modo solo-lectura: roles sin permiso de edición (ej. Visor, Residente)
  // pueden abrir la ficha para CONSULTAR y descargar consumos, pero no
  // pueden tocar ni guardar nada.
  setMaquinariaFormReadOnly(!Roles.puedeEditarMaquinaria(currentRol));

  // Punto pedido: la pestaña "Maquinaria" ya NO permite subir/editar los
  // documentos (Permiso, Factura, DC3, Tarjeta, Póliza) — eso ahora vive
  // únicamente en la pestaña "Permisos" (abrirMaquinaria(id) sin 2do
  // argumento, o explícitamente con origen "permisos"). Si el modal se
  // abrió desde Maquinaria (origen === "maquinaria"), se oculta TODO el
  // bloque de subida (checkbox "tiene" + input de archivo + fecha de
  // vencimiento) como un solo grupo — solo queda visible el nombre del
  // documento, su badge de estado (Falta/Vencido/Por vencer/OK) y el
  // link "Ver PDF" si el rol tiene permiso para verlo.
  const origenMaquinaria = origen === "maquinaria";
  document.getElementById("maq-docs-nota-permisos")?.classList.toggle("hidden", !origenMaquinaria);

  const puedeSubirDocs = Roles.puedeSubirDocumentosMaquinaria(currentRol) && !origenMaquinaria;
  DOCUMENTOS_TIPOS.forEach(({ idSufijo }) => {
    document.getElementById(`maq-doc-${idSufijo}`).disabled = !puedeSubirDocs;
    document.getElementById(`maq-doc-${idSufijo}-file`).disabled = !puedeSubirDocs;
    document.getElementById(`maq-doc-${idSufijo}-venc`).disabled = !puedeSubirDocs;
    // El checkbox y la zona completa de subida (archivo + fecha) se
    // ocultan como bloque cuando origenMaquinaria es true. El checkbox
    // sigue existiendo en el DOM (oculto) para que su valor .checked se
    // siga guardando sin cambios al presionar "Guardar" desde Maquinaria.
    document.getElementById(`maq-doc-${idSufijo}`).classList.toggle("hidden", origenMaquinaria);
    document.getElementById(`doc-upload-${idSufijo}`).classList.toggle("hidden", origenMaquinaria);
  });

  document.getElementById("modal-maquinaria").classList.remove("hidden");
  navPush("modal-maquinaria");
}

/* ───────────────────────────── PERMISOS / DOCUMENTOS DE MAQUINARIA (punto 7.2) ───────────────────────────── */

async function loadPermisos() {
  const list = document.getElementById("permisos-list");
  list.innerHTML = "Cargando...";
  try {
    const col = window.fbCollection(window.firebaseDB, "maquinaria");
    const snap = await window.fbGetDocs(col);

    const buscar = (document.getElementById("perm-f-buscar").value || "").trim().toUpperCase();
    const fZona = document.getElementById("perm-f-zona").value;
    const fProveedor = document.getElementById("perm-f-proveedor").value;
    const fEstado = document.getElementById("perm-f-estado").value;

    const zonasSet = new Set();
    const proveedoresSet = new Set();
    const items = [];

    snap.forEach(docSnap => {
      const d = docSnap.data();
      window._maquinariaCache[docSnap.id] = d;
      if (d.zona) zonasSet.add(d.zona);
      if (d.proveedor) proveedoresSet.add(d.proveedor);

      if (buscar && !`${d.eco || ""} ${d.numInterno || ""}`.toUpperCase().includes(buscar)) return;
      if (fZona && d.zona !== fZona) return;
      if (fProveedor && d.proveedor !== fProveedor) return;

      const docsNorm = DOCUMENTOS_TIPOS.map(t => ({ ...t, norm: normalizarDocumento(d.documentos?.[t.campo]), estado: estadoDocumento(normalizarDocumento(d.documentos?.[t.campo])) }));

      if (fEstado === "faltante" && !docsNorm.some(x => x.estado === "faltante")) return;
      if (fEstado === "vencido" && !docsNorm.some(x => x.estado === "vencido")) return;
      if (fEstado === "porVencer" && !docsNorm.some(x => x.estado === "porVencer")) return;

      items.push({ id: docSnap.id, ...d, docsNorm });
    });

    const zonaActual = fZona, provActual = fProveedor;
    document.getElementById("perm-f-zona").innerHTML =
      `<option value="">Todas las zonas</option>` + [...zonasSet].sort().map(z => `<option value="${z}">${z}</option>`).join("");
    document.getElementById("perm-f-zona").value = zonaActual;
    document.getElementById("perm-f-proveedor").innerHTML =
      `<option value="">Todos los proveedores</option>` + [...proveedoresSet].sort().map(p => `<option value="${p}">${p}</option>`).join("");
    document.getElementById("perm-f-proveedor").value = provActual;

    if (!items.length) { list.innerHTML = "<p>No hay maquinaria que coincida con el filtro.</p>"; return; }

    list.innerHTML = "";
    items.sort((a, b) => (a.eco || "").localeCompare(b.eco || "")).forEach(d => {
      const badges = d.docsNorm.map(({ label, norm, estado, campo }) => {
        const info = ESTADO_DOC_INFO[estado];
        const venc = norm.vencimiento ? ` · vence ${norm.vencimiento}` : "";
        return `<div style="display:flex; justify-content:space-between; gap:6px; font-size:12px; padding:3px 0; border-bottom:1px solid var(--border);">
          <span>${label}</span>
          <span style="color:${info.color};">${info.texto(campo)}${venc}</span>
        </div>`;
      }).join("");

      list.innerHTML += `
        <div class="history-card" style="cursor:pointer;" onclick="abrirMaquinaria('${d.id}')">
          <div class="hc-header"><span>${d.eco || d.numInterno || "—"}</span><span>${d.activa === false ? "🔴 Inactiva" : "🟢 Activa"}</span></div>
          <p style="color:var(--text-muted); font-size:12px; margin:5px 0 8px;">${d.tipo || "—"} · ${d.zona || "Sin zona"}</p>
          ${badges}
        </div>`;
    });
  } catch (e) {
    list.innerHTML = `<p style="color:var(--red);">❌ Error al cargar permisos: ${e.message}</p>`;
    console.error("loadPermisos error:", e);
  }
}


// Deshabilita/habilita todos los campos del formulario de Maquinaria y
// oculta el botón "Guardar" cuando el rol actual no puede editar.
function setMaquinariaFormReadOnly(soloLectura) {
  const modal = document.getElementById("modal-maquinaria");
  modal.querySelectorAll(".field-input, input[type=checkbox]").forEach(el => { el.disabled = soloLectura; });
  document.getElementById("btn-guardar-maquinaria").classList.toggle("hidden", soloLectura);
}

function cerrarModalMaquinaria(desdePopstate = false) {
  document.getElementById("modal-maquinaria").classList.add("hidden");
  if (!desdePopstate) consumirHistorialDeModal();
}

async function guardarMaquinaria() {
  const errBox = document.getElementById("maquinaria-error");
  errBox.classList.add("hidden");

  const docId = document.getElementById("maq-doc-id").value;
  const tipoSel = document.getElementById("maq-tipo").value;
  const tipo = tipoSel === "Otro" ? document.getElementById("maq-tipo-otro").value.trim() : tipoSel;
  const marcaSel = document.getElementById("maq-marca").value;
  const marca = marcaSel === "Otro" ? document.getElementById("maq-marca-otro").value.trim() : marcaSel;
  const eco = document.getElementById("maq-eco").value.trim();
  const numInterno = document.getElementById("maq-num-interno").value.trim();
  const zona = document.getElementById("maq-zona").value;
  const subzona = document.getElementById("maq-subzona").value;

  if (!tipo) { errBox.textContent = "Indica el tipo de maquinaria."; errBox.classList.remove("hidden"); return; }
  if (!eco && !numInterno) { errBox.textContent = "Captura al menos el # ECO o el # interno."; errBox.classList.remove("hidden"); return; }

  // BUG REAL (punto C): el catálogo importado del CSV solo trae "# Interno",
  // así que el campo "# ECO" llegaba vacío y al subir un documento tronaba
  // pidiendo "Captura el # ECO" aunque la máquina ya tuviera identificador.
  // Mismo criterio que tenían los datos del CSV: si no se capturó un ECO
  // distinto, se usa el # Interno como identificador para guardar y para
  // la ruta de Storage de los documentos.
  const ecoEfectivo = eco || numInterno;

  showLoading("Guardando maquinaria...");
  try {
    const anterior = docId ? window._maquinariaCache[docId] : null;
    const cambioZona = anterior && (anterior.zona !== zona || anterior.subzona !== subzona);

    // Documentos (punto 7.2): si se seleccionó un PDF nuevo para algún
    // tipo, se sube primero a Storage; si no, se conserva la URL/path que
    // ya existiera. El checkbox y la fecha de vencimiento son independientes
    // de si hay PDF o no (se pueden marcar "se tiene" a mano, sin archivo).
    const documentos = {};
    for (const { campo, idSufijo } of DOCUMENTOS_TIPOS) {
      const anteriorDoc = normalizarDocumento(anterior?.documentos?.[campo]);
      const file = document.getElementById(`maq-doc-${idSufijo}-file`).files[0];
      let url = anteriorDoc.url;
      let path = anteriorDoc.path;
      let subidoEn = anteriorDoc.subidoEn;
      let subidoPor = anteriorDoc.subidoPor;

      if (file) {
        if (!ecoEfectivo) throw new Error(`Captura el # ECO o el # Interno antes de subir el PDF de "${campo}".`);
        const subida = await subirDocumentoMaquinaria(file, ecoEfectivo, idSufijo);
        url = subida.url;
        path = subida.path;
        subidoEn = window.fbTimestamp.now();
        subidoPor = currentUser?.email || "—";
      }

      documentos[campo] = {
        tiene: document.getElementById(`maq-doc-${idSufijo}`).checked || !!url,
        url, path,
        vencimiento: document.getElementById(`maq-doc-${idSufijo}-venc`).value || null,
        subidoEn, subidoPor,
      };
    }

    const data = {
      tipo, marca,
      modelo: document.getElementById("maq-modelo").value.trim(),
      eco: ecoEfectivo, numInterno,
      serie: document.getElementById("maq-serie").value.trim(),
      fechaIngreso: document.getElementById("maq-fecha-ingreso").value || null,
      fechaEgreso: document.getElementById("maq-fecha-egreso").value || null,
      zona, subzona,
      proveedor: document.getElementById("maq-proveedor").value.trim(),
      propiedad: document.getElementById("maq-propiedad").value,
      capacidadTanque: parseFloat(document.getElementById("maq-capacidad").value) || null,
      consumoBajo: parseFloat(document.getElementById("maq-consumo-bajo").value) || null,
      consumoMedio: parseFloat(document.getElementById("maq-consumo-medio").value) || null,
      consumoAlto: parseFloat(document.getElementById("maq-consumo-alto").value) || null,
      consumoPromedio: parseFloat(document.getElementById("maq-consumo-promedio").value) || null,
      activa: document.getElementById("maq-activa").checked,
      documentos,
      actualizadoEn: window.fbTimestamp.now(),
    };

    let refMaquina;
    if (docId) {
      refMaquina = window.fbDoc(window.firebaseDB, "maquinaria", docId);
      await window.fbUpdateDoc(refMaquina, data);
    } else {
      data.creadoEn = window.fbTimestamp.now();
      refMaquina = window.fbDoc(window.fbCollection(window.firebaseDB, "maquinaria"));
      await window.fbSetDoc(refMaquina, data);
    }

    // Historial de zonas (append-only, punto 7): si la máquina cambió de
    // zona/subzona, dejamos constancia del "antes" y "después" para que el
    // consumo de combustible se siga atribuyendo correctamente por zona.
    if (cambioZona || !docId) {
      const histRef = window.fbCollection(window.firebaseDB, "maquinaria", refMaquina.id, "historialZonas");
      await window.fbAddDoc?.(histRef, {
        zonaAnterior: anterior?.zona || null,
        subzonaAnterior: anterior?.subzona || null,
        zonaNueva: zona,
        subzonaNueva: subzona,
        fecha: window.fbTimestamp.now(),
        usuario: currentUser?.email || "—",
      }).catch(async () => {
        // Fallback por si fbAddDoc no está expuesto: usamos setDoc con id propio.
        const docHist = window.fbDoc(histRef);
        await window.fbSetDoc(docHist, {
          zonaAnterior: anterior?.zona || null,
          subzonaAnterior: anterior?.subzona || null,
          zonaNueva: zona,
          subzonaNueva: subzona,
          fecha: window.fbTimestamp.now(),
          usuario: currentUser?.email || "—",
        });
      });
    }

    hideLoading();
    cerrarModalMaquinaria();
    loadMaquinaria();
  } catch (e) {
    hideLoading();
    errBox.textContent = "Error: " + e.message;
    errBox.classList.remove("hidden");
  }
}

async function eliminarMaquinaria() {
  if (!isMaster) return;
  const docId = document.getElementById("maq-doc-id").value;
  if (!docId) return;
  if (!confirm("¿Eliminar esta maquinaria del catálogo? Esta acción no se puede deshacer.")) return;
  showLoading("Eliminando...");
  try {
    await window.fbDeleteDoc(window.fbDoc(window.firebaseDB, "maquinaria", docId));
    hideLoading();
    cerrarModalMaquinaria();
    loadMaquinaria();
  } catch (e) {
    hideLoading();
    alert("Error al eliminar: " + e.message);
  }
}

/* --- DESCARGA DE CONSUMOS DE UNA MÁQUINA (punto 7) ---
   Tabla en Excel con: fecha, carga (L), tipo de combustible y
   rendimiento (lt/hr), de TODAS las cargas registradas para esa máquina. */
async function cargarSheetJS() {
  if (window.XLSX) return;
  await new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = res;
    s.onerror = () => rej(new Error("No se pudo cargar la librería de Excel. Revisa tu conexión a internet."));
    document.head.appendChild(s);
  });
}

async function descargarConsumosMaquinaria() {
  const docId = document.getElementById("maq-doc-id").value;
  if (!docId) return;
  const d = window._maquinariaCache[docId];
  if (!d) { alert("No se encontró la maquinaria en caché. Vuelve a abrir la ficha e intenta de nuevo."); return; }

  // Mismo criterio que usa el catálogo de Cargas para # ECO: numInterno
  // tiene prioridad, luego eco, luego el id del documento.
  const interno = d.numInterno || d.eco || docId;

  showLoading("Generando tabla de consumos...");
  try {
    await cargarSheetJS();

    const col = window.fbCollection(window.firebaseDB, "registros");
    const q = window.fbQuery(col, window.fbWhere("eco", "==", interno));
    const snap = await window.fbGetDocs(q);

    if (snap.empty) {
      hideLoading();
      alert(`No hay cargas de combustible registradas para ${interno} todavía.`);
      return;
    }

    const registrosOrdenados = snap.docs
      .map(ds => ds.data())
      .sort((a, b) => (a.fecha || "").localeCompare(b.fecha || ""));

    const filas = [["Fecha", "Carga (L)", "Tipo de combustible", "Rendimiento (lt/hr)"]];
    registrosOrdenados.forEach(r => {
      const rendimientoNumerico =
        typeof r.rendimiento === "string" && !isNaN(parseFloat(r.rendimiento))
          ? parseFloat(r.rendimiento)
          : (r.rendimiento || "—");
      filas.push([
        r.fecha || "",
        typeof r.litros === "number" ? r.litros : (parseFloat(r.litros) || ""),
        r.tipoCombustible || "",
        rendimientoNumerico,
      ]);
    });

    const ws = window.XLSX.utils.aoa_to_sheet(filas);
    ws["!cols"] = [{ wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 18 }];
    const rango = window.XLSX.utils.decode_range(ws["!ref"]);
    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const celda = ws[window.XLSX.utils.encode_cell({ r: 0, c })];
      if (celda) celda.s = { font: { bold: true } };
    }

    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Consumos");
    window.XLSX.writeFile(wb, `Consumos_${rutaSegura(interno)}_${new Date().toISOString().split("T")[0]}.xlsx`);

    hideLoading();
  } catch (e) {
    hideLoading();
    alert("Error al generar la tabla de consumos: " + e.message);
  }
}

/* ───────────────────────────── RESUMEN (punto 6) y DASHBOARD (punto 8) ───────────────────────────── */

// Trae la maquinaria UNA vez y arma:
//  - mapPorInterno: igual clave que usa "registros.eco" (numInterno || eco || docId)
//  - lista: arreglo completo de máquinas con su id
async function obtenerMaquinariaParaReportes() {
  const col = window.fbCollection(window.firebaseDB, "maquinaria");
  const snap = await window.fbGetDocs(col);
  const mapPorInterno = {};
  const lista = [];
  snap.forEach(docSnap => {
    const d = { id: docSnap.id, ...docSnap.data() };
    lista.push(d);
    const clave = d.numInterno || d.eco || d.id;
    mapPorInterno[clave] = d;
  });
  return { mapPorInterno, lista };
}

// Escapa texto antes de insertarlo en SVG/HTML (labels vienen de zona,
// subzona, tipo, etc. — capturados por usuarios con rol de edición, pero
// igual no cuesta nada evitar que un "<" o "&" rompa el marcado).
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ============================================================
// GRÁFICA DE BARRAS HORIZONTALES (SVG) — reemplaza a las barras
// hechas con <div> planos. Se ve consistente en cualquier tamaño de
// pantalla (viewBox responsivo, ideal para celular) y sin depender
// de ninguna librería externa (sigue funcionando offline en la PWA).
// data = [{ label, value }]
// opts.sufijo → texto después del valor (ej. " lt/hr")
// opts.color / opts.colorEnd → degradado de las barras
// ============================================================
function renderBarChart(containerId, data, opts = {}) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  if (!data || !data.length) {
    cont.innerHTML = `<div class="chart-empty">📭 Sin datos para mostrar.</div>`;
    return;
  }

  const sufijo = opts.sufijo || "";
  const color = opts.color || "var(--orange)";
  const colorEnd = opts.colorEnd || "var(--orange-glow)";

  const ordenados = [...data].sort((a, b) => b.value - a.value).slice(0, opts.maxItems || 12);
  const max = Math.max(...ordenados.map(d => Math.abs(d.value)), 1);

  const rowH = 26;
  const gap = 12;
  const topPad = 6;
  const labelW = 92;
  const rightPad = 44;
  const chartW = 320;
  const trackW = chartW - labelW - rightPad;
  const h = ordenados.length * (rowH + gap) - gap + topPad * 2;
  const gradId = `barGrad-${containerId}`;

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(f => {
    const x = labelW + f * trackW;
    return `<line x1="${x.toFixed(1)}" y1="0" x2="${x.toFixed(1)}" y2="${h}" class="chart-grid-line" />`;
  }).join("");

  const bars = ordenados.map((d, i) => {
    const y = topPad + i * (rowH + gap);
    const w = Math.max((Math.abs(d.value) / max) * trackW, 3);
    const label = escapeHtml(d.label).length > 16 ? escapeHtml(d.label).slice(0, 15) + "…" : escapeHtml(d.label);
    return `
      <g>
        <title>${escapeHtml(d.label)}: ${d.value}${sufijo}</title>
        <text x="${labelW - 8}" y="${(y + rowH / 2).toFixed(1)}" text-anchor="end" dominant-baseline="middle" class="chart-bar-label">${label}</text>
        <rect x="${labelW}" y="${y}" width="${trackW.toFixed(1)}" height="${rowH}" rx="5" class="chart-bar-track" />
        <rect x="${labelW}" y="${y}" width="${w.toFixed(1)}" height="${rowH}" rx="5" fill="url(#${gradId})" class="chart-bar-fill" />
        <text x="${(labelW + w + 8).toFixed(1)}" y="${(y + rowH / 2).toFixed(1)}" dominant-baseline="middle" class="chart-bar-value">${d.value}${sufijo}</text>
      </g>`;
  }).join("");

  cont.innerHTML = `
    <svg viewBox="0 0 ${chartW} ${h}" class="chart-svg" preserveAspectRatio="xMidYMid meet" role="img">
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${color}" />
          <stop offset="100%" stop-color="${colorEnd}" />
        </linearGradient>
      </defs>
      ${gridLines}
      ${bars}
    </svg>`;
}

// Se conserva el nombre anterior como alias, por si algo más lo llama.
const renderBarras = renderBarChart;

// ============================================================
// GRÁFICA DE DONA (SVG) — para distribuciones tipo Bajo/Medio/Alto.
// data = [{ label, value, color }]
// ============================================================
function renderDonutChart(containerId, data, opts = {}) {
  const cont = document.getElementById(containerId);
  if (!cont) return;
  const limpio = (data || []).filter(d => d.value > 0);
  const total = limpio.reduce((s, d) => s + d.value, 0);

  if (!total) {
    cont.innerHTML = `<div class="chart-empty">📭 Sin datos para mostrar.</div>`;
    return;
  }

  const R = 52, strokeW = 18, cx = 64, cy = 64;
  const C = 2 * Math.PI * R;
  let acc = 0;
  const segments = limpio.map(d => {
    const frac = d.value / total;
    const dash = Math.max(frac * C, frac > 0 ? 1.5 : 0);
    const seg = `<circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="${d.color}" stroke-width="${strokeW}"
      stroke-dasharray="${dash.toFixed(2)} ${(C - dash).toFixed(2)}" stroke-dashoffset="${(-acc).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})" class="donut-seg"><title>${escapeHtml(d.label)}: ${d.value} (${Math.round(frac * 100)}%)</title></circle>`;
    acc += dash;
    return seg;
  }).join("");

  const legend = limpio.map(d => `
    <div class="donut-legend-item">
      <span class="donut-dot" style="background:${d.color};"></span>
      <span class="donut-legend-label">${escapeHtml(d.label)}</span>
      <span class="donut-legend-value">${d.value} · ${Math.round((d.value / total) * 100)}%</span>
    </div>`).join("");

  cont.innerHTML = `
    <div class="donut-wrap">
      <svg viewBox="0 0 128 128" class="donut-svg" role="img">
        <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="var(--bg-elevated)" stroke-width="${strokeW}" />
        ${segments}
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" class="donut-total-num">${total}</text>
        <text x="${cx}" y="${cy + 13}" text-anchor="middle" class="donut-total-label">${opts.centerLabel || "total"}</text>
      </svg>
      <div class="donut-legend">${legend}</div>
    </div>`;
}

function clasificarConsumo(valor, bajo, medio, alto) {
  if (valor == null || isNaN(valor)) return null;
  if (bajo == null || alto == null) return null;
  if (valor <= bajo) return "Bajo";
  if (valor <= alto) return "Medio";
  return "Alto";
}

/* ── RESUMEN ── */
async function loadResumen() {
  const desdeInput = document.getElementById("res-fecha-desde");
  const hastaInput = document.getElementById("res-fecha-hasta");
  if (!hastaInput.value) hastaInput.value = new Date().toISOString().split("T")[0];
  if (!desdeInput.value) {
    const d = new Date(); d.setDate(d.getDate() - 30);
    desdeInput.value = d.toISOString().split("T")[0];
  }
  const desde = desdeInput.value, hasta = hastaInput.value;
  const zonaFiltro = document.getElementById("res-f-zona").value;

  // Punto 5: el Visor sí puede descargar el PDF de Resumen aunque no
  // pueda editar nada más en la app.
  document.getElementById("btn-pdf-resumen")?.classList.toggle("hidden", !Roles.puedeDescargarPDFResumen(currentRol));

  document.getElementById("res-rendimientos-chart").innerHTML = "Cargando...";
  document.getElementById("res-equipos-list").innerHTML = "Cargando...";

  try {
    const { mapPorInterno, lista } = await obtenerMaquinariaParaReportes();

    // Refrescar opciones del select de zona sin perder lo seleccionado
    const zonas = [...new Set(lista.map(m => m.zona).filter(Boolean))].sort();
    const selZona = document.getElementById("res-f-zona");
    selZona.innerHTML = `<option value="">Todas las zonas</option>` + zonas.map(z => `<option value="${z}">${z}</option>`).join("");
    selZona.value = zonaFiltro;

    // --- Sección RENDIMIENTOS ---
    const colReg = window.fbCollection(window.firebaseDB, "registros");
    const qReg = window.fbQuery(colReg, window.fbWhere("fecha", ">=", desde), window.fbWhere("fecha", "<=", hasta));
    const snapReg = await window.fbGetDocs(qReg);

    const grupos = {}; // etiqueta -> { suma, n }
    snapReg.forEach(docSnap => {
      const r = docSnap.data();
      const valor = parseFloat(r.rendimiento);
      if (isNaN(valor)) return; // ignora "N/A" / "Primer Registro"
      const maquina = mapPorInterno[r.eco];
      if (!maquina) return;
      if (zonaFiltro && maquina.zona !== zonaFiltro) return;

      const etiqueta = zonaFiltro
        ? `${maquina.tipo || "—"} ${maquina.marca || ""}`.trim()
        : (maquina.zona || "Sin zona");

      if (!grupos[etiqueta]) grupos[etiqueta] = { suma: 0, n: 0 };
      grupos[etiqueta].suma += valor;
      grupos[etiqueta].n += 1;
    });

    const dataRendimientos = Object.entries(grupos).map(([label, g]) => ({ label, value: Math.round((g.suma / g.n) * 100) / 100 }));
    document.getElementById("res-rendimientos-sub").textContent = zonaFiltro
      ? `Consumo promedio por tipo+marca en "${zonaFiltro}" (${desde} a ${hasta})`
      : `Consumo promedio (lt/hr) por zona (${desde} a ${hasta})`;
    renderBarChart("res-rendimientos-chart", dataRendimientos, { sufijo: " lt/hr", color: "var(--orange)", colorEnd: "var(--orange-glow)" });

    // --- Sección EQUIPOS ---
    const activos = lista.filter(m => m.activa !== false);
    const porTipo = {};
    activos.forEach(m => {
      const tipo = m.tipo || "Sin tipo";
      if (!porTipo[tipo]) porTipo[tipo] = { propia: 0, rentada: 0 };
      if ((m.propiedad || "Propia") === "Rentada") porTipo[tipo].rentada++;
      else porTipo[tipo].propia++;
    });
    const equiposHtml = Object.entries(porTipo)
      .sort((a, b) => (b[1].propia + b[1].rentada) - (a[1].propia + a[1].rentada))
      .map(([tipo, c]) => `
        <div class="history-card" style="cursor:default;">
          <div class="hc-header"><span>${tipo}</span><span>${c.propia + c.rentada}</span></div>
          <p style="color:var(--text-muted); font-size:12px; margin-top:4px;">Propias: ${c.propia} · Rentadas: ${c.rentada}</p>
        </div>`).join("");
    document.getElementById("res-equipos-list").innerHTML = equiposHtml || `<p style="color:var(--text-muted); font-size:13px;">Sin maquinaria activa.</p>`;

    // Cache para el PDF
    window._resumenCache = { desde, hasta, zonaFiltro, dataRendimientos, porTipo };
  } catch (e) {
    document.getElementById("res-rendimientos-chart").innerHTML = `<p style="color:var(--red);">❌ Error: ${e.message}</p>`;
    console.error("loadResumen error:", e);
  }
}

async function descargarResumenPDF() {
  const data = window._resumenCache;
  if (!data) { alert("Espera a que cargue el Resumen antes de descargarlo."); return; }
  if (!window.jspdf) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = res; s.onerror = () => rej(new Error("No se pudo cargar jsPDF."));
      document.head.appendChild(s);
    });
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "in", format: "letter" });
  let y = 0.6;
  doc.setFont("helvetica", "bold"); doc.setFontSize(16);
  doc.text("Resumen ejecutivo — Control de Combustible", 0.5, y); y += 0.3;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(`Periodo: ${data.desde} a ${data.hasta}${data.zonaFiltro ? " · Zona: " + data.zonaFiltro : ""}`, 0.5, y); y += 0.35;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Rendimientos", 0.5, y); y += 0.22;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  data.dataRendimientos.forEach(d => { doc.text(`${d.label}: ${d.value} lt/hr`, 0.6, y); y += 0.2; });
  y += 0.2;

  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text("Equipos activos", 0.5, y); y += 0.22;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  Object.entries(data.porTipo).forEach(([tipo, c]) => {
    doc.text(`${tipo}: ${c.propia + c.rentada} (Propias: ${c.propia}, Rentadas: ${c.rentada})`, 0.6, y); y += 0.2;
  });

  doc.save(`Resumen_${data.desde}_a_${data.hasta}.pdf`);
}

/* ── DASHBOARD ── */
async function loadDashboard() {
  document.getElementById("dash-kpis").innerHTML = "Cargando...";
  try {
    const { lista } = await obtenerMaquinariaParaReportes();

    // Refrescar opciones de filtros sin perder lo seleccionado
    const fEco = document.getElementById("dash-f-eco").value;
    const fZona = document.getElementById("dash-f-zona").value;
    const fProv = document.getElementById("dash-f-proveedor").value;

    document.getElementById("dash-f-eco").innerHTML = `<option value="">Todas las máquinas</option>` +
      lista.map(m => `<option value="${m.numInterno || m.eco || m.id}">${m.eco || m.numInterno} — ${m.tipo || ""}</option>`).join("");
    document.getElementById("dash-f-eco").value = fEco;

    const zonas = [...new Set(lista.map(m => m.zona).filter(Boolean))].sort();
    document.getElementById("dash-f-zona").innerHTML = `<option value="">Todas las zonas</option>` + zonas.map(z => `<option value="${z}">${z}</option>`).join("");
    document.getElementById("dash-f-zona").value = fZona;

    const proveedores = [...new Set(lista.map(m => m.proveedor).filter(Boolean))].sort();
    document.getElementById("dash-f-proveedor").innerHTML = `<option value="">Todos los proveedores</option>` + proveedores.map(p => `<option value="${p}">${p}</option>`).join("");
    document.getElementById("dash-f-proveedor").value = fProv;

    const filtradas = lista.filter(m => {
      if (fEco && (m.numInterno || m.eco || m.id) !== fEco) return false;
      if (fZona && m.zona !== fZona) return false;
      if (fProv && m.proveedor !== fProv) return false;
      return true;
    });

    // --- KPIs Bajo/Medio/Alto: usa el último rendimiento registrado de cada máquina ---
    const conteo = { Bajo: 0, Medio: 0, Alto: 0, "Sin datos": 0 };
    await Promise.all(filtradas.map(async m => {
      const clave = m.numInterno || m.eco || m.id;
      try {
        const colReg = window.fbCollection(window.firebaseDB, "registros");
        const qReg = window.fbQuery(colReg, window.fbWhere("eco", "==", clave), window.fbLimit(10));
        const snap = await window.fbGetDocs(qReg);
        let mejorValor = null, mejorFecha = null;
        snap.forEach(docSnap => {
          const r = docSnap.data();
          const v = parseFloat(r.rendimiento);
          if (isNaN(v)) return;
          if (!mejorFecha || r.fecha > mejorFecha) { mejorFecha = r.fecha; mejorValor = v; }
        });
        const claseReal = mejorValor == null ? "Sin datos" : (clasificarConsumo(mejorValor, m.consumoBajo, m.consumoMedio, m.consumoAlto) || "Sin datos");
        conteo[claseReal] = (conteo[claseReal] || 0) + 1;
      } catch (e) { conteo["Sin datos"]++; }
    }));

    document.getElementById("dash-kpis").innerHTML = `
      <div class="kpi-card kpi-neutral">
        <div class="kpi-icon">🚜</div>
        <div class="kpi-num">${filtradas.length}</div>
        <div class="kpi-label">Máquinas filtradas</div>
      </div>
      <div class="kpi-card kpi-green">
        <div class="kpi-icon">🟢</div>
        <div class="kpi-num" style="color:var(--green);">${conteo.Bajo}</div>
        <div class="kpi-label">Consumo bajo</div>
      </div>
      <div class="kpi-card kpi-orange">
        <div class="kpi-icon">🟠</div>
        <div class="kpi-num" style="color:var(--orange);">${conteo.Medio}</div>
        <div class="kpi-label">Consumo medio</div>
      </div>
      <div class="kpi-card kpi-red">
        <div class="kpi-icon">🔴</div>
        <div class="kpi-num" style="color:var(--red);">${conteo.Alto}</div>
        <div class="kpi-label">Consumo alto</div>
      </div>
    `;

    renderDonutChart("dash-donut", [
      { label: "Bajo", value: conteo.Bajo, color: "var(--green)" },
      { label: "Medio", value: conteo.Medio, color: "var(--orange)" },
      { label: "Alto", value: conteo.Alto, color: "var(--red)" },
      { label: "Sin datos", value: conteo["Sin datos"], color: "var(--text-dim)" },
    ], { centerLabel: "máquinas" });

    // --- Gráfico por zona y por subzona ---
    const porZona = {}, porSubzona = {};
    filtradas.forEach(m => {
      const z = m.zona || "Sin zona"; porZona[z] = (porZona[z] || 0) + 1;
      const s = m.subzona || "Sin subzona"; porSubzona[s] = (porSubzona[s] || 0) + 1;
    });
    renderBarChart("dash-chart-zona", Object.entries(porZona).map(([label, value]) => ({ label, value })), { color: "var(--orange)", colorEnd: "var(--orange-glow)" });
    renderBarChart("dash-chart-subzona", Object.entries(porSubzona).map(([label, value]) => ({ label, value })), { color: "var(--blue)", colorEnd: "rgba(88,166,255,0.35)" });

    // --- Tabla tipo / cantidad / marcas / consumo promedio ---
    const porTipo = {};
    filtradas.forEach(m => {
      const tipo = m.tipo || "Sin tipo";
      if (!porTipo[tipo]) porTipo[tipo] = { cantidad: 0, marcas: new Set(), sumaConsumo: 0, nConsumo: 0 };
      porTipo[tipo].cantidad++;
      if (m.marca) porTipo[tipo].marcas.add(m.marca);
      if (typeof m.consumoPromedio === "number") { porTipo[tipo].sumaConsumo += m.consumoPromedio; porTipo[tipo].nConsumo++; }
    });
    const filas = Object.entries(porTipo).map(([tipo, t]) => `
      <tr>
        <td>${tipo}</td>
        <td>${t.cantidad}</td>
        <td>${[...t.marcas].join(", ") || "—"}</td>
        <td>${t.nConsumo ? (t.sumaConsumo / t.nConsumo).toFixed(2) : "—"}</td>
      </tr>`).join("");
    document.getElementById("dash-tabla").innerHTML = `
      <table class="resumen-table">
        <thead><tr><th>Tipo</th><th>Cantidad</th><th>Marcas</th><th>Consumo prom. lt/hr</th></tr></thead>
        <tbody>${filas || `<tr><td colspan="4">Sin datos</td></tr>`}</tbody>
      </table>`;
  } catch (e) {
    document.getElementById("dash-kpis").innerHTML = `<p style="color:var(--red);">❌ Error: ${e.message}</p>`;
    console.error("loadDashboard error:", e);
  }
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
window.descargarConsumosMaquinaria = descargarConsumosMaquinaria;
window.installApp = installApp;
window.autoCompletarEquipoEdit = autoCompletarEquipoEdit;
window.abrirEditar = abrirEditar;
window.cerrarModalEditar = cerrarModalEditar;
window.guardarEdicion = guardarEdicion;
window.conciliarRegistro = conciliarRegistro;
window.abrirUsuario = abrirUsuario;
window.cerrarModalUsuario = cerrarModalUsuario;
window.guardarUsuario = guardarUsuario;
window.resetPasswordUsuario = resetPasswordUsuario;
window.eliminarUsuario = eliminarUsuario;
window.forceDownloadPDF = forceDownloadPDF;
window.descargarPDFDesdeCache = descargarPDFDesdeCache;
window.loadPendientes = loadPendientes;
window.resetFormulario = resetFormulario;
window.sincronizarCola = sincronizarCola;
window.setHorometroMode = setHorometroMode;
window.loadProveedor = loadProveedor;
window.previewProveedorFoto = previewProveedorFoto;
window.abrirProveedor = abrirProveedor;
window.cerrarModalProveedor = cerrarModalProveedor;
window.guardarProveedor = guardarProveedor;
window.eliminarProveedor = eliminarProveedor;
window.descargarFotoProveedor = descargarFotoProveedor;
window.descargarProveedorPDF = descargarProveedorPDF;
window.loadMaquinaria = loadMaquinaria;
window.loadPermisos = loadPermisos;
window.abrirMaquinaria = abrirMaquinaria;
window.cerrarModalMaquinaria = cerrarModalMaquinaria;
window.guardarMaquinaria = guardarMaquinaria;
window.eliminarMaquinaria = eliminarMaquinaria;
window.toggleOtroMaquinaria = toggleOtroMaquinaria;
window.syncEcoConInterno = syncEcoConInterno;
window.poblarSubzonas = poblarSubzonas;
window.loadResumen = loadResumen;
window.descargarResumenPDF = descargarResumenPDF;
window.loadDashboard = loadDashboard;
