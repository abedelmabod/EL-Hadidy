import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyC0adM1TaTOek1iJLgHUxFprfO4nEImjvw",
  authDomain: "el-hadidy-app.firebaseapp.com",
  projectId: "el-hadidy-app",
  storageBucket: "el-hadidy-app.firebasestorage.app",
  messagingSenderId: "1031581630612",
  appId: "1:1031581630612:web:558d5e604b8085a13b7481",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { app, auth, db, storage };
