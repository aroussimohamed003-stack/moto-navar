import { isFirebaseConfigured } from "./firebase.js";
import { requestPasswordReset } from "./auth-service.js";
import {
  setLoading, showFieldError, clearFieldErrors, showFormAlert, isValidEmail,
  authErrorMessage, showConfigWarning, toast,
} from "./ui.js";

if (!isFirebaseConfigured) showConfigWarning();

const form = document.getElementById("forgot-form");
const alertEl = document.getElementById("form-alert");
const params = new URLSearchParams(location.search);
if (params.get("email")) form.email.value = params.get("email");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFieldErrors(form);
  showFormAlert(alertEl, "");
  const email = form.email.value.trim();
  if (!isValidEmail(email)) { showFieldError(form.email, "Enter a valid email address."); return; }

  const btn = form.querySelector("button[type=submit]");
  setLoading(btn, true);
  try {
    await requestPasswordReset(email);
    done(email);
  } catch (err) {
    // Don't reveal whether an account exists for this email.
    if (err.code === "auth/user-not-found") { done(email); return; }
    showFormAlert(alertEl, authErrorMessage(err));
    toast(authErrorMessage(err), "error");
  } finally {
    setLoading(btn, false);
  }
});

function done(email) {
  form.hidden = true;
  const ok = document.getElementById("reset-sent");
  ok.hidden = false;
  ok.querySelector("b").textContent = email;
}
