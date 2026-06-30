// =============================================
// js/nav.js — Pantallas, pestañas y navegación "atrás" del sistema
// =============================================

import { AppState } from "./state.js";
import { loadHistory, loadPendientes, cerrarModalPendiente, cerrarModalEditar } from "./historial.js";
import { loadUsuarios, cerrarModalUsuario } from "./usuarios.js";
import { goStep } from "./cargas.js";

export function showScreen(name) {
  document.querySelectorAll(".screen").forEach(s => {
    s.classList.toggle("active", s.id === `screen-${name}`);
    s.classList.toggle("hidden", s.id !== `screen-${name}`);
  });
}

export function switchTab(name, desdePopstate = false) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.id === `tab-${name}`));
  document.querySelectorAll(".tab-content").forEach(c => c.classList.toggle("active", c.id === `content-${name}`));
  if (name === "historial") loadHistory();
  if (name === "pendientes" && AppState.isAdmin) loadPendientes();
  if (name === "usuarios" && AppState.isMaster) loadUsuarios();
  // Solo empujamos historial si NO venimos de Registro→Registro (evita
  // entradas duplicadas) y si el cambio fue un click real, no un popstate.
  if (!desdePopstate && name !== "registro") navPush(`tab-${name}`);
}

/* ─────────────────────────────────────────────────────────────────
   NAVEGACIÓN "ATRÁS" DEL SISTEMA (gesto / botón físico del celular)
   ─────────────────────────────────────────────────────────────────
   Por defecto, una PWA de una sola página no tiene "páginas" que el
   navegador pueda recorrer: el botón/gesto "atrás" del teléfono no
   encuentra historial y termina cerrando la app completa.

   Para evitarlo, cada vez que el usuario entra a un "nivel" navegable
   (un paso del formulario, un modal abierto) empujamos una entrada al
   historial del navegador con history.pushState(). Así, el botón
   "atrás" del sistema dispara un evento popstate que interceptamos
   aquí para cerrar/retroceder SOLO ese nivel, sin salir de la app.
   Si no hay ningún nivel especial abierto, dejamos que el navegador
   haga lo que corresponda (normalmente, salir de la app/pestaña).
───────────────────────────────────────────────────────────────── */
export function navPush(nivel) {
  history.pushState({ fuelControlNivel: nivel }, "");
}

window.addEventListener("popstate", (e) => {
  // ¿Hay un modal abierto? Ciérralo y no hagas nada más.
  const modalesAbiertos = ["modal-pendiente", "modal-editar", "modal-usuario"]
    .filter(id => !document.getElementById(id)?.classList.contains("hidden"));

  if (modalesAbiertos.length > 0) {
    modalesAbiertos.forEach(id => {
      if (id === "modal-pendiente") cerrarModalPendiente(true);
      if (id === "modal-editar") cerrarModalEditar(true);
      if (id === "modal-usuario") cerrarModalUsuario(true);
    });
    return;
  }

  // ¿Estamos en el formulario de Registro y no es el paso 1? Retrocede un paso.
  const enRegistro = document.getElementById("content-registro")?.classList.contains("active");
  if (enRegistro && AppState.currentStep > 1) {
    goStep(AppState.currentStep - 1, /*desdePopstate*/ true);
    return;
  }

  // ¿Estamos en otra pestaña que no sea Registro? Vuelve a Registro.
  const tabActiva = document.querySelector(".tab-btn.active")?.id;
  if (tabActiva && tabActiva !== "tab-registro") {
    switchTab("registro", true);
    return;
  }

  // En cualquier otro caso (ya estamos en Registro paso 1, o en login),
  // no interceptamos: dejamos que el sistema haga lo que corresponda
  // (normalmente, minimizar/cerrar la app), que es el comportamiento
  // esperado cuando ya no queda "a dónde regresar" dentro de la app.
});