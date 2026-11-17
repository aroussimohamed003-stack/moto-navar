/**
 * MOTO NAVAR – grant or revoke administrator rights.
 *
 * Run ONLY on a trusted computer by the site owner. Requires a Firebase
 * service-account key, which is a SECRET: never upload it to the website,
 * never commit it to Git, never send it by email/chat.
 *
 *   cd admin-tools
 *   npm install
 *   set GOOGLE_APPLICATION_CREDENTIALS=C:\secure\motonavar-service-account.json   (Windows)
 *   export GOOGLE_APPLICATION_CREDENTIALS=/secure/motonavar-service-account.json  (macOS/Linux)
 *   node set-admin.js grant  owner@example.com
 *   node set-admin.js revoke someone@example.com
 *   node set-admin.js list
 *   node set-admin.js users                     (list all accounts + emails)
 *   node set-admin.js delete customer@example.com
 *
 * The user must sign out and back in (or wait up to 1 hour) for the new
 * claim to reach their ID token.
 */
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp({ credential: applicationDefault() });
const auth = getAuth();
const db = getFirestore();

const [, , action, email] = process.argv;

async function setAdmin(email, isAdmin) {
  const user = await auth.getUserByEmail(email);
  const claims = { ...(user.customClaims || {}) };
  if (isAdmin) claims.admin = true;
  else delete claims.admin;
  await auth.setCustomUserClaims(user.uid, claims);
  // Mirror on the profile for display purposes only (rules use the claim).
  await db.doc(`users/${user.uid}`).set(
    { role: isAdmin ? "admin" : "customer", roleUpdatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  // Force existing sessions to pick up the change.
  await auth.revokeRefreshTokens(user.uid);
  console.log(`${isAdmin ? "Granted" : "Revoked"} admin for ${email} (uid ${user.uid}).`);
}

async function listAdmins() {
  let token;
  do {
    const page = await auth.listUsers(1000, token);
    page.users.filter((u) => u.customClaims?.admin).forEach((u) => console.log(`${u.email}  ${u.uid}`));
    token = page.pageToken;
  } while (token);
}

async function listUsers() {
  let token;
  do {
    const page = await auth.listUsers(1000, token);
    page.users.forEach((u) => console.log(`${(u.email || "(no email)").padEnd(40)} ${u.providerData.map((p) => p.providerId).join(",").padEnd(30)} ${u.metadata.creationTime}`));
    token = page.pageToken;
  } while (token);
}

async function deleteAccount(email) {
  const user = await auth.getUserByEmail(email);
  if (user.customClaims?.admin) throw new Error("This is an admin account. Revoke admin first.");
  await auth.deleteUser(user.uid);
  await db.recursiveDelete(db.doc(`users/${user.uid}`));
  const orders = await db.collection("orders").where("userId", "==", user.uid).get();
  const batch = db.batch();
  orders.forEach((d) => batch.update(d.ref, { customerDeleted: true, customerDeletedAt: FieldValue.serverTimestamp() }));
  if (!orders.empty) await batch.commit();
  console.log(`Deleted ${email} (uid ${user.uid}). ${orders.size} order(s) kept and flagged.`);
}

try {
  if (action === "grant" && email) await setAdmin(email, true);
  else if (action === "revoke" && email) await setAdmin(email, false);
  else if (action === "list") await listAdmins();
  else if (action === "users") await listUsers();
  else if (action === "delete" && email) await deleteAccount(email);
  else console.log("Usage: node set-admin.js grant|revoke|delete <email>  |  list  |  users");
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
}
