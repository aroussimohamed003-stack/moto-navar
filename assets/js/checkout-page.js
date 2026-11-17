/** MOTO NAVAR – checkout (signed-in customers, cash on delivery). */
import { requireAuth } from "./auth-guard.js";
import { getCart, cartSubtotal, clearCart } from "./cart.js";
import { getProduct, formatPrice } from "./products.js";
import { getProfile, listAddresses, saveAddress, createOrder } from "./customer-data.js";
import { getSettings, deliveryFeeFor, GOVERNORATES } from "./store-settings.js";
import { toast, setLoading, showFieldError, clearFieldErrors, authErrorMessage } from "./ui.js";
import { esc } from "./product-card.js";

const $ = (s) => document.querySelector(s);
const form = $("#checkout-form");
const user = await requireAuth();
const s = await getSettings();
let items = getCart();

if (!items.length) {
  location.replace("cart.html");
} else {
  init();
}

async function init() {
  $("#c-gov").innerHTML = `<option value="">Choose…</option>` + GOVERNORATES.map((g) => `<option>${esc(g)}</option>`).join("");

  // Re-check live prices and stock from the catalogue.
  const fresh = await Promise.all(items.map(async (i) => ({ i, p: await getProduct(i.productId).catch(() => null) })));
  const problems = [];
  items = fresh.filter(({ i, p }) => {
    if (!p || !p.active || p.stock <= 0) { problems.push(`${i.name} is no longer available`); return false; }
    if (i.qty > p.stock) { problems.push(`${i.name}: only ${p.stock} left`); i.qty = p.stock; }
    i.price = p.price;
    i.name = p.name;
    return true;
  }).map(({ i }) => i);
  if (problems.length) toast(problems.join(" · "), "warning", 8000);

  const profile = await getProfile().catch(() => null);
  const addresses = await listAddresses().catch(() => []);
  form.fullName.value = profile?.fullName || user.displayName || "";
  form.phone.value = profile?.phone || "";
  if (addresses.length) {
    $("#saved-wrap").hidden = false;
    $("#saved").innerHTML = `<option value="">New address</option>` + addresses.map((a) => `<option value="${esc(a.id)}">${esc(a.label || "Address")} — ${esc([a.line1, a.city].filter(Boolean).join(", "))}</option>`).join("");
    const fill = (a) => {
      if (!a) return;
      Object.assign(form.fullName, { value: a.fullName || form.fullName.value });
      form.phone.value = a.phone || form.phone.value;
      form.line1.value = a.line1 || "";
      form.city.value = a.city || "";
      form.region.value = GOVERNORATES.includes(a.region) ? a.region : "";
      form.postalCode.value = a.postalCode || "";
    };
    $("#saved").addEventListener("change", (e) => { fill(addresses.find((a) => a.id === e.target.value)); form.save.checked = !e.target.value; });
    const def = addresses.find((a) => a.isDefault) || addresses[0];
    $("#saved").value = def.id;
    fill(def);
    form.save.checked = false;
  }
  renderSummary();
}

function totals() {
  const subtotal = cartSubtotal(items);
  const deliveryFee = deliveryFeeFor(subtotal, s);
  return { subtotal, deliveryFee, total: Math.round((subtotal + deliveryFee) * 1000) / 1000 };
}

function renderSummary() {
  const t = totals();
  $("#summary").innerHTML = `
    <h3>Your order</h3>
    ${items.map((i) => `<div class="sum-item"><span>${esc(i.name)} <span class="muted">× ${i.qty}</span></span><b>${formatPrice(i.price * i.qty)}</b></div>`).join("")}
    <div class="sum-row"><span>Subtotal</span><b>${formatPrice(t.subtotal)}</b></div>
    <div class="sum-row"><span>Delivery</span><b>${t.deliveryFee ? formatPrice(t.deliveryFee) : "Free"}</b></div>
    <div class="sum-row sum-row--total"><span>Total</span><b>${formatPrice(t.total)}</b></div>
    <button class="btn btn--block btn--display" id="place" ${items.length ? "" : "disabled"}><span>Place order</span><span class="spinner" aria-hidden="true"></span></button>
    <p class="muted small" style="margin-top:12px">By placing your order you agree to be contacted by phone to confirm delivery.</p>`;
  $("#place").addEventListener("click", place);
}

async function place() {
  clearFieldErrors(form);
  const v = (n) => form[n].value.trim();
  let ok = true;
  if (v("fullName").length < 2) { showFieldError(form.fullName, "Enter your full name."); ok = false; }
  if (!/^\+?[\d\s().-]{8,20}$/.test(v("phone"))) { showFieldError(form.phone, "Enter a valid phone number."); ok = false; }
  if (v("line1").length < 4) { showFieldError(form.line1, "Enter your address."); ok = false; }
  if (!v("region")) { showFieldError(form.region, "Choose your governorate."); ok = false; }
  if (v("city").length < 2) { showFieldError(form.city, "Enter your city."); ok = false; }
  if (!ok) { form.scrollIntoView({ behavior: "smooth" }); return; }

  const btn = $("#place");
  setLoading(btn, true);
  const address = { fullName: v("fullName"), phone: v("phone"), line1: v("line1"), line2: "", city: v("city"), region: v("region"), postalCode: v("postalCode"), country: "Tunisia" };
  try {
    const t = totals();
    const orderId = await createOrder({
      items: items.map((i) => ({ productId: i.productId, name: i.name, price: i.price, qty: i.qty })),
      subtotal: t.subtotal,
      deliveryFee: t.deliveryFee,
      total: t.total,
      currency: "TND",
      shippingAddress: address,
      note: v("note"),
      paymentMethod: "cash_on_delivery",
    });
    if (form.save.checked) await saveAddress({ ...address, label: "Home", isDefault: true }).catch(() => {});
    clearCart();
    location.replace(`order-success.html?id=${encodeURIComponent(orderId)}`);
  } catch (err) {
    toast(authErrorMessage(err), "error", 7000);
    setLoading(btn, false);
  }
}
