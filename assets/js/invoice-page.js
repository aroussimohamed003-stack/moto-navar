/**
 * MOTO NAVAR – order slip ("Devis / Bon de commande") for one order.
 * invoice.html?id=ORDER_ID[&new=1]
 * Visible to the customer who placed the order and to admins (Security Rules).
 * Can be downloaded as a PNG image (drawn on a canvas) or printed / saved as PDF.
 */
import { db, doc, getDoc } from "./firebase.js";
import { requireAuth } from "./auth-guard.js";
import { formatPrice } from "./products.js";
import { getSettings } from "./store-settings.js";
import { authErrorMessage } from "./ui.js";

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const params = new URLSearchParams(location.search);
const id = params.get("id") || "";
const STATUS_FR = { pending: "En attente", confirmed: "Confirmée", processing: "En préparation", shipped: "Expédiée", out_for_delivery: "En livraison", delivered: "Livrée", cancelled: "Annulée" };
const ref = (o) => "MN-" + o.id.slice(0, 8).toUpperCase();
const dateOf = (o) => (o.createdAt?.toDate ? o.createdAt.toDate() : new Date());
const fmtDate = (d) => d.toLocaleDateString("fr-TN", { day: "2-digit", month: "2-digit", year: "numeric" }) + " " + d.toLocaleTimeString("fr-TN", { hour: "2-digit", minute: "2-digit" });

await requireAuth();
if (params.get("new")) $("#thanks").hidden = false;

let order, s;
try {
  const snap = await getDoc(doc(db, "orders", id));
  if (!snap.exists()) throw Object.assign(new Error("Commande introuvable."), { code: "not-found" });
  order = { id: snap.id, ...snap.data() };
  s = await getSettings();
  renderHtml();
  await renderImage();
} catch (err) {
  $("#invoice").innerHTML = `<p class="muted">Impossible d'afficher ce devis : ${esc(err.code === "not-found" ? err.message : authErrorMessage(err))}</p>`;
}

/* ---------------- HTML version (print / PDF) ---------------- */

function renderHtml() {
  const o = order;
  const a = o.shippingAddress || {};
  const subtotal = o.subtotal ?? (o.items || []).reduce((n, i) => n + i.price * i.qty, 0);
  document.title = `Devis ${ref(o)} – MOTO NAVAR`;
  $("#invoice").innerHTML = `
    <div class="inv-head">
      <div class="inv-brand">
        <img src="${esc(s.logoImage || "assets/img/logo-mark.svg")}" alt="">
        ${s.logoShowName !== false || !s.logoImage ? `<b>MOTO <span>NAVAR</span></b>` : ""}
      </div>
      <div class="inv-store">
        ${s.address ? `<div>${esc(s.address)}</div>` : ""}
        ${s.phone ? `<div>Tél : ${esc(s.phone)}</div>` : ""}
        ${s.email ? `<div>${esc(s.email)}</div>` : ""}
        ${s.taxId ? `<div>MF : ${esc(s.taxId)}</div>` : ""}
      </div>
    </div>
    <div class="inv-title">
      <h2>DEVIS / BON DE COMMANDE</h2>
      <div><b>N° ${esc(ref(o))}</b><span>${fmtDate(dateOf(o))}</span><span>Statut : ${esc(STATUS_FR[o.status] || o.status)}</span></div>
    </div>
    <div class="inv-parties">
      <div><small>CLIENT</small><b>${esc(a.fullName)}</b><span>${esc(a.phone)}</span>${o.customerEmail ? `<span>${esc(o.customerEmail)}</span>` : ""}</div>
      <div><small>LIVRAISON</small><span>${esc(a.line1)}</span><span>${esc([a.postalCode, a.city].filter(Boolean).join(" "))}</span><span>${esc([a.region, a.country].filter(Boolean).join(", "))}</span></div>
    </div>
    <table class="inv-table">
      <thead><tr><th>Désignation</th><th>Qté</th><th>Prix unitaire</th><th>Total</th></tr></thead>
      <tbody>${(o.items || []).map((i) => `<tr><td>${esc(i.name)}</td><td>${i.qty}</td><td>${formatPrice(i.price)}</td><td>${formatPrice(i.price * i.qty)}</td></tr>`).join("")}</tbody>
    </table>
    <div class="inv-totals">
      <div><span>Sous-total</span><b>${formatPrice(subtotal)}</b></div>
      <div><span>Livraison</span><b>${o.deliveryFee ? formatPrice(o.deliveryFee) : "Gratuite"}</b></div>
      <div class="inv-grand"><span>TOTAL À PAYER</span><b>${formatPrice(o.total)}</b></div>
    </div>
    ${o.note ? `<p class="inv-note">Note : ${esc(o.note)}</p>` : ""}
    <div class="inv-foot">Paiement à la livraison (espèces) · Prix en dinars tunisiens (DT) · Merci pour votre confiance !</div>`;
}

/* ---------------- PNG version (canvas) ---------------- */

function loadImg(src) {
  return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
}

function wrap(ctx, text, maxW) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

async function renderImage() {
  const o = order;
  const a = o.shippingAddress || {};
  const items = o.items || [];
  const subtotal = o.subtotal ?? items.reduce((n, i) => n + i.price * i.qty, 0);
  try { await document.fonts.ready; } catch { /* ignore */ }

  const W = 1240, P = 80;
  const F = (w, size) => `${w} ${size}px Inter, "Segoe UI", Arial, sans-serif`;
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  // measure rows first
  ctx.font = F(500, 24);
  const rows = items.map((i) => ({ i, lines: wrap(ctx, i.name, 560) }));
  const tableH = rows.reduce((n, r) => n + 30 * r.lines.length + 34, 0);
  const H = 980 + tableH + (o.note ? 60 : 0);
  c.width = W; c.height = H;

  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#ff4d1c"; ctx.fillRect(0, 0, W, 14);

  // logo + name
  let y = 70;
  const logo = await loadImg(s.logoImage || "assets/img/logo-mark.svg");
  let x = P;
  if (logo) {
    const h = 80, w = Math.min(260, (logo.width / logo.height) * h || h);
    ctx.drawImage(logo, x, y, w, h);
    x += w + 20;
  }
  if (s.logoShowName !== false || !s.logoImage) {
    ctx.font = F(800, 42); ctx.fillStyle = "#111"; ctx.textBaseline = "middle";
    ctx.fillText("MOTO", x, y + 40);
    ctx.fillStyle = "#ff4d1c"; ctx.fillText("NAVAR", x + ctx.measureText("MOTO ").width, y + 40);
  }
  // store info (right)
  ctx.textAlign = "right"; ctx.textBaseline = "alphabetic"; ctx.font = F(400, 21); ctx.fillStyle = "#555";
  const info = [s.address, s.phone && `Tél : ${s.phone}`, s.email, s.taxId && `MF : ${s.taxId}`].filter(Boolean);
  info.forEach((t, k) => ctx.fillText(t, W - P, y + 22 + k * 28));
  ctx.textAlign = "left";

  // title band
  y = 210;
  ctx.fillStyle = "#111"; ctx.fillRect(P, y, W - 2 * P, 90);
  ctx.fillStyle = "#fff"; ctx.font = F(800, 34); ctx.fillText("DEVIS / BON DE COMMANDE", P + 30, y + 57);
  ctx.textAlign = "right"; ctx.font = F(700, 24); ctx.fillText(`N° ${ref(o)}`, W - P - 30, y + 40);
  ctx.font = F(400, 20); ctx.fillStyle = "#ddd"; ctx.fillText(`${fmtDate(dateOf(o))} · ${STATUS_FR[o.status] || o.status}`, W - P - 30, y + 70);
  ctx.textAlign = "left";

  // parties
  y = 350;
  const col = (title, lines, cx) => {
    ctx.font = F(700, 18); ctx.fillStyle = "#ff4d1c"; ctx.fillText(title, cx, y);
    lines.filter(Boolean).forEach((t, k) => { ctx.font = F(k === 0 ? 700 : 400, 23); ctx.fillStyle = k === 0 ? "#111" : "#444"; ctx.fillText(t, cx, y + 36 + k * 32); });
  };
  col("CLIENT", [a.fullName, a.phone, o.customerEmail], P);
  col("LIVRAISON", [a.line1, [a.postalCode, a.city].filter(Boolean).join(" "), [a.region, a.country].filter(Boolean).join(", ")], W / 2 + 20);

  // table
  y = 520;
  const cols = [P + 20, 720, 840, W - P - 20];
  ctx.fillStyle = "#f3f3f5"; ctx.fillRect(P, y, W - 2 * P, 54);
  ctx.font = F(700, 20); ctx.fillStyle = "#333";
  ctx.fillText("Désignation", cols[0], y + 34); ctx.fillText("Qté", cols[1], y + 34);
  ctx.textAlign = "right"; ctx.fillText("Prix unitaire", 1010, y + 34); ctx.fillText("Total", cols[3], y + 34); ctx.textAlign = "left";
  y += 54;
  for (const { i, lines } of rows) {
    const rh = 30 * lines.length + 34;
    ctx.font = F(500, 24); ctx.fillStyle = "#111";
    lines.forEach((l, k) => ctx.fillText(l, cols[0], y + 40 + k * 30));
    ctx.fillText(String(i.qty), cols[1], y + 40);
    ctx.textAlign = "right";
    ctx.fillText(formatPrice(i.price), 1010, y + 40);
    ctx.font = F(700, 24); ctx.fillText(formatPrice(i.price * i.qty), cols[3], y + 40);
    ctx.textAlign = "left";
    y += rh;
    ctx.fillStyle = "#e6e6ea"; ctx.fillRect(P, y, W - 2 * P, 2);
  }

  // totals
  y += 50;
  const line = (label, value, big) => {
    ctx.font = F(big ? 800 : 500, big ? 30 : 24); ctx.fillStyle = big ? "#111" : "#555";
    ctx.fillText(label, 700, y);
    ctx.textAlign = "right"; ctx.fillStyle = big ? "#ff4d1c" : "#111"; ctx.fillText(value, W - P - 20, y); ctx.textAlign = "left";
    y += big ? 50 : 42;
  };
  line("Sous-total", formatPrice(subtotal));
  line("Livraison", o.deliveryFee ? formatPrice(o.deliveryFee) : "Gratuite");
  ctx.fillStyle = "#111"; ctx.fillRect(700, y - 26, W - P - 700, 3);
  y += 20;
  line("TOTAL À PAYER", formatPrice(o.total), true);

  if (o.note) {
    ctx.font = F(400, 21); ctx.fillStyle = "#555";
    ctx.fillText(`Note : ${String(o.note).slice(0, 110)}`, P, y + 10);
    y += 60;
  }

  // footer
  ctx.fillStyle = "#f3f3f5"; ctx.fillRect(0, H - 90, W, 90);
  ctx.font = F(500, 20); ctx.fillStyle = "#555"; ctx.textAlign = "center";
  ctx.fillText("Paiement à la livraison (espèces) · Prix en dinars tunisiens (DT) · Merci pour votre confiance !", W / 2, H - 38);
  ctx.textAlign = "left";

  const url = c.toDataURL("image/png");
  $("#invoice-img").src = url;
  $("#invoice-img").hidden = false;
  const btn = $("#dl-png");
  btn.disabled = false;
  btn.onclick = () => {
    const link = Object.assign(document.createElement("a"), { href: url, download: `devis-${ref(o)}.png` });
    document.body.appendChild(link); link.click(); link.remove();
  };
}

$("#print").addEventListener("click", () => window.print());
