import { getApp, getApps, initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyC0adM1TaTOek1iJLgHUxFprfO4nEImjvw",
  authDomain: "el-hadidy-app.firebaseapp.com",
  projectId: "el-hadidy-app",
  storageBucket: "el-hadidy-app.firebasestorage.app",
  messagingSenderId: "1031581630612",
  appId: "1:1031581630612:web:558d5e604b8085a13b7481",
};

export function getOrCreateFirebaseApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

export function getFirebaseFirestore(app, options = {}) {
  const { platform = "web" } = options;

  if (platform !== "native") {
    return getFirestore(app);
  }

  try {
    return initializeFirestore(app, {
      experimentalForceLongPolling: true,
      useFetchStreams: false,
    });
  } catch (error) {
    return getFirestore(app);
  }
}

export function getFirebaseStorage(app) {
  return getStorage(app);
}
