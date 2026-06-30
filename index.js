// functions/index.js — Firebase Cloud Functions (FuelControl)
// Deploy: cd functions && npm install firebase-admin firebase-functions && cd .. && firebase deploy --only functions

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { initializeApp }      = require("firebase-admin/app");
const { getAuth }            = require("firebase-admin/auth");
const { getFirestore }       = require("firebase-admin/firestore");

initializeApp();

/* =============================================================
   resetUserPassword (punto 1 — "cambiar contraseñas de forma
   rápida" del rol Master).
   -------------------------------------------------------------
   El SDK de cliente de Firebase Auth NO permite cambiarle la
   contraseña a OTRO usuario sin cerrar la sesión de quien hace el
   cambio, por eso esto tiene que vivir en una Cloud Function con
   el Admin SDK (que sí puede tocar cualquier cuenta).

   NOTA IMPORTANTE: esta función YA SE LLAMABA desde app.js
   (window.fbResetUserPassword) pero nunca había sido implementada
   aquí — el botón de "resetear contraseña" del Master estaba roto
   en producción. Se agrega ahora.
============================================================= */
exports.resetUserPassword = onCall(async (request) => {
  if (!request.auth || !request.auth.token?.email) {
    throw new HttpsError("unauthenticated", "Debes iniciar sesión.");
  }

  const callerEmail = request.auth.token.email.toLowerCase();
  const db = getFirestore();

  // Verificación de permiso EN EL SERVIDOR (nunca confiar solo en lo que
  // valida la app en el navegador): solo un Master activo puede resetear
  // contraseñas de otros usuarios.
  const callerSnap = await db.collection("whitelist").doc(callerEmail).get();
  const callerData = callerSnap.exists ? callerSnap.data() : null;
  if (!callerData || callerData.rol !== "master" || callerData.activo !== true) {
    throw new HttpsError("permission-denied", "Solo un usuario con rol Master activo puede resetear contraseñas.");
  }

  const { email, newPassword } = request.data || {};
  if (!email || typeof email !== "string") {
    throw new HttpsError("invalid-argument", "Falta el correo del usuario al que se le va a resetear la contraseña.");
  }
  if (!newPassword || typeof newPassword !== "string" || newPassword.length < 6) {
    throw new HttpsError("invalid-argument", "La nueva contraseña debe tener al menos 6 caracteres.");
  }

  try {
    const userRecord = await getAuth().getUserByEmail(email.toLowerCase());
    await getAuth().updateUser(userRecord.uid, { password: newPassword });
    return { ok: true };
  } catch (e) {
    throw new HttpsError("internal", "No se pudo resetear la contraseña: " + e.message);
  }
});

/* =============================================================
   Sobre la consolidación de PDFs (decisión confirmada: NO se hace)
   -------------------------------------------------------------
   Antes existía aquí una función "consolidarPDFsECO" que intentaba
   fusionar en un solo PDF todos los tickets de un mismo # ECO + día.
   Se decidió NO consolidar — cada carga sigue generando y
   descargando su propio PDF por separado (igual que ya hace app.js
   con jsPDF en el navegador). Esa función, además, nunca llegó a
   funcionar de verdad: buscaba un campo "pdfPath" que app.js nunca
   llenó, así que se disparaba en cada carga sin encontrar nada que
   consolidar — puro gasto de invocaciones de balde.

   Si ya la tienes desplegada en Firebase, el próximo
   "firebase deploy --only functions" la borra solo (Firebase
   elimina del proyecto las funciones que ya no existen en el
   código). También se puede borrar a mano con:
     firebase functions:delete consolidarPDFsECO
============================================================= */
