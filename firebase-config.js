// Firebase SDK Imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getMessaging } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  doc,
  updateDoc,
  getDocs,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyA3lrMAs3Z5HaJxZafaLfLGhs8UA2nuFOw",
  authDomain: "labwa-7ff5a.firebaseapp.com",
  projectId: "labwa-7ff5a",
  storageBucket: "labwa-7ff5a.firebasestorage.app",
  messagingSenderId: "405750283502",
  appId: "1:405750283502:web:cedd7e0f5381af2ee847ff",
  measurementId: "G-L8V448D1XR"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firestore
const db = getFirestore(app);

// Initialize Firebase Cloud Messaging
const messaging = getMessaging(app);

// Export everything needed in app.js
export {
  db,
  messaging,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  deleteDoc,
  doc,
  updateDoc,
  getDocs,
  setDoc
};