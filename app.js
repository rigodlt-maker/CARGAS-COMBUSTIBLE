// =============================================
// app.js — FuelControl PWA
// Lógica principal: Auth, Formulario, Firestore, Storage
// =============================================

/* ============================================
   ESTADO GLOBAL
   ============================================ */
let currentUser   = null;
let currentStep   = 1;
let capturedPhotos = [];   // Array de { blob, dataUrl }
let photoConfirmed = false;

/* ============================================
   AUTH
   ============================================ */
document.addEventListener("DOMContentLoaded", () => {
  // Esperar a que Firebase esté listo
  const waitForFirebase = setInterval(() => {
    if (window.firebaseAuth && window.fbAuthChanged) {
      clearInterval(waitForFirebase);
      initAuth();
    }
  }, 100);

  // Fecha de hoy por defecto
  const today = new Date().toISOString().split("T")[0];
  const dateField = document.getElementById("f-fecha");
  if (dateField) dateField.value = today;

  // Horómetro: actualizar badge en tiempo real
  const horoInput = document.getElementById("f-horometro");
  if (horoInput) horoInput.addEventListener("input", updateHorometroBadge);
});

function initAuth() {
  window.fbAuthChanged(window.firebaseAuth, async (user) => {
    if (user) {
      // Verificar lista blanca
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
    console.error("Error verificando whitelist:", e);
    // En modo demo (sin Firebase real), permitir acceso
    return true;
  }
}

async function handleLogin() {
  const email = document.getElementById("login-email").value.trim();
  const pw    = document.getElementById("login-password").value;
  const btn   = document.getElementById("btn-login");

  if (!email || !pw) { showLoginError("Ingresa correo y contraseña."); return; }

  btn.disabled = true;
  btn.querySelector(".btn-label").textContent = "Verificando...";

  try {
    await window.fbSignIn(window.firebaseAuth, email, pw);
    // onAuthStateChanged se encarga del resto
  } catch (e) {
    const msgs = {
      "auth/user-not-found":    "Correo no registrado.",
      "auth/wrong-password":    "Contraseña incorrecta.",
      "auth/invalid-email":     "Formato de correo inválido.",
      "auth/too-many-requests": "Demasiados intentos. Intenta más tarde.",
      "auth/invalid-credential":"Credenciales incorrectas."
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
  setTimeout(() => el.classList.add("hidden"), 5000);
}

function togglePassword() {
  const input = document.getElementById("login-password");
  input.type = input.type === "password" ? "text" : "password";
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
   STEPS
   ============================================ */
function goStep(n) {
  if (n > currentStep && !validateStep(currentStep)) return;

  currentStep = n;

  // Panels
  for (let i = 1; i <= 4; i++) {
    const panel = document.getElementById(`panel-step-${i}`);
    if (panel) panel.classList.toggle("active", i === n);
  }

  // Step dots
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`step-dot-${i}`);
    if (!dot) continue;
    dot.classList.toggle("active", i === n);
    dot.classList.toggle("done", i < n);
  }

  // Step lines
  for (let i = 1; i <= 3; i++) {
    const line = document.getElementById(`step-line-${i}`);
    if (!line) continue;
    line.classList.toggle("done",   i < n);
    line.classList.toggle("active", i === n);
  }

  // Si es paso 4, construir resumen
  if (n === 4) buildSummary();

  // Scroll al top del form
  document.querySelector(".form-container")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function validateStep(step) {
  if (step === 1) {
    if (!document.getElementById("f-fecha").value) { alert("Selecciona la fecha de carga."); return false; }
    if (!document.getElementById("f-maquinaria").value) { alert("Selecciona la maquinaria."); return false; }
    if (!document.getElementById("f-eco").value.trim()) { alert("Ingresa el # ECO Interno."); return false; }
    const sinHoro = document.getElementById("chk-sin-horometro").checked;
    if (!sinHoro && !document.getElementById("f-horometro").value) { alert("Ingresa el horómetro o marca 'Sin horómetro'."); return false; }
  }
  if (step === 2) {
    const tipo = document.querySelector('input[name="tipo-combustible"]:checked');
    if (!tipo) { alert("Selecciona el tipo de combustible."); return false; }
    if (!document.getElementById("f-litros").value) { alert("Ingresa los litros cargados."); return false; }
    const ci = parseFloat(document.getElementById("f-cuenta-inicial").value);
    if (document.getElementById("f-cuenta-inicial").value === "" || isNaN(ci)) { alert("Ingresa la cuenta litros inicial."); return false; }
    if (ci !== 0) { alert("La cuenta litros inicial debe ser 0."); return false; }
    if (!document.getElementById("f-cuenta-final").value) { alert("Ingresa la cuenta litros final."); return false; }
  }
  if (step === 3) {
    if (!document.getElementById("f-ticket").value.trim()) { alert("Ingresa el # de ticket."); return false; }
    if (capturedPhotos.length === 0) { alert("Captura al menos una foto del ticket."); return false; }
    if (!photoConfirmed) { alert("Confirma la foto del ticket."); return false; }
  }
  return true;
}

/* ============================================
   FORM HELPERS
   ============================================ */
function onMaquinariaChange() {
  const val   = document.getElementById("f-maquinaria").value;
  const noHoro = ["Planta de luz"];
  const chk   = document.getElementById("chk-sin-horometro");
  if (noHoro.includes(val)) {
    chk.checked = true;
    toggleHorometro();
  }
}

function toggleHorometro() {
  const sinHoro  = document.getElementById("chk-sin-horometro").checked;
  const horoInput = document.getElementById("f-horometro");
  const badge    = document.getElementById("horometro-badge");
  horoInput.disabled = sinHoro;
  horoInput.style.opacity = sinHoro ? "0.35" : "1";
  if (sinHoro) { horoInput.value = ""; badge.textContent = "N/A"; }
}

function updateHorometroBadge() {
  const val   = document.getElementById("f-horometro").value;
  const badge = document.getElementById("horometro-badge");
  if (!val) { badge.textContent = "— h"; return; }

  const parts  = val.toString().split(".");
  const hours  = parseInt(parts[0]) || 0;
  const frac   = parseInt(parts[1]?.[0]) || 0;
  const mins   = frac * 6;
  badge.textContent = `${hours}h ${mins > 0 ? mins + "m" : ""}`;
}

function onTipoChange() {
  // Actualizar estilos de radio cards
  document.querySelectorAll(".radio-card").forEach(card => {
    const input = card.querySelector("input");
    card.style.borderColor = input.checked ? "var(--orange)" : "";
  });
}

function onLitrosChange() {
  const litros = parseFloat(document.getElementById("f-litros").value) || 0;
  const final  = parseFloat(document.getElementById("f-cuenta-final").value) || 0;
  const val    = litros || final;
  const pct    = Math.min((val / 1000) * 100, 100);

  document.getElementById("meter-value").textContent = val > 0 ? `${val.toFixed(1)} L` : "— L";
  document.getElementById("meter-fill").style.width = `${pct}%`;
}

function validateCuentaInicial() {
  const val  = parseFloat(document.getElementById("f-cuenta-inicial").value);
  const warn = document.getElementById("ci-warning");
  const badge = document.getElementById("ci-badge");

  if (val === 0) {
    warn.classList.add("hidden");
    badge.classList.remove("hidden");
  } else {
    warn.classList.remove("hidden");
    badge.classList.add("hidden");
  }
}

/* ============================================
   CAMERA / PHOTOS
   ============================================ */
function triggerCamera() {
  document.getElementById("file-ticket").click();
}

function onPhotoCapture(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    const blob    = file;

    // Mostrar preview
    document.getElementById("ticket-img").src = dataUrl;
    document.getElementById("camera-placeholder").classList.add("hidden");
    document.getElementById("camera-preview").classList.remove("hidden");
    document.getElementById("photo-actions").classList.remove("hidden");

    // Guardar temporalmente
    window._pendingPhoto = { blob, dataUrl, name: file.name };
    photoConfirmed = false;
  };
  reader.readAsDataURL(file);
  event.target.value = ""; // reset input
}

function confirmPhoto() {
  if (!window._pendingPhoto) return;

  capturedPhotos.push(window._pendingPhoto);
  window._pendingPhoto = null;
  photoConfirmed = true;

  // Actualizar thumbs
  renderPhotoThumbs();

  // Mostrar btn agregar foto
  document.getElementById("btn-add-photo").style.display = "flex";
  document.getElementById("photo-actions").classList.add("hidden");

  // Reset camera zone para siguiente foto
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
    div.innerHTML = `
      <img src="${p.dataUrl}" alt="Foto ${i+1}" />
      <button class="remove-photo" onclick="removePhoto(${i})" title="Eliminar">×</button>`;
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
   GENERAR PDF DE TICKET (client-side)
   ============================================ */
async function generateTicketPDF(photos, metadata) {
  // Usamos la librería jsPDF via CDN (se carga dinámicamente)
  if (!window.jspdf) {
    await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Header
  doc.setFillColor(28, 33, 40);
  doc.rect(0, 0, 210, 35, "F");
  doc.setTextColor(232, 98, 10);
  doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text("FuelControl — Rompeolas Oriente", 15, 14);
  doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.setTextColor(139, 148, 158);
  doc.text(`Ticket: ${metadata.ticket}  |  ECO: ${metadata.eco}  |  Fecha: ${metadata.fecha}`, 15, 22);
  doc.text(`Maquinaria: ${metadata.maquinaria}  |  ${metadata.tipo}: ${metadata.litros} L`, 15, 28);

  // Fotos
  let y = 42;
  for (let i = 0; i < photos.length; i++) {
    const imgData = photos[i].dataUrl;
    const imgProps = doc.getImageProperties(imgData);
    const maxW = 180; const maxH = 220;
    let w = maxW, h = (imgProps.height * maxW) / imgProps.width;
    if (h > maxH) { h = maxH; w = (imgProps.width * maxH) / imgProps.height; }

    if (y + h > 285) { doc.addPage(); y = 15; }
    doc.addImage(imgData, "JPEG", (210 - w) / 2, y, w, h);
    y += h + 8;
  }

  // Footer
  doc.setFontSize(8); doc.setTextColor(77, 85, 98);
  doc.text(`Generado: ${new Date().toLocaleString("es-MX")}  |  Usuario: ${currentUser?.email || "—"}`, 15, 290);

  return doc.output("blob");
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

/* ============================================
   RESUMEN (STEP 4)
   ============================================ */
function buildSummary() {
  const tipo  = document.querySelector('input[name="tipo-combustible"]:checked')?.value || "—";
  const litros = parseFloat(document.getElementById("f-litros").value) || 0;
  const sinHoro = document.getElementById("chk-sin-horometro").checked;
  const horo  = sinHoro ? "Sin horómetro" : (document.getElementById("f-horometro").value || "—");

  const rows = [
    ["Fecha",          document.getElementById("f-fecha").value],
    ["Maquinaria",     document.getElementById("f-maquinaria").value],
    ["# ECO",          document.getElementById("f-eco").value],
    ["Horómetro",      horo],
    ["# Ticket",       document.getElementById("f-ticket").value],
    ["Tipo",           tipo, "badge"],
    ["Litros cargados",`${litros.toFixed(2)} L`, "highlight"],
    ["Cta. Inicial",   document.getElementById("f-cuenta-inicial").value || "0"],
    ["Cta. Final",     document.getElementById("f-cuenta-final").value || "—"],
    ["Fotos capturadas",`${capturedPhotos.length} foto(s)`],
  ];

  const card = document.getElementById("summary-card");
  card.innerHTML = rows.map(([k, v, type], i) => {
    let valHtml = `<span class="summary-val${type === 'highlight' ? ' highlight' : ''}">${v}</span>`;
    if (type === "badge") {
      const cls = v === "Diésel" ? "badge-diesel" : "badge-gasolina";
      valHtml = `<span class="summary-val"><span class="summary-badge ${cls}">${v}</span></span>`;
    }
    const divClass = i > 0 && i % 4 === 0 ? "summary-row divider" : "summary-row";
    return `<div class="${divClass}"><span class="summary-key">${k}</span>${valHtml}</div>`;
  }).join("");
}

/* ============================================
   SUBMIT — Guardar en Firebase
   ============================================ */
async function handleSubmit() {
  const btn = document.getElementById("btn-submit");
  btn.disabled = true;
  showLoading("Generando PDF del ticket...");

  try {
    const fecha     = document.getElementById("f-fecha").value;
    const eco       = document.getElementById("f-eco").value.trim().toUpperCase();
    const maquinaria = document.getElementById("f-maquinaria").value;
    const ticket    = document.getElementById("f-ticket").value.trim().toUpperCase();
    const tipo      = document.querySelector('input[name="tipo-combustible"]:checked')?.value;
    const litros    = parseFloat(document.getElementById("f-litros").value);
    const cuentaIni = parseFloat(document.getElementById("f-cuenta-inicial").value);
    const cuentaFin = parseFloat(document.getElementById("f-cuenta-final").value);
    const sinHoro   = document.getElementById("chk-sin-horometro").checked;
    const horo      = sinHoro ? null : document.getElementById("f-horometro").value;

    // Metadata para el PDF
    const meta = { ticket, eco, fecha, maquinaria, tipo, litros: litros.toFixed(2) };

    // 1. Generar PDF
    const pdfBlob = await generateTicketPDF(capturedPhotos, meta);

    showLoading("Subiendo archivos...");

    // 2. Subir PDF a Storage: YYYY-MM-DD/ECO/ticket_TIMESTAMP.pdf
    const ts       = Date.now();
    const pdfPath  = `${fecha}/${eco}/ticket_${ticket}_${ts}.pdf`;
    const pdfRef   = window.fbStorageRef(window.firebaseStorage, pdfPath);
    await window.fbUploadBytes(pdfRef, pdfBlob, { contentType: "application/pdf" });
    const pdfUrl   = await window.fbGetDownloadURL(pdfRef);

    showLoading("Guardando registro...");

    // 3. Guardar en Firestore
    const record = {
      fecha,
      eco,
      maquinaria,
      ticket,
      tipo,
      litros,
      cuentaInicial: cuentaIni,
      cuentaFinal:   cuentaFin,
      horometro:     horo,
      sinHorometro:  sinHoro,
      pdfUrl,
      pdfPath,
      usuario:       currentUser.email,
      creadoEn:      window.fbTimestamp.now(),
    };

    await window.fbAddDoc(window.fbCollection(window.firebaseDB, "registros"), record);

    hideLoading();
    showSubmitSuccess();

  } catch (e) {
    hideLoading();
    console.error("Error al guardar:", e);
    const errEl = document.getElementById("submit-error");
    errEl.textContent = `Error: ${e.message}`;
    errEl.classList.remove("hidden");
    setTimeout(() => errEl.classList.add("hidden"), 8000);
  } finally {
    btn.disabled = false;
  }
}

function showSubmitSuccess() {
  const el = document.getElementById("submit-success");
  el.textContent = "✅ Registro guardado exitosamente. PDF consolidado en Storage.";
  el.classList.remove("hidden");
  setTimeout(() => {
    el.classList.add("hidden");
    resetForm();
    switchTab("historial");
  }, 3000);
}

function resetForm() {
  capturedPhotos = [];
  photoConfirmed = false;
  window._pendingPhoto = null;

  // Reset inputs
  ["f-fecha","f-eco","f-horometro","f-ticket","f-litros","f-cuenta-inicial","f-cuenta-final"]
    .forEach(id => { const el = document.getElementById(id); if(el) el.value = ""; });

  document.getElementById("f-maquinaria").value = "";
  document.querySelectorAll('input[name="tipo-combustible"]').forEach(r => r.checked = false);
  document.getElementById("chk-sin-horometro").checked = false;
  document.getElementById("f-horometro").disabled = false;
  document.getElementById("horometro-badge").textContent = "— h";
  document.getElementById("meter-fill").style.width = "0%";
  document.getElementById("meter-value").textContent = "— L";
  document.getElementById("photos-list").innerHTML = "";
  document.getElementById("btn-add-photo").style.display = "none";
  document.getElementById("photo-actions").classList.add("hidden");
  document.getElementById("camera-placeholder").classList.remove("hidden");
  document.getElementById("camera-preview").classList.add("hidden");
  document.getElementById("ci-badge").classList.add("hidden");
  document.getElementById("ci-warning").classList.add("hidden");

  // Fecha de hoy
  document.getElementById("f-fecha").value = new Date().toISOString().split("T")[0];

  goStep(1);
}

/* ============================================
   HISTORIAL
   ============================================ */
async function loadHistory() {
  const fecha = document.getElementById("hist-fecha").value;
  const eco   = document.getElementById("hist-eco").value;
  const list  = document.getElementById("history-list");

  list.innerHTML = `<div class="empty-state"><div class="spinner"></div><p>Cargando...</p></div>`;

  try {
    const col = window.fbCollection(window.firebaseDB, "registros");
    let q = window.fbQuery(col, window.fbOrderBy("creadoEn", "desc"));

    if (fecha) q = window.fbQuery(col,
      window.fbWhere("fecha", "==", fecha),
      window.fbOrderBy("creadoEn", "desc")
    );
    if (eco) q = window.fbQuery(col,
      window.fbWhere("eco", "==", eco),
      window.fbOrderBy("creadoEn", "desc")
    );
    if (fecha && eco) q = window.fbQuery(col,
      window.fbWhere("fecha", "==", fecha),
      window.fbWhere("eco", "==", eco),
      window.fbOrderBy("creadoEn", "desc")
    );

    const snap = await window.fbGetDocs(q);
    if (snap.empty) {
      list.innerHTML = `<div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#3D4551" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <p>Sin registros</p><span>Ajusta los filtros o registra una carga.</span></div>`;
      return;
    }

    list.innerHTML = "";
    snap.forEach(doc => {
      const d = doc.data();
      const card = document.createElement("div");
      card.className = "history-card";
      card.innerHTML = `
        <div class="hc-header">
          <span class="hc-eco">${d.eco}</span>
          <span class="hc-time">${d.fecha}</span>
        </div>
        <div class="hc-machine">${d.maquinaria}</div>
        <div class="hc-footer">
          <span class="hc-litros">${d.litros?.toFixed(1)}<span> L · ${d.tipo}</span></span>
          <span class="summary-badge ${d.tipo === 'Diésel' ? 'badge-diesel' : 'badge-gasolina'}">${d.tipo}</span>
          ${d.pdfUrl ? `<a href="${d.pdfUrl}" target="_blank" title="Ver PDF" style="color:var(--orange);font-size:12px;margin-left:auto;">📄 PDF</a>` : ""}
        </div>`;
      list.appendChild(card);
    });

  } catch(e) {
    list.innerHTML = `<div class="empty-state"><p>Error al cargar: ${e.message}</p></div>`;
  }
}

/* ============================================
   ESTADÍSTICAS
   ============================================ */
async function loadStats() {
  const today = new Date().toISOString().split("T")[0];
  try {
    const col  = window.fbCollection(window.firebaseDB, "registros");
    const q    = window.fbQuery(col, window.fbWhere("fecha", "==", today));
    const snap = await window.fbGetDocs(q);
    let totalLitros = 0; const ecos = new Set();
    snap.forEach(d => { totalLitros += d.data().litros || 0; ecos.add(d.data().eco); });
    document.getElementById("stat-hoy").textContent     = snap.size;
    document.getElementById("stat-litros-hoy").textContent = `${totalLitros.toFixed(0)} L`;
    document.getElementById("stat-equipos").textContent = ecos.size;
    // Mes
    const mes = today.slice(0, 7);
    const qMes = window.fbQuery(col, window.fbWhere("fecha", ">=", `${mes}-01`), window.fbWhere("fecha", "<=", `${mes}-31`));
    const snapMes = await window.fbGetDocs(qMes);
    let totalMes = 0; snapMes.forEach(d => totalMes += d.data().litros || 0);
    document.getElementById("stat-mes").textContent = `${totalMes.toFixed(0)} L`;
  } catch(e) { console.warn("Stats no disponibles:", e.message); }
}

/* ============================================
   EXPORTAR CSV
   ============================================ */
async function exportCSV() {
  const desde = document.getElementById("exp-desde").value;
  const hasta = document.getElementById("exp-hasta").value;
  const eco   = document.getElementById("exp-eco").value;

  showLoading("Generando CSV...");
  try {
    const col = window.fbCollection(window.firebaseDB, "registros");
    let q = window.fbQuery(col, window.fbOrderBy("fecha", "asc"));
    if (desde) q = window.fbQuery(col, window.fbWhere("fecha", ">=", desde), window.fbOrderBy("fecha","asc"));
    if (hasta) q = window.fbQuery(col, window.fbWhere("fecha", "<=", hasta), window.fbOrderBy("fecha","asc"));

    const snap = await window.fbGetDocs(q);
    const rows = [["Fecha","ECO","Maquinaria","Ticket","Tipo","Litros","Cta_Inicial","Cta_Final","Horometro","Usuario"]];
    snap.forEach(doc => {
      const d = doc.data();
      if (eco && d.eco !== eco) return;
      rows.push([d.fecha, d.eco, d.maquinaria, d.ticket, d.tipo, d.litros, d.cuentaInicial, d.cuentaFinal, d.horometro || "N/A", d.usuario]);
    });

    const csv  = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = `FuelControl_${desde || "todo"}_${hasta || ""}.csv`;
    a.click(); URL.revokeObjectURL(url);
  } catch(e) { alert("Error al exportar: " + e.message); }
  finally { hideLoading(); }
}

/* ============================================
   LOADING
   ============================================ */
function showLoading(msg = "Procesando...") {
  document.getElementById("loading-text").textContent = msg;
  document.getElementById("loading-overlay").classList.remove("hidden");
}
function hideLoading() {
  document.getElementById("loading-overlay").classList.add("hidden");
}
