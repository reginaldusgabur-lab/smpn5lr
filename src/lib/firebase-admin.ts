import admin from "firebase-admin";

if (!admin.apps.length) {
  admin.initializeApp({
      databaseURL: "https://aplikasi-smpn5lr02-45474403-default-rtdb.asia-southeast1.firebasedatabase.app"
  });
}

const adminDb = admin.firestore();
const adminAuth = admin.auth();

export { adminDb, adminAuth };
