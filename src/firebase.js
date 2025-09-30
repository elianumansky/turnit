// firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

// Tu config
const firebaseConfig = {
  apiKey: "AIzaSyDRSu_QvAxGF8tdnprkFCu277rMu5l1ByE",
  authDomain: "turnit-a04c7.firebaseapp.com",
  projectId: "turnit-a04c7",
  storageBucket: "turnit-a04c7.firebasestorage.app",
  messagingSenderId: "802491077395",
  appId: "1:802491077395:web:6f0b42857330335330c0e6",
  measurementId: "G-E7TXQPQDNM",
};

// Init
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Google provider para “Continuar con Google”
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Analytics (solo si el entorno lo soporta — evita errores en SSR)
let analytics;
isSupported()
  .then((yes) => {
    if (yes) analytics = getAnalytics(app);
  })
  .catch(() => { /* noop */ });

export { analytics };
