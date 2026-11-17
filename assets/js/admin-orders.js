/** MOTO NAVAR – Admin: orders (admin.html#orders). */
import {
  db, collection, getDocs, doc, getDoc, updateDoc, arrayUnion, Timestamp, writeBatch,
} from "./firebase.js";
import { formatPrice } from "./products.js";
import { toast, setLoading, authErrorMessage } from "./ui.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = (ts) => {
  const d = ts?.toDate ? ts.toDate() : ts ? new Date(ts) : null;
  return d ? d.toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
};

export const STATUSES = [
  ["pending", "Pending", "warn"],
  ["confirmed", "Confirmed", "info"],
  ["processing", "Preparing", "info"],
  ["shipped", "Shipped", "info"],
  ["out_for_delivery", "Out for delivery", "info"],
  ["delivered", "Delivered", "ok"],
  ["cancelled", "Cancelled", "danger"],
];
const label = (s) => STATUSES.find(([k]) => k === s)?.[1] || s;
const pill = (s) => `<span class="pill pill--${STATUSES.find(([k]) => k === s)?.[2] || "info"}">${esc(label(s))}</span>`;
const DEDUCTED = ["confirmed", "processing", "shipped", "out_for_delivery", "delivered"];

let orders = [];
let current = null;

export function initOrders() {
  $("#o-status").innerHTML += STATUSES.map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  $("#order-form").status.innerHTML = STATUSES.map(([k, l]) => `<option value="${k}">${l}</option>`).join("");
  $("#o-search").addEventListener("input", render);
  $("#o-status").addEventListener("change", render);
  $("#o-refresh").addEventListener("click", load);
  $("#o-tbody").addEventListener("click", (e) => {
    const id = e.target.closest("[data-order]")?.dataset.order;
    if (id) open(orders.find((o) => o.id === id));
  });
  $("#order-close").addEventListener("click", () => $("#order-dialog").close());
  $("#order-form").addEventListener("submit", save);
  load();
}

async function load() {
  try {
    const snap = await getDocs(collection(db, "orders"));
    orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    const pending = orders.filter((o) => o.status === "pending").length;
    $("#os-total").textContent = orders.length;
    $("#os-pending").textContent = pending;
    $("#os-shipping").textContent = orders.filter((o) => ["shipped", "out_for_delivery"].includes(o.status)).length;
    $("#os-revenue").textContent = formatPrice(orders.filter((o) => o.status === "delivered").reduce((n, o) => n + (Number(o.total) || 0), 0));
    $("#badge-pending").textContent = pending || "";
    render();
  } catch (err) {
    $("#o-tbody").innerHTML = `<tr><td colspan="7" class="muted center">Could not load orders: ${esc(authErrorMessage(err))}</td></tr>`;
  }
}

function render() {
  const q = $("#o-search").value.trim().toLowerCase();
  const st = $("#o-status").value;
  const rows = orders.filter((o) => {
    const a = o.shippingAddress || {};
    return (!st || o.status === st) &&
      (!q || [o.id, a.fullName, a.phone, a.city, a.region, o.customerEmail].some((v) => String(v || "").toLowerCase().includes(q)));
  });
  $("#o-count").textContent = `${rows.length} of ${orders.length}`;
  if (!rows.length) {
    $("#o-tbody").innerHTML = `<tr><td colspan="7" class="muted center">${orders.length ? "No orders match." : "No orders yet."}</td></tr>`;
    return;
  }
  $("#o-tbody").innerHTML = rows.map((o) => {
    const a = o.shippingAddress || {};
    const n = (o.items || []).reduce((s, i) => s + (i.qty || 1), 0);
    return `
    <tr>
      <td><b>#${esc(o.id.slice(0, 8).toUpperCase())}</b></td>
      <td><strong>${esc(a.fullName || "—")}</strong><span class="muted small" style="display:block">${esc(a.phone || "")} · ${esc(a.region || a.city || "")}</span></td>
      <td>${n} item${n === 1 ? "" : "s"}<span class="muted small" style="display:block;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc((o.items || []).map((i) => i.name).join(", "))}</span></td>
      <td class="nowrap"><b>${formatPrice(o.total)}</b></td>
      <td>${pill(o.status)}</td>
      <td class="nowrap small">${fmtDate(o.createdAt)}</td>
      <td class="actions"><button class="btn btn--sm" data-order="${esc(o.id)}">Open</button></td>
    </tr>`;
  }).join("");
}

function open(o) {
  current = o;
  const a = o.shippingAddress || {};
  $("#order-detail").innerHTML = `
    <h2>Order #${esc(o.id.slice(0, 8).toUpperCase())}</h2>
    <p class="muted small">${fmtDate(o.createdAt)} · ${pill(o.status)} · ${o.paymentMethod === "cash_on_delivery" ? "Cash on delivery" : esc(o.paymentMethod || "")}</p>
    <div class="grid-2" style="margin:14px 0">
      <div class="card" style="margin:0;padding:16px">
        <b>${esc(a.fullName)}</b><br>
        <a href="tel:${esc((a.phone || "").replace(/\s/g, ""))}">${esc(a.phone)}</a><br>
        ${o.customerEmail ? `<a href="mailto:${esc(o.customerEmail)}">${esc(o.customerEmail)}</a><br>` : ""}
        <span class="muted small">${esc([a.line1, a.city, a.region, a.postalCode].filter(Boolean).join(", "))}</span>
        ${o.note ? `<p class="small" style="margin:8px 0 0">📝 ${esc(o.note)}</p>` : ""}
      </div>
      <div class="card" style="margin:0;padding:16px">
        ${(o.items || []).map((i) => `<div class="sum-item"><span>${esc(i.name)} <span class="muted">× ${i.qty}</span></span><b>${formatPrice(i.price * i.qty)}</b></div>`).join("")}
        <div class="sum-row"><span>Delivery</span><b>${o.deliveryFee ? formatPrice(o.deliveryFee) : "Free"}</b></div>
        <div class="sum-row sum-row--total"><span>Total</span><b>${formatPrice(o.total)}</b></div>
      </div>
    </div>`;
  const f = $("#order-form");
  f.status.value = o.status || "pending";
  f.carrier.value = o.carrier || "";
  f.trackingNumber.value = o.trackingNumber || "";
  f.note.value = "";
  $("#order-dialog").showModal();
}

/** Deduct (sign = -1) or restore (sign = +1) product stock for an order. */
async function adjustStock(o, sign) {
  const batch = writeBatch(db);
  for (const it of o.items || []) {
    const ref = doc(db, "products", it.productId);
    const snap = await getDoc(ref);
    if (!snap.exists()) continue;
    batch.update(ref, { stock: Math.max(0, (Number(snap.data().stock) || 0) + sign * (Number(it.qty) || 1)) });
  }
  await batch.commit();
}

async function save(e) {
  e.preventDefault();
  const f = e.currentTarget;
  const btn = f.querySelector("button[type=submit]");
  const status = f.status.value;
  const updates = { status, carrier: f.carrier.value.trim(), trackingNumber: f.trackingNumber.value.trim() };
  if (status !== current.status || f.note.value.trim()) {
    updates.statusHistory = arrayUnion({ status, at: Timestamp.now(), note: f.note.value.trim() });
  }
  setLoading(btn, true);
  try {
    if (!current.stockDeducted && DEDUCTED.includes(status)) {
      await adjustStock(current, -1);
      updates.stockDeducted = true;
    } else if (current.stockDeducted && status === "cancelled") {
      await adjustStock(current, +1);
      updates.stockDeducted = false;
    }
    await updateDoc(doc(db, "orders", current.id), updates);
    $("#order-dialog").close();
    toast("Order updated.", "success");
    load();
  } catch (err) {
    toast(authErrorMessage(err), "error");
  } finally {
    setLoading(btn, false);
  }
}
