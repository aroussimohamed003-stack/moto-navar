/** MOTO NAVAR – Admin: products (admin.html#products). */
import {
  CATEGORIES, VEHICLE_CATEGORIES, SPEC_FIELDS, CONDITIONS,
  listProducts, saveProduct, deleteProduct, setProductActive, resizeImage, formatPrice,
} from "./products.js";
import { toast, setLoading, authErrorMessage, showFieldError, clearFieldErrors } from "./ui.js";

const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const BRANDS = ["Yamaha", "Honda", "Suzuki", "Kawasaki", "KTM", "BMW", "Ducati", "Triumph", "Harley-Davidson", "Piaggio", "Vespa", "SYM", "Kymco", "Peugeot", "Benelli", "CFMoto", "Royal Enfield", "Forza", "Dayang", "Zontes"];

let products = [];
let view = "grid";
const selected = new Set();
let lastRows = [];
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
  $("#p-grid").addEventListener("click", onRowClick);
  for (const el of [$("#p-grid"), $("#p-tbody")]) el.addEventListener("change", onSelect);
  document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
    view = b.dataset.view;
    document.querySelectorAll("[data-view]").forEach((x) => x.classList.toggle("is-active", x === b));
    render();
  }));
  $("#p-select-all").addEventListener("change", (e) => {
    lastRows.forEach((p) => (e.target.checked ? selected.add(p.id) : selected.delete(p.id)));
    render();
  });
  $("#bulk-delete").addEventListener("click", () => {
    if (!selected.size) return;
    deletingIds = [...selected];
    $("#pdel-name").textContent = `${deletingIds.length} product${deletingIds.length === 1 ? "" : "s"}`;
    $("#pdel-preview").innerHTML = previewThumbs(deletingIds);
    $("#product-delete-dialog").showModal();
  });
  $("#bulk-hide").addEventListener("click", () => bulkActive(false));
  $("#bulk-show").addEventListener("click", () => bulkActive(true));
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
    for (const id of [...selected]) if (!products.some((p) => p.id === id)) selected.delete(id);
    render();
    const editId = new URLSearchParams(location.search).get("edit");
    if (editId && products.some((p) => p.id === editId)) {
      history.replaceState(null, "", location.pathname + "#products");
      openEditor(products.find((p) => p.id === editId));
    }
  } catch (err) {
    $("#p-grid").innerHTML = `<p class="muted center" style="grid-column:1/-1">Could not load products: ${esc(authErrorMessage(err))}</p>`;
    $("#p-tbody").innerHTML = `<tr><td colspan="7" class="muted center">Could not load products: ${esc(authErrorMessage(err))}</td></tr>`;
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
  lastRows = rows;
  $("#p-grid").hidden = view !== "grid";
  $("#p-table").hidden = view !== "table";
  $("#bulk-bar").hidden = !products.length;
  $("#bulk-count").textContent = selected.size ? `${selected.size} selected` : "";
  $("#p-select-all").checked = rows.length > 0 && rows.every((p) => selected.has(p.id));
  ["#bulk-delete", "#bulk-hide", "#bulk-show"].forEach((b) => ($(b).disabled = !selected.size));

  if (!rows.length) {
    const msg = products.length ? "No products match these filters." : "No products yet. Click <b>+ Add product</b> to create your first one.";
    $("#p-grid").innerHTML = `<p class="muted center" style="grid-column:1/-1;padding:40px">${msg}</p>`;
    $("#p-tbody").innerHTML = `<tr><td colspan="7" class="muted center">${msg}</td></tr>`;
    return;
  }
  const meta = (p) => { const sp = p.specs || {}; return [p.brand, p.model, sp.engineCc && `${sp.engineCc} cc`, sp.year, p.condition !== "New" && p.condition].filter(Boolean).join(" · "); };
  const stockPill = (p) => (p.stock <= 0 ? `<span class="pill pill--danger">Out of stock</span>` : p.stock <= 2 ? `<span class="pill pill--warn">Stock ${p.stock}</span>` : `<span class="pill pill--ok">Stock ${p.stock}</span>`);
  const statusPill = (p) => (p.active ? `<span class="pill pill--ok">Visible</span>` : `<span class="pill pill--warn">Hidden</span>`) + (p.featured ? ` <span class="pill pill--info">Featured</span>` : "");
  const toggleBtn = (p) => `<button class="btn btn--sm btn--ghost" data-toggle="${esc(p.id)}">${p.active ? "🙈 Hide" : "👁 Show"}</button>`;

  if (view === "grid") {
    $("#p-grid").innerHTML = rows.map((p) => `
      <article class="apcard ${selected.has(p.id) ? "is-selected" : ""} ${p.active ? "" : "is-hidden"}">
        <label class="apcard__select" title="Select"><input type="checkbox" data-select="${esc(p.id)}" ${selected.has(p.id) ? "checked" : ""}></label>
        <div class="apcard__img">${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="">` : `<span class="pcard__noimg"></span>`}</div>
        <div class="apcard__body">
          <span class="pcard__cat">${esc(p.category || "")}</span>
          <strong class="apcard__name">${esc(p.name)}</strong>
          ${meta(p) ? `<span class="muted small">${esc(meta(p))}</span>` : ""}
          <div class="apcard__price"><b>${formatPrice(p.price)}</b>${p.oldPrice > p.price ? ` <s class="muted small">${formatPrice(p.oldPrice)}</s>` : ""}</div>
          <div class="apcard__pills">${stockPill(p)} ${statusPill(p)}</div>
        </div>
        <div class="apcard__actions">
          <button class="btn btn--sm" data-edit="${esc(p.id)}">✏️ Edit</button>
          ${toggleBtn(p)}
          <a class="btn btn--sm btn--ghost" href="product.html?id=${encodeURIComponent(p.id)}" target="_blank">View</a>
          <button class="btn btn--sm btn--ghost" data-dup="${esc(p.id)}">Copy</button>
          <button class="btn btn--sm btn--danger apcard__del" data-del="${esc(p.id)}">🗑 Delete</button>
        </div>
      </article>`).join("");
    return;
  }

  $("#p-tbody").innerHTML = rows.map((p) => `
    <tr class="${selected.has(p.id) ? "is-selected" : ""}">
      <td><input type="checkbox" data-select="${esc(p.id)}" ${selected.has(p.id) ? "checked" : ""} aria-label="Select"></td>
      <td><div class="u-cell">
        <div class="p-thumb">${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="">` : ""}</div>
        <div><strong>${esc(p.name)}</strong>${meta(p) ? `<span class="muted small">${esc(meta(p))}</span>` : ""}${p.sku ? `<span class="muted small">Ref ${esc(p.sku)}</span>` : ""}</div>
      </div></td>
      <td>${esc(p.category || "—")}</td>
      <td class="nowrap"><b>${formatPrice(p.price)}</b>${p.oldPrice > p.price ? `<br><s class="muted small">${formatPrice(p.oldPrice)}</s>` : ""}</td>
      <td>${stockPill(p)}</td>
      <td>${statusPill(p)}</td>
      <td class="actions">
        <button class="btn btn--sm btn--ghost" data-edit="${esc(p.id)}">Edit</button>
        ${toggleBtn(p)}
        <button class="btn btn--sm btn--danger" data-del="${esc(p.id)}">🗑 Delete</button>
      </td>
    </tr>`).join("");
}

function onSelect(e) {
  const id = e.target.dataset?.select;
  if (!id) return;
  e.target.checked ? selected.add(id) : selected.delete(id);
  render();
}

function previewThumbs(ids) {
  return ids.slice(0, 6).map((id) => {
    const p = products.find((x) => x.id === id);
    return `<div class="p-thumb" title="${esc(p?.name)}">${p?.images?.[0] ? `<img src="${esc(p.images[0])}" alt="">` : ""}</div>`;
  }).join("") + (ids.length > 6 ? `<span class="muted">+${ids.length - 6}</span>` : "");
}

async function bulkActive(active) {
  try {
    await Promise.all([...selected].map((id) => setProductActive(id, active)));
    toast(`${selected.size} product${selected.size === 1 ? "" : "s"} ${active ? "shown in" : "hidden from"} the shop.`, "success");
    selected.clear();
    load();
  } catch (err) { toast(authErrorMessage(err), "error"); }
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

let deletingIds = [];

async function onRowClick(e) {
  const find = (id) => products.find((p) => p.id === id);
  const editId = e.target.closest("[data-edit]")?.dataset.edit;
  if (editId) openEditor(find(editId));
  const dupId = e.target.closest("[data-dup]")?.dataset.dup;
  if (dupId) openEditor(find(dupId), { duplicate: true });
  const togId = e.target.closest("[data-toggle]")?.dataset.toggle;
  if (togId) {
    const p = find(togId);
    try {
      await setProductActive(togId, !p.active);
      toast(p.active ? "Product hidden from the shop." : "Product is visible in the shop.", "success", 2500);
      load();
    } catch (err) { toast(authErrorMessage(err), "error"); }
  }
  const delId = e.target.closest("[data-del]")?.dataset.del;
  if (delId) {
    deletingIds = [delId];
    $("#pdel-name").textContent = find(delId)?.name || "This product";
    $("#pdel-preview").innerHTML = previewThumbs(deletingIds);
    $("#product-delete-dialog").showModal();
  }
}

async function onDelete(e) {
  const btn = e.currentTarget;
  setLoading(btn, true);
  try {
    await Promise.all(deletingIds.map((id) => deleteProduct(id)));
    deletingIds.forEach((id) => selected.delete(id));
    $("#product-delete-dialog").close();
    toast(deletingIds.length > 1 ? `${deletingIds.length} products deleted.` : "Product deleted.", "success");
    load();
  } catch (err) {
    toast(err.code === "permission-denied" ? "Permission denied: this account is not an administrator." : authErrorMessage(err), "error");
  } finally {
    setLoading(btn, false);
  }
}
