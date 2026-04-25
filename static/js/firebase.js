/**
 * Growth Point App – Firebase Config & SDK
 * 認証とデータベースの初期化
 */

// Firebase SDK (Modular API) を CDN からインポート
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-app.js';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut as firebaseSignOut, 
  onAuthStateChanged 
} from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.10.0/firebase-firestore.js';

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyDpWTJfNtgxfz382k36gJq7ApjxWTK3c2U",
  authDomain: "growth-point-app-2026.firebaseapp.com",
  projectId: "growth-point-app-2026",
  storageBucket: "growth-point-app-2026.firebasestorage.app",
  messagingSenderId: "882027644397",
  appId: "1:882027644397:web:dab4e5493f3a6c73ecd3e4"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

/**
 * Google ログイン
 */
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Login error:', error.message);
    throw error;
  }
}

/**
 * ログアウト
 */
export async function signOut() {
  try {
    await firebaseSignOut(auth);
    window.location.reload();
  } catch (error) {
    console.error('Logout error:', error.message);
  }
}

/**
 * 現在のユーザー取得
 */
export function getCurrentUser() {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe();
      resolve(user);
    });
  });
}

export { auth, db };
export default app;
