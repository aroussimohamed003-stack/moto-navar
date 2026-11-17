/** MOTO NAVAR – cart page. */
import { getCart, setQty, removeFromCart, cartSubtotal } from "./cart.js";
import { getProduct, formatPrice } from "./products.js";
import { getSettings, deliveryFeeFor } from "./store-settings.js";
import { esc } from "./product-card.js";

const $ = (s) => document.querySelector(s);
const thumbs = {};
const s = await getSettings();

async function loadThumbs(items) {
  await Promise.all(items.filter((i) => !(i.productId in thumbs)).map(async (i) => {
    try { thumbs[i.productId] = (await getProduct(i.productId))?.images?.[0] || ""; } catch { thumbs[i.productId] = ""; }
  }));
}

async function render() {
  const items = getCart();
  if (!items.length) {
    $("#cart-items").innerHTML = `<div class="empty"><div class="empty__mark"></div><h3>Your cart is empty</h3><p>Find your next ride or the right gear.</p><a class="btn" href="shop.html">Go shopping</a></div>`;
    $("#summary").hidden = true;
    return;
  }
  await loadThumbs(items);
  $("#cart-items").innerHTML = items.map((i) => `
    <div class="cart-row">
      <a class="cart-row__img" href="product.html?id=${encodeURIComponent(i.productId)}">${thumbs[i.productId] ? `<img src="${esc(thumbs[i.productId])}" alt="">` : ""}</a>
      <div class="cart-row__info">
        <a href="product.html?id=${encodeURIComponent(i.productId)}"><b>${esc(i.name)}</b></a>
        <span class="muted small">${esc(i.category || "")} · ${formatPrice(i.price)}</span>
        <button class="link-btn link-btn--danger" data-remove="${esc(i.productId)}">Remove</button>
      </div>
      <div class="qty qty--sm"><button data-dec="${esc(i.productId)}" aria-label="Less">−</button><input value="${i.qty}" readonly aria-label="Quantity"><button data-inc="${esc(i.productId)}" aria-label="More">+</button></div>
      <b class="cart-row__total">${formatPrice(i.price * i.qty)}</b>
    </div>`).join("");
  const sub = cartSubtotal(items);
  const fee = deliveryFeeFor(sub, s);
  $("#summary").hidden = false;
  $("#summary").innerHTML = `
    <h3>Order summary</h3>
    <div class="sum-row"><span>Subtotal</span><b>${formatPrice(sub)}</b></div>
    <div class="sum-row"><span>Delivery</span><b>${fee ? formatPrice(fee) : "Free"}</b></div>
    ${s.freeDeliveryFrom && fee ? `<p class="muted small">Free delivery from ${formatPrice(s.freeDeliveryFrom)}.</p>` : ""}
    <div class="sum-row sum-row--total"><span>Total</span><b>${formatPrice(sub + fee)}</b></div>
    <a class="btn btn--block btn--display" href="checkout.html">Checkout</a>
    <a class="btn btn--block btn--ghost" href="shop.html" style="margin-top:10px">Continue shopping</a>`;
}

$("#cart-items").addEventListener("click", (e) => {
  const items = getCart();
  const t = e.target.closest("[data-remove],[data-inc],[data-dec]");
  if (!t) return;
  if (t.dataset.remove) removeFromCart(t.dataset.remove);
  const id = t.dataset.inc || t.dataset.dec;
  if (id) {
    const it = items.find((i) => i.productId === id);
    setQty(id, it.qty + (t.dataset.inc ? 1 : -1));
  }
  render();
});

render();
