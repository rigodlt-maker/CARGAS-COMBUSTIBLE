// =============================================
// app.js — FuelControl PWA (todo en uno)
// =============================================

// ---- Cargar Firebase desde CDN (Versión Limpia) ----
async function loadFirebase() {
  const { initializeApp }   = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-app.js");
  const { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged }
    = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-auth.js");
  const { getFirestore, collection, addDoc, getDocs, query, where, orderBy, Timestamp }
    = await import("https://www.gstatic.com/firebasejs/11.9.0/firebase-firestore.js");

  // Tu llave maestra de Firebase
  const firebaseConfig = {
    apiKey:            "AIzaSyCeIsd_BrHKbAY1HrYb3HL4vG4cpadUTuU",
    authDomain:        "cargas-7bf25.firebaseapp.com",
    projectId:         "cargas-7bf25",
    storageBucket:     "cargas-7bf25.firebasestorage.app",
    messagingSenderId: "1058286419136",
    appId:             "1:1058286419136:web:14246dae0c214429fe0125"
  };

  const app  = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db   = getFirestore(app);

  // Guardamos las herramientas para usarlas en toda la app
  window.firebaseAuth  = auth;
  window.firebaseDB    = db;
  window.fbSignIn      = signInWithEmailAndPassword;
  window.fbSignOut     = signOut;
  window.fbAuthChanged = onAuthStateChanged;
  window.fbCollection  = collection;
  window.fbAddDoc      = addDoc;
  window.fbGetDocs     = getDocs;
  window.fbQuery       = query;
  window.fbWhere       = where;
  window.fbOrderBy     = orderBy;
  window.fbTimestamp   = Timestamp;

  console.log("✅ Motor de Firebase encendido y listo");
  initAuth();
}

/* ============================================
   ESTADO GLOBAL
   ============================================ */
let currentUser    = null;
let currentStep    = 1;
let capturedPhotos = [];
let photoConfirmed = false;

/* ============================================
   INIT
   ============================================ */
document.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().split("T")[0];
  const dateField = document.getElementById("f-fecha");
  if (dateField) dateField.value = today;

  const horoInput = document.getElementById("f-horometro");
  if (horoInput) horoInput.addEventListener("input", updateHorometroBadge);

  loadFirebase().catch(e => {
    console.error("Error cargando Firebase:", e);
    showLoginError("Error al conectar con el servidor. Revisa tu conexión.");
  });
});

/* ============================================
   AUTH Y LISTA BLANCA
   ============================================ */
function initAuth() {
  window.fbAuthChanged(window.firebaseAuth, async (user) => {
    if (user) {
      const allowed = await checkWhitelist(user.email);
      if (!allowed) {
        showLoginError("Tu correo no está autorizado. Contacta al administrador.");
        await window.fbSignOut(window.firebaseAuth);
        return;
      }
      currentUser = user;
      document.getElementById("header-user").textContent = user.email;
      showScreen("app");
      loadStats();
    } else {
      currentUser = null;
      showScreen("login");
    }
  });
}

async function checkWhitelist(email) {
  try {
    const col  = window.fbCollection(window.firebaseDB, "whitelist");
    const q    = window.fbQuery(col, window.fbWhere("email", "==", email.toLowerCase()));
    const snap = await window.fbGetDocs(q);
    return !snap.empty;
  } catch (e) {
    console.error("Error whitelist:", e);
    return true; 
  }
}

async function handleLogin() {
  const email = document.getElementById("login-email").value.trim();
  const pw    = document.getElementById("login-password").value;
  const btn   = document.getElementById("btn-login");

  if (!email || !pw) { showLoginError("Ingresa correo y contraseña."); return; }
  if (!window.fbSignIn) { showLoginError("Conectando con el servidor, espera un momento..."); return; }

  btn.disabled = true;
  btn.querySelector(".btn-label").textContent = "Verificando...";

  try {
    await window.fbSignIn(window.firebaseAuth, email, pw);
  } catch (e) {
    const msgs = {
      "auth/user-not-found":     "Correo no registrado.",
      "auth/wrong-password":     "Contraseña incorrecta.",
      "auth/invalid-email":      "Formato de correo inválido.",
      "auth/too-many-requests":  "Demasiados intentos. Intenta más tarde.",
      "auth/invalid-credential": "Credenciales incorrectas."
    };
    showLoginError(msgs[e.code] || `Error: ${e.message}`);
  } finally {
    btn.disabled = false;
    btn.querySelector(".btn-label").textContent = "Ingresar";
  }
}

async function handleLogout() {
  await window.fbSignOut(window.firebaseAuth);
  resetForm();
}

function showLoginError(msg) {
  const el = document.getElementById("login-error");
  el.textContent = msg;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 6000);
}

function togglePassword() {
  const input = document.getElementById("login-password");
  input.type  = input.type === "password" ? "text" : "password";
}

/* ============================================
   NAVEGACIÓN
   ============================================ */
function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => {
    s.classList.toggle("active", s.id === `screen-${name}`);
    s.classList.toggle("hidden", s.id !== `screen-${name}`);
  });
}

function switchTab(name) {
  document.querySelectorAll(".tab-btn").forEach(b =>
    b.classList.toggle("active", b.id === `tab-${name}`)
  );
  document.querySelectorAll(".tab-content").forEach(c =>
    c.classList.toggle("active", c.id === `content-${name}`)
  );
  if (name === "historial") loadHistory();
  if (name === "exportar")  loadStats();
}

/* ============================================
   PASOS DEL FORMULARIO
   ============================================ */
function goStep(n) {
  if (n > currentStep && !validateStep(currentStep)) return;
  currentStep = n;

  for (let i = 1; i <= 4; i++) {
    document.getElementById(`panel-step-${i}`)?.classList.toggle("active", i === n);
    const dot = document.getElementById(`step-dot-${i}`);
    if (dot) {
      dot.classList.toggle("active", i === n);
      dot.classList.toggle("done",   i < n);
    }
  }
  for (let i = 1; i <= 3; i++) {
    const line = document.getElementById(`step-line-${i}`);
    if (line) {
      line.classList.toggle("done",   i < n);
      line.classList.toggle("active", i === n);
    }
  }

  if (n === 4) buildSummary();
  document.querySelector(".form-container")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function validateStep(step) {
  if (step === 1) {
    if (!document.getElementById("f-fecha").value)      { alert("Selecciona la fecha de carga.");       return false; }
    if (!document.getElementById("f-maquinaria").value) { alert("Selecciona la maquinaria.");           return false; }
    if (!document.getElementById("f-eco").value.trim()) { alert("Ingresa el # ECO Interno.");           return false; }
    const sinHoro = document.getElementById("chk-sin-horometro").checked;
    if (!sinHoro && !document.getElementById("f-horometro").value) {
      alert("Ingresa el horómetro o marca 'Sin horómetro'."); return false;
    }
  }
  if (step === 2) {
    const tipo = document.querySelector('input[name="tipo-combustible"]:checked');
    if (!tipo)                                             { alert("Selecciona el tipo de combustible."); return false; }
    if (!document.getElementById("f-litros").value)       { alert("Ingresa los litros cargados.");       return false; }
    const ci = parseFloat(document.getElementById("f-cuenta-inicial").value);
    if (document.getElementById("f-cuenta-inicial").value === "" || isNaN(ci)) {
      alert("Ingresa la cuenta litros inicial."); return false;
    }
    if (ci !== 0)                                          { alert("La cuenta litros inicial debe ser 0."); return false; }
    if (!document.getElementById("f-cuenta-final").value) { alert("Ingresa la cuenta litros final.");    return false; }
  }
  if (step === 3) {
    if (!document.getElementById("f-ticket").value.trim()) { alert("Ingresa el # de ticket.");          return false; }
    if (capturedPhotos.length === 0)                        { alert("Captura al menos una foto.");       return false; }
    if (!photoConfirmed)                                    { alert("Confirma la foto del ticket.");     return false; }
  }
  return true;
}

/* ============================================
   LÓGICA DE CAMPOS (Maquinaria y Horómetro)
   ============================================ */
function onMaquinariaChange() {
  const val    = document.getElementById("f-maquinaria").value;
  const noHoro = ["Planta de luz"];
  const chk    = document.getElementById("chk-sin-horometro");
  if (noHoro.includes(val)) { chk.checked = true; toggleHorometro(); }
}

function toggleHorometro() {
  const sinHoro   = document.getElementById("chk-sin-horometro").checked;
  const horoInput = document.getElementById("f-horometro");
  const badge     = document.getElementById("horometro-badge");
  horoInput.disabled      = sinHoro;
  horoInput.style.opacity = sinHoro ? "0.35" : "1";
  if (sinHoro) { horoInput.value = ""; badge.textContent = "N/A"; }
}

function updateHorometroBadge() {
  const val   = document.getElementById("f-horometro").value;
  const badge = document.getElementById("horometro-badge");
  if (!val) { badge.textContent = "— h"; return; }
  
  // Lógica de fracciones de hora (* 6 minutos)
  const lastDigit = parseInt(val.toString().slice(-1)) || 0;
  const hours = Math.floor(val / 10);
  
  if (val.length === 1) {
    badge.textContent = `0h ${lastDigit * 6}m`;
  } else {
    badge.textContent = `${hours}h ${lastDigit > 0 ? (lastDigit * 6) + "m" : ""}`;
  }
}

function onTipoChange() {
  document.querySelectorAll(".radio-card").forEach(card => {
    card.style.borderColor = card.querySelector("input").checked ? "var(--orange)" : "";
  });
}

function onLitrosChange() {
  const litros = parseFloat(document.getElementById("f-litros").value) || 0;
  const final  = parseFloat(document.getElementById("f-cuenta-final").value) || 0;
  const val    = litros || final;
  const pct    = Math.min((val / 1000) * 100, 100);
  document.getElementById("meter-value").textContent = val > 0 ? `${val.toFixed(1)} L` : "— L";
  document.getElementById("meter-fill").style.width  = `${pct}%`;
}

function validateCuentaInicial() {
  const val  = parseFloat(document.getElementById("f-cuenta-inicial").value);
  const warn = document.getElementById("ci-warning");
  const badge = document.getElementById("ci-badge");
  if (val === 0) { warn.classList.add("hidden"); badge.classList.remove("hidden"); }
  else           { warn.classList.remove("hidden"); badge.classList.add("hidden"); }
}

/* ============================================
   CÁMARA Y FOTOS
   ============================================ */
function triggerCamera() {
  document.getElementById("file-ticket").click();
}

function onPhotoCapture(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    compressImage(e.target.result, 1200, 0.75, (dataUrl) => {
      document.getElementById("ticket-img").src = dataUrl;
      document.getElementById("camera-placeholder").classList.add("hidden");
      document.getElementById("camera-preview").classList.remove("hidden");
      document.getElementById("photo-actions").classList.remove("hidden");
      window._pendingPhoto = { dataUrl, name: file.name };
      photoConfirmed = false;
    });
  };
  reader.readAsDataURL(file);
  event.target.value = "";
}

function compressImage(dataUrl, maxWidth, quality, callback) {
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    let w = img.width, h = img.height;
    if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    callback(canvas.toDataURL("image/jpeg", quality));
  };
  img.src = dataUrl;
}

function confirmPhoto() {
  if (!window._pendingPhoto) return;
  capturedPhotos.push(window._pendingPhoto);
  window._pendingPhoto = null;
  photoConfirmed = true;
  renderPhotoThumbs();
  document.getElementById("btn-add-photo").style.display = "flex";
  document.getElementById("photo-actions").classList.add("hidden");
  document.getElementById("camera-placeholder").classList.remove("hidden");
  document.getElementById("camera-preview").classList.add("hidden");
}

function repeatPhoto() {
  window._pendingPhoto = null;
  document.getElementById("camera-placeholder").classList.remove("hidden");
  document.getElementById("camera-preview").classList.add("hidden");
  document.getElementById("photo-actions").classList.add("hidden");
}

function renderPhotoThumbs() {
  const list = document.getElementById("photos-list");
  list.innerHTML = "";
  capturedPhotos.forEach((p, i) => {
    const div = document.createElement("div");
    div.className = "photo-thumb";
    div.innerHTML = `<img src="${p.dataUrl}" alt="Foto ${i+1}" />
      <button class="remove-photo" onclick="removePhoto(${i})">×</button>`;
    list.appendChild(div);
  });
}

function removePhoto(idx) {
  capturedPhotos.splice(idx, 1);
  if (capturedPhotos.length === 0) {
    photoConfirmed = false;
    document.getElementById("btn-add-photo").style.display = "none";
  }
  renderPhotoThumbs();
}

/* ============================================
   GENERAR PDF LOCAL
   ============================================ */
async function generateTicketPDF(photos, meta) {
  if (!window.jspdf) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFillColor(28, 33, 40);
  doc.rect(0, 0, 210, 38, "F");
  doc.setTextColor(232, 98, 10);
  doc.setFontSize(15); doc.setFont("helvetica", "bold");
  doc.text("FuelControl — Rompeolas Oriente", 14, 13);
  doc.setFontSize(8.5); doc.setFont("helvetica", "normal");
  doc.setTextColor(180, 188, 198);
  doc.text(`Ticket: ${meta.ticket}   ECO: ${meta.eco}   Fecha: ${meta.fecha}`, 14, 21);
  doc.text(`Maquinaria: ${meta.maquinaria}   ${meta.tipo}: ${meta.litros} L   Horómetro: ${meta.horometro}`, 14, 28);
  doc.text(`Usuario: ${meta.usuario}   Generado: ${new Date().toLocaleString("es-MX")}`, 14, 35);

  let y = 45;
  for (let i = 0; i < photos.length; i++) {
    const imgData  = photos[i].dataUrl;
    const imgProps = doc.getImageProperties(imgData);
    const maxW = 182, maxH = 230;
    let w = maxW, h = (imgProps.height * maxW) / imgProps.width;
    if (h > maxH) { h = maxH; w = (imgProps.width * maxH) / imgProps.height; }
    if (y + h > 285) { doc.addPage(); y = 14; }
    doc.addImage(imgData, "JPEG", (210 - w) / 2, y, w, h);
    y += h + 10;
  }
  return doc;
}

/* ============================================
   RESUMEN STEP 4
   ============================================ */
function buildSummary() {
  const tipo    = document.querySelector('input[name="tipo-combustible"]:checked')?.value || "—";
  const litros  = parseFloat(document.getElementById("f-litros").value) || 0;
  const sinHoro = document.getElementById("chk-sin-horometro").checked;
  const horo    = sinHoro ? "Sin horómetro" : (document.getElementById("f-horometro").value || "—");

  const rows = [
    ["Fecha",           document.getElementById("f-fecha").value],
    ["Maquinaria",      document.getElementById("f-maquinaria").value],
    ["# ECO",           document.getElementById("f-eco").value],
    ["Horómetro",       horo],
    ["# Ticket",        document.getElementById("f-ticket").value],
    ["Tipo",            tipo, "badge"],
    ["Litros cargados", `${litros.toFixed(2)} L`, "highlight"],
    ["Cta. Inicial",    document.getElementById("f-cuenta-inicial").value || "0"],
    ["Cta. Final",      document.getElementById("f-cuenta-final").value || "—"],
    ["Fotos",           `${capturedPhotos.length} capturada(s)`],
  ];

  document.getElementById("summary-card").innerHTML = rows.map(([k, v, type]) => {
    let val = `<span class="summary-val${type === "highlight" ? " highlight" : ""}">${v}</span>`;
    if (type === "badge") {
      const cls = v === "Diésel" ? "badge-diesel" : "badge-gasolina";
      val = `<span class="summary-val"><span class="summary-badge ${cls}">${v}</span></span>`;
    }
    return `<div class="summary-row"><span class="summary-key">${k}</span>${val}</div>`;
  }).join("");
}

/* ============================================
   SUBMIT A FIREBASE (GUARDAR DATOS)
   ============================================ */
async function handleSubmit() {
  const btn = document.getElementById("btn-submit");
  btn.disabled = true;
  showLoading("Guardando registro...");

  try {
    const fecha      = document.getElementById("f-fecha").value;
    const eco        = document.getElementById("f-eco").value.trim().toUpperCase();
    const maquinaria = document.getElementById("f-maquinaria").value;
    const ticket     = document.getElementById("f-ticket").value.trim().toUpperCase();
    const tipo       = document.querySelector('input[name="tipo-combustible"]:checked')?.value;
    const litros     = parseFloat(document.getElementById("f-litros").value);
    const cuentaIni  = parseFloat(document.getElementById("f-cuenta-inicial").value);
    const cuentaFin  = parseFloat(document.getElementById("f-cuenta-final").value);
    const sinHoro    = document.getElementById("chk-sin-horometro").checked;
    const horo       = sinHoro ? null : document.getElementById("f-horometro").value;

    const record = {
      fecha, eco, maquinaria, ticket, tipo, litros,
      cuentaInicial: cuentaIni,
      cuentaFinal:   cuentaFin,
      horometro:     horo,
      sinHorometro:  sinHoro,
      fotos:         capturedPhotos.map(p => p.dataUrl),
      usuario:       currentUser.email,
      creadoEn:      window.fbTimestamp.now(),
    };

    await window.fbAddDoc(window.fbCollection(window.firebaseDB, "registros"), record);

    showLoading("Generando PDF...");
    const meta = { ticket, eco, fecha, maquinaria, tipo,
                   litros: litros.toFixed(2), horometro: horo || "N/A",
                   usuario: currentUser.email };
    const doc = await generateTicketPDF(capturedPhotos, meta);
    doc.save(`FuelControl_${eco}_${ticket}_${fecha}.pdf`);

    hideLoading();
    const el = document.getElementById("submit-success");
    el.textContent = "✅ Registro guardado. PDF descargado en tu dispositivo.";
    el.classList.remove("hidden");
    setTimeout(() => { el.classList.add("hidden"); resetForm(); switchTab("historial"); }, 3500);

  } catch (e) {
    hideLoading();
    console.error(e);
    const errEl = document.getElementById("submit-error");
    errEl.textContent = `Error: ${e.message}`;
    errEl.classList.remove("hidden");
    setTimeout(() => errEl.classList.add("hidden"), 8000);
  } finally {
    btn.disabled = false;
  }
}

function resetForm() {
  capturedPhotos = []; photoConfirmed = false; window._pendingPhoto = null;
  ["f-fecha","f-eco","f-horometro","f-ticket","f-litros","f-cuenta-inicial","f-cuenta-final"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  document.getElementById("f-maquinaria").value = "";
  document.querySelectorAll('input[name="tipo-combustible"]').forEach(r => r.checked = false);
  document.getElementById("chk-sin-horometro").checked  = false;
  document.getElementById("f-horometro").disabled       = false;
  document.getElementById("f-horometro").style.opacity  = "1";
  document.getElementById("horometro-badge").textContent = "— h";
  document.getElementById("meter-fill").style.width     = "0%";
  document.getElementById("meter-value").textContent    = "— L";
  document.getElementById("photos-list").innerHTML      = "";
  document.getElementById("btn-add-photo").style.display = "none";
  document.getElementById("photo-actions").classList.add("hidden");
  document.getElementById("camera-placeholder").classList.remove("hidden");
  document.getElementById("camera-preview").classList.add("hidden");
  document.getElementById("ci-badge").classList.add("hidden");
  document.getElementById("ci-warning").classList.add("hidden");
  document.getElementById("f-fecha").value = new Date().toISOString().split("T")[0];
  goStep(1);
}

/* ============================================
   HISTORIAL Y EXPORTACIÓN
   ============================================ */
async function loadHistory() {
  const fecha = document.getElementById("hist-fecha").value;
  const eco   = document.getElementById("hist-eco").value;
  const list  = document.getElementById("history-list");
  list.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Cargando...</p></div>`;

  try {
    const col = window.fbCollection(window.firebaseDB, "registros");
    let constraints = [window.fbOrderBy("creadoEn", "desc")];
    if (fecha && eco) constraints = [window.fbWhere("fecha","==",fecha), window.fbWhere("eco","==",eco), window.fbOrderBy("creadoEn","desc")];
    else if (fecha)   constraints = [window.fbWhere("fecha","==",fecha), window.fbOrderBy("creadoEn","desc")];
    else if (eco)     constraints = [window.fbWhere("eco","==",eco),     window.fbOrderBy("creadoEn","desc")];

    const snap = await window.fbGetDocs(window.fbQuery(col, ...constraints));
    if (snap.empty) {
      list.innerHTML = `<div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3D4551" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p>Sin registros</p><span>Ajusta los filtros.</span></div>`;
      return;
    }
    list.innerHTML = "";
    snap.forEach(docSnap => {
      const d = docSnap.data();
      const card = document.createElement("div");
      card.className = "history-card";
      card.innerHTML = `
        <div class="hc-header"><span class="hc-eco">${d.eco}</span><span class="hc-time">${d.fecha}</span></div>
        <div class="hc-machine">${d.maquinaria}</div>
        <div class="hc-footer">
          <span class="hc-litros">${(d.litros||0).toFixed(1)}<span> L</span></span>
          <span class="summary-badge ${d.tipo==="Diésel"?"badge-diesel":"badge-gasolina"}">${d.tipo}</span>
          <span style="margin-left:auto;font-size:11px;color:var(--text-muted)">Ticket: ${d.ticket}</span>
          <button class="btn btn-outline btn-sm" style="margin-left:8px"
            onclick='redownloadPDF(${JSON.stringify({eco:d.eco,ticket:d.ticket,fecha:d.fecha,maquinaria:d.maquinaria,tipo:d.tipo,litros:d.litros,horometro:d.horometro,usuario:d.usuario,fotos:d.fotos})})'>
            📄 PDF
          </button>
        </div>`;
      list.appendChild(card);
    });
  } catch(e) {
    list.innerHTML = `<div class="empty-state"><p>Error: ${e.message}</p></div>`;
  }
}

async function redownloadPDF(data) {
  showLoading("Regenerando PDF...");
  try {
    const fotos = (data.fotos||[]).map(dataUrl => ({ dataUrl }));
    const meta  = { ticket:data.ticket, eco:data.eco, fecha:data.fecha,
                    maquinaria:data.maquinaria, tipo:data.tipo,
                    litros:(data.litros||0).toFixed(2), horometro:data.horometro||"N/A",
                    usuario:data.usuario };
    const doc = await generateTicketPDF(fotos, meta);
    doc.save(`FuelControl_${data.eco}_${data.ticket}_${data.fecha}.pdf`);
  } catch(e) { alert("Error PDF: " + e.message); }
  finally { hideLoading(); }
}

async function loadStats() {
  const today = new Date().toISOString().split("T")[0];
  try {
    const col  = window.fbCollection(window.firebaseDB, "registros");
    const snap = await window.fbGetDocs(window.fbQuery(col, window.fbWhere("fecha","==",today)));
    let totalL = 0; const ecos = new Set();
    snap.forEach(d => { totalL += d.data().litros||0; ecos.add(d.data().eco); });
    document.getElementById("stat-hoy").textContent        = snap.size;
    document.getElementById("stat-litros-hoy").textContent = `${totalL.toFixed(0)} L`;
    document.getElementById("stat-equipos").textContent    = ecos.size;
    const mes     = today.slice(0,7);
    const snapMes = await window.fbGetDocs(window.fbQuery(col,
      window.fbWhere("fecha",">=",`${mes}-01`), window.fbWhere("fecha","<=",`${mes}-31`)));
    let totalMes = 0; snapMes.forEach(d => totalMes += d.data().litros||0);
    document.getElementById("stat-mes").textContent = `${totalMes.toFixed(0)} L`;
  } catch(e) { console.warn("Stats:", e.message); }
}

async function exportCSV() {
  const desde = document.getElementById("exp-desde").value;
  const hasta = document.getElementById("exp-hasta").value;
  const eco   = document.getElementById("exp-eco").value;
  showLoading("Generando CSV...");
  try {
    const col  = window.fbCollection(window.firebaseDB, "registros");
    const snap = await window.fbGetDocs(window.fbQuery(col, window.fbOrderBy("fecha","asc")));
    const rows = [["Fecha","ECO","Maquinaria","Ticket","Tipo","Litros","Cta_Inicial","Cta_Final","Horometro","Fotos","Usuario"]];
    snap.forEach(docSnap => {
      const d = docSnap.data();
      if (eco   && d.eco   !== eco)   return;
      if (desde && d.fecha <  desde)  return;
      if (hasta && d.fecha >  hasta)  return;
      rows.push([d.fecha,d.eco,d.maquinaria,d.ticket,d.tipo,d.litros,
                 d.cuentaInicial,d.cuentaFinal,d.horometro||"N/A",(d.fotos||[]).length,d.usuario]);
    });
    const csv  = rows.map(r => r.map(v=>`"${v}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8"});
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `FuelControl_${desde||"todo"}_${hasta||"hoy"}.csv`;
    a.click(); URL.revokeObjectURL(url);
  } catch(e) { alert("Error CSV: "+e.message); }
  finally { hideLoading(); }
}

function showLoading(msg="Procesando...") {
  document.getElementById("loading-text").textContent = msg;
  document.getElementById("loading-overlay").classList.remove("hidden");
}
function hideLoading() {
  document.getElementById("loading-overlay").classList.add("hidden");
}

/* ============================================
   EXPONER FUNCIONES AL HTML
   ============================================ */
window.handleLogin       = handleLogin;
window.handleLogout      = handleLogout;
window.togglePassword    = togglePassword;
window.switchTab         = switchTab;
window.goStep            = goStep;
window.onMaquinariaChange= onMaquinariaChange;
window.toggleHorometro   = toggleHorometro;
window.onTipoChange      = onTipoChange;
window.onLitrosChange    = onLitrosChange;
window.validateCuentaInicial = validateCuentaInicial;
window.triggerCamera     = triggerCamera;
window.onPhotoCapture    = onPhotoCapture;
window.confirmPhoto      = confirmPhoto;
window.repeatPhoto       = repeatPhoto;
window.removePhoto       = removePhoto;
window.handleSubmit      = handleSubmit;
window.loadHistory       = loadHistory;
window.redownloadPDF     = redownloadPDF;
window.exportCSV         = exportCSV;
