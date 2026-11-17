# MOTO NAVAR – Authentication setup guide

This website uses **real Firebase Authentication**. Nothing is simulated. Each
sign-in button starts working as soon as you enable and configure its provider
in the steps below. Until then, the button shows a clear error such as
"Facebook sign-in is not enabled yet".

> **Secrets rule:** client secrets, the Apple `.p8` private key and
> service-account JSON files go **only** into the Firebase Console (or stay on
> your own computer for `admin-tools`). Never put them in the website files.
> The values in `assets/js/firebase-config.js` are public IDs, not secrets.

---

## 0. What's in this folder

| File | Purpose |
|---|---|
| `login.html` | Sign-in page: email/password, Remember me, Forgot password, 4 social buttons |
| `register.html` | Account creation (email or social), password strength, terms |
| `forgot-password.html` | Password reset by email |
| `account.html` | Customer dashboard: profile, photo, orders + tracking, wishlist, addresses, sign-in methods, password, logout |
| `assets/js/firebase-config.js` | **The only file you edit**: your Firebase project keys |
| `assets/js/firebase.js` | Loads the Firebase SDK (v13.4.0) |
| `assets/js/auth-service.js` | Providers, popup/redirect flows, persistence, account linking, Firestore profile |
| `assets/js/customer-data.js` | Orders, wishlist and addresses API (also for your shop pages) |
| `assets/js/auth-guard.js` | Protects private pages |
| `assets/js/auth-nav.js` | "Sign in" / avatar widget for your shop header |
| `firestore.rules` | Server-side security rules (the actual protection) |
| `firestore.indexes.json` | Index used by the orders list |
| `firebase.json` | Firebase Hosting + rules deployment config |
| `admin.html` | **Admin panel**: list of all registered accounts with emails, search, CSV export, delete |
| `functions/` | Cloud Functions used by the admin panel (list all logins, delete an account) |
| `admin-tools/` | Grants admin rights. Run on your computer only and **never upload it** |

---

## 1. Create the Firebase project

1. Open <https://console.firebase.google.com>, then **Add project** and name it, for example `moto-navar`.
2. **Project settings → General → Your apps → Web (`</>`)**. Register the app as "MOTO NAVAR Web".
3. Copy the `firebaseConfig` values into `assets/js/firebase-config.js`. Replace every `YOUR_...` value.
4. **Build → Authentication → Get started.**
5. **Build → Firestore Database → Create database**. Choose **Production mode** and a region close to Tunisia (for example `europe-west1`).

### Settings that apply to all providers

**Authentication → Settings**:

- **Authorized domains**: add every domain the site runs on.
  - `localhost` (for testing; it's usually there already)
  - `motonavar.com` and `www.motonavar.com` (your real domain)
  - `YOUR_PROJECT_ID.web.app` and `YOUR_PROJECT_ID.firebaseapp.com` (already there)
- **User account linking**: keep **"Link accounts that use the same email"**.
  This setting is what triggers the automatic account-linking flow. One
  customer with one email gets one account, even if they use several providers.
- **User actions → Email enumeration protection**: keep it **on**. The pages are
  built to show generic messages, such as "If an account exists…".
- Optional: **Password policy**. Require at least 8 characters with letters and numbers, which matches the site's checks.

**Authentication → Templates**: set the sender name to *MOTO NAVAR* and customize
the verification and password-reset emails.

### The OAuth redirect URL (you'll need it for every provider)

```
https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/handler
```

If you later change `authDomain` to your own domain (see section 8), also add
`https://motonavar.com/__/auth/handler` in each provider's console.

---

## 2. Google

1. **Authentication → Sign-in method → Add new provider → Google → Enable.**
2. Set the **public-facing name** (MOTO NAVAR) and the **support email**, then save.
3. Recommended: in Google Cloud Console, go to **Google Auth Platform → Branding**.
   Add the app name, logo, home page, privacy policy URL and your authorized
   domain, then **publish** the app. Otherwise users see your project ID on the consent screen.

No secret is needed. Firebase creates the Google OAuth client for you.

---

## 3. Facebook

**Facebook Developer side** (<https://developers.facebook.com>):

1. **My Apps → Create app**. Choose the use case **"Authenticate and request data from users with Facebook Login"**.
2. **App settings → Basic**:
   - Copy the **App ID** and the **App Secret** (click *Show*).
   - Fill in the **Privacy Policy URL**, **Terms URL**, **App domains** (`motonavar.com`) and **Category**.
3. **Facebook Login → Settings**:
   - **Valid OAuth Redirect URIs**: `https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/handler`
   - Keep *Client OAuth login* and *Web OAuth login* **on**.
4. Permissions: `email` and `public_profile` (the site requests both).
5. Switch the app from **Development** to **Live** mode. Before that,
   only people listed as app admins, developers or testers can sign in.

**Firebase side:** **Authentication → Sign-in method → Facebook → Enable**. Paste the
**App ID** and **App Secret**, then save. Firebase shows the redirect URI. It must match step 3 exactly.

---

## 4. Microsoft (Hotmail, Outlook.com, Live, MSN, and work/school accounts)

**Microsoft side:** go to <https://entra.microsoft.com> (or portal.azure.com), then **Identity → Applications → App registrations → New registration**.

1. **Name:** MOTO NAVAR.
2. **Supported account types:** choose
   **"Accounts in any organizational directory and personal Microsoft accounts"**.
   This is required for Hotmail, Outlook and Live accounts.
3. **Redirect URI:** platform **Web**, value
   `https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/handler`.
4. After you create the app, copy the **Application (client) ID** from the *Overview* page.
5. **Certificates & secrets → Client secrets → New client secret**. Copy the **Value**
   right away; it's shown once (the *Secret ID* is not what you need). Note the expiry date
   and create a new secret before it expires, or Microsoft sign-in will stop working.
6. Optional: under **Branding & properties**, add the logo, home page, terms and privacy URLs.

**Firebase side:** **Sign-in method → Microsoft → Enable**. Paste the **Application ID**
and the **Application secret**, then save.

**About the "issuer"/tenant:** the built-in Microsoft provider does not ask for an
issuer. The tenant is set in the code (`tenant: "common"` in
`auth-service.js`), which accepts both personal and work accounts. To allow
only personal accounts, change it to `"consumers"`. Do **not** set Microsoft up as a
generic OIDC provider. (If you ever do, the issuer would be
`https://login.microsoftonline.com/<tenant-id>/v2.0`.)

> Microsoft does not give Firebase a profile photo URL, so Microsoft users start
> with their initial as an avatar and can upload a photo on the account page.

---

## 5. Apple

You need a paid **Apple Developer Program** membership.

**Apple side** (<https://developer.apple.com/account> → Certificates, Identifiers & Profiles):

1. **Team ID:** shown at the top right of the Membership page (10 characters).
2. **Identifiers → + → App IDs.** Create an App ID (for example `com.motonavar.app`) and
   tick **Sign in with Apple**.
3. **Identifiers → + → Services IDs.** Create a Services ID such as `com.motonavar.web`.
   This is the **Services ID** that Firebase asks for.
   - Tick **Sign in with Apple → Configure**:
     - **Primary App ID:** the App ID from step 2.
     - **Domains and Subdomains:** `YOUR_PROJECT_ID.firebaseapp.com` and `motonavar.com`.
     - **Return URLs:** `https://YOUR_PROJECT_ID.firebaseapp.com/__/auth/handler`.
4. **Keys → +.** Name the key "MOTO NAVAR Sign in with Apple" and tick **Sign in with Apple**
   (Configure → choose the primary App ID). Download the `.p8` file. **You can only
   download it once.** Note the **Key ID**.
5. **Private email relay:** in **Services → Sign in with Apple for Email Communication**,
   register `noreply@YOUR_PROJECT_ID.firebaseapp.com` (or your custom
   sender domain). Without this, verification and reset emails don't reach
   customers who chose "Hide my email".

**Firebase side:** **Sign-in method → Apple → Enable**.

- **Services ID:** `com.motonavar.web`
- **OAuth code flow configuration:** **Apple team ID**, **Key ID**, and the **private key**
  (open the `.p8` file in Notepad and paste its full content, including the BEGIN/END lines).
- Save. Keep the `.p8` file somewhere safe and offline. Do **not** put it in the site folder.

> Apple shares the customer's name only the first time they sign in. Customers
> can always edit their name on the account page.

---

## 6. Email and password

**Sign-in method → Email/Password → Enable** (leave "Email link" off).
Registration sends a verification email automatically. The account page shows a
banner until the address is verified. **Forgot password** uses Firebase's
secure reset email.

---

## 7. Firestore security rules and index

Pick one way:

- **Console:** in **Firestore → Rules**, paste the content of `firestore.rules` and click **Publish**.
  For the index, open the account page once while signed in. If the index is missing,
  the browser console shows a link that creates it in one click. You can also add it
  manually in **Firestore → Indexes**: collection `orders`, fields `userId` (Ascending)
  and `createdAt` (Descending).
- **CLI:** in this folder, run
  ```
  npm install -g firebase-tools
  firebase login
  firebase use --add            (choose your project)
  firebase deploy --only firestore
  ```

What the rules guarantee:

- A customer can read and edit **only their own** profile, addresses and wishlist.
- A profile can only be created with `role: "customer"`. The `role`, `uid`,
  `createdAt` and `provider` fields can **never** be changed by the customer.
- Customers can place orders for themselves, always as `pending`, and read only their
  own orders. Status, tracking number and payment fields are **admin-only**.
- Admin rights come only from a server-issued custom claim (`admin: true`), never from data the browser sends.
- Everything not listed in the rules is closed.

---

## 8. Hosting, testing and the redirect flow

- **Test locally over http, not by double-clicking the file.** ES modules don't run from `file://`.
  In this folder, run `npx serve .` (or use VS Code "Live Server"), then open
  `http://localhost:3000/login.html`. `localhost` must be in the Authorized domains.
- **Deploy:** run `firebase deploy --only hosting` (the `admin-tools` folder and config
  files are excluded automatically). You can also upload the files to your own host.
  In that case, add its domain to the Authorized domains.
- The site signs in with a **popup**. It falls back to a full-page **redirect** if the
  popup is blocked, or inside the Facebook or Instagram in-app browser. Browsers now block
  third-party storage, so for the redirect flow to work reliably you should host on
  **Firebase Hosting with your own domain** and then:
  1. Set `authDomain: "motonavar.com"` in `firebase-config.js`.
  2. Add `https://motonavar.com/__/auth/handler` as a redirect URI for Facebook,
     Microsoft and Apple (Return URL + domain), and in Google Cloud for Google's OAuth client.

---

## 9. Lock down the public API key (recommended)

In Google Cloud Console, open **APIs & Services → Credentials →** the "Browser key"
created by Firebase, then set **Application restrictions → Websites** to:

```
https://motonavar.com/*
https://www.motonavar.com/*
https://YOUR_PROJECT_ID.web.app/*
https://YOUR_PROJECT_ID.firebaseapp.com/*
http://localhost:*/*
```

Optional extra protection: **Firebase App Check** with reCAPTCHA Enterprise.

---

## 10. Administrators (trusted people only)

The website has no button that grants admin rights, and it never will. The site
owner runs this on their own computer:

1. In Firebase Console, go to **Project settings → Service accounts → Generate new private key**.
   Save the JSON file **outside** the website folder, for example `C:\secure\motonavar-sa.json`.
2. Run:
   ```
   cd admin-tools
   npm install
   set GOOGLE_APPLICATION_CREDENTIALS=C:\secure\motonavar-sa.json
   node set-admin.js grant owner@motonavar.com
   node set-admin.js list
   node set-admin.js revoke someone@example.com
   ```
3. The person must sign out and sign back in for the change to take effect.

### Admin panel: `admin.html` (registered accounts)

Once your account has the admin claim, an **"Admin · Accounts"** button appears in
your account sidebar. You can also open `admin.html` directly. Anyone else sees
"Access denied", and the server refuses their requests anyway.

The panel shows:

- every registered account: name, **email** (click it to send a message), phone, verified status, sign-in methods, role, registration date and last login
- search and filter by sign-in method, **Copy emails**, and **Export CSV** (opens in Excel)
- a **Delete** button on each customer. You must type `DELETE` to confirm. It removes
  the login, profile, addresses and wishlist. Orders are kept (marked `customerDeleted`)
  for your accounting. Admin accounts and your own account can't be deleted from the panel.
  Each deletion is recorded in the `adminLogs` collection.

**Enable deletion (one time):** deleting a Firebase login is only allowed from a
server, so deploy the Cloud Functions. This needs the **Blaze (pay-as-you-go)**
plan; for a shop this size it normally stays within the free quota.

```
firebase deploy --only functions,firestore
```

Without the functions, the panel still lists the customer profiles and their emails
from the database, and shows a note at the top. In that case you can delete from
your computer instead:

```
cd admin-tools
node set-admin.js users                        (list every account and email)
node set-admin.js delete customer@example.com
```

---

## 11. Connecting it to the rest of the MOTO NAVAR shop

**Header account button** (every page):

```html
<div id="mn-account-nav"></div>
<link rel="stylesheet" href="assets/css/auth.css"> <!-- or copy the .mn-nav-* rules -->
<script type="module" src="assets/js/auth-nav.js"></script>
```

**Protect any other private page** (for example `checkout.html`):

```html
<script type="module">
  import { requireAuth } from "./assets/js/auth-guard.js";
  const user = await requireAuth();   // redirects to login.html?next=checkout.html if signed out
</script>
```

**Wishlist "heart" button on a product page:**

```html
<script type="module">
  import { auth } from "./assets/js/firebase.js";
  import { addToWishlist } from "./assets/js/customer-data.js";
  document.querySelector("#wish-btn").onclick = async () => {
    if (!auth.currentUser) return location.href = "login.html?next=" + encodeURIComponent(location.pathname.slice(1));
    await addToWishlist({ productId: "helmet-x1", name: "Helmet X1", price: 459, image: "img/helmet-x1.jpg", url: "product.html?id=helmet-x1" });
  };
</script>
```

**Placing an order at checkout:** `createOrder({ items, total, currency, shippingAddress })`
from `customer-data.js`. Always re-check prices and totals in your back office
or a Cloud Function before you ship, and never trust totals sent by the browser.

**Updating order tracking (admin):** set these fields on `orders/{id}`:
`status` (`pending` → `confirmed` → `processing` → `shipped` → `out_for_delivery` →
`delivered`, or `cancelled`), `trackingNumber`, `carrier`, `trackingUrl`, and
`statusHistory: [{ status, at, note }]`. The customer's timeline updates automatically.

---

## 12. Final checklist

- [ ] `firebase-config.js` filled in (the yellow "not configured" banner disappears)
- [ ] Google, Facebook, Microsoft, Apple and Email/Password enabled in Sign-in method
- [ ] Each provider's console has the exact `/__/auth/handler` redirect URL
- [ ] Facebook app switched to **Live**
- [ ] Microsoft app supports **personal accounts**, and you noted the secret's expiry date
- [ ] Apple: Services ID, Team ID, Key ID, `.p8` content, email relay sender registered
- [ ] Authorized domains include your real domain (and `localhost` for testing)
- [ ] "Link accounts that use the same email" enabled
- [ ] `firestore.rules` published and the `orders` index created
- [ ] Cloud Functions deployed (needed for deleting accounts in `admin.html`)
- [ ] Your own account granted admin with `set-admin.js grant`
- [ ] API key restricted to your domains
- [ ] Service-account JSON and `.p8` key stored offline, **not** in the site folder
