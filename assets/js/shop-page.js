/** MOTO NAVAR – shop page with filters (shop.html?category=&q=). */
import { CATEGORIES, CONDITIONS, VEHICLE_CATEGORIES, listProducts } from "./products.js";
import { productCard, bindCardActions, esc } from "./product-card.js";
import { authErrorMessage } from "./ui.js";

const $ = (s) => document.querySelector(s);
const params = new URLSearchParams(location.search);
let products = [];
const state = {
  q: params.get("q") || "",
  cats: new Set(params.get("category") ? [params.get("category")] : []),
  brands: new Set(),
  conds: new Set(),
  pmin: "", pmax: "", ccmin: "", ccmax: "",
  stock: false, sale: false,
  sort: "featured",
};

function checkboxList(el, values, set, counts) {
  el.innerHTML = values.length
    ? values.map((v) => `<label class="check"><input type="checkbox" value="${esc(v)}" ${set.has(v) ? "checked" : ""}> ${esc(v)} <span class="muted small">(${counts[v] || 0})</span></label>`).join("")
    : `<span class="muted small">—</span>`;
  el.onchange = (e) => {
    const v = e.target.value;
    e.target.checked ? set.add(v) : set.delete(v);
    render();
  };
}

function apply() {
  const q = state.q.trim().toLowerCase();
  const num = (v) => (v === "" ? null : Number(v));
  const [pmin, pmax, ccmin, ccmax] = [num(state.pmin), num(state.pmax), num(state.ccmin), num(state.ccmax)];
  let list = products.filter((p) => {
    if (q && ![p.name, p.brand, p.model, p.category, p.description].some((v) => String(v || "").toLowerCase().includes(q))) return false;
    if (state.cats.size && !state.cats.has(p.category)) return false;
    if (state.brands.size && !state.brands.has(p.brand)) return false;
    if (state.conds.size && !state.conds.has(p.condition || "New")) return false;
    if (pmin !== null && p.price < pmin) return false;
    if (pmax !== null && p.price > pmax) return false;
    const cc = p.specs?.engineCc;
    if ((ccmin !== null || ccmax !== null) && cc === undefined) return false;
    if (ccmin !== null && cc < ccmin) return false;
    if (ccmax !== null && cc > ccmax) return false;
    if (state.stock && !(p.stock > 0)) return false;
    if (state.sale && !(p.oldPrice > p.price)) return false;
    return true;
  });
  const t = (p) => p.createdAt?.toMillis?.() || 0;
  const sorters = {
    featured: (a, b) => Number(!!b.featured) - Number(!!a.featured) || t(b) - t(a),
    newest: (a, b) => t(b) - t(a),
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return list.sort(sorters[state.sort]);
}

function render() {
  const list = apply();
  const onlyCat = state.cats.size === 1 ? [...state.cats][0] : "";
  $("#shop-title").textContent = onlyCat || (state.q ? `Results for “${state.q}”` : "All products");
  document.title = `${$("#shop-title").textContent} – MOTO NAVAR`;
  $("#shop-count").textContent = `${list.length} product${list.length === 1 ? "" : "s"}`;
  $("#f-cc-group").hidden = state.cats.size > 0 && ![...state.cats].some((c) => VEHICLE_CATEGORIES.includes(c));
  $("#grid").innerHTML = list.length
    ? list.map(productCard).join("")
    : `<div class="empty" style="grid-column:1/-1"><div class="empty__mark"></div><h3>No products found</h3><p>Try removing some filters.</p></div>`;
  const url = new URL(location.href);
  url.search = "";
  if (onlyCat) url.searchParams.set("category", onlyCat);
  if (state.q) url.searchParams.set("q", state.q);
  history.replaceState(null, "", url);
}

function buildFilters() {
  const count = (key) => products.reduce((m, p) => ((m[p[key] || "New"] = (m[p[key] || "New"] || 0) + 1), m), {});
  checkboxList($("#f-cats"), CATEGORIES.map((c) => c.id), state.cats, count("category"));
  const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))].sort();
  checkboxList($("#f-brands"), brands, state.brands, count("brand"));
  checkboxList($("#f-cond"), CONDITIONS, state.conds, count("condition"));
}

$("#f-q").value = state.q;
const bindInput = (id, key, ev = "input") => $(id).addEventListener(ev, (e) => { state[key] = e.target.type === "checkbox" ? e.target.checked : e.target.value; render(); });
bindInput("#f-q", "q");
bindInput("#f-pmin", "pmin");
bindInput("#f-pmax", "pmax");
bindInput("#f-ccmin", "ccmin");
bindInput("#f-ccmax", "ccmax");
bindInput("#f-stock", "stock", "change");
bindInput("#f-sale", "sale", "change");
bindInput("#sort", "sort", "change");
$("#f-reset").addEventListener("click", () => {
  Object.assign(state, { q: "", pmin: "", pmax: "", ccmin: "", ccmax: "", stock: false, sale: false });
  state.cats.clear(); state.brands.clear(); state.conds.clear();
  document.querySelectorAll("#filters input").forEach((i) => (i.type === "checkbox" ? (i.checked = false) : (i.value = "")));
  buildFilters();
  render();
});
$("#filters-toggle").addEventListener("click", () => $("#filters").classList.toggle("is-open"));
bindCardActions($("#grid"), () => products);

try {
  products = await listProducts();
  buildFilters();
  render();
} catch (err) {
  $("#grid").innerHTML = `<p class="muted">Could not load products: ${esc(authErrorMessage(err))}</p>`;
}
