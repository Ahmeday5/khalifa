// Firebase Cloud Messaging service worker — handles push notifications
// while the dashboard tab is closed or in the background.
//
// Must live at the origin root (served here via Angular's `public/` assets
// glob) so it can register at the default FCM scope.
//
// Uses the `-compat` build via importScripts since this file runs raw in
// the service-worker global scope with no bundler — it can't import from
// `src/environments/environment.ts`, so the Firebase config is duplicated
// here.

importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBNn6UjkD7z5Tr9NpG11ZG_jOM6veGPQpk',
  authDomain: 'alkhalifa-3cbdc.firebaseapp.com',
  projectId: 'alkhalifa-3cbdc',
  storageBucket: 'alkhalifa-3cbdc.firebasestorage.app',
  messagingSenderId: '218576711048',
  appId: '1:218576711048:web:a8e139df66ee2d39851e3d',
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const title = payload.notification?.title ?? 'إشعار جديد';
  self.registration.showNotification(title, {
    body: payload.notification?.body ?? '',
    icon: '/assets/img/logo.jpeg',
    data: payload.data,
  });
});
