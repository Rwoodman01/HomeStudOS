import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyBF9QkwP42TQrS6F7xwZVXfyRmDptZzW-8",
  authDomain: "homestud-os.firebaseapp.com",
  projectId: "homestud-os",
  storageBucket: "homestud-os.firebasestorage.app",
  messagingSenderId: "480918577802",
  appId: "1:480918577802:web:e8f8d27d072ca0b6c00373",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(firebaseApp);
export const storage = getStorage(firebaseApp);
export const functions = getFunctions(firebaseApp, "us-central1");

enableIndexedDbPersistence(db).catch(() => {
  // Persistence can fail in private mode or when another tab owns the lock.
});
