
// firebase.js
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDRSu_QvAxGF8tdnprkFCu277rMu5l1ByE",
  authDomain: "turnit-a04c7.firebaseapp.com",
  projectId: "turnit-a04c7",
  storageBucket: "turnit-a04c7.firebasestorage.app",
  messagingSenderId: "802491077395",
  appId: "1:802491077395:web:6f0b42857330335330c0e6",
  measurementId: "G-E7TXQPQDNM"
};


const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const analytics = getAnalytics(app);

export { app, auth, db };
