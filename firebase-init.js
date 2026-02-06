// firebase-init.js (compat 방식 고정)
(function () {
  if (window.__FIREBASE_READY__) return; // 중복 방지

  // ✅ 여기에 Firebase 콘솔의 config 그대로
  const firebaseConfig = {
    apiKey: "...",
    authDomain: "...",
    projectId: "...",
    storageBucket: "...",
    messagingSenderId: "...",
    appId: "..."
  };

  firebase.initializeApp(firebaseConfig);
  window.db = firebase.firestore();
  window.__FIREBASE_READY__ = true;
})();
