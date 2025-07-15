import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC9ZIUZ_yUtB2yZJJ7J3E8n1cQhPqTx0Jk",
  authDomain: "turnit-a04c7.firebaseapp.com",
  projectId: "turnit-a04c7",
  storageBucket: "turnit-a04c7.appspot.com",
  messagingSenderId: "802491077395",
  appId: "1:802491077395:web:placeholderappid"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
