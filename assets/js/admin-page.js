/**
 * MOTO NAVAR – Admin: registered accounts (admin.html).
 * Lists every customer account with its email, and deletes accounts.
 *
 * Who can use it: only users with the custom claim admin: true
 * (granted with admin-tools/set-admin.js). Everyone else sees "Access denied",
 * and Firestore rules + the Cloud Function refuse their requests on the server.
 */
import {
  auth, db, functions, httpsCallable, isFirebaseConfigured, siteSettings,
  collection, getDocs,
} from "./firebase.js";
import { requireAuth } from "./auth-guard.js";
import { providerLabel, logout } from "./auth-service.js";
import { toast, setLoading, authErrorMessage, showConfigWarning, ICONS } from "./ui.js";
import { initProducts } from "./admin-products.js";
import { initOrders } from "./admin-orders.js";
import { initSettings } from "./admin-settings.js";
import { isCurrentUserAdmin } from "./store-settings.js";

if (!isFirebaseConfigured) showConfigWarning();

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const toDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);
const fmt = (v) => {
  const d = toDate(v);
  return d && !isNaN(d) ? d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";
};

const listAuthUsers = httpsCallable(functions, "adminListAuthUsers");
const deleteUserFn = httpsCallable(functions, "adminDeleteUser");

let me;
let accounts = [];
let source = "auth"; // "auth" (Cloud Function) or "firestore" (fallback)

/* ---------------- Data ---------------- */

async function loadAccounts() {
  $("#tbody").innerHTML = `<tr><td colspan="6" class="muted center">Loading accounts…</td></tr>`;
  // Firestore profiles (always available to admins via Security Rules)
  const profiles = new Map();
  const snap = await getDocs(collection(db, "users"));
  snap.forEach((d) => profiles.set(d.id, d.data()));

  try {
    // Full list from Firebase Authentication (needs the Cloud Function)
    const { data } = await listAuthUsers();
    source = "auth";
    accounts = data.users.map((u) => {
      const p = profiles.get(u.uid) || {};
      return {
        uid: u.uid,
        fullName: p.fullName || u.displayName || "",
        email: u.email || p.email || "",
        phone: p.phone || u.phone || "",
        photoURL: p.photoURL || u.photoURL || "",
        providers: u.providers.length ? u.providers : p.providers || [],
        role: u.admin ? "admin" : p.role || "customer",
        emailVerified: u.emailVerified,
        disabled: u.disabled,
        hasProfile: profiles.has(u.uid),
        createdAt: u.createdAt || p.createdAt,
        lastLogin: u.lastLogin || p.lastLogin,
      };
    });
  } catch (err) {
    // Functions not deployed yet → show Firestore profiles only.
    source = "firestore";
    console.warn("[admin] adminListAuthUsers unavailable, using Firestore profiles:", err.code, err.message);
    accounts = [...profiles.entries()].map(([uid, p]) => ({
      uid, fullName: p.fullName || "", email: p.email || "", phone: p.phone || "", photoURL: p.photoURL || "",
      providers: p.providers || [p.provider].filter(Boolean), role: p.role || "customer",
      emailVerified: null, disabled: false, hasProfile: true, createdAt: p.createdAt, lastLogin: p.lastLogin,
    }));
  }
  accounts.sort((a, b) => (toDate(b.createdAt) || 0) - (toDate(a.createdAt) || 0));
  $("#source-note").hidden = source === "auth";
  renderStats();
  renderTable();
}

/* ---------------- Rendering ---------------- */

function renderStats() {
  const weekAgo = Date.now() - 7 * 864e5;
  const count = (fn) => accounts.filter(fn).length;
  $("#stat-total").textContent = accounts.length;
  $("#stat-new").textContent = count((a) => (toDate(a.createdAt) || 0) > weekAgo);
  $("#stat-verified").textContent = source === "auth" ? count((a) => a.emailVerified) : "—";
  $("#stat-social").textContent = count((a) => a.providers.some((p) => p !== "password"));
}

function filtered() {
  const q = $("#search").value.trim().toLowerCase();
  const prov = $("#filter-provider").value;
  return accounts.filter((a) =>
    (!q || [a.email, a.fullName, a.phone, a.uid].some((v) => String(v).toLowerCase().includes(q))) &&
    (!prov || a.providers.includes(prov))
  );
}

function renderTable() {
  const rows = filtered();
  $("#result-count").textContent = `${rows.length} of ${accounts.length} accounts`;
  if (!rows.length) {
    $("#tbody").innerHTML = `<tr><td colspan="6" class="muted center">No accounts found.</td></tr>`;
    return;
  }
  $("#tbody").innerHTML = rows.map((a) => {
    const initial = esc((a.fullName || a.email || "?").trim().charAt(0).toUpperCase());
    const isMe = a.uid === me.uid;
    return `
    <tr>
      <td>
        <div class="u-cell">
          ${a.photoURL ? `<img class="avatar avatar--sm" src="${esc(a.photoURL)}" alt="" referrerpolicy="no-referrer">` : `<span class="avatar avatar--sm avatar--initials">${initial}</span>`}
          <div>
            <strong>${esc(a.fullName || "—")}${isMe ? ` <span class="pill pill--info">You</span>` : ""}</strong>
            <span class="u-email">${a.email ? `<a href="mailto:${esc(a.email)}">${esc(a.email)}</a>` : `<span class="muted">no email</span>`}
              ${a.emailVerified === true ? `<span class="pill pill--ok">verified</span>` : a.emailVerified === false ? `<span class="pill pill--warn">unverified</span>` : ""}</span>
            ${a.phone ? `<span class="muted small">${esc(a.phone)}</span>` : ""}
          </div>
        </div>
      </td>
      <td><div class="prov-icons">${a.providers.map((p) => `<span title="${esc(providerLabel(p))}">${ICONS[p] || esc(p)}</span>`).join("")}</div></td>
      <td>${a.role === "admin" ? `<span class="pill pill--danger">Admin</span>` : `<span class="pill pill--info">Customer</span>`}${a.disabled ? ` <span class="pill pill--warn">disabled</span>` : ""}${!a.hasProfile ? ` <span class="pill pill--warn">no profile</span>` : ""}</td>
      <td class="nowrap">${fmt(a.createdAt)}</td>
      <td class="nowrap">${fmt(a.lastLogin)}</td>
      <td class="actions">
        ${a.email ? `<button class="icon-btn" data-copy="${esc(a.email)}" title="Copy email" aria-label="Copy email"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg></button>` : ""}
        ${isMe || a.role === "admin" ? "" : `<button class="btn btn--sm btn--danger" data-delete="${esc(a.uid)}">Delete</button>`}
      </td>
    </tr>`;
  }).join("");
}

/* ---------------- Actions ---------------- */

$("#search").addEventListener("input", renderTable);
$("#filter-provider").addEventListener("change", renderTable);
$("#refresh").addEventListener("click", () => loadAccounts().catch((e) => toast(authErrorMessage(e), "error")));

$("#tbody").addEventListener("click", async (e) => {
  const copy = e.target.closest("[data-copy]")?.dataset.copy;
  if (copy) {
    try { await navigator.clipboard.writeText(copy); toast("Email copied.", "success", 2000); }
    catch { toast(copy, "info"); }
  }
  const uid = e.target.closest("[data-delete]")?.dataset.delete;
  if (uid) openDeleteDialog(accounts.find((a) => a.uid === uid));
});

$("#copy-emails").addEventListener("click", async () => {
  const emails = filtered().map((a) => a.email).filter(Boolean).join(", ");
  try { await navigator.clipboard.writeText(emails); toast(`${emails ? emails.split(", ").length : 0} emails copied.`, "success"); }
  catch { toast("Could not access the clipboard.", "error"); }
});

$("#export-csv").addEventListener("click", () => {
  const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["Full name", "Email", "Phone", "Providers", "Role", "Email verified", "Created", "Last login", "UID"];
  const lines = filtered().map((a) => [a.fullName, a.email, a.phone, a.providers.join(" "), a.role,
    a.emailVerified ?? "", fmt(a.createdAt), fmt(a.lastLogin), a.uid].map(cell).join(","));
  const blob = new Blob(["﻿" + [header.map(cell).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `motonavar-accounts-${new Date().toISOString().slice(0, 10)}.csv` });
  link.click();
  URL.revokeObjectURL(link.href);
});

/* ---------------- Delete ---------------- */

const dlg = $("#delete-dialog");
const confirmInput = $("#delete-confirm-input");
const confirmBtn = $("#delete-confirm");

function openDeleteDialog(a) {
  if (!a) return;
  $("#delete-who").textContent = a.email || a.fullName || a.uid;
  confirmInput.value = "";
  confirmBtn.disabled = true;
  confirmBtn.dataset.uid = a.uid;
  dlg.showModal();
  confirmInput.focus();
}

confirmInput.addEventListener("input", () => {
  confirmBtn.disabled = confirmInput.value.trim().toUpperCase() !== "DELETE";
});
$("#delete-cancel").addEventListener("click", () => dlg.close());

confirmBtn.addEventListener("click", async () => {
  const uid = confirmBtn.dataset.uid;
  setLoading(confirmBtn, true);
  try {
    const { data } = await deleteUserFn({ uid });
    dlg.close();
    toast(`Account ${data.email || uid} deleted.${data.ordersFlagged ? ` ${data.ordersFlagged} order(s) kept for your records.` : ""}`, "success", 6000);
    accounts = accounts.filter((a) => a.uid !== uid);
    renderStats();
    renderTable();
  } catch (err) {
    const notDeployed = ["functions/not-found", "functions/internal", "functions/unavailable"].includes(err.code);
    const msg = notDeployed
      ? "Could not reach the delete function. Make sure it is deployed: firebase deploy --only functions (AUTH-SETUP-GUIDE.md, section 10)."
      : err.code?.startsWith("functions/") ? err.message : authErrorMessage(err);
    toast(msg, "error", 8000);
  } finally {
    setLoading(confirmBtn, false);
  }
});

/* ---------------- Tabs ---------------- */

const TABS = ["orders", "products", "settings", "accounts"];
function initAdminTabs() {
  const links = document.querySelectorAll("[data-admin-tab]");
  const show = (name) => {
    links.forEach((l) => l.classList.toggle("is-active", l.dataset.adminTab === name));
    TABS.forEach((t) => ($(`#tab-${t}`).hidden = t !== name));
  };
  links.forEach((l) => l.addEventListener("click", (e) => {
    e.preventDefault();
    history.replaceState(null, "", `#${l.dataset.adminTab}`);
    show(l.dataset.adminTab);
  }));
  const h = location.hash.slice(1);
  show(TABS.includes(h) ? h : "orders");
}

/* ---------------- Boot ---------------- */

me = await requireAuth();
$("#me-email").textContent = me.email || "";
$("#logout-btn").onclick = async () => { await logout(); location.replace(siteSettings.loginUrl); };

if (!(await isCurrentUserAdmin(me))) {
  $("#denied").hidden = false;
  $("#admin-app").hidden = true;
} else {
  $("#admin-app").hidden = false;
  initAdminTabs();
  initOrders();
  initProducts();
  initSettings();
  loadAccounts().catch((err) => {
    $("#tbody").innerHTML = `<tr><td colspan="6" class="muted center">Could not load accounts: ${esc(authErrorMessage(err))}</td></tr>`;
  });
}
