/** MOTO NAVAR – shopping cart (kept in this browser). */
const KEY = "mn.cart";

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
function write(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent("cart:change", { detail: items }));
}

export const getCart = () => read();
export const cartCount = () => read().reduce((n, i) => n + i.qty, 0);
export const cartSubtotal = (items = read()) => Math.round(items.reduce((n, i) => n + i.price * i.qty, 0) * 1000) / 1000;

/** Store only small fields; the image is a small thumbnail reference. */
export function addToCart(p, qty = 1) {
  const items = read();
  const found = items.find((i) => i.productId === p.id);
  const max = Math.max(1, p.stock || 1);
  if (found) found.qty = Math.min(max, found.qty + qty);
  else items.push({ productId: p.id, name: p.name, price: p.price, qty: Math.min(max, qty), stock: p.stock, category: p.category });
  write(items);
}

export function setQty(productId, qty) {
  const items = read();
  const it = items.find((i) => i.productId === productId);
  if (!it) return;
  it.qty = Math.max(1, Math.min(it.stock || 99, qty));
  write(items);
}

export function removeFromCart(productId) {
  write(read().filter((i) => i.productId !== productId));
}

export function clearCart() {
  write([]);
}

// Keep the header count in sync across tabs.
window.addEventListener("storage", (e) => {
  if (e.key === KEY) window.dispatchEvent(new CustomEvent("cart:change", { detail: read() }));
});
