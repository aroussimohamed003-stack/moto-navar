import { signInWithEmail } from "./auth-service.js";
import { initAuthPage, handleSuccess, handleAuthError } from "./auth-pages.js";
import {
  initPasswordToggles, setLoading, setBusy, showFieldError, clearFieldErrors,
  showFormAlert, isValidEmail,
} from "./ui.js";

initPasswordToggles();
initAuthPage();

const form = document.getElementById("login-form");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFieldErrors(form);
  showFormAlert(document.getElementById("form-alert"), "");

  const email = form.email.value.trim();
  const password = form.password.value;
  let ok = true;
  if (!isValidEmail(email)) { showFieldError(form.email, "Enter a valid email address."); ok = false; }
  if (!password) { showFieldError(form.password, "Enter your password."); ok = false; }
  if (!ok) return;

  const btn = form.querySelector("button[type=submit]");
  setBusy(true);
  setLoading(btn, true);
  try {
    const result = await signInWithEmail(email, password, { remember: form.remember.checked });
    await handleSuccess(result);
  } catch (err) {
    handleAuthError(err);
  } finally {
    setLoading(btn, false);
    setBusy(false);
  }
});
