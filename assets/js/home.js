/** MOTO NAVAR – home page: banner, categories, featured motorcycles, latest. */
import { CATEGORIES, VEHICLE_CATEGORIES, listProducts } from "./products.js";
import { productCard, bindCardActions, esc } from "./product-card.js";
import { getSettings } from "./store-settings.js";
import { authErrorMessage } from "./ui.js";

const $ = (s) => document.querySelector(s);
let products = [];

const s = await getSettings();
$("#banner-kicker").textContent = s.bannerKicker;
$("#banner-title").textContent = s.bannerTitle;
$("#banner-text").textContent = s.bannerSubtitle;
$("#banner-cta").textContent = s.bannerCta;
if (s.bannerLink && !/^\s*javascript:/i.test(s.bannerLink)) $("#banner-cta").href = s.bannerLink;
if (s.bannerImage) {
  $("#banner-bg").style.backgroundImage = `url("${s.bannerImage.replace(/"/g, "%22")}")`;
  $("#banner").classList.add("has-image");
}

const empty = (t) => `<div class="empty" style="grid-column:1/-1"><div class="empty__mark"></div><h3>${t}</h3><p>New stock is coming soon.</p></div>`;

try {
  products = await listProducts();
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, products.filter((p) => p.category === c.id).length]));
  $("#cat-grid").innerHTML = CATEGORIES.map((c) => `
    <a class="cat-tile" href="shop.html?category=${encodeURIComponent(c.id)}">
      <span class="cat-tile__icon">${c.icon}</span>
      <b>${esc(c.label)}</b>
      <span class="muted small">${counts[c.id]} product${counts[c.id] === 1 ? "" : "s"}</span>
    </a>`).join("");
  const motos = products.filter((p) => VEHICLE_CATEGORIES.includes(p.category)).slice(0, 8);
  $("#moto-grid").innerHTML = motos.length ? motos.map(productCard).join("") : empty("No motorcycles listed yet");
  const latest = [...products].sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)).slice(0, 8);
  $("#latest-grid").innerHTML = latest.length ? latest.map(productCard).join("") : empty("No products yet");
} catch (err) {
  $("#latest-grid").innerHTML = `<p class="muted">Could not load products: ${esc(authErrorMessage(err))}</p>`;
}
bindCardActions($("#moto-grid"), () => products);
bindCardActions($("#latest-grid"), () => products);
