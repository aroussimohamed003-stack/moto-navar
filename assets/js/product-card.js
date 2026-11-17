/** MOTO NAVAR – product card used on home and shop pages. */
import { auth } from "./firebase.js";
import { formatPrice, VEHICLE_CATEGORIES } from "./products.js";
import { addToWishlist } from "./customer-data.js";
import { addToCart } from "./cart.js";
import { toast, authErrorMessage } from "./ui.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function productCard(p) {
  const sale = p.oldPrice > p.price;
  const url = `product.html?id=${encodeURIComponent(p.id)}`;
  const s = p.specs || {};
  const chips = VEHICLE_CATEGORIES.includes(p.category)
    ? [s.engineCc && `${s.engineCc} cc`, s.year, s.mileageKm !== undefined && p.condition !== "New" && `${Number(s.mileageKm).toLocaleString("fr-TN")} km`, s.transmission].filter(Boolean)
    : [];
  return `
  <article class="pcard">
    <a class="pcard__img" href="${url}">
      ${p.images?.[0] ? `<img src="${esc(p.images[0])}" alt="${esc(p.name)}" loading="lazy">` : `<span class="pcard__noimg"></span>`}
      ${sale ? `<span class="pcard__badge">-${Math.round((1 - p.price / p.oldPrice) * 100)}%</span>` : ""}
      ${p.condition && p.condition !== "New" ? `<span class="pcard__badge pcard__badge--cond">${esc(p.condition)}</span>` : ""}
      ${p.stock <= 0 ? `<span class="pcard__badge pcard__badge--out">Out of stock</span>` : ""}
    </a>
    <button class="pcard__heart" data-wish="${esc(p.id)}" title="Add to wishlist" aria-label="Add to wishlist"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg></button>
    <div class="pcard__body">
      <span class="pcard__cat">${esc(p.category || "")}${p.brand ? ` · ${esc(p.brand)}` : ""}</span>
      <a class="pcard__name" href="${url}">${esc(p.name)}</a>
      ${chips.length ? `<div class="pcard__specs">${chips.map((c) => `<span>${esc(c)}</span>`).join("")}</div>` : ""}
      <div class="pcard__foot">
        <div class="pcard__price"><b>${formatPrice(p.price)}</b>${sale ? `<s>${formatPrice(p.oldPrice)}</s>` : ""}</div>
        <button class="pcard__cart" data-cart="${esc(p.id)}" ${p.stock > 0 ? "" : "disabled"} title="Add to cart" aria-label="Add to cart"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg></button>
      </div>
    </div>
  </article>`;
}

/** Wire wishlist + cart buttons inside a container. */
export function bindCardActions(container, getProducts) {
  container.addEventListener("click", async (e) => {
    const wishId = e.target.closest("[data-wish]")?.dataset.wish;
    const cartId = e.target.closest("[data-cart]")?.dataset.cart;
    const p = getProducts().find((x) => x.id === (wishId || cartId));
    if (!p) return;
    if (cartId) {
      addToCart(p, 1);
      toast(`${p.name} added to cart.`, "success", 2500);
      return;
    }
    if (!auth.currentUser) {
      location.href = `login.html?next=${encodeURIComponent(location.pathname.split("/").pop() + location.search)}`;
      return;
    }
    try {
      await addToWishlist({ productId: p.id, name: p.name, price: p.price, image: "", url: `product.html?id=${encodeURIComponent(p.id)}` });
      e.target.closest("[data-wish]").classList.add("is-on");
      toast("Added to your wishlist.", "success", 2500);
    } catch (err) {
      toast(authErrorMessage(err), "error");
    }
  });
}
