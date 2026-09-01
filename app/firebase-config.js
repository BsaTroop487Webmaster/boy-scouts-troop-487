// Firebase Configuration and Initialization
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, query, where, getDocs, addDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { getDatabase, ref, set, get, remove, onValue, push } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-database.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js";

// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCaFVBJhQt2lx21w8AV9PUYVYVaBBk2A1w",
    authDomain: "boyscoutstroop487.firebaseapp.com",
    projectId: "boyscoutstroop487",
    storageBucket: "boyscoutstroop487.firebasestorage.app",
    messagingSenderId: "495601546940",
    appId: "1:495601546940:web:d38f6e149279a139d182b9",
    measurementId: "G-DT4D840799"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const database = getDatabase(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);

// Export Firebase services for use throughout the app
export { app, auth, db, database, storage, analytics, onAuthStateChanged, signOut, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, collection, doc, getDoc, setDoc, updateDoc, deleteDoc, query, where, getDocs, addDoc, onSnapshot, ref, set, get, remove, onValue, push, storageRef, uploadBytes, getDownloadURL };
