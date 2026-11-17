/** MOTO NAVAR – shared UI helpers (toasts, loading states, errors). */
import { providerLabel } from "./auth-service.js";

/* ---------------- Toast notifications ---------------- */

function toastHost() {
  let host = document.querySelector(".toast-host");
  if (!host) {
    host = document.createElement("div");
    host.className = "toast-host";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.appendChild(host);
  }
  return host;
}

export function toast(message, type = "info", timeout = 5000) {
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  const icon = { success: "✓", error: "!", info: "i", warning: "!" }[type] || "i";
  el.innerHTML = `<span class="toast__icon" aria-hidden="true">${icon}</span><span class="toast__msg"></span><button class="toast__close" aria-label="Dismiss">×</button>`;
  el.querySelector(".toast__msg").textContent = message;
  el.querySelector(".toast__close").onclick = () => dismiss();
  toastHost().appendChild(el);
  requestAnimationFrame(() => el.classList.add("is-visible"));
  const t = setTimeout(dismiss, timeout);
  function dismiss() {
    clearTimeout(t);
    el.classList.remove("is-visible");
    setTimeout(() => el.remove(), 250);
  }
}

/* ---------------- Loading states ---------------- */

export function setLoading(button, loading) {
  if (!button) return;
  button.classList.toggle("is-loading", loading);
  button.disabled = loading;
  button.setAttribute("aria-busy", String(loading));
}

/** Disable every auth action on the page while one is running. */
export function setBusy(busy) {
  document.querySelectorAll("[data-auth-action]").forEach((b) => (b.disabled = busy));
  document.body.classList.toggle("is-busy", busy);
}

/* ---------------- Form helpers ---------------- */

export function initPasswordToggles(root = document) {
  root.querySelectorAll("[data-toggle-password]").forEach((btn) => {
    const input = document.getElementById(btn.dataset.togglePassword);
    btn.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", String(show));
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      btn.classList.toggle("is-shown", show);
    });
  });
}

export function showFieldError(input, message) {
  const field = input.closest(".field");
  field?.classList.toggle("has-error", !!message);
  const slot = field?.querySelector(".field__error");
  if (slot) slot.textContent = message || "";
  input.setAttribute("aria-invalid", message ? "true" : "false");
}

export function clearFieldErrors(form) {
  form.querySelectorAll("input").forEach((i) => showFieldError(i, ""));
}

export function showFormAlert(el, message, type = "error") {
  if (!el) return;
  el.hidden = !message;
  el.className = `form-alert form-alert--${type}`;
  el.textContent = message || "";
}

export const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

/* ---------------- Errors ---------------- */

const CANCELLED = ["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled", "auth/redirect-cancelled-by-user"];
export const isCancelled = (err) => CANCELLED.includes(err?.code);

export function authErrorMessage(err) {
  const code = err?.code || "";
  const provider = err?.providerId ? providerLabel(err.providerId) : "this provider";
  const map = {
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/invalid-login-credentials": "Incorrect email or password.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/user-not-found": "Incorrect email or password.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/missing-password": "Please enter your password.",
    "auth/user-disabled": "This account has been disabled. Please contact MOTO NAVAR support.",
    "auth/too-many-requests": "Too many attempts. Please wait a few minutes and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again.",
    "auth/email-already-in-use": "An account already exists with this email. Sign in instead (with the method you used before), or reset your password.",
    "auth/weak-password": "Your password is too weak. Use at least 8 characters with letters and numbers.",
    "auth/password-does-not-meet-requirements": "Your password does not meet the security requirements.",
    "auth/account-exists-with-different-credential": `You already have a MOTO NAVAR account with this email. Sign in with the method you used before and we'll connect ${provider} to it.`,
    "auth/credential-already-in-use": `This ${provider} account is already connected to another MOTO NAVAR account.`,
    "auth/provider-already-linked": `${provider} is already connected to your account.`,
    "auth/email-already-exists": "An account already exists with this email.",
    "auth/requires-recent-login": "For your security, please confirm your identity and try again.",
    "auth/operation-not-allowed": `${provider} sign-in is not enabled yet. Enable it in Firebase Console → Authentication → Sign-in method.`,
    "auth/unauthorized-domain": "This website's domain is not authorized for sign-in. Add it in Firebase Console → Authentication → Settings → Authorized domains.",
    "auth/invalid-api-key": "Firebase is not configured. Add your project keys to assets/js/firebase-config.js.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "Firebase is not configured. Add your project keys to assets/js/firebase-config.js.",
    "auth/configuration-not-found": "Firebase Authentication is not set up for this project yet.",
    "auth/invalid-oauth-client-id": `${provider} is misconfigured in Firebase (check the client ID).`,
    "auth/invalid-oauth-provider": `${provider} is misconfigured in Firebase.`,
    "auth/web-storage-unsupported": "Your browser blocks storage needed to sign in. Enable cookies/storage or use another browser.",
    "auth/internal-error": "Sign-in failed because of a configuration problem. Please try again later.",
    "auth/expired-action-code": "This link has expired. Please request a new one.",
    "auth/invalid-action-code": "This link is invalid or was already used.",
    "auth/no-current-user": "Please sign in first.",
    "permission-denied": "You don't have permission to do that.",
    "unavailable": "Service temporarily unavailable. Please try again.",
  };
  if (isCancelled(err)) return "Sign-in was cancelled.";
  return map[code] || err?.message?.replace(/^Firebase:\s*/, "").replace(/\s*\(.*\)\.?$/, "") || "Something went wrong. Please try again.";
}

/* ---------------- Navigation ---------------- */

/** Only allow same-site relative paths as ?next= (prevents open redirects). */
export function safeNextUrl(fallback) {
  const next = new URLSearchParams(location.search).get("next");
  if (!next) return fallback;
  try {
    const url = new URL(next, location.href);
    if (url.origin !== location.origin) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}

/** Banner shown when firebase-config.js still has placeholder values. */
export function showConfigWarning() {
  const bar = document.createElement("div");
  bar.className = "config-warning";
  bar.innerHTML = "<strong>Firebase is not configured.</strong> Add your project keys to <code>assets/js/firebase-config.js</code> — see AUTH-SETUP-GUIDE.md. Sign-in will not work until then.";
  document.body.prepend(bar);
}

/* ---------------- Provider logos (official brand marks) ---------------- */

export const ICONS = {
  "google.com": `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>`,
  "facebook.com": `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="20" fill="#1877F2"/><path fill="#fff" d="M26.7 44V29.6h4.8l.7-5.6h-5.5v-3.5c0-1.6.5-2.7 2.8-2.7h2.9v-5c-.5-.1-2.2-.2-4.2-.2-4.2 0-7 2.5-7 7.2V24h-4.7v5.6h4.7V44h5.5z"/></svg>`,
  "microsoft.com": `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#F25022" d="M6 6h17v17H6z"/><path fill="#7FBA00" d="M25 6h17v17H25z"/><path fill="#00A4EF" d="M6 25h17v17H6z"/><path fill="#FFB900" d="M25 25h17v17H25z"/></svg>`,
  "apple.com": `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M33.9 25.4c0-3.9 3.2-5.7 3.3-5.8-1.8-2.6-4.6-3-5.6-3-2.4-.2-4.6 1.4-5.8 1.4-1.2 0-3-1.4-5-1.3-2.6 0-5 1.5-6.3 3.8-2.7 4.7-.7 11.6 1.9 15.4 1.3 1.9 2.8 3.9 4.8 3.9 1.9-.1 2.7-1.2 5-1.2s3 1.2 5 1.2c2.1 0 3.4-1.9 4.6-3.8 1.5-2.1 2.1-4.2 2.1-4.3 0 0-4-1.6-4-6.3zM30.1 13.9c1-1.3 1.8-3.1 1.6-4.9-1.5.1-3.4 1-4.5 2.3-1 1.1-1.8 2.9-1.6 4.7 1.7.1 3.4-.9 4.5-2.1z"/></svg>`,
  password: `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" d="M3 6h18v12H3z M3 7l9 6 9-6"/></svg>`,
};
