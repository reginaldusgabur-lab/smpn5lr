
const admin = require('firebase-admin');
const serviceAccount = require('../e-spenli-firebase-adminsdk-32o6s-9ac6edde82.json');

try {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  // Ignore re-initialization error
  if (error.code !== 'app/duplicate-app') {
    console.error('Firebase admin initialization error:', error);
  }
}

const db = admin.firestore();

async function getUserData() {
  try {
    const usersCollection = await db.collection('users').get();
    if (usersCollection.empty) {
      console.log('No users found.');
      return;
    }
    usersCollection.forEach(doc => {
      console.log(`User ID: ${doc.id}`);
      const data = doc.data();
      console.log(`  Name: ${data.name || 'N/A'}`);
      console.log(`  NIP: ${data.nip || 'N/A'}`);
      console.log(`  Role: ${data.role || 'N/A'}`);
      console.log(`  Employment Status: ${data.employmentStatus || 'N/A'}`);
      console.log('---');
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
  }
}

getUserData();
