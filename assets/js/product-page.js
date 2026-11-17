/** MOTO NAVAR – product page (product.html?id=...). */
import { auth } from "./firebase.js";
import { getProduct, listProducts, formatPrice, SPEC_FIELDS, specValue } from "./products.js";
import { addToWishlist } from "./customer-data.js";
import { addToCart } from "./cart.js";
import { productCard, bindCardActions, esc } from "./product-card.js";
import { getSettings } from "./store-settings.js";
import { toast, authErrorMessage } from "./ui.js";

const $ = (s) => document.querySelector(s);
const id = new URLSearchParams(location.search).get("id");
const here = `product.html?id=${encodeURIComponent(id || "")}`;
let related = [];

async function render(p) {
  document.title = `${p.name} – MOTO NAVAR`;
  $("#crumbs").innerHTML = `<a href="index.html">Home</a> › <a href="shop.html?category=${encodeURIComponent(p.category)}">${esc(p.category)}</a> › <span>${esc(p.name)}</span>`;
  const sale = p.oldPrice > p.price;
  const imgs = p.images || [];
  const specs = SPEC_FIELDS.filter((f) => p.specs?.[f.key] !== undefined && p.specs[f.key] !== "");
  const s = await getSettings();
  const wa = s.whatsapp ? `https://wa.me/${s.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hello MOTO NAVAR, I'm interested in: ${p.name} (${formatPrice(p.price)})`)}` : "";

  $("#pdp").innerHTML = `
    <div class="pdp__gallery">
      <div class="pdp__main">${imgs[0] ? `<img id="main-img" src="${esc(imgs[0])}" alt="${esc(p.name)}">` : `<span class="pcard__noimg"></span>`}</div>
      ${imgs.length > 1 ? `<div class="pdp__thumbs">${imgs.map((src, i) => `<button data-img="${i}" class="${i === 0 ? "is-active" : ""}"><img src="${esc(src)}" alt=""></button>`).join("")}</div>` : ""}
    </div>
    <div class="pdp__info">
      <span class="pcard__cat">${esc(p.category)}${p.brand ? ` · ${esc(p.brand)}` : ""}${p.model ? ` ${esc(p.model)}` : ""}</span>
      <h1 class="pdp__title">${esc(p.name)}</h1>
      <div class="pdp__badges">
        <span class="pill pill--info">${esc(p.condition || "New")}</span>
        ${p.stock > 0 ? `<span class="pill pill--ok">In stock · ${p.stock}</span>` : `<span class="pill pill--danger">Out of stock</span>`}
        ${p.sku ? `<span class="muted small">Ref: ${esc(p.sku)}</span>` : ""}
      </div>
      <div class="pdp__price"><b>${formatPrice(p.price)}</b>${sale ? `<s>${formatPrice(p.oldPrice)}</s><span class="pill pill--danger">-${Math.round((1 - p.price / p.oldPrice) * 100)}%</span>` : ""}</div>
      ${specs.length ? `<div class="spec-chips">${specs.slice(0, 4).map((f) => `<div><span>${esc(f.label)}</span><b>${esc(specValue(f, p.specs[f.key]))}</b></div>`).join("")}</div>` : ""}
      <div class="pdp__buy">
        <div class="qty"><button type="button" data-q="-1" aria-label="Less">−</button><input id="qty" type="number" min="1" max="${Math.max(1, p.stock)}" value="1" aria-label="Quantity"><button type="button" data-q="1" aria-label="More">+</button></div>
        <button class="btn btn--display" id="cart-btn" ${p.stock > 0 ? "" : "disabled"}>Add to cart</button>
        <button class="btn btn--ghost btn--display" id="buy-btn" ${p.stock > 0 ? "" : "disabled"}>Buy now</button>
        <button class="icon-btn icon-btn--lg" id="wish-btn" title="Add to wishlist" aria-label="Add to wishlist">♡</button>
      </div>
      ${wa ? `<a class="btn btn--ghost btn--sm wa-btn" href="${esc(wa)}" target="_blank" rel="noopener">Ask on WhatsApp</a>` : ""}
      <ul class="pdp__assure"><li>🚚 Delivery to all 24 governorates</li><li>💵 Cash on delivery</li>${p.specs?.warranty ? `<li>🛡️ Warranty: ${esc(p.specs.warranty)}</li>` : ""}</ul>
    </div>
    ${p.description ? `<section class="pdp__section"><h2>Description</h2><div class="pdp__desc">${esc(p.description).replace(/\n/g, "<br>")}</div></section>` : ""}
    ${specs.length ? `<section class="pdp__section"><h2>Specifications</h2><table class="spec-table"><tbody>${specs.map((f) => `<tr><th>${esc(f.label)}</th><td>${esc(specValue(f, p.specs[f.key]))}</td></tr>`).join("")}</tbody></table></section>` : ""}`;

  document.querySelectorAll("[data-img]").forEach((b) => b.addEventListener("click", () => {
    $("#main-img").src = imgs[+b.dataset.img];
    document.querySelectorAll("[data-img]").forEach((x) => x.classList.toggle("is-active", x === b));
  }));
  document.querySelectorAll("[data-q]").forEach((b) => b.addEventListener("click", () => {
    const q = $("#qty");
    q.value = Math.min(Math.max(1, (+q.value || 1) + +b.dataset.q), Math.max(1, p.stock));
  }));
  const qty = () => Math.min(Math.max(1, +$("#qty").value || 1), Math.max(1, p.stock));
  $("#cart-btn").addEventListener("click", () => { addToCart(p, qty()); toast("Added to cart.", "success", 2500); });
  $("#buy-btn").addEventListener("click", () => { addToCart(p, qty()); location.href = "checkout.html"; });
  $("#wish-btn").addEventListener("click", async () => {
    if (!auth.currentUser) { location.href = `login.html?next=${encodeURIComponent(here)}`; return; }
    try {
      await addToWishlist({ productId: p.id, name: p.name, price: p.price, image: "", url: here });
      $("#wish-btn").classList.add("is-on");
      toast("Added to your wishlist.", "success", 2500);
    } catch (err) { toast(authErrorMessage(err), "error"); }
  });
}

try {
  const p = id ? await getProduct(id) : null;
  if (!p || !p.active) {
    $("#pdp").innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty__mark"></div><h3>Product not found</h3><p>It may have been removed.</p><a class="btn btn--ghost" href="shop.html">Back to shop</a></div>`;
  } else {
    await render(p);
    related = (await listProducts()).filter((x) => x.category === p.category && x.id !== p.id).slice(0, 4);
    if (related.length) {
      $("#related").innerHTML = related.map(productCard).join("");
      $("#related-wrap").hidden = false;
      bindCardActions($("#related"), () => related);
    }
  }
} catch (err) {
  $("#pdp").innerHTML = `<p class="muted">Could not load product: ${esc(authErrorMessage(err))}</p>`;
}
