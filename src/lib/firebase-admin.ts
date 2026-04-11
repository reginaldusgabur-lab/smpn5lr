
import admin from "firebase-admin";

// The Firebase Admin SDK will automatically find and use the credentials
// from the GOOGLE_APPLICATION_CREDENTIALS environment variable when initialized.
// We just need to make sure the app is initialized.

if (!admin.apps.length) {
  // When GOOGLE_APPLICATION_CREDENTIALS is set, initializeApp() will use it.
  // We can also provide other config like the databaseURL here.
  admin.initializeApp({
      databaseURL: "https://studio-6483313657-7894b-default-rtdb.firebaseio.com"
  });
}

const adminDb = admin.firestore();
const adminAuth = admin.auth();

export { adminDb, adminAuth };
