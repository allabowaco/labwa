importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyA3lrMAs3Z5HaJxZafaLfLGhs8UA2nuFOw",
  authDomain: "labwa-7ff5a.firebaseapp.com",
  projectId: "labwa-7ff5a",
  storageBucket: "labwa-7ff5a.firebasestorage.app",
  messagingSenderId: "405750283502",
  appId: "1:405750283502:web:cedd7e0f5381af2ee847ff"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("تم استلام إشعار بالخلفية:", payload);

  const notificationTitle =
    payload.notification?.title || "سجل اللبوة";

  const notificationOptions = {
    body: payload.notification?.body || "يوجد تحديث جديد",
    icon: "/icon.png",
    badge: "/icon.png"
  };

  self.registration.showNotification(
    notificationTitle,
    notificationOptions
  );
});