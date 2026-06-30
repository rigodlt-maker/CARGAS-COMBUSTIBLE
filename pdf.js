// =============================================
// js/pdf.js — Generación y descarga de PDF de evidencia
// =============================================

import { getRegistroCache } from "./state.js";

export function showLoading(msg="Procesando...") { document.getElementById("loading-text").textContent = msg; document.getElementById("loading-overlay").classList.remove("hidden"); }
export function hideLoading() { document.getElementById("loading-overlay").classList.add("hidden"); }

/* --- GENERAR PDF MAESTRO CON 3 FOTOS Y RENDIMIENTO --- */
export async function generateTicketPDF(record) {
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
  const yInicio = headerH + 0.35;
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

// --- FUNCIÓN PARA RE-GENERAR Y DESCARGAR PDF DESDE LA SESIÓN MASTER ---
export async function forceDownloadPDF(record) {
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
export function descargarPDFDesdeCache(id) {
  const d = getRegistroCache(id);
  if (!d) { alert("❌ No se encontró el registro en caché. Recarga la lista e intenta de nuevo."); return; }
  forceDownloadPDF(d);
}