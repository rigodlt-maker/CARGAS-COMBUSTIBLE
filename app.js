// =============================================
// app.js — FuelControl PWA (Actualizado L/h y Pendientes)
// =============================================

async function loadFirebase() {
  const { initializeApp }   = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js");
  const { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js");
  // Añadimos limit, doc y updateDoc para las nuevas funciones
  const { getFirestore, collection, addDoc, getDocs, query, where, orderBy, Timestamp, limit, doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js");

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

  initAuth();
}

/* --- VARIABLES GLOBALES --- */
let currentUser = null;
let currentStep = 1;
let isAdmin = false;

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
cargarSelectorEquipos();
document.getElementById("f-fecha").value = new Date().toISOString().split("T")[0];
document.getElementById("f-horometro").addEventListener("input", updateHorometroBadge);
loadFirebase();

function cargarSelectorEquipos() {
  const selectEco = document.getElementById("f-eco");
  catalogoEquipos.forEach(e => {
    const opt = document.createElement("option");
    opt.value = e.interno; opt.textContent = `${e.interno} - ${e.maquinaria}`;
    selectEco.appendChild(opt);
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
      
      // Activar pestaña admin si tiene rol
      isAdmin = (authData.rol === 'admin');
      if (isAdmin) document.getElementById("tab-pendientes").classList.remove("hidden");
      
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
    return { allowed: true, rol: data.rol || 'operador' };
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
  if(!horRawActual) return "N/A";
  try {
    const col = window.fbCollection(window.firebaseDB, "registros");
    const q = window.fbQuery(col, window.fbWhere("eco", "==", ecoActual), window.fbOrderBy("creadoEn", "desc"), window.fbLimit(1));
    const snap = await window.fbGetDocs(q);
    
    if(!snap.empty) {
      const prevData = snap.docs[0].data();
      if(prevData.horometroRaw) {
        // Convertir formato "10002" -> 1000.2 horas reales para matemáticas
        const currentHoroDec = (Math.floor(horRawActual / 10)) + ((horRawActual % 10) / 10);
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
      creadoEn: window.fbTimestamp.now()
    };

    await window.fbAddDoc(window.fbCollection(window.firebaseDB, "registros"), record);

    if(!isPendiente) {
      showLoading("Generando PDF Completo...");
      const doc = await generateTicketPDF(record);
      doc.save(`FuelControl_${eco}_${record.ticket}.pdf`);
    }

    hideLoading();
    alert(isPendiente ? "Guardado como PENDIENTE. (No se generó PDF aún)" : "Guardado con éxito y PDF descargado.");
    location.reload(); // Reiniciar app limpia

  } catch(e) { hideLoading(); alert("Error: " + e.message); }
}

/* --- PENDIENTES (ADMIN) --- */
async function loadPendientes() {
  const list = document.getElementById("pendientes-list");
  list.innerHTML = "Cargando pendientes...";
  const q = window.fbQuery(window.fbCollection(window.firebaseDB, "registros"), window.fbWhere("status", "==", "pendiente"));
  const snap = await window.fbGetDocs(q);
  
  if(snap.empty) { list.innerHTML = "<p>No hay tickets pendientes.</p>"; return; }
  
  list.innerHTML = "";
  snap.forEach(docSnap => {
    const d = docSnap.data();
    list.innerHTML += `
      <div class="history-card" style="border-left: 4px solid var(--orange); cursor:pointer;" onclick="abrirPendiente('${docSnap.id}', '${d.eco}', '${d.fecha}', ${d.litros})">
        <div class="hc-header"><span>${d.eco}</span><span>${d.fecha}</span></div>
        <p style="color:var(--orange); font-size:12px; margin-top:5px;">Falta Ticket • ${d.litros} L</p>
      </div>
    `;
  });
}

let docPendienteActual = null;
function abrirPendiente(id, eco, fecha, litros) {
  docPendienteActual = id;
  document.getElementById("pend-eco").textContent = `${eco} (${litros} L) - ${fecha}`;
  document.getElementById("pend-ticket-input").value = "";
  estadoFotos.pend = false;
  dataFotos.pend = null;
  document.getElementById("ok-pend").classList.add("hidden");
  document.getElementById("btn-cam-pend").classList.remove("hidden");
  document.getElementById("preview-box-pend").classList.add("hidden");
  document.getElementById("btn-save-pend").style.display = "none";
  
  document.getElementById("pendientes-list").classList.add("hidden");
  document.getElementById("modal-pendiente").classList.remove("hidden");
}

function cerrarModalPendiente() {
  document.getElementById("modal-pendiente").classList.add("hidden");
  document.getElementById("pendientes-list").classList.remove("hidden");
}

async function guardarPendiente() {
  const ticketVal = document.getElementById("pend-ticket-input").value.trim();
  if(!ticketVal) return alert("Ingresa el número de ticket definitivo.");
  
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
    loadPendientes();
  } catch(e) { hideLoading(); alert("Error: " + e.message); }
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
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFillColor(28, 33, 40); doc.rect(0, 0, 210, 42, "F");
  doc.setTextColor(232, 98, 10); doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text("FuelControl — Evidencia de Carga", 14, 15);
  
  doc.setFontSize(10); doc.setFont("helvetica", "normal"); doc.setTextColor(200, 200, 200);
  doc.text(`ECO: ${record.eco}   |   Maquinaria: ${record.maquinaria}`, 14, 23);
  doc.text(`Ticket: ${record.ticket}   |   Fecha: ${record.fecha}`, 14, 29);
  
  // Imprimir Rendimiento y Litros
  doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold");
  doc.text(`Carga: ${record.litros} L   |   Rendimiento: ${record.rendimiento} L/h`, 14, 36);

  // Acomodo de las 3 fotos en la misma hoja (si caben)
  let y = 50;
  const fotosArr = [
    { label: "Bomba (Inicial)", data: record.fotoInicial },
    { label: "Bomba (Final)", data: record.fotoFinal },
    { label: "Ticket", data: record.fotoTicket }
  ];

  for (let i = 0; i < fotosArr.length; i++) {
    if(!fotosArr[i].data) continue;
    doc.setTextColor(0,0,0); doc.setFontSize(12);
    doc.text(fotosArr[i].label, 14, y - 2);
    
    const props = doc.getImageProperties(fotosArr[i].data);
    const maxW = 180, maxH = 75; // Altura restringida para que quepan 3
    let w = maxW, h = (props.height * maxW) / props.width;
    if (h > maxH) { h = maxH; w = (props.width * maxH) / props.height; }
    
    if (y + h > 285) { doc.addPage(); y = 20; }
    doc.addImage(fotosArr[i].data, "JPEG", 15, y, w, h);
    y += h + 10;
  }
  return doc;
}

function showLoading(msg="Procesando...") { document.getElementById("loading-text").textContent = msg; document.getElementById("loading-overlay").classList.remove("hidden"); }
function hideLoading() { document.getElementById("loading-overlay").classList.add("hidden"); }

/* EXPORTACIONES PARA EL HTML */
window.handleLogin = handleLogin;
window.Logout = handleLogout;
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
