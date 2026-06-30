// =============================================
// js/auth.js — Login, sesión y whitelist de roles
// =============================================

import { AppState } from "./state.js";
import { actualizarBannerConexion, sincronizarCola } from "./offline.js";
import { showScreen } from "./nav.js";

export function initAuth() {
  window.fbAuthChanged(window.firebaseAuth, async (user) => {
    if (user) {
      const authData = await checkWhitelist(user.email);
      if (!authData.allowed) {
        showLoginError("Usuario no autorizado o inactivo.");
        await window.fbSignOut(window.firebaseAuth);
        return;
      }
      AppState.currentUser = user;

      // Mostrar solo el alias en la barra superior
      let displayUser = user.email;
      if(displayUser.endsWith("@grupoindi.com")) {
        displayUser = displayUser.replace("@grupoindi.com", "");
      }
      document.getElementById("header-user").textContent = displayUser;

      AppState.isAdmin = (authData.rol === 'admin' || authData.rol === 'master');
      AppState.isMaster = (authData.rol === 'master');
      if (AppState.isAdmin) document.getElementById("tab-pendientes").classList.remove("hidden");
      if (AppState.isMaster) document.getElementById("tab-usuarios").classList.remove("hidden");

      showScreen("app");
      // Intentar sincronizar registros offline que quedaron pendientes
      actualizarBannerConexion();
      setTimeout(sincronizarCola, 1500); // pequeño delay para que Firebase esté listo
    } else {
      AppState.currentUser = null; showScreen("login");
    }
  });
}

export async function checkWhitelist(email) {
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

export async function handleLogin() {
  // Ahora capturamos el alias (ej. operador1)
  const username = document.getElementById("login-username").value.trim().toLowerCase();
  const pw = document.getElementById("login-password").value;

  if(!username || !pw) return showLoginError("Ingresa usuario y contraseña.");

  // Le agregamos el dominio ficticio por detrás
  const fakeEmail = `${username}@grupoindi.com`;

  try { await window.fbSignIn(window.firebaseAuth, fakeEmail, pw); }
  catch(e) { showLoginError("Usuario o contraseña incorrectos."); }
}

export async function handleLogout() { await window.fbSignOut(window.firebaseAuth); location.reload(); }
export function showLoginError(msg) { document.getElementById("login-error").textContent = msg; document.getElementById("login-error").classList.remove("hidden"); }
export function togglePassword() { const p = document.getElementById("login-password"); p.type = p.type==="password"?"text":"password"; }