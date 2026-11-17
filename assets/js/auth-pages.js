/** MOTO NAVAR – shared logic for login.html and register.html. */
import { auth, isFirebaseConfigured, siteSettings } from "./firebase.js";
import {
  signInWithProvider, completeRedirectSignIn, getPendingLink, clearPendingLink,
  linkProvider, providerLabel, getRememberPreference,
} from "./auth-service.js";
import {
  toast, setLoading, setBusy, showFormAlert, authErrorMessage, isCancelled,
  safeNextUrl, showConfigWarning, ICONS,
} from "./ui.js";

const SOCIAL = ["google.com", "facebook.com", "microsoft.com", "apple.com"];
const alertEl = () => document.getElementById("form-alert");
const nextUrl = () => safeNextUrl(siteSettings.afterLoginUrl);

export function goNext() {
  location.replace(nextUrl());
}

/* ---------------- Social buttons ---------------- */

export function renderSocialButtons(container) {
  container.innerHTML = SOCIAL.map((id) => `
    <button type="button" class="social-btn social-btn--${id.split(".")[0]}" data-provider="${id}" data-auth-action>
      <span class="social-btn__icon">${ICONS[id]}</span>
      <span class="social-btn__label">Continue with ${providerLabel(id)}</span>
      <span class="spinner" aria-hidden="true"></span>
    </button>`).join("");

  container.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-provider]");
    if (!btn || btn.disabled) return;
    const providerId = btn.dataset.provider;
    const remember = document.getElementById("remember")?.checked ?? true;
    showFormAlert(alertEl(), "");
    setBusy(true);
    setLoading(btn, true);
    try {
      const result = await signInWithProvider(providerId, { remember });
      if (result.redirecting) return; // page is navigating away
      await handleSuccess(result);
    } catch (err) {
      handleAuthError(err);
    } finally {
      setLoading(btn, false);
      setBusy(false);
    }
  });
}

/* ---------------- Success / errors ---------------- */

export async function handleSuccess(result) {
  if (result.linked) {
    toast(`${providerLabel(result.linked)} is now connected to your account.`, "success");
  }
  if (result.linkNeeded) {
    openLinkDialog(result.linkNeeded);
    return;
  }
  toast("Welcome to MOTO NAVAR!", "success", 1500);
  setTimeout(goNext, 400);
}

export function handleAuthError(err) {
  if (isCancelled(err)) {
    toast("Sign-in was cancelled.", "info", 3000);
    return;
  }
  const msg = authErrorMessage(err);
  showFormAlert(alertEl(), msg, err.code === "auth/account-exists-with-different-credential" ? "info" : "error");
  if (err.code === "auth/account-exists-with-different-credential") {
    renderPendingLinkNotice();
    const email = document.getElementById("email");
    if (email && err.pendingLink?.email) email.value = err.pendingLink.email;
  } else {
    toast(msg, "error");
  }
  console.warn("[MOTO NAVAR auth]", err.code, err.message);
}

/* ---------------- Account linking UI ---------------- */

export function renderPendingLinkNotice() {
  const pending = getPendingLink();
  const box = document.getElementById("link-notice");
  if (!box) return;
  if (!pending) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `
    <div class="link-notice__icon">${ICONS[pending.providerId] || ""}</div>
    <div>
      <strong>Connect ${providerLabel(pending.providerId)} to your account</strong>
      <p>${pending.email ? `<b></b> already has a MOTO NAVAR account. ` : ""}Sign in below with the method you used before — we'll link ${providerLabel(pending.providerId)} automatically.</p>
      <button type="button" class="link-btn" id="cancel-link">Cancel linking</button>
    </div>`;
  if (pending.email) box.querySelector("p b").textContent = pending.email;
  box.querySelector("#cancel-link").onclick = () => {
    clearPendingLink();
    box.hidden = true;
    showFormAlert(alertEl(), "");
  };
}

function openLinkDialog(providerId) {
  const dlg = document.getElementById("link-dialog");
  dlg.querySelectorAll("[data-link-provider-name]").forEach((el) => (el.textContent = providerLabel(providerId)));
  dlg.querySelector("[data-link-icon]").innerHTML = ICONS[providerId] || "";
  const confirm = dlg.querySelector("#link-confirm");
  const skip = dlg.querySelector("#link-skip");
  confirm.onclick = async () => {
    setLoading(confirm, true);
    try {
      await linkProvider(providerId);
      toast(`${providerLabel(providerId)} is now connected.`, "success");
      dlg.close();
      goNext();
    } catch (err) {
      if (!isCancelled(err)) toast(authErrorMessage({ ...err, providerId }), "error");
    } finally {
      setLoading(confirm, false);
    }
  };
  skip.onclick = () => { clearPendingLink(); dlg.close(); goNext(); };
  dlg.showModal();
}

/* ---------------- Page bootstrap ---------------- */

export async function initAuthPage() {
  if (!isFirebaseConfigured) showConfigWarning();

  const remember = document.getElementById("remember");
  if (remember) remember.checked = getRememberPreference();

  renderSocialButtons(document.getElementById("social-buttons"));
  renderPendingLinkNotice();

  // 1. Finish a redirect-based social sign-in, if we are coming back from one.
  try {
    const result = await completeRedirectSignIn();
    if (result) { await handleSuccess(result); return; }
  } catch (err) {
    handleAuthError(err);
  }

  // 2. Already signed in? Skip the login page.
  await auth.authStateReady();
  if (auth.currentUser && !getPendingLink()) goNext();
}
