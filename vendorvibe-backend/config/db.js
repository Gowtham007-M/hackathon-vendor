// config/db.js
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const initializeFirebase = () => {
  try {
    // Option 1: Using service account key file
    const serviceAccount = require('../path/to/your/serviceAccountKey.json');
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      // Optional: if you're using Realtime Database instead of Firestore
      // databaseURL: "https://your-project-id-default-rtdb.firebaseio.com"
    });

    // Option 2: Using environment variables (recommended for production)
    /*
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      })
    });
    */

    console.log('Firebase connected successfully');
    return admin.firestore(); // Return Firestore instance
  } catch (error) {
    console.error('Firebase connection error:', error);
    process.exit(1);
  }
};

// Get Firestore database instance
const db = initializeFirebase();

module.exports = { db, admin }; 