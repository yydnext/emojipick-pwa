// firebase-init.js (compat 방식 고정)
(function () {
  if (window.__FIREBASE_READY__) return; // 중복 방지

  // ✅ 여기에 Firebase 콘솔의 config 그대로
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAVYc_K5ahGZ6TKpL4qUF0jXP16xtPOdww",
  authDomain: "localboost-dev.firebaseapp.com",
  projectId: "localboost-dev",
  storageBucket: "localboost-dev.firebasestorage.app",
  messagingSenderId: "262055028680",
  appId: "1:262055028680:web:197f41affc87849d87c2fd"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

  firebase.initializeApp(firebaseConfig);
  window.db = firebase.firestore();
  window.__FIREBASE_READY__ = true;
})();
