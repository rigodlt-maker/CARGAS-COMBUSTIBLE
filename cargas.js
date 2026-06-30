// =============================================
// js/cargas.js — Formulario de captura "Cargas" (antes "Registro")
// =============================================
// Migrado del app.js monolítico original. Incluye el catálogo de equipos,
// los 4 pasos del formulario, fotos de surtidor/ticket/horómetro, cálculo
// de rendimiento L/h y el guardado a Firestore (con cola offline).

import { AppState } from "./state.js";
import { navPush } from "./nav.js";
import { generateTicketPDF, showLoading, hideLoading } from "./pdf.js";
import { guardarEnCola, actualizarBannerConexion } from "./offline.js";
import { switchTab } from "./nav.js";

/* ─────────────────────────────────────────────────────────────────
   CATÁLOGO DE EQUIPOS (provisional — se reemplazará por el catálogo
   jerárquico Maquinaria→Marca→Modelo de maquinaria.js, punto 7 de los
   requerimientos, cuando ese módulo exista)
───────────────────────────────────────────────────────────────── */
export const catalogoEquipos = [
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

export function cargarSelectorEquipos(targetId) {
  const select = document.getElementById(targetId);
  if (!select) return;
  select.innerHTML = '<option value="">Selecciona el # ECO...</option>';
  catalogoEquipos.forEach(e => {
    const opt = document.createElement("option");
    opt.value = e.interno; opt.textContent = `${e.interno} - ${e.maquinaria}`;
    select.appendChild(opt);
  });
}

export function autoCompletarEquipo() {
  const eco = document.getElementById("f-eco").value;
  const eq = catalogoEquipos.find(e => e.interno === eco);
  document.getElementById("f-maquinaria").value = eq?.maquinaria || "";
  document.getElementById("f-marca").value = eq?.marca || "";
  document.getElementById("f-modelo").value = eq?.modelo || "";
}

export function autoCompletarEquipoEdit() {
  const eco = document.getElementById("edit-eco").value;
  const eq = catalogoEquipos.find(e => e.interno === eco);
  document.getElementById("edit-maquinaria").value = eq?.maquinaria || "";
}

/* ─────────────────────────────────────────────────────────────────
   HORÓMETRO / TICKET — toggles del formulario
───────────────────────────────────────────────────────────────── */
export function setHorometroMode(sinHoro) {
  document.getElementById("chk-sin-horometro").checked = sinHoro;
  document.getElementById("btn-sin-horometro")?.classList.toggle("active", sinHoro);
  document.getElementById("btn-con-horometro")?.classList.toggle("active", !sinHoro);

  const input = document.getElementById("f-horometro");
  input.disabled = sinHoro;
  document.getElementById("horo-foto-section").style.display = sinHoro ? "none" : "block";

  if (sinHoro) {
    input.value = "";
    document.getElementById("horometro-badge").textContent = "N/A";
    AppState.dataFotos.horo = null;
    AppState.estadoFotos.horo = false;
    document.getElementById("preview-box-horo")?.classList.add("hidden");
    document.getElementById("ok-horo")?.classList.add("hidden");
    document.getElementById("btn-cam-horo")?.classList.remove("hidden");
    const imgHoro = document.getElementById("img-horo");
    if (imgHoro) imgHoro.src = "";
  } else {
    document.getElementById("horometro-badge").textContent = "— h";
  }
}

// Compatibilidad con el checkbox onchange="toggleHorometro()"
export function toggleHorometro() {
  setHorometroMode(document.getElementById("chk-sin-horometro").checked);
}

export function updateHorometroBadge() {
  const val = document.getElementById("f-horometro").value;
  if (!val) return (document.getElementById("horometro-badge").textContent = "— h");
  const lastDigit = parseInt(val.toString().slice(-1)) || 0;
  const hours = Math.floor(val / 10);
  document.getElementById("horometro-badge").textContent = `${hours}h ${lastDigit * 6 > 0 ? lastDigit * 6 + "m" : ""}`;
}

export function toggleTicket() {
  const isChecked = document.getElementById("chk-ticket-despues").checked;
  document.getElementById("ticket-section").style.display = isChecked ? "none" : "block";
}

/* ─────────────────────────────────────────────────────────────────
   COMPRESIÓN DE IMÁGENES (control de tamaño máximo, Firestore ~1 MiB)
───────────────────────────────────────────────────────────────── */
function tamanoBase64Bytes(dataUrl) {
  if (!dataUrl) return 0;
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil(base64.length * 0.75);
}

function compressImageToTarget(dataUrl, targetBytes, callback) {
  const img = new Image();
  img.onload = () => {
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
      if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const resultado = canvas.toDataURL("image/jpeg", quality);
      if (tamanoBase64Bytes(resultado) <= targetBytes || i === intentos.length - 1) callback(resultado);
      else { i++; probar(); }
    };
    probar();
  };
  img.onerror = () => callback(dataUrl);
  img.src = dataUrl;
}

const TARGET_BYTES_FOTO = { ini: 140 * 1024, fin: 140 * 1024, ticket: 220 * 1024, pend: 220 * 1024, horo: 140 * 1024 };
const LIMITE_TOTAL_FOTOS_BYTES = 850 * 1024;

function validarTamanoFotos(...fotos) {
  let total = 0;
  fotos.forEach(f => { if (f) total += tamanoBase64Bytes(f); });
  return { ok: total <= LIMITE_TOTAL_FOTOS_BYTES, totalKB: Math.round(total / 1024) };
}

export function previewSurtidor(event, tipo) {
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

export function aceptarSurtidor(tipo) {
  if (!window[`_pending_${tipo}`]) return;
  AppState.dataFotos[tipo] = window[`_pending_${tipo}`];
  AppState.estadoFotos[tipo] = true;

  document.getElementById(`preview-box-${tipo}`).classList.add("hidden");
  document.getElementById(`btn-cam-${tipo}`).classList.remove("hidden");
  document.getElementById(`ok-${tipo}`).classList.remove("hidden");

  if (tipo === "pend") document.getElementById("btn-save-pend").style.display = "block";
}

/* ─────────────────────────────────────────────────────────────────
   NAVEGACIÓN Y VALIDACIÓN DE PASOS
───────────────────────────────────────────────────────────────── */
export function goStep(n, desdePopstate = false) {
  if (n > AppState.currentStep && !validateStep(AppState.currentStep)) return;
  if (!desdePopstate) navPush(`paso-${n}`);
  AppState.currentStep = n;
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`panel-step-${i}`)?.classList.toggle("active", i === n);
    document.getElementById(`step-dot-${i}`)?.classList.toggle("active", i === n);
    document.getElementById(`step-line-${i}`)?.classList.toggle("active", i === n);
  }
  if (n === 4) buildSummary();
}

function validateStep(step) {
  const { estadoFotos } = AppState;
  if (step === 1) {
    if (!document.getElementById("f-eco").value) { alert("Selecciona el ECO"); return false; }
    if (!document.getElementById("chk-sin-horometro").checked) {
      if (!document.getElementById("f-horometro").value) { alert("Falta horómetro"); return false; }
      if (!estadoFotos.horo) { alert("❌ Debes tomar y CONFIRMAR la foto del horómetro."); return false; }
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
    const cf = parseFloat(document.getElementById("f-cuenta-final").value);
    if (isNaN(cf) || cf <= ci) { alert("❌ La cuenta final debe ser mayor que la cuenta inicial (0)."); return false; }
    const difContador = cf - ci;
    const litrosForm = parseFloat(document.getElementById("f-litros").value);
    if (Math.abs(difContador - litrosForm) > 5) {
      if (!confirm(`⚠️ Los litros capturados (${litrosForm} L) difieren de la diferencia del contador (${difContador.toFixed(1)} L).\n\n¿Deseas continuar de todas formas?`)) return false;
    }
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

  const { estadoFotos } = AppState;
  const chkIni    = estadoFotos.ini    ? "✅" : "❌";
  const chkFin    = estadoFotos.fin    ? "✅" : "❌";
  const chkTicket = isPendiente ? "—" : (estadoFotos.ticket ? "✅" : "❌");

  document.getElementById("summary-card").innerHTML = `
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
}

/* ─────────────────────────────────────────────────────────────────
   CÁLCULO DE RENDIMIENTO L/H
───────────────────────────────────────────────────────────────── */
export async function getRendimiento(ecoActual, horoRawActual, litrosActuales, excludeDocId = null) {
  if (!horoRawActual) return "N/A";
  try {
    const col = window.fbCollection(window.firebaseDB, "registros");
    const q = window.fbQuery(col, window.fbWhere("eco", "==", ecoActual), window.fbLimit(30));
    const snap = await window.fbGetDocs(q);
    if (snap.empty) return "Primer Registro";

    function horoADecimal(raw) { return Math.floor(raw / 10) + (raw % 10) / 10; }
    const horoActualDec = horoADecimal(horoRawActual);

    const docsOrdenados = snap.docs
      .filter(d => d.data().horometroRaw)
      .sort((a, b) => b.data().horometroRaw - a.data().horometroRaw);

    for (const docSnap of docsOrdenados) {
      if (excludeDocId && docSnap.id === excludeDocId) continue;
      const prev = docSnap.data();
      if (!prev.horometroRaw) continue;

      const horoPrevDec = horoADecimal(prev.horometroRaw);
      const horasTrabajadas = horoActualDec - horoPrevDec;
      if (horasTrabajadas <= 0) continue;

      const litrosPrevios = prev.litros;
      if (!litrosPrevios || litrosPrevios <= 0) continue;

      return (litrosPrevios / horasTrabajadas).toFixed(2);
    }
    return "Primer Registro";
  } catch (e) {
    console.error("getRendimiento error:", e);
    return "N/A";
  }
}

/* ─────────────────────────────────────────────────────────────────
   RESET DEL FORMULARIO
───────────────────────────────────────────────────────────────── */
export function resetFormulario() {
  AppState.dataFotos   = { ini: null, fin: null, ticket: null, pend: null, horo: null };
  AppState.estadoFotos = { ini: false, fin: false, ticket: false, pend: false, horo: false };
  AppState.currentStep = 1;

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
  const radioMarcado = document.querySelector('input[name="tipo-combustible"]:checked');
  if (radioMarcado) radioMarcado.checked = false;

  ["ini", "fin", "ticket", "horo"].forEach(tipo => {
    document.getElementById(`preview-box-${tipo}`)?.classList.add("hidden");
    document.getElementById(`ok-${tipo}`)?.classList.add("hidden");
    document.getElementById(`btn-cam-${tipo}`)?.classList.remove("hidden");
    const img = document.getElementById(`img-${tipo}`);
    if (img) img.src = "";
  });

  const horoSection = document.getElementById("horo-foto-section");
  if (horoSection) horoSection.style.display = "block";

  for (let i = 1; i <= 4; i++) {
    document.getElementById(`panel-step-${i}`)?.classList.toggle("active", i === 1);
    document.getElementById(`step-dot-${i}`)?.classList.toggle("active", i === 1);
    document.getElementById(`step-line-${i}`)?.classList.toggle("active", i === 1);
  }
  document.getElementById("f-fecha").value = new Date().toISOString().split("T")[0];
}

/* ─────────────────────────────────────────────────────────────────
   GUARDAR EN FIREBASE (con cola offline)
───────────────────────────────────────────────────────────────── */
export async function handleSubmit() {
  const sinHoroCheck = document.getElementById("chk-sin-horometro").checked;
  const isPendienteCheck = document.getElementById("chk-ticket-despues").checked;
  const { dataFotos } = AppState;

  const fotosAValidar = [dataFotos.ini, dataFotos.fin];
  if (!isPendienteCheck) fotosAValidar.push(dataFotos.ticket);
  if (!sinHoroCheck) fotosAValidar.push(dataFotos.horo);

  const chequeoTamano = validarTamanoFotos(...fotosAValidar);
  if (!chequeoTamano.ok) {
    alert(`❌ Las fotos de este registro pesan demasiado (${chequeoTamano.totalKB} KB).\n\nPor favor vuelve a tomar alguna de las fotos con menos zoom/detalle y vuelve a intentar guardar.`);
    return;
  }

  showLoading("Guardando en base de datos...");
  try {
    const eco = document.getElementById("f-eco").value;
    const horoRaw = sinHoroCheck ? null : parseFloat(document.getElementById("f-horometro").value);
    const litros = parseFloat(document.getElementById("f-litros").value);
    const isPendiente = isPendienteCheck;

    const rendimiento = await getRendimiento(eco, horoRaw, litros);
    const docRef = window.fbDoc(window.fbCollection(window.firebaseDB, "registros"));

    const record = {
      fecha: document.getElementById("f-fecha").value,
      eco,
      maquinaria: document.getElementById("f-maquinaria").value,
      litros,
      horometroRaw: horoRaw,
      rendimiento,
      status: isPendiente ? "pendiente" : "completado",
      ticket: isPendiente ? "PENDIENTE" : document.getElementById("f-ticket").value,
      fotoInicial: dataFotos.ini,
      fotoFinal: dataFotos.fin,
      fotoTicket: isPendiente ? null : dataFotos.ticket,
      fotoHorometro: dataFotos.horo || null,
      usuario: AppState.currentUser.email,
      conciliado: false,
      creadoEn: window.fbTimestamp.now(),
      tipoCombustible: document.querySelector('input[name="tipo-combustible"]:checked')?.value || "",
    };

    try {
      await window.fbSetDoc(docRef, record);
    } catch (firebaseErr) {
      if (!navigator.onLine || firebaseErr.code === "unavailable" || firebaseErr.message.includes("offline")) {
        await guardarEnCola(record);
        actualizarBannerConexion();
        hideLoading();
        alert("📵 Sin conexión — el registro se guardó localmente y se subirá automáticamente cuando vuelva internet.");
        resetFormulario();
        switchTab("historial");
        return;
      }
      throw firebaseErr;
    }

    if (!isPendiente) {
      showLoading("Datos guardados. Generando PDF...");
      const pdfDoc = await generateTicketPDF(record);
      pdfDoc.save(`FuelControl_${eco}_${record.ticket}.pdf`);
    }

    hideLoading();
    alert(isPendiente ? "Guardado como PENDIENTE. (No se generó PDF aún)" : "Guardado con éxito en la nube y PDF descargado.");
    resetFormulario();
    switchTab("historial");
  } catch (e) {
    hideLoading();
    alert("❌ Error al subir a Firebase. Revisa tu conexión a internet o tus permisos. Detalle: " + e.message);
  }
}

/* ─────────────────────────────────────────────────────────────────
   EXPORTAR EXCEL (XLSX) — legado; se reemplazará por descargas
   específicas desde Resumen/Maquinaria cuando esos módulos existan.
───────────────────────────────────────────────────────────────── */
export async function exportExcel() {
  showLoading("Generando Excel...");
  try {
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
      let horoDecimal = 0;
      if (typeof d.horometroRaw === "number") {
        const horas = Math.floor(d.horometroRaw / 10);
        const decimas = d.horometroRaw % 10;
        horoDecimal = parseFloat(`${horas}.${decimas}`);
      }
      filas.push([
        d.eco || "", d.fecha || "", horoDecimal,
        typeof d.litros === "number" ? d.litros : (parseFloat(d.litros) || ""),
        d.tipoCombustible || "", d.ticket || ""
      ]);
    });

    const ws = window.XLSX.utils.aoa_to_sheet(filas);
    ws["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];
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