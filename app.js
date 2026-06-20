// =============================================
// app.js — FuelControl PWA (Actualizado L/h y Pendientes)
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

async function loadFirebase() {
  const { initializeApp }   = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js");
  const { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js");
  // Añadimos limit, doc y updateDoc para las nuevas funciones
  const { getFirestore, collection, addDoc, getDocs, query, where, orderBy, Timestamp, limit, doc, updateDoc, setDoc } = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js");
const { getStorage, ref, uploadString } = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-storage.js");
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
  window.fbQuery      = query;
  window.fbWhere      = where;
  window.fbOrderBy    = orderBy;
  window.fbTimestamp  = Timestamp;
  window.fbLimit      = limit;
  window.fbDoc        = doc;
  window.fbUpdateDoc  = updateDoc;
  window.fbSetDoc     = setDoc;
  window.firebaseStorage = getStorage(app);
window.fbStorageRef     = ref;
window.fbUploadString   = uploadString;

  initAuth();
}

/* --- VARIABLES GLOBALES --- */
let currentUser = null;
let currentStep = 1;
let isAdmin = false;   // true para rol 'admin' o 'master' (edita registros, ve Pendientes)
let isMaster = false;  // true solo para rol 'master' (Conciliar y gestionar Usuarios)

// Estado de las fotos
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
        showLoginError("Correo no autorizado.");
        await window.fbSignOut(window.firebaseAuth);
        return;
      }
      currentUser = user;
      document.getElementById("header-user").textContent = user.email;
      
      // Roles: capturista (default) -> admin -> master
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
    if (data.activo === false) return { allowed: false }; // usuario desactivado por un admin
    return { allowed: true, rol: data.rol || 'capturista' };
  } catch (e) { return { allowed: false }; }
}

async function handleLogin() {
  const email = document.getElementById("login-email").value.trim();
  const pw = document.getElementById("login-password").value;
  if(!email || !pw) return showLoginError("Ingresa datos");
  try { await window.fbSignIn(window.firebaseAuth, email, pw); } 
  catch(e) { showLoginError("Error de credenciales"); }
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
function toggleHorometro() {
  const sinHoro = document.getElementById("chk-sin-horometro").checked;
  const input = document.getElementById("f-horometro");
  input.disabled = sinHoro;
  if(sinHoro) { input.value = ""; document.getElementById("horometro-badge").textContent="N/A"; }
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

/* --- COMPRESIÓN DE IMÁGENES (faltaba esta función) --- */
function compressImage(dataUrl, maxWidth, quality, callback) {
  const img = new Image();
  img.onload = () => {
    let { width, height } = img;
    if (width > maxWidth) {
      height = Math.round((height * maxWidth) / width);
      width = maxWidth;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").drawImage(img, 0, 0, width, height);
    callback(canvas.toDataURL("image/jpeg", quality));
  };
  // Si la imagen falla al cargar, no bloqueamos el flujo: usamos el original
  img.onerror = () => callback(dataUrl);
  img.src = dataUrl;
}

/* --- FOTOS SURTIDOR Y TICKET (LOGICA MEJORADA) --- */
function previewSurtidor(event, tipo) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    compressImage(e.target.result, 800, 0.7, (dataUrl) => {
      // Guardamos preview
      document.getElementById(`img-${tipo}`).src = dataUrl;
      
      // Ocultar botón de cámara, mostrar zona de Aceptar/Repetir
      document.getElementById(`preview-box-${tipo}`).classList.remove("hidden");
      document.getElementById(`btn-cam-${tipo}`).classList.add("hidden");
      document.getElementById(`ok-${tipo}`).classList.add("hidden"); // Ocultar palomita si se reintenta
      
      // Guardamos la foto en temporal (pero NO la marcamos como confirmada aún)
      window[`_pending_${tipo}`] = dataUrl;
    });
  };
  reader.readAsDataURL(file);
}

function aceptarSurtidor(tipo) {
  if (!window[`_pending_${tipo}`]) return;
  
  dataFotos[tipo] = window[`_pending_${tipo}`]; // Ahora sí la guardamos
  estadoFotos[tipo] = true; // MARCAMOS COMO SUBIDA CORRECTA
  
  // UI: Ocultar todo y mostrar palomita
  document.getElementById(`preview-box-${tipo}`).classList.add("hidden");
  document.getElementById(`btn-cam-${tipo}`).classList.remove("hidden");
  document.getElementById(`ok-${tipo}`).classList.remove("hidden"); // AQUÍ APARECE LA PALOMITA

  // En el modal de "Pendientes", al confirmar la foto del ticket habilitamos
  // el botón para cerrar el registro y generar el PDF
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
  // PASO 1: Equipo
  if(step === 1) {
    if(!document.getElementById("f-eco").value) { alert("Selecciona el ECO"); return false; }
    if(!document.getElementById("chk-sin-horometro").checked && !document.getElementById("f-horometro").value) { 
      alert("Falta horómetro"); return false; 
    }
    return true;
  }

  // PASO 2: Carga
  if(step === 2) {
    const tipo = document.querySelector('input[name="tipo-combustible"]:checked');
    if(!tipo) { alert("Selecciona Diésel o Gasolina"); return false; }
    if(!document.getElementById("f-litros").value) { alert("Faltan litros"); return false; }
    
    // Validación de cuenta inicial cero
    const ci = parseFloat(document.getElementById("f-cuenta-inicial").value);
    if (isNaN(ci) || ci !== 0) { alert("❌ La cuenta litros inicial debe ser 0."); return false; }
    
    if(!document.getElementById("f-cuenta-final").value) { alert("Falta cuenta final"); return false; }
    
    // VALIDACIÓN ESTRICTA DE PALOMITAS INICIAL/FINAL
    if(!estadoFotos.ini) { alert("❌ Debes tomar y CONFIRMAR la foto Inicial."); return false; }
    if(!estadoFotos.fin) { alert("❌ Debes tomar y CONFIRMAR la foto Final."); return false; }
    return true;
  }

  // PASO 3: Ticket
  if(step === 3) {
    // Si NO está marcada la casilla de adjuntar después, validamos el ticket y su foto
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
  const html = `
    <div class="summary-row"><span class="summary-key">ECO</span><span class="summary-val highlight">${document.getElementById("f-eco").value}</span></div>
    <div class="summary-row"><span class="summary-key">Litros</span><span class="summary-val">${document.getElementById("f-litros").value} L</span></div>
    <div class="summary-row"><span class="summary-key">Estatus Ticket</span><span class="summary-val">${isPendiente ? "⏳ Pendiente" : "✅ Adjuntado"}</span></div>
  `;
  document.getElementById("summary-card").innerHTML = html;
}

/* --- CALCULO RENDIMIENTO L/H --- */
async function getRendimiento(ecoActual, horoRawActual, litrosActuales) {
  if(!horoRawActual) return "N/A";
  try {
    const col = window.fbCollection(window.firebaseDB, "registros");
    const q = window.fbQuery(col, window.fbWhere("eco", "==", ecoActual), window.fbOrderBy("creadoEn", "desc"), window.fbLimit(1));
    const snap = await window.fbGetDocs(q);
    
    if(!snap.empty) {
      const prevData = snap.docs[0].data();
      if(prevData.horometroRaw) {
        // Convertir formato "10002" -> 1000.2 horas reales para matemáticas
        const currentHoroDec = (Math.floor(horoRawActual / 10)) + ((horoRawActual % 10) / 10);
        const prevHoroDec = (Math.floor(prevData.horometroRaw / 10)) + ((prevData.horometroRaw % 10) / 10);
        
        const horasTrabajadas = currentHoroDec - prevHoroDec;
        if(horasTrabajadas > 0) {
          return (litrosActuales / horasTrabajadas).toFixed(2);
        }
      }
    }
    return "Primer Registro";
  } catch(e) { return "N/A"; }
}

/* --- GUARDAR A FIREBASE --- */
async function handleSubmit() {
  showLoading("Calculando rendimiento y guardando...");
  try {
    const eco = document.getElementById("f-eco").value;
    const sinHoro = document.getElementById("chk-sin-horometro").checked;
    const horoRaw = sinHoro ? null : parseFloat(document.getElementById("f-horometro").value);
    const litros = parseFloat(document.getElementById("f-litros").value);
    const isPendiente = document.getElementById("chk-ticket-despues").checked;
    
    // Calcular rendimiento
    const rendimiento = await getRendimiento(eco, horoRaw, litros);

    // Generamos el ID del documento ANTES de escribir, para nombrar el PDF en Storage
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
    
  if(!isPendiente) {
      showLoading("Generando PDF Completo...");
      const pdfDoc = await generateTicketPDF(record);
      pdfDoc.save(`FuelControl_${eco}_${record.ticket}.pdf`);

      const pdfPath = `${record.fecha}/${eco}/${docRef.id}.pdf`;
      await window.fbUploadString(window.fbStorageRef(window.firebaseStorage, pdfPath), pdfDoc.output("datauristring"), "data_url");
      record.pdfPath = pdfPath;
    }

    await window.fbSetDoc(docRef, record);
    hideLoading();
    alert(isPendiente ? "Guardado como PENDIENTE. (No se generó PDF aún)" : "Guardado con éxito y PDF descargado.");
    location.reload(); // Reiniciar app limpia

  } catch(e) { hideLoading(); alert("Error: " + e.message); }
}

/* --- CACHÉ DE REGISTROS (evita pasar datos vía atributos onclick) --- */
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
  const q = window.fbQuery(window.fbCollection(window.firebaseDB, "registros"), window.fbWhere("status", "==", "pendiente"));
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
        </div>
      `;
    } else {
      list.innerHTML += `
        <div class="history-card" style="border-left: 4px solid var(--orange); cursor:pointer;" onclick="abrirPendiente('${docSnap.id}')">
          <div class="hc-header"><span>${d.eco}</span><span>${d.fecha}</span></div>
          <p style="color:var(--orange); font-size:12px; margin-top:5px;">Falta Ticket • ${d.litros} L</p>
        </div>
      `;
    }
  });
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

  // El modal ahora es un overlay global (funciona desde Historial o Pendientes)
  document.getElementById("modal-pendiente").classList.remove("hidden");
}

function cerrarModalPendiente() {
  document.getElementById("modal-pendiente").classList.add("hidden");
}

// Refresca la lista visible (Historial o Pendientes) tras cualquier cambio
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
    
    // Recuperar info completa para el PDF
    const snap = await window.fbGetDocs(window.fbQuery(window.fbCollection(window.firebaseDB, "registros"), window.fbWhere("__name__", "==", docPendienteActual)));
    const record = snap.docs[0].data();
    
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
   const docRef = window.fbDoc(window.firebaseDB, "registros", docPendienteActual);

    const snap = await window.fbGetDocs(window.fbQuery(window.fbCollection(window.firebaseDB, "registros"), window.fbWhere("__name__", "==", docPendienteActual)));
    const record = { ...snap.docs[0].data(), ticket: ticketVal, fotoTicket: dataFotos.pend };

    const docPDF = await generateTicketPDF(record);
    docPDF.save(`FuelControl_${record.eco}_${ticketVal}.pdf`);

    const pdfPath = `${record.fecha}/${record.eco}/${docPendienteActual}.pdf`;
    await window.fbUploadString(window.fbStorageRef(window.firebaseStorage, pdfPath), docPDF.output("datauristring"), "data_url");

    await window.fbUpdateDoc(docRef, {
      ticket: ticketVal,
      fotoTicket: dataFotos.pend,
      status: "completado",
      pdfPath
    });
    

/* --- CONCILIAR (solo Admin Maestro): bloquea edición y carga de ticket --- */
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

      let botones = "";
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
    list.innerHTML = `<p>Error al cargar historial: ${e.message}</p>`;
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
      list.innerHTML += `
        <div class="history-card" style="cursor:pointer;" onclick="abrirUsuario('${docSnap.id}')">
          <div class="hc-header"><span>${d.nombre || d.email}</span><span style="color:${activo ? 'var(--green)' : 'var(--red)'};">${activo ? '✅ Activo' : '⛔ Inactivo'}</span></div>
          <p style="color:var(--text-muted); font-size:12px; margin-top:5px;">${d.email} • ${rolLabels[d.rol] || "👷 Capturista"}</p>
        </div>
      `;
    });
  } catch (e) {
    list.innerHTML = `<p>Error al cargar usuarios: ${e.message}</p>`;
  }
}

function abrirUsuario(docId) {
  document.getElementById("usuario-error").classList.add("hidden");
  const u = docId ? window._usuariosCache?.[docId] : null;

  document.getElementById("usuario-modal-title").textContent = docId ? "Editar usuario" : "Nuevo usuario";
  document.getElementById("usuario-doc-id").value = docId || "";
  document.getElementById("usuario-email").value = u?.email || "";
  document.getElementById("usuario-email").disabled = !!docId; // el correo no se cambia una vez creado
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
  const email = document.getElementById("usuario-email").value.trim().toLowerCase();
  const nombre = document.getElementById("usuario-nombre").value.trim();
  const rol = document.getElementById("usuario-rol").value;
  const activo = document.getElementById("usuario-activo").checked;

  if (!email || !email.includes("@")) { errBox.textContent = "Ingresa un correo válido."; errBox.classList.remove("hidden"); return; }
  if (!nombre) { errBox.textContent = "Ingresa el nombre del usuario."; errBox.classList.remove("hidden"); return; }

  showLoading("Guardando usuario...");
  try {
    if (docId) {
      // Usuario existente: se actualiza con el ID que ya tenía (sin tocar el correo)
      await window.fbUpdateDoc(window.fbDoc(window.firebaseDB, "whitelist", docId), { nombre, rol, activo });
    } else {
      // Usuario nuevo: el ID del documento es el correo (recomendado por las reglas de seguridad)
      await window.fbSetDoc(window.fbDoc(window.firebaseDB, "whitelist", email), { email, nombre, rol, activo });
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

/* --- EXPORTAR CSV --- */
async function exportCSV() {
  showLoading("Generando CSV...");
  try {
    const col = window.fbCollection(window.firebaseDB, "registros");
    const snap = await window.fbGetDocs(col);

    if (snap.empty) { hideLoading(); alert("No hay registros para exportar."); return; }

    const headers = ["Fecha", "ECO", "Maquinaria", "Litros", "Horometro", "Rendimiento(L/h)", "Ticket", "Estatus", "Usuario"];
    const rows = [headers.join(",")];

    snap.forEach(docSnap => {
      const d = docSnap.data();
      const fila = [
        d.fecha || "",
        d.eco || "",
        `"${(d.maquinaria || "").replace(/"/g, '""')}"`,
        d.litros ?? "",
        d.horometroRaw ?? "",
        d.rendimiento ?? "",
        d.ticket || "",
        d.status || "",
        d.usuario || ""
      ];
      rows.push(fila.join(","));
    });

    const csvContent = rows.join("\n");
    // \uFEFF (BOM) para que Excel detecte UTF-8 y los acentos no se rompan
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `FuelControl_Export_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

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
  // Carta (8.5" x 11"), todo en pulgadas para facilitar el layout en una sola hoja
  const doc = new jsPDF({ orientation: "portrait", unit: "in", format: "letter" });

  const pageW = 8.5, pageH = 11, margin = 0.4;
  const contentW = pageW - margin * 2;

  // --- Encabezado ---
  const headerH = 1.4;
  doc.setFillColor(28, 33, 40); doc.rect(0, 0, pageW, headerH, "F");
  doc.setTextColor(232, 98, 10); doc.setFontSize(15); doc.setFont("helvetica", "bold");
  doc.text("FuelControl — Evidencia de Carga", margin, 0.35);

  doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(200, 200, 200);
  doc.text(`ECO: ${record.eco}   |   Maquinaria: ${record.maquinaria}`, margin, 0.62);
  doc.text(`Ticket: ${record.ticket}   |   Fecha: ${record.fecha}`, margin, 0.82);

  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(10.5);
  doc.text(`Carga: ${record.litros} L   |   Rendimiento: ${record.rendimiento} L/h`, margin, 1.08);

  // --- Fotos del cuenta litros (Inicial y Final), lado a lado ---
  const gap = 0.2;
  const halfW = (contentW - gap) / 2;
  const maxHTop = 4.6;
  let y = headerH + 0.35;

  const fotosTop = [
    { label: "Bomba (Inicial)", data: record.fotoInicial, x: margin },
    { label: "Bomba (Final)",   data: record.fotoFinal,   x: margin + halfW + gap }
  ];

  let maxBottomY = y;
  fotosTop.forEach(f => {
    if (!f.data) return;
    doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text(f.label, f.x, y - 0.06);

    const props = doc.getImageProperties(f.data);
    let w = halfW, h = (props.height * w) / props.width;
    if (h > maxHTop) { h = maxHTop; w = (props.width * h) / props.height; }

    doc.addImage(f.data, "JPEG", f.x, y, w, h);
    maxBottomY = Math.max(maxBottomY, y + h);
  });

  // --- Foto del Ticket, "acostada" (horizontal) en el espacio restante de la hoja ---
  if (record.fotoTicket) {
    const yTicket = maxBottomY + 0.4;
    doc.setTextColor(0, 0, 0); doc.setFontSize(10); doc.setFont("helvetica", "bold");
    doc.text("Ticket de Carga", margin, yTicket - 0.06);

    const props = doc.getImageProperties(record.fotoTicket);
    const maxHTicket = pageH - margin - yTicket;
    let w = contentW, h = (props.height * w) / props.width;
    if (h > maxHTicket) { h = maxHTicket; w = (props.width * h) / props.height; }

    const xTicket = margin + (contentW - w) / 2; // centrada si quedó más angosta
    doc.addImage(record.fotoTicket, "JPEG", xTicket, yTicket, w, h);
  }

  return doc;
}

function showLoading(msg="Procesando...") { document.getElementById("loading-text").textContent = msg; document.getElementById("loading-overlay").classList.remove("hidden"); }
function hideLoading() { document.getElementById("loading-overlay").classList.add("hidden"); }

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
window.exportCSV = exportCSV;
window.installApp = installApp;
window.autoCompletarEquipoEdit = autoCompletarEquipoEdit;
window.abrirEditar = abrirEditar;
window.cerrarModalEditar = cerrarModalEditar;
window.guardarEdicion = guardarEdicion;
window.conciliarRegistro = conciliarRegistro;
window.abrirUsuario = abrirUsuario;
window.cerrarModalUsuario = cerrarModalUsuario;
window.guardarUsuario = guardarUsuario;
