/**
 * MOTO NAVAR – Cloud Functions (server side, trusted).
 *
 * adminDeleteUser: permanently deletes a customer account.
 *   - deletes the Firebase Authentication login (so the email can no longer sign in)
 *   - deletes users/{uid} and its sub-collections (addresses, wishlist)
 *   - orders are KEPT for accounting, but marked customerDeleted: true
 *
 * Only callers whose ID token carries the custom claim admin: true are allowed.
 * Deploy:  firebase deploy --only functions   (requires the Blaze plan)
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

initializeApp();
const auth = getAuth();
const db = getFirestore();

const REGION = "europe-west1";

function assertAdmin(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in first.");
  if (request.auth.token.admin !== true) throw new HttpsError("permission-denied", "Administrators only.");
}

export const adminDeleteUser = onCall({ region: REGION }, async (request) => {
  assertAdmin(request);

  const uid = String(request.data?.uid || "").trim();
  if (!uid) throw new HttpsError("invalid-argument", "Missing uid.");
  if (uid === request.auth.uid) throw new HttpsError("failed-precondition", "You cannot delete your own account from the admin panel.");

  // Never let one admin delete another admin by mistake.
  let target = null;
  try {
    target = await auth.getUser(uid);
  } catch (err) {
    if (err.code !== "auth/user-not-found") throw new HttpsError("internal", err.message);
  }
  if (target?.customClaims?.admin) {
    throw new HttpsError("failed-precondition", "This account is an administrator. Revoke admin rights first (admin-tools/set-admin.js revoke).");
  }

  // 1. Auth login
  if (target) await auth.deleteUser(uid);

  // 2. Profile + sub-collections
  await db.recursiveDelete(db.doc(`users/${uid}`));

  // 3. Keep orders, flag them
  const orders = await db.collection("orders").where("userId", "==", uid).get();
  const batch = db.batch();
  orders.forEach((d) => batch.update(d.ref, { customerDeleted: true, customerDeletedAt: FieldValue.serverTimestamp() }));
  if (!orders.empty) await batch.commit();

  // 4. Audit log
  await db.collection("adminLogs").add({
    action: "deleteUser",
    targetUid: uid,
    targetEmail: target?.email || null,
    by: request.auth.uid,
    byEmail: request.auth.token.email || null,
    at: FieldValue.serverTimestamp(),
  });

  return { ok: true, uid, email: target?.email || null, ordersFlagged: orders.size };
});

/**
 * adminListAuthUsers: lists ALL Firebase Authentication logins (including
 * people whose Firestore profile is missing), with email and providers.
 */
export const adminListAuthUsers = onCall({ region: REGION }, async (request) => {
  assertAdmin(request);
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      users.push({
        uid: u.uid,
        email: u.email || "",
        emailVerified: u.emailVerified,
        displayName: u.displayName || "",
        photoURL: u.photoURL || "",
        phone: u.phoneNumber || "",
        disabled: u.disabled,
        admin: u.customClaims?.admin === true,
        providers: u.providerData.map((p) => p.providerId),
        createdAt: u.metadata.creationTime,
        lastLogin: u.metadata.lastSignInTime,
      });
    }
    pageToken = page.pageToken;
  } while (pageToken && users.length < 10000);
  return { users };
});
