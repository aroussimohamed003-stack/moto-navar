/** MOTO NAVAR – customer dashboard (account.html). */
import {
  auth, isFirebaseConfigured, siteSettings, updateProfile, updatePassword,
  reauthenticateWithCredential, reauthenticateWithPopup, linkWithCredential,
  unlink,
} from "./firebase.js";
import { requireAuth, watchSignOut } from "./auth-guard.js";
import {
  PROVIDERS, providerLabel, linkProvider, logout, upsertUserProfile,
  getPendingLink, EmailAuthProvider,
} from "./auth-service.js";
import { getProduct } from "./products.js";
import { isCurrentUserAdmin } from "./store-settings.js";
import {
  getProfile, updateProfileFields, listMyOrders, listWishlist, removeFromWishlist,
  listAddresses, saveAddress, deleteAddress, setDefaultAddress,
} from "./customer-data.js";
import {
  toast, setLoading, authErrorMessage, isCancelled, initPasswordToggles,
  showFieldError, clearFieldErrors, showConfigWarning, ICONS,
} from "./ui.js";

if (!isFirebaseConfigured) showConfigWarning();

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (ts) => (ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null)?.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) || "—";
const fmtMoney = (n, cur = "TND") => {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur }).format(Number(n) || 0); }
  catch { return `${Number(n || 0).toFixed(2)} ${cur}`; }
};

let user;
let profile;

/* ================================================================== */
/* Boot                                                               */
/* ================================================================== */

/* ================================================================== */
/* Tabs                                                               */
/* ================================================================== */

function initTabs() {
  const links = document.querySelectorAll("[data-tab]");
  const show = (name) => {
    links.forEach((l) => l.classList.toggle("is-active", l.dataset.tab === name));
    document.querySelectorAll(".panel").forEach((p) => (p.hidden = p.id !== `panel-${name}`));
  };
  links.forEach((l) => l.addEventListener("click", (e) => {
    e.preventDefault();
    history.replaceState(null, "", `#${l.dataset.tab}`);
    show(l.dataset.tab);
  }));
  const initial = location.hash.slice(1);
  show([...links].some((l) => l.dataset.tab === initial) ? initial : "profile");
}

/* ================================================================== */
/* Header + profile                                                   */
/* ================================================================== */

function avatarHTML(size = "") {
  const name = profile.fullName || user.email || "?";
  const photo = profile.photoURL || user.photoURL;
  return photo
    ? `<img class="avatar ${size}" src="${esc(photo)}" alt="Profile photo" referrerpolicy="no-referrer">`
    : `<span class="avatar avatar--initials ${size}">${esc(name.trim().charAt(0).toUpperCase())}</span>`;
}

function renderHeader() {
  $("#side-avatar").innerHTML = avatarHTML();
  $("#side-name").textContent = profile.fullName || "MOTO NAVAR rider";
  $("#side-email").textContent = user.email || "";
  $("#hello-name").textContent = (profile.fullName || "rider").split(" ")[0];
}

function renderProfile() {
  $("#profile-avatar").innerHTML = avatarHTML("avatar--xl");
  const f = $("#profile-form");
  f.fullName.value = profile.fullName || "";
  f.phone.value = profile.phone || "";
  f.email.value = user.email || "";
  $("#meta-provider").innerHTML = `${ICONS[profile.provider] || ""} ${esc(providerLabel(profile.provider || "password"))}`;
  $("#meta-since").textContent = fmtDate(profile.createdAt);
  $("#meta-last").textContent = fmtDate(profile.lastLogin);
}

$("#profile-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  clearFieldErrors(f);
  const fullName = f.fullName.value.trim();
  const phone = f.phone.value.trim();
  if (fullName.length < 2) return showFieldError(f.fullName, "Enter your full name.");
  if (phone && !/^\+?[\d\s().-]{6,20}$/.test(phone)) return showFieldError(f.phone, "Enter a valid phone number.");
  const btn = f.querySelector("button[type=submit]");
  setLoading(btn, true);
  try {
    await updateProfileFields({ fullName, phone });
    await updateProfile(user, { displayName: fullName });
    Object.assign(profile, { fullName, phone });
    renderHeader();
    toast("Profile saved.", "success");
  } catch (err) {
    toast(authErrorMessage(err), "error");
  } finally {
    setLoading(btn, false);
  }
});

/* ---- Profile photo: resized in the browser, stored on the profile ---- */

$("#photo-input").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) return toast("Please choose a JPG, PNG or WebP image.", "error");
  if (file.size > 10 * 1024 * 1024) return toast("Image is too large (max 10 MB).", "error");
  try {
    const dataUrl = await resizeImage(file, 256);
    await updateProfileFields({ photoURL: dataUrl });
    profile.photoURL = dataUrl;
    renderHeader();
    renderProfile();
    toast("Profile photo updated.", "success");
  } catch (err) {
    toast(authErrorMessage(err), "error");
  }
});

$("#photo-remove").addEventListener("click", async () => {
  try {
    await updateProfileFields({ photoURL: "" });
    profile.photoURL = "";
    renderHeader();
    renderProfile();
    toast("Profile photo removed.", "success");
  } catch (err) {
    toast(authErrorMessage(err), "error");
  }
});

function resizeImage(file, size) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = size;
      const s = Math.min(img.width, img.height);
      c.getContext("2d").drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read this image.")); };
    img.src = url;
  });
}

/* ================================================================== */
/* Orders + tracking                                                  */
/* ================================================================== */

const STEPS = [
  ["pending", "Order placed"],
  ["confirmed", "Confirmed"],
  ["processing", "Preparing"],
  ["shipped", "Shipped"],
  ["out_for_delivery", "Out for delivery"],
  ["delivered", "Delivered"],
];

async function loadOrders() {
  const box = $("#orders-list");
  try {
    const orders = await listMyOrders();
    $("#count-orders").textContent = orders.length;
    if (!orders.length) {
      box.innerHTML = emptyState("No orders yet", "When you place an order, you can follow it here step by step.", "Start shopping");
      return;
    }
    box.innerHTML = orders.map(orderCard).join("");
  } catch (err) {
    box.innerHTML = `<p class="muted">Could not load orders: ${esc(authErrorMessage(err))}</p>`;
  }
}

function orderCard(o) {
  const cancelled = o.status === "cancelled";
  const idx = STEPS.findIndex(([k]) => k === o.status);
  const items = Array.isArray(o.items) ? o.items : [];
  const history = Array.isArray(o.statusHistory) ? o.statusHistory : [];
  return `
  <details class="order">
    <summary>
      <div><span class="order__no">#${esc(o.orderNumber || o.id.slice(0, 8).toUpperCase())}</span>
        <span class="muted">${fmtDate(o.createdAt)} · ${items.length} item${items.length === 1 ? "" : "s"}</span></div>
      <div class="order__right"><strong>${fmtMoney(o.total, o.currency)}</strong>
        <span class="pill pill--${cancelled ? "danger" : o.status === "delivered" ? "ok" : "info"}">${esc(cancelled ? "Cancelled" : STEPS[idx]?.[1] || o.status)}</span>
        <span class="order__toggle">Track</span></div>
    </summary>
    <div class="order__body">
      ${cancelled ? `<p class="muted">This order was cancelled.</p>` : `
      <ol class="track">${STEPS.map(([k, label], i) => `<li class="${i < idx ? "done" : i === idx ? "current" : ""}"><span></span>${label}</li>`).join("")}</ol>`}
      ${o.trackingNumber ? `<p class="tracking">Tracking number: <b>${esc(o.trackingNumber)}</b>${o.carrier ? ` · ${esc(o.carrier)}` : ""}${o.trackingUrl && /^https:\/\//.test(o.trackingUrl) ? ` · <a href="${esc(o.trackingUrl)}" target="_blank" rel="noopener">Track with carrier</a>` : ""}</p>` : ""}
      ${history.length ? `<ul class="history">${history.map((h) => `<li><b>${esc(STEPS.find(([k]) => k === h.status)?.[1] || h.status)}</b> <span class="muted">${fmtDate(h.at)}</span>${h.note ? ` — ${esc(h.note)}` : ""}</li>`).join("")}</ul>` : ""}
      <table class="items"><tbody>${items.map((it) => `<tr><td>${esc(it.name)}</td><td class="muted">× ${esc(it.qty ?? it.quantity ?? 1)}</td><td>${fmtMoney((it.price || 0) * (it.qty ?? it.quantity ?? 1), o.currency)}</td></tr>`).join("")}</tbody></table>
      <p style="margin:14px 0 0"><a class="btn btn--sm btn--ghost" href="invoice.html?id=${encodeURIComponent(o.id)}">📄 Devis / bon de commande</a></p>
      ${o.shippingAddress ? `<p class="muted small">Ship to: ${esc([o.shippingAddress.fullName, o.shippingAddress.line1, o.shippingAddress.city, o.shippingAddress.country].filter(Boolean).join(", "))}</p>` : ""}
    </div>
  </details>`;
}

function emptyState(title, text, cta) {
  return `<div class="empty"><div class="empty__mark"></div><h3>${title}</h3><p>${text}</p>${cta ? `<a class="btn btn--ghost" href="${siteSettings.homeUrl}">${cta}</a>` : ""}</div>`;
}

/* ================================================================== */
/* Wishlist                                                           */
/* ================================================================== */

async function loadWishlist() {
  const box = $("#wishlist-grid");
  try {
    const items = await listWishlist();
    await Promise.all(items.map(async (it) => {
      if (it.image) return;
      try { it.image = (await getProduct(it.productId))?.images?.[0] || ""; } catch { /* product removed */ }
    }));
    $("#count-wishlist").textContent = items.length;
    if (!items.length) {
      box.innerHTML = emptyState("Your wishlist is empty", "Tap the heart on any helmet, jacket or part to save it here.", "Browse products");
      return;
    }
    box.innerHTML = items.map((it) => `
      <article class="wish">
        <div class="wish__img">${it.image ? `<img src="${esc(it.image)}" alt="">` : ""}</div>
        <div class="wish__body">
          <h4>${esc(it.name)}</h4>
          <p class="wish__price">${fmtMoney(it.price)}</p>
          <div class="wish__actions">
            ${it.url ? `<a class="btn btn--sm" href="${esc(it.url)}">View</a>` : ""}
            <button class="btn btn--sm btn--ghost" data-remove="${esc(it.id)}">Remove</button>
          </div>
        </div>
      </article>`).join("");
  } catch (err) {
    box.innerHTML = `<p class="muted">Could not load wishlist: ${esc(authErrorMessage(err))}</p>`;
  }
}

$("#wishlist-grid").addEventListener("click", async (e) => {
  const id = e.target.closest("[data-remove]")?.dataset.remove;
  if (!id) return;
  try {
    await removeFromWishlist(id);
    toast("Removed from wishlist.", "success");
    loadWishlist();
  } catch (err) {
    toast(authErrorMessage(err), "error");
  }
});

/* ================================================================== */
/* Addresses                                                          */
/* ================================================================== */

let addresses = [];
const addrDialog = $("#address-dialog");
const addrForm = $("#address-form");

async function loadAddresses() {
  const box = $("#address-list");
  try {
    addresses = await listAddresses();
    if (!addresses.length) {
      box.innerHTML = emptyState("No saved addresses", "Save your delivery addresses for a faster checkout.");
      return;
    }
    box.innerHTML = addresses.map((a) => `
      <article class="address ${a.isDefault ? "is-default" : ""}">
        <header><strong>${esc(a.label || "Address")}</strong>${a.isDefault ? `<span class="pill pill--ok">Default</span>` : ""}</header>
        <p>${esc(a.fullName)}<br>${esc(a.line1)}${a.line2 ? `<br>${esc(a.line2)}` : ""}<br>${esc([a.postalCode, a.city].filter(Boolean).join(" "))}${a.region ? `, ${esc(a.region)}` : ""}<br>${esc(a.country)}</p>
        ${a.phone ? `<p class="muted small">${esc(a.phone)}</p>` : ""}
        <footer>
          <button class="link-btn" data-edit="${a.id}">Edit</button>
          ${a.isDefault ? "" : `<button class="link-btn" data-default="${a.id}">Set as default</button>`}
          <button class="link-btn link-btn--danger" data-delete="${a.id}">Delete</button>
        </footer>
      </article>`).join("");
  } catch (err) {
    box.innerHTML = `<p class="muted">Could not load addresses: ${esc(authErrorMessage(err))}</p>`;
  }
}

function openAddressForm(a = null) {
  addrForm.reset();
  clearFieldErrors(addrForm);
  addrForm.dataset.id = a?.id || "";
  $("#address-dialog-title").textContent = a ? "Edit address" : "New address";
  const defaults = { fullName: profile.fullName, phone: profile.phone, country: "Tunisia", isDefault: !addresses.length };
  const src = a || defaults;
  for (const el of addrForm.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") el.checked = !!src[el.name];
    else el.value = src[el.name] ?? "";
  }
  addrDialog.showModal();
}

$("#address-add").onclick = () => openAddressForm();
$("#address-cancel").onclick = () => addrDialog.close();

$("#address-list").addEventListener("click", async (e) => {
  const t = e.target;
  try {
    if (t.dataset.edit) openAddressForm(addresses.find((a) => a.id === t.dataset.edit));
    if (t.dataset.default) { await setDefaultAddress(t.dataset.default); toast("Default address updated.", "success"); loadAddresses(); }
    if (t.dataset.delete && confirm("Delete this address?")) { await deleteAddress(t.dataset.delete); toast("Address deleted.", "success"); loadAddresses(); }
  } catch (err) {
    toast(authErrorMessage(err), "error");
  }
});

addrForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearFieldErrors(addrForm);
  let ok = true;
  for (const name of ["fullName", "line1", "city", "country"]) {
    if (!addrForm[name].value.trim()) { showFieldError(addrForm[name], "Required"); ok = false; }
  }
  if (!ok) return;
  const data = Object.fromEntries([...addrForm.elements].filter((el) => el.name).map((el) => [el.name, el.type === "checkbox" ? el.checked : el.value]));
  const btn = addrForm.querySelector("button[type=submit]");
  setLoading(btn, true);
  try {
    await saveAddress(data, addrForm.dataset.id || null);
    addrDialog.close();
    toast("Address saved.", "success");
    loadAddresses();
  } catch (err) {
    toast(authErrorMessage(err), "error");
  } finally {
    setLoading(btn, false);
  }
});

/* ================================================================== */
/* Security: sign-in methods + password                               */
/* ================================================================== */

const LINKABLE = ["google.com", "facebook.com", "microsoft.com", "apple.com"];
const hasProvider = (id) => auth.currentUser.providerData.some((p) => p.providerId === id);

function renderSecurity() {
  const pending = getPendingLink();
  $("#providers-list").innerHTML = [...LINKABLE, "password"].map((id) => {
    const linked = hasProvider(id);
    const info = auth.currentUser.providerData.find((p) => p.providerId === id);
    const canUnlink = linked && auth.currentUser.providerData.length > 1;
    let action = "";
    if (id === "password") action = linked ? "" : `<span class="muted small">Add a password below</span>`;
    else if (!linked) action = `<button class="btn btn--sm" data-link="${id}">Connect</button>`;
    else if (canUnlink) action = `<button class="link-btn link-btn--danger" data-unlink="${id}">Disconnect</button>`;
    return `
      <li class="provider ${linked ? "is-linked" : ""} ${pending?.providerId === id ? "is-pending" : ""}">
        <span class="provider__icon">${ICONS[id]}</span>
        <div><strong>${providerLabel(id)}</strong><span class="muted small">${linked ? esc(info?.email || "Connected") : pending?.providerId === id ? "Waiting to be connected" : "Not connected"}</span></div>
        ${action}
      </li>`;
  }).join("");

  const hasPassword = hasProvider("password");
  $("#pw-current-field").hidden = !hasPassword;
  $("#pw-title").textContent = hasPassword ? "Change password" : "Add a password";
  $("#pw-help").textContent = hasPassword
    ? "Enter your current password, then choose a new one."
    : `You currently sign in with ${auth.currentUser.providerData.map((p) => providerLabel(p.providerId)).join(", ")}. Add a password to also sign in with ${user.email || "your email"}.`;
  $("#password-form").hidden = !user.email;
  $("#pw-unsupported").hidden = !!user.email;
}

$("#providers-list").addEventListener("click", async (e) => {
  const linkId = e.target.closest("[data-link]")?.dataset.link;
  const unlinkId = e.target.closest("[data-unlink]")?.dataset.unlink;
  try {
    if (linkId) {
      setLoading(e.target, true);
      user = await linkProvider(linkId);
      toast(`${providerLabel(linkId)} connected.`, "success");
    }
    if (unlinkId && confirm(`Disconnect ${providerLabel(unlinkId)}? You will no longer be able to sign in with it.`)) {
      await unlink(auth.currentUser, unlinkId);
      await upsertUserProfile(auth.currentUser);
      toast(`${providerLabel(unlinkId)} disconnected.`, "success");
    }
  } catch (err) {
    if (!isCancelled(err)) toast(authErrorMessage({ ...err, code: err.code, message: err.message, providerId: linkId || unlinkId }), "error");
  } finally {
    renderSecurity();
  }
});

async function reauthenticate(currentPassword) {
  const u = auth.currentUser;
  if (hasProvider("password")) {
    await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, currentPassword));
  } else {
    const social = u.providerData.find((p) => PROVIDERS[p.providerId]?.create);
    await reauthenticateWithPopup(u, PROVIDERS[social.providerId].create());
  }
}

$("#password-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  clearFieldErrors(f);
  const hasPassword = hasProvider("password");
  const current = f.currentPassword.value;
  const next = f.newPassword.value;
  if (hasPassword && !current) return showFieldError(f.currentPassword, "Enter your current password.");
  if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) return showFieldError(f.newPassword, "Use at least 8 characters, including letters and numbers.");
  if (next !== f.confirmPassword.value) return showFieldError(f.confirmPassword, "Passwords do not match.");

  const btn = f.querySelector("button[type=submit]");
  setLoading(btn, true);
  try {
    // Firebase requires a recent sign-in for sensitive changes.
    await reauthenticate(current);
    if (hasPassword) {
      await updatePassword(auth.currentUser, next);
      toast("Password changed.", "success");
    } else {
      await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(auth.currentUser.email, next));
      await upsertUserProfile(auth.currentUser);
      toast("Password added. You can now sign in with your email too.", "success");
    }
    f.reset();
    renderSecurity();
  } catch (err) {
    if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password") showFieldError(f.currentPassword, "Current password is incorrect.");
    else if (!isCancelled(err)) toast(authErrorMessage(err), "error");
  } finally {
    setLoading(btn, false);
  }
});

$("#reset-instead").addEventListener("click", (e) => {
  e.preventDefault();
  location.href = `forgot-password.html?email=${encodeURIComponent(user.email || "")}`;
});

/* ================================================================== */
/* Boot (runs after every function and constant above is defined)      */
/* ================================================================== */

user = await requireAuth();
watchSignOut();
isCurrentUserAdmin(user).then((ok) => { if (ok) $("#admin-link").hidden = false; });
initPasswordToggles();
initTabs();

try {
  profile = await getProfile();
  if (!profile) {
    await upsertUserProfile(user);
    profile = await getProfile();
  }
} catch (err) {
  toast(authErrorMessage(err), "error");
  profile = { fullName: user.displayName || "", email: user.email || "", phone: "", photoURL: user.photoURL || "" };
}

renderHeader();
renderProfile();
renderSecurity();
loadOrders();
loadWishlist();
loadAddresses();

if (getPendingLink()) {
  const p = getPendingLink();
  toast(`Finish connecting ${providerLabel(p.providerId)} in the Security tab.`, "info", 7000);
}

$("#logout-btn").onclick = async () => {
  await logout();
  location.replace(siteSettings.loginUrl);
};
