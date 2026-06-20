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
i  deferredInstallPrompt = null;
  document.getElementById("btn-install")?.classList.add("hidden");
}
window.addEventListener("appinstalled", () => {
  document.getElementById("btn-install")?.classList.add("hidden");
});

async function loadFirebase() {
  const { initializeApp }   = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js");
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

let dataFotos = { ini: null, fin: null, ticket: null, pend: null };
let estadoFotos = { ini: false, fin: false, ticket: false, pend: false };

const catalogoEquipos = [
  { "maquinaria": "CAMION ARTICULADO", "marca": "CAT", "modelo": "745", "interno": "CAT-745-" },
  { "maquinaria": "CAMION ARTICULADO", "marca": "SANY", "modelo": "SAT40C", "interno": "SANY-SAT40C" },
  { "maquinaria": "CARGADOR FRONTAL", "marca": "KOMATSU", "modelo": "WA600", "interno": "CFN-600-001" },
  { "maquinaria": "EXCAVADORA", "marca": "CAT", "modelo": "320ELRR", "interno": "EHO-320-E" },
  { "maquinaria": "EXCAVADORA", "marca": "CAT", "modelo": "385 BL", "interno": "EHO-385-" },
  { "maquinaria": "EXCAVADORA", "marca": "KOMATSU", "modelo": "PC450-LC8", "interno": "EHO-450-" },
  { "maquinaria": "EXCAVADORA", "marca": "KOMATSU", "modelo": "PC500 LC-10M0", "interno": "PC500 LC-" },
  { "maquinaria": "EXCAVADORA", "marca": "SANY", "modelo": "SY550HD", "interno": "R-EHO-550" },
  { "maquinaria": "EXCAVADORA", "marca": "SANY", "modelo": "SY500H", "interno": "R-EHO-500" },
  { "maquinaria": "GRÚA", "marca": "LINKBELT", "modelo": "LS138", "interno": "GDO-138-X" },
  { "maquinaria": "MOTOCONFORMADORA", "marca": "SANY", "modelo": "SMG200C-8", "interno": "R-MOT-200-0" },
  { "maquinaria": "RETROEXCAVADORA", "marca": "JOHN DEERE", "modelo": "310L", "interno": "RHN-310-0" },
  { "maquinaria": "TRACTOR DE ORUGAS", "marca": "KOMATSU", "modelo": "D65EX-16", "interno": "R-TRO-D6-0" },
  { "maquinaria": "VIBROCOMPACTADOR", "marca": "CAT", "modelo": "CS11GC", "interno": "VCM-S11-0" }
];

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
  document.getElementById("edit-maquinaria").value = eq ? eq.maquinaria : "";
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
      if (displayUser.endsWith("@rompeolas.app")) {
        displayUser = displayUser.replace("@rompeolas.app", "");
      }
      document.getElementById("header-user").textContent = displayUser;

      isAdmin = (authData.rol === 'admin' || authData.rol === 'master');
      isMaster = (authData.rol === 'master');
      if (isAdmin) document.getElementById("tab-pendientes").classList.remove("hidden");
      if (isMaster) document.getElementById("tab-usuarios").classList.remove("hidden");

      showScreen("app");
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
  const username = document.getElementById("login-username").value.trim().toLowerCase();
  const pw = document.getElementById("login-password").value;

  if (!username || !pw) return showLoginError("Ingresa usuario y contraseña.");

  // Le agregamos el dominio ficticio por detrás
  const fakeEmail = `${username}@rompeolas.app`;

  try { await window.fbSignIn(window.firebaseAuth, fakeEmail, pw); }
  catch (e) { showLoginError("Usuario o contraseña incorrectos."); }
}

async function handleLogout() { await window.fbSignOut(window.firebaseAuth); location.reload(); }
function showLoginError(msg) { document.getElementById("login-error").textContent = msg; document.getElementById("login-error").classList.remove("hidden"); }
function togglePassword() { const p = document.getElementById("login-password"); p.type = p.type === "password" ? "text" : "password"; }

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
function toggleHorometro() {
  const sinHoro = document.getElementById("chk-sin-horometro").checked;
  const input = document.getElementById("f-horometro");
  input.disabled = sinHoro;
  if (sinHoro) { input.value = ""; document.getElementById("horometro-badge").textContent = "N/A"; }
}
function updateHorometroBadge() {
  const val = document.getElementById("f-horometro").value;
  if (!val) return document.getElementById("horometro-badge").textContent = "— h";
  const lastDigit = parseInt(val.toString().slice(-1)) || 0;
  const hours = Math.floor(val / 10);
  document.getElementById("horometro-badge").textContent = `${hours}h ${lastDigit * 6 > 0 ? lastDigit * 6 + "m" : ""}`;
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
const TARGET_BYTES_FOTO = { ini: 140 * 1024, fin: 140 * 1024, ticket: 220 * 1024, pend: 220 * 1024 };

// Límite de seguridad para la suma de las fotos de un registro.
const LIMITE_TOTAL_FOTOS_BYTES = 850 * 1024;

function validarTamanoFotos(...fotos) {
  let total = 0;
  fotos.forEach(f => { if (f) total += tamanoBase64Bytes(f); });
  return { ok: total <= LIMITE_TOTAL_FOTOS_BYTES, totalKB: Math.round(total / 1024) };
}

/* --- FOTOS SURTIDOR Y TICKET --- */
// ✅ CORRECCIÓN: se reemplazó compressImage() (inexistente) por compressImageToTarget()
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
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`panel-step-${i}`)?.classList.toggle("active", i === n);
    document.getElementById(`step-dot-${i}`)?.classList.toggle("active", i === n);
    document.getElementById(`step-line-${i}`)?.classList.toggle("active", i === n);
  }
  if (n === 4) buildSummary();
}

function validateStep(step) {
  if (step === 1) {
    if (!document.getElementById("f-eco").value) { alert("Selecciona el ECO"); return false; }
    if (!document.getElementById("chk-sin-horometro").checked && !document.getElementById("f-horometro").value) {
      alert("Falta horómetro"); return false;
    }
    return true;
  }
  if (step === 2) {
    const tipo = document.querySelector('input[name="tipo-combustible"]:checked');
    if (!tipo) { alert("Selecciona Diésel o Gasolina"); return false; }
    if (!document.getElementById("f-litros").value) { alert("Faltan litros"); return false; }
    const ci = parseFloat(document.getElementById("f-cuenta-inicial").value);
    if (isNaN(ci) || ci !== 0) { alert("❌ La cuenta litros inicial debe ser 0."); return false; }
    if (!document.getElementById("f-cuenta-final").value) { alert("Falta cuenta final"); return false; }
    if (!estadoFotos.ini) { alert("❌ Debes tomar y CONFIRMAR la foto Inicial."); return false; }
    if (!estadoFotos.fin) { alert("❌ Debes tomar y CONFIRMAR la foto Final."); return false; }
    return true;
  }
  if (step === 3) {
    if (!document.getElementById("chk-ticket-despues").checked) {
      if (!document.getElementById("f-ticket").value) { alert("Ingresa el # de Ticket"); return false; }
      if (!estadoFotos.ticket) { alert("❌ Debes tomar y CONFIRMAR la foto del Ticket."); return false; }
    }
    return true;
  }
  return true;
}

function buildSummary() {
  const isPendiente = document.getElementById("chk-ticket-despues").checked;
  const html = `
    <div class="summary-row"><span class="summary-key">ECO</span><span class="summary-val highlight">${document.getElementById("f-eco").value}</span></div>
    <div class="summary-row"><span class="summary-key">Litros</span><span class="summary-val">${document.getElementById("f-litros").value} L</span></div>
    <div class="summary-row"><span class="summary-key">Estatus Ticket</span><span class="summary-val">${isPendiente ? "⏳ Pendiente" : "✅ Adjuntado"}</span></div>
  `;
  document.getElementById("summary-card").innerHTML = html;
}

/* --- CALCULO RENDIMIENTO L/H --- */
async function getRendimiento(ecoActual, horoRawActual, litrosActuales) {
  if (!horoRawActual) return "N/A";
  try {
    const col = window.fbCollection(window.firebaseDB, "registros");
    const q = window.fbQuery(col, window.fbWhere("eco", "==", ecoActual), window.fbOrderBy("creadoEn", "desc"), window.fbLimit(1));
    const snap = await window.fbGetDocs(q);

    if (!snap.empty) {
      const prevData = snap.docs[0].data();
      if (prevData.horometroRaw) {
        const currentHoroDec = (Math.floor(horoRawActual / 10)) + ((horoRawActual % 10) / 10);
        const prevHoroDec = (Math.floor(prevData.horometroRaw / 10)) + ((prevData.horometroRaw % 10) / 10);
        const horasTrabajadas = currentHoroDec - prevHoroDec;
        if (horasTrabajadas > 0) {
          return (litrosActuales / horasTrabajadas).toFixed(2);
        }
      }
    }
    return "Primer Registro";
  } catch (e) { return "N/A"; }
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
      usuario: currentUser.email,
      conciliado: false,
      creadoEn: window.fbTimestamp.now()
    };

    // 1. PRIMERO GUARDAMOS EN FIREBASE
    await window.fbSetDoc(docRef, record);

    // 2. SOLO SI FIREBASE GUARDÓ CON ÉXITO, GENERAMOS EL PDF
    if (!isPendiente) {
      showLoading("Datos guardados. Generando PDF...");
      const pdfDoc = await generateTicketPDF(record);
      pdfDoc.save(`FuelControl_${eco}_${record.ticket}.pdf`);
    }

    hideLoading();
    alert(isPendiente ? "Guardado como PENDIENTE. (No se generó PDF aún)" : "Guardado con éxito en la nube y PDF descargado.");
    location.reload();

  } catch (e) {
    hideLoading();
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
    if (snap.empty) {
      list.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:20px;">Sin registros pendientes ✅</p>';
      return;
    }

  
