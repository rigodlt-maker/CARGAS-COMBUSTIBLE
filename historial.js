// =============================================
// js/historial.js — Historial, Pendientes, edición y conciliación
// =============================================
// Migrado del app.js monolítico original, adaptado a la matriz de 5 roles
// de roles.js (antes solo existían isAdmin/isMaster booleanos).

import { AppState, setCache, getCache, resetCache } from "./state.js";
import { navPush } from "./nav.js";
import { generateTicketPDF, showLoading, hideLoading } from "./pdf.js";
import {
  puedeEditarConciliado,
  puedeEditarNoConciliado,
  puedeConciliar,
  puedeDescargarPDFHistorial,
} from "./roles.js";

/* ─────────────────────────────────────────────────────────────────
   Helper de tamaño de foto (duplicado mínimo del que vive en cargas.js
   para no crear una dependencia circular historial.js <-> cargas.js;
   cuando exista cargas.js, este bloque se puede borrar e importar de ahí).
───────────────────────────────────────────────────────────────── */
function tamanoBase64Bytes(dataUrl) {
  if (!dataUrl) return 0;
  const base64 = dataUrl.split(",")[1] || "";
  return Math.ceil((base64.length * 3) / 4);
}
function validarTamanoFotoPendiente(dataUrl, limiteKB = 800) {
  const kb = tamanoBase64Bytes(dataUrl) / 1024;
  return { ok: kb <= limiteKB, totalKB: Math.round(kb) };
}

/* ─────────────────────────────────────────────────────────────────
   PENDIENTES — registros a los que les falta el ticket
───────────────────────────────────────────────────────────────── */
export async function loadPendientes() {
  const list = document.getElementById("pendientes-list");
  list.innerHTML = "Cargando pendientes...";
  try {
    const q = window.fbQuery(
      window.fbCollection(window.firebaseDB, "registros"),
      window.fbWhere("status", "==", "pendiente")
    );
    const snap = await window.fbGetDocs(q);

    resetCache("pendientes");
    if (snap.empty) { list.innerHTML = "<p>No hay tickets pendientes.</p>"; return; }

    list.innerHTML = "";
    snap.forEach(docSnap => {
      const d = docSnap.data();
      setCache("pendientes", docSnap.id, d);
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
  } catch (e) {
    list.innerHTML = `<p style="color:var(--red);">❌ Error al cargar pendientes: ${e.message}</p>`;
    console.error("loadPendientes error:", e);
  }
}

let docPendienteActual = null;

export function abrirPendiente(id) {
  const d = getCache("pendientes", id) || getCache("historial", id);
  docPendienteActual = id;
  document.getElementById("pend-eco").textContent = d ? `${d.eco} (${d.litros} L) - ${d.fecha}` : id;
  document.getElementById("pend-ticket-input").value = "";
  AppState.estadoFotos.pend = false;
  AppState.dataFotos.pend = null;
  document.getElementById("ok-pend").classList.add("hidden");
  document.getElementById("btn-cam-pend").classList.remove("hidden");
  document.getElementById("preview-box-pend").classList.add("hidden");
  document.getElementById("btn-save-pend").style.display = "none";
  document.getElementById("modal-pendiente").classList.remove("hidden");
  navPush("modal-pendiente");
}

export function cerrarModalPendiente(desdePopstate = false) {
  document.getElementById("modal-pendiente").classList.add("hidden");
  if (!desdePopstate) history.back();
}

export function refrescarListaActual() {
  if (document.getElementById("content-historial")?.classList.contains("active")) loadHistory();
  if (document.getElementById("content-pendientes")?.classList.contains("active")) loadPendientes();
}

export async function guardarPendiente() {
  const ticketVal = document.getElementById("pend-ticket-input").value.trim();
  if (!ticketVal) return alert("Ingresa el número de ticket definitivo.");
  if (!AppState.estadoFotos.pend) return alert("❌ Debes tomar y CONFIRMAR la foto del Ticket.");

  const chequeoTamano = validarTamanoFotoPendiente(AppState.dataFotos.pend);
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
    await window.fbUpdateDoc(docRef, {
      ticket: ticketVal,
      fotoTicket: AppState.dataFotos.pend,
      status: "completado"
    });

    const docSnap = await window.fbGetDoc(window.fbDoc(window.firebaseDB, "registros", docPendienteActual));
    const record = docSnap.data();
    record.fotoTicket = AppState.dataFotos.pend;
    record.ticket = ticketVal;

    const docPDF = await generateTicketPDF(record);
    docPDF.save(`FuelControl_${record.eco}_${ticketVal}.pdf`);

    hideLoading();
    alert("Ticket adjuntado y PDF generado.");
    cerrarModalPendiente();
    refrescarListaActual();
  } catch (e) { hideLoading(); alert("Error: " + e.message); }
}

/* ─────────────────────────────────────────────────────────────────
   EDITAR REGISTRO — Coordinador/Admin (no conciliado) y Master (siempre)
───────────────────────────────────────────────────────────────── */
export function abrirEditar(id) {
  const d = getCache("historial", id);
  if (!d) return alert("No se encontró el registro.");

  const esConciliado = d.conciliado === true;
  if (esConciliado && !puedeEditarConciliado(AppState.rol)) {
    return alert("Este registro ya fue conciliado. Solo el rol Master puede editarlo.");
  }
  if (!esConciliado && !puedeEditarNoConciliado(AppState.rol) && !puedeEditarConciliado(AppState.rol)) {
    return alert("No tienes permiso para editar registros.");
  }

  document.getElementById("edit-error").classList.add("hidden");
  document.getElementById("edit-id").value = id;
  document.getElementById("edit-fecha").value = d.fecha || "";
  document.getElementById("edit-eco").value = d.eco || "";
  // autoCompletarEquipoEdit() vive en cargas.js — se llama desde el HTML
  // con onchange="autoCompletarEquipoEdit()" una vez exista ese módulo.
  document.getElementById("edit-litros").value = d.litros ?? "";
  document.getElementById("edit-horometro").value = d.horometroRaw ?? "";
  document.getElementById("edit-ticket").value = (d.ticket === "PENDIENTE" ? "" : d.ticket) || "";
  document.getElementById("modal-editar").classList.remove("hidden");
  navPush("modal-editar");
}

export function cerrarModalEditar(desdePopstate = false) {
  document.getElementById("modal-editar").classList.add("hidden");
  if (!desdePopstate) history.back();
}

export async function guardarEdicion() {
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
    const eq = AppState.catalogoEquipos.find(e => e.interno === eco);
    // getRendimiento vive en cargas.js (cálculo de L/h contra el último
    // registro previo de la misma máquina); se importa ahí cuando exista.
    const { getRendimiento } = await import("./cargas.js");
    const rendimiento = await getRendimiento(eco, horoRaw, litros, id);
    const original = getCache("historial", id);

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

/* --- CONCILIAR (solo Master) --- */
export async function conciliarRegistro(id) {
  if (!puedeConciliar(AppState.rol)) return alert("Solo el rol Master puede conciliar registros.");
  if (!confirm("¿Conciliar este registro?\n\nYa no se podrá editar ni subir el ticket después (excepto por el Master). Esta acción es definitiva para el resto de los roles.")) return;
  showLoading("Conciliando registro...");
  try {
    await window.fbUpdateDoc(window.fbDoc(window.firebaseDB, "registros", id), { conciliado: true });
    hideLoading();
    refrescarListaActual();
  } catch (e) { hideLoading(); alert("Error: " + e.message); }
}

/* ─────────────────────────────────────────────────────────────────
   HISTORIAL — lista por fecha
───────────────────────────────────────────────────────────────── */
export async function loadHistory() {
  const list = document.getElementById("history-list");
  const fechaInput = document.getElementById("hist-fecha");
  if (!fechaInput.value) fechaInput.value = new Date().toISOString().split("T")[0];
  const fecha = fechaInput.value;

  list.innerHTML = "Cargando...";
  try {
    const col = window.fbCollection(window.firebaseDB, "registros");
    const q = window.fbQuery(col, window.fbWhere("fecha", "==", fecha));
    const snap = await window.fbGetDocs(q);

    resetCache("historial");
    if (snap.empty) { list.innerHTML = "<p>No hay registros para esta fecha.</p>"; return; }

    list.innerHTML = "";
    snap.forEach(docSnap => {
      const d = docSnap.data();
      setCache("historial", docSnap.id, d);

      const esPendiente = d.status === "pendiente";
      const esConciliado = d.conciliado === true;
      const colorEstatus = esConciliado ? "var(--blue)" : (esPendiente ? "var(--orange)" : "var(--green)");
      const txtEstatus = esConciliado ? "🔒 Conciliado" : (esPendiente ? "⏳ Pendiente" : "✅ Completado");

      let botones = "";
      if (puedeDescargarPDFHistorial(AppState.rol)) {
        botones += `<button class="btn btn-outline btn-sm" onclick="descargarPDFDesdeCache('${docSnap.id}')">📥 Descargar PDF</button>`;
      }
      if (!esConciliado) {
        if (esPendiente) {
          botones += `<button class="btn btn-outline btn-sm" onclick="abrirPendiente('${docSnap.id}')">📷 Subir Ticket</button>`;
        }
        if (puedeEditarNoConciliado(AppState.rol)) {
          botones += `<button class="btn btn-ghost btn-sm" onclick="abrirEditar('${docSnap.id}')">✏️ Editar</button>`;
        }
      }
      // Master puede editar SIEMPRE, incluso conciliado.
      if (esConciliado && puedeEditarConciliado(AppState.rol)) {
        botones += `<button class="btn btn-ghost btn-sm" onclick="abrirEditar('${docSnap.id}')">✏️ Editar (Master)</button>`;
      }
      if (!esConciliado && puedeConciliar(AppState.rol)) {
        botones += `<button class="btn btn-ghost btn-sm" style="color:var(--blue); border:1px solid var(--blue);" onclick="conciliarRegistro('${docSnap.id}')">🔒 Conciliar</button>`;
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