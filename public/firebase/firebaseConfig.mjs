// /public/firebase/firebaseConfig.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js';

const firebaseConfig = {
  apiKey: "AIzaSyAA-PKUvVk4DnCMlYbMPNR6Zd3lBtbrBGE",
  authDomain: "wallywall-18303.firebaseapp.com",
  projectId: "wallywall-18303",
  storageBucket: "wallywall-18303.firebasestorage.app",
  messagingSenderId: "699677979638",
  appId: "1:699677979638:web:ecec0b42369c55fffdcdd7",
  measurementId: "G-5KRL7X1N81"
};

// Init Firebase
const app = initializeApp(firebaseConfig);

// Services
const auth = getAuth();
const db = getFirestore();
const storage = getStorage();

export { auth, db, storage };