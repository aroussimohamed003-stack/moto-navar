/** MOTO NAVAR – Admin: products (admin.html#products). */
import {
  CATEGORIES, VEHICLE_CATEGORIES, SPEC_FIELDS, CONDITIONS,
  listProducts, saveProduct, deleteProduct, resizeImage, formatPrice,
} from "./products.js";
import { toast, setLoading, authErrorMessage, showFieldError, clearFieldErrors } from "./ui.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BRANDS = ["Yamaha", "Honda", "Suzuki", "Kawasaki", "KTM", "BMW", "Ducati", "Triumph", "Harley-Davidson", "Piaggio", "Vespa", "SYM", "Kymco", "Peugeot", "Benelli", "CFMoto", "Royal Enfield", "Forza", "Dayang", "Zontes"];

let products = [];
let editingId = null;
let images = [];
const MAX_IMAGES = 4;
const MAX_TOTAL_BYTES = 850 * 1024; // Firestore documents are limited to 1 MB

export function initProducts() {
  const catOpts = CATEGORIES.map((c) => `<option value="${esc(c.id)}">${c.icon} ${esc(c.label)}</option>`).join("");
  $("#p-filter-cat").innerHTML += catOpts;
  $("#pf-category").innerHTML = catOpts;
  $("#pf-condition").innerHTML = CONDITIONS.map((c) => `<option>${c}</option>`).join("");
  $("#brand-list").innerHTML = BRANDS.map((b) => `<option value="${b}">`).join("");
  $("#specs-fields").innerHTML = SPEC_FIELDS.map((f) => `
    <div class="field">
      <label for="spec-${f.key}">${esc(f.label)}${f.unit ? ` <span class="opt">(${f.unit})</span>` : ""}</label>
      ${f.type === "select"
        ? `<select id="spec-${f.key}" data-spec="${f.key}" class="select" style="width:100%"><option value="">—</option>${f.options.map((o) => `<option>${esc(o)}</option>`).join("")}</select>`
        : `<input id="spec-${f.key}" data-spec="${f.key}" type="${f.type === "number" ? "number" : "text"}" ${f.type === "number" ? 'min="0" step="any"' : ""}>`}
    </div>`).join("");

  ["#p-search", "#p-filter-cat", "#p-filter-status", "#p-filter-stock", "#p-sort"].forEach((sel) =>
    $(sel).addEventListener(sel === "#p-search" ? "input" : "change", render));
  $("#product-add").addEventListener("click", () => openEditor());
  $("#product-cancel").addEventListener("click", () => $("#product-dialog").close());
  $("#product-form").addEventListener("submit", onSave);
  $("#pf-category").addEventListener("change", toggleSpecs);
  $("#pf-file").addEventListener("change", onFiles);
  $("#pf-images").addEventListener("click", onImageClick);
  $("#p-tbody").addEventListener("click", onRowClick);
  $("#pdel-cancel").addEventListener("click", () => $("#product-delete-dialog").close());
  $("#pdel-confirm").addEventListener("click", onDelete);
  load();
}

async function load() {
  try {
    products = await listProducts({ activeOnly: false });
    $("#ps-total").textContent = products.length;
    $("#ps-visible").textContent = products.filter((p) => p.active).length;
    $("#ps-low").textContent = products.filter((p) => p.stock > 0 && p.stock <= 2).length;
    $("#ps-out").textContent = products.filter((p) => p.stock <= 0).length;
    render();
  } catch (err) {
    $("#p-tbody").innerHTML = `<tr><td colspan="6" class="muted center">Could not load products: ${esc(authErrorMessage(err))}</td></tr>`;
  }
}

function render() {
  const q = $("#p-search").value.trim().toLowerCase();
  const cat = $("#p-filter-cat").value;
  const status = $("#p-filter-status").value;
  const stock = $("#p-filter-stock").value;
  const t = (p) => p.createdAt?.toMillis?.() || 0;
  const sorters = {
    newest: (a, b) => t(b) - t(a), name: (a, b) => a.name.localeCompare(b.name),
    "price-asc": (a, b) => a.price - b.price, "price-desc": (a, b) => b.price - a.price, stock: (a, b) => a.stock - b.stock,
  };
  const rows = products.filter((p) =>
    (!q || [p.name, p.brand, p.model, p.sku, p.category].some((v) => String(v || "").toLowerCase().includes(q))) &&
    (!cat || p.category === cat) &&
    (!status || (status === "visible" ? p.active : status === "hidden" ? !p.active : p.featured)) &&
    (!stock || (stock === "in" ? p.stock > 0 : stock === "low" ? p.stock > 0 && p.stock <= 2 : p.stock <= 0))
  ).sort(sorters[$("#p-sort").value]);
  $("#p-count").textContent = `${rows.length} of ${products.length}`;
  if (!rows.length) {
    $("#p-tbody").innerHTML = `<tr><td colspan="6" class="muted center">${products.length ? "No products match these filters." : "No products yet. Click <b>+ Add product</b> to create your first one."}</td></tr>`;
    return;
  }
  $("#p-tbody").innerHTML = rows.map((p) => {
    const sp = p.specs || {};
    const meta = [p.brand, p.model, sp.engineCc && `${sp.engineCc} cc`, sp.year, p.condition !== "New" && p.condition].filter(Boolean).join(" · ");
    return `
    <tr>
      <td><div class="u-cell">
        <div class="p-thumb">${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="">` : ""}</div>
        <div><strong>${esc(p.name)}</strong>${meta ? `<span class="muted small">${esc(meta)}</span>` : ""}${p.sku ? `<span class="muted small">Ref ${esc(p.sku)}</span>` : ""}</div>
      </div></td>
      <td>${esc(p.category || "—")}</td>
      <td class="nowrap"><b>${formatPrice(p.price)}</b>${p.oldPrice > p.price ? `<br><s class="muted small">${formatPrice(p.oldPrice)}</s>` : ""}</td>
      <td>${p.stock <= 0 ? `<span class="pill pill--danger">0</span>` : p.stock <= 2 ? `<span class="pill pill--warn">${p.stock}</span>` : p.stock}</td>
      <td>${p.active ? `<span class="pill pill--ok">Visible</span>` : `<span class="pill pill--warn">Hidden</span>`}${p.featured ? ` <span class="pill pill--info">Featured</span>` : ""}</td>
      <td class="actions">
        <a class="icon-btn" href="product.html?id=${encodeURIComponent(p.id)}" target="_blank" title="View in shop" aria-label="View in shop"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></a>
        <button class="btn btn--sm btn--ghost" data-edit="${esc(p.id)}">Edit</button>
        <button class="btn btn--sm btn--ghost" data-dup="${esc(p.id)}" title="Duplicate">Copy</button>
        <button class="btn btn--sm btn--danger" data-del="${esc(p.id)}">Delete</button>
      </td>
    </tr>`;
  }).join("");
}

/* ---------------- Editor ---------------- */

function toggleSpecs() {
  $("#specs-box").hidden = !VEHICLE_CATEGORIES.includes($("#pf-category").value);
}

function openEditor(p = null, { duplicate = false } = {}) {
  const f = $("#product-form");
  f.reset();
  clearFieldErrors(f);
  $("#pf-images-error").textContent = "";
  editingId = p && !duplicate ? p.id : null;
  images = [...(p?.images || [])];
  $("#product-dialog-title").textContent = editingId ? "Edit product" : duplicate ? "Duplicate product" : "Add product";
  document.querySelectorAll("[data-spec]").forEach((el) => (el.value = ""));
  if (p) {
    f.name.value = (p.name || "") + (duplicate ? " (copy)" : "");
    f.category.value = p.category || CATEGORIES[0].id;
    f.brand.value = p.brand || "";
    f.model.value = p.model || "";
    f.condition.value = p.condition || "New";
    f.sku.value = duplicate ? "" : p.sku || "";
    f.price.value = p.price ?? "";
    f.oldPrice.value = p.oldPrice || "";
    f.stock.value = p.stock ?? 0;
    f.description.value = p.description || "";
    f.active.checked = !!p.active;
    f.featured.checked = !!p.featured;
    for (const [k, v] of Object.entries(p.specs || {})) {
      const el = document.querySelector(`[data-spec="${k}"]`);
      if (el) el.value = v;
    }
  }
  toggleSpecs();
  renderImages();
  $("#product-dialog").showModal();
}

function renderImages() {
  $("#pf-images").innerHTML = images.map((src, i) => `
    <div class="img-tile">
      <img src="${esc(src)}" alt="">
      ${i === 0 ? `<span class="img-tile__main">Main</span>` : `<button type="button" class="img-tile__btn img-tile__left" data-main="${i}" title="Make main photo">★</button>`}
      <button type="button" class="img-tile__btn" data-remove="${i}" title="Remove" aria-label="Remove photo">×</button>
    </div>`).join("") +
    (images.length < MAX_IMAGES ? `<button type="button" class="img-add" data-add><span>+</span>Add photo</button>` : "");
}

function onImageClick(e) {
  if (e.target.closest("[data-add]")) $("#pf-file").click();
  const rm = e.target.closest("[data-remove]")?.dataset.remove;
  if (rm !== undefined) { images.splice(+rm, 1); renderImages(); }
  const main = e.target.closest("[data-main]")?.dataset.main;
  if (main !== undefined) { images.unshift(images.splice(+main, 1)[0]); renderImages(); }
}

async function onFiles(e) {
  const files = [...e.target.files].slice(0, MAX_IMAGES - images.length);
  e.target.value = "";
  for (const file of files) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { toast(`${file.name}: use JPG, PNG or WebP.`, "error"); continue; }
    try { images.push(await resizeImage(file, 900, 0.78)); } catch (err) { toast(err.message, "error"); }
  }
  renderImages();
}

async function onSave(e) {
  e.preventDefault();
  const f = e.currentTarget;
  clearFieldErrors(f);
  $("#pf-images-error").textContent = "";
  let ok = true;
  if (f.name.value.trim().length < 2) { showFieldError(f.name, "Enter the product name."); ok = false; }
  if (f.price.value === "" || Number(f.price.value) < 0) { showFieldError(f.price, "Enter a valid price in DT."); ok = false; }
  if (f.stock.value === "" || Number(f.stock.value) < 0) { showFieldError(f.stock, "Enter the stock quantity."); ok = false; }
  if (images.reduce((n, s) => n + s.length, 0) > MAX_TOTAL_BYTES) { $("#pf-images-error").textContent = "Photos are too large together. Remove one photo or use smaller images."; ok = false; }
  if (!ok) return;

  const specs = {};
  if (VEHICLE_CATEGORIES.includes(f.category.value)) {
    document.querySelectorAll("[data-spec]").forEach((el) => { if (el.value !== "") specs[el.dataset.spec] = el.value; });
  }
  const btn = f.querySelector("button[type=submit]");
  setLoading(btn, true);
  try {
    await saveProduct({
      name: f.name.value, category: f.category.value, brand: f.brand.value, model: f.model.value,
      condition: f.condition.value, sku: f.sku.value, price: f.price.value, oldPrice: f.oldPrice.value,
      stock: f.stock.value, description: f.description.value, images, specs,
      active: f.active.checked, featured: f.featured.checked,
    }, editingId);
    $("#product-dialog").close();
    toast(editingId ? "Product updated." : "Product added to the shop.", "success");
    load();
  } catch (err) {
    toast(err.code === "permission-denied" ? "Permission denied: this account is not an administrator." : authErrorMessage(err), "error", 7000);
  } finally {
    setLoading(btn, false);
  }
}

/* ---------------- Row actions ---------------- */

let deletingId = null;

function onRowClick(e) {
  const find = (id) => products.find((p) => p.id === id);
  const editId = e.target.closest("[data-edit]")?.dataset.edit;
  if (editId) openEditor(find(editId));
  const dupId = e.target.closest("[data-dup]")?.dataset.dup;
  if (dupId) openEditor(find(dupId), { duplicate: true });
  const delId = e.target.closest("[data-del]")?.dataset.del;
  if (delId) {
    deletingId = delId;
    $("#pdel-name").textContent = find(delId)?.name || "This product";
    $("#product-delete-dialog").showModal();
  }
}

async function onDelete(e) {
  const btn = e.currentTarget;
  setLoading(btn, true);
  try {
    await deleteProduct(deletingId);
    $("#product-delete-dialog").close();
    toast("Product deleted.", "success");
    load();
  } catch (err) {
    toast(authErrorMessage(err), "error");
  } finally {
    setLoading(btn, false);
  }
}
