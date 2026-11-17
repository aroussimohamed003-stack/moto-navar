import { registerWithEmail } from "./auth-service.js";
import { initAuthPage, handleAuthError } from "./auth-pages.js";
import {
  initPasswordToggles, setLoading, setBusy, showFieldError, clearFieldErrors,
  showFormAlert, isValidEmail, toast, safeNextUrl,
} from "./ui.js";
import { siteSettings } from "./firebase.js";

initPasswordToggles();
initAuthPage();

const form = document.getElementById("register-form");
const meter = document.getElementById("strength");

function strength(pw) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

form.password.addEventListener("input", () => {
  const s = form.password.value ? Math.max(1, strength(form.password.value)) : 0;
  meter.dataset.level = s;
  meter.querySelector("span").textContent = ["", "Weak", "Fair", "Good", "Strong"][s];
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFieldErrors(form);
  showFormAlert(document.getElementById("form-alert"), "");

  const data = {
    fullName: form.fullName.value.trim(),
    email: form.email.value.trim(),
    phone: form.phone.value.trim(),
    password: form.password.value,
  };
  let ok = true;
  if (data.fullName.length < 2) { showFieldError(form.fullName, "Enter your full name."); ok = false; }
  if (!isValidEmail(data.email)) { showFieldError(form.email, "Enter a valid email address."); ok = false; }
  if (data.phone && !/^\+?[\d\s().-]{6,20}$/.test(data.phone)) { showFieldError(form.phone, "Enter a valid phone number."); ok = false; }
  if (data.password.length < 8 || !/[A-Za-z]/.test(data.password) || !/\d/.test(data.password)) {
    showFieldError(form.password, "Use at least 8 characters, including letters and numbers."); ok = false;
  }
  if (form.confirm.value !== data.password) { showFieldError(form.confirm, "Passwords do not match."); ok = false; }
  if (!form.terms.checked) { showFieldError(form.terms, "Please accept the terms to continue."); ok = false; }
  if (!ok) return;

  const btn = form.querySelector("button[type=submit]");
  setBusy(true);
  setLoading(btn, true);
  try {
    await registerWithEmail(data);
    toast("Account created! Welcome to MOTO NAVAR.", "success", 4000);
    setTimeout(() => location.replace(safeNextUrl(siteSettings.afterLoginUrl)), 900);
  } catch (err) {
    handleAuthError(err);
  } finally {
    setLoading(btn, false);
    setBusy(false);
  }
});
