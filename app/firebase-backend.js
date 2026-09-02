// Firebase Backend Integration for BSA Troop 487
// Replaces localStorage with Firestore + Auth

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, arrayUnion, arrayRemove, serverTimestamp, writeBatch } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getBytes } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-storage.js";
import { getAnalytics, logEvent } from "https://www.gstatic.com/firebasejs/12.18.0/firebase-analytics.js";

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
const storage = getStorage(app);
const analytics = getAnalytics(app);

// ============= USER MANAGEMENT =============

/**
 * Register a new user with Firebase Auth + Firestore
 */
async function firebaseRegisterUser(username, email, password, dob, type, rank = null) {
  try {
    // Create Firebase Auth user
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // Calculate age
    const age = calculateAge(dob);

    // Validate age
    if (age > 122) {
      await deleteUser(auth.currentUser);
      throw new Error("Invalid age bounds. Maximum allowable lifespan thresholds exceeded.");
    }

    // Create user document in Firestore
    await setDoc(doc(db, "users", uid), {
      username: username,
      email: email,
      dob: dob,
      age: age,
      type: type, // 'scout' or 'non-scout'
      rank: rank || "Scout",
      isAdmin: false,
      createdAt: serverTimestamp(),
      lastLogin: serverTimestamp(),
      banStatus: null,
      appeals: [],
      profileStatus: "active"
    });

    logEvent(analytics, "user_registered", { username: username, type: type });

    return { success: true, uid: uid, user: userCredential.user };
  } catch (error) {
    console.error("Registration error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Sign in user with Firebase Auth
 */
async function firebaseSignInUser(email, password) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const uid = userCredential.user.uid;

    // Fetch user data from Firestore
    const userDoc = await getDoc(doc(db, "users", uid));
    if (!userDoc.exists()) {
      throw new Error("User profile not found");
    }

    const userData = userDoc.data();

    // Check ban status
    if (userData.banStatus && userData.banStatus.until > Date.now()) {
      await signOut(auth);
      throw new Error(`Access Suspended: ${userData.banStatus.reason}`);
    }

    // Update last login
    await updateDoc(doc(db, "users", uid), {
      lastLogin: serverTimestamp()
    });

    logEvent(analytics, "user_login", { username: userData.username });

    return {
      success: true,
      uid: uid,
      user: {
        username: userData.username,
        email: userData.email,
        type: userData.type,
        rank: userData.rank,
        isAdmin: userData.isAdmin,
        age: userData.age,
        sessionSecureToken: generateSessionToken(password)
      }
    };
  } catch (error) {
    console.error("Sign in error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Sign out user
 */
async function firebaseSignOut() {
  try {
    await signOut(auth);
    logEvent(analytics, "user_logout");
    return { success: true };
  } catch (error) {
    console.error("Sign out error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get current user
 */
function getCurrentUser() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        resolve({ uid: user.uid, ...userDoc.data() });
      } else {
        resolve(null);
      }
    });
  });
}

// ============= CHAT & MESSAGING =============

/**
 * Post a message to group chat
 */
async function firebasePostChatMessage(uid, username, message, attachedImage = null) {
  try {
    const chatRef = collection(db, "chats");

    // Check profanity
    const cleanMessage = cleanseTextProfanityPayloadAndLeetspeak(message);
    if (cleanMessage.violated) {
      await recordProfanityViolation(uid, username);
    }

    const chatDoc = {
      uid: uid,
      user: username,
      msg: cleanMessage.clearedText,
      attachedImg: attachedImage || null,
      timestamp: serverTimestamp(),
      reactions: []
    };

    await setDoc(doc(chatRef), chatDoc);
    logEvent(analytics, "chat_message_posted", { user: username });

    return { success: true };
  } catch (error) {
    console.error("Chat post error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Fetch all chat messages
 */
async function firebaseGetChatHistory(limit = 100) {
  try {
    const chatRef = collection(db, "chats");
    const q = query(chatRef);
    const querySnapshot = await getDocs(q);

    const messages = [];
    querySnapshot.forEach((doc) => {
      messages.push({ id: doc.id, ...doc.data() });
    });

    return { success: true, messages: messages.slice(-limit) };
  } catch (error) {
    console.error("Chat fetch error:", error);
    return { success: false, error: error.message };
  }
}

// ============= ADMIN & MODERATION =============

/**
 * Ban or restrict a user
 */
async function firebaseEnforceUserBan(targetUid, duration, reason) {
  try {
    const until = Date.now() + parseDurationToMs(duration);

    await updateDoc(doc(db, "users", targetUid), {
      banStatus: {
        reason: reason,
        until: until,
        issuedAt: serverTimestamp()
      }
    });

    logEvent(analytics, "user_banned", { uid: targetUid, reason: reason, duration: duration });

    return { success: true };
  } catch (error) {
    console.error("Ban error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Lift ban on user
 */
async function firebaseRemoveUserBan(targetUid) {
  try {
    await updateDoc(doc(db, "users", targetUid), {
      banStatus: null
    });

    logEvent(analytics, "user_unbanned", { uid: targetUid });

    return { success: true };
  } catch (error) {
    console.error("Unban error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Submit account appeal
 */
async function firebaseSubmitAppeal(uid, username, reason) {
  try {
    const appealRef = collection(db, "appeals");

    await setDoc(doc(appealRef), {
      uid: uid,
      username: username,
      reason: reason,
      status: "pending",
      submittedAt: serverTimestamp(),
      resolvedAt: null
    });

    logEvent(analytics, "appeal_submitted", { username: username });

    return { success: true };
  } catch (error) {
    console.error("Appeal error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get all pending appeals (admin only)
 */
async function firebaseGetAppeals() {
  try {
    const appealRef = collection(db, "appeals");
    const q = query(appealRef, where("status", "==", "pending"));
    const querySnapshot = await getDocs(q);

    const appeals = [];
    querySnapshot.forEach((doc) => {
      appeals.push({ id: doc.id, ...doc.data() });
    });

    return { success: true, appeals: appeals };
  } catch (error) {
    console.error("Appeals fetch error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Resolve an appeal
 */
async function firebaseResolveAppeal(appealId, resolution) {
  try {
    await updateDoc(doc(db, "appeals", appealId), {
      status: resolution, // 'approved' or 'denied'
      resolvedAt: serverTimestamp()
    });

    return { success: true };
  } catch (error) {
    console.error("Appeal resolution error:", error);
    return { success: false, error: error.message };
  }
}

// ============= USER PROFILES & SETTINGS =============

/**
 * Update user password
 */
async function firebaseUpdatePassword(uid, currentPassword, newPassword) {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("No user logged in");

    // Verify current password by re-authenticating
    const email = user.email;
    await signInWithEmailAndPassword(auth, email, currentPassword);

    // Update password
    await user.updatePassword(newPassword);

    logEvent(analytics, "password_changed", { uid: uid });

    return { success: true };
  } catch (error) {
    console.error("Password update error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Delete user account
 */
async function firebaseDeleteUserAccount(uid) {
  try {
    // Soft delete: archive the user
    await updateDoc(doc(db, "users", uid), {
      profileStatus: "deleted",
      deletedAt: serverTimestamp()
    });

    // Delete auth user
    await auth.currentUser.delete();

    logEvent(analytics, "account_deleted", { uid: uid });

    return { success: true };
  } catch (error) {
    console.error("Account deletion error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Get user directory (admin only)
 */
async function firebaseGetUserDirectory() {
  try {
    const usersRef = collection(db, "users");
    const querySnapshot = await getDocs(usersRef);

    const users = [];
    querySnapshot.forEach((doc) => {
      users.push({ uid: doc.id, ...doc.data() });
    });

    return { success: true, users: users };
  } catch (error) {
    console.error("User directory error:", error);
    return { success: false, error: error.message };
  }
}

// ============= IMAGE & FILE STORAGE =============

/**
 * Upload image to Firebase Storage
 */
async function firebaseUploadImage(uid, imageBase64, fileName) {
  try {
    const imageBuffer = Uint8Array.from(atob(imageBase64.split(',')[1]), c => c.charCodeAt(0));
    const storageRef = ref(storage, `user-uploads/${uid}/${fileName}`);

    await uploadBytes(storageRef, imageBuffer);
    const url = `https://firebasestorage.googleapis.com/v0/b/boyscoutstroop487.firebasestorage.app/o/user-uploads%2F${uid}%2F${encodeURIComponent(fileName)}?alt=media`;

    return { success: true, url: url };
  } catch (error) {
    console.error("Image upload error:", error);
    return { success: false, error: error.message };
  }
}

// ============= HELPER FUNCTIONS =============

function calculateAge(dobString) {
  const birth = new Date(dobString);
  const current = new Date();
  let age = current.getFullYear() - birth.getFullYear();
  const m = current.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && current.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function generateSessionToken(password) {
  try {
    const rnd = Math.random();
    const stamp = new Date().toISOString().replace(/[-T:Z]/g, "/");
    const noise = Math.random().toString(36).substring(2, 8);
    const txt = `${rnd}.${stamp}.${noise}.${password}`;

    let sum = 0n;
    for (let idx = 0; idx < txt.length; idx++) {
      sum += BigInt(txt.charCodeAt(idx));
    }
    const exp = sum ** 5n;
    return "ST-" + (exp - 8n * 4n).toString(16).substring(0, 32);
  } catch (err) {
    return "ST-FALLBACK-" + Date.now().toString(16);
  }
}

function cleanseTextProfanityPayloadAndLeetspeak(inputString) {
  let output = inputString;
  const words = ["fuck", "shit", "bitch", "asshole"];
  const regexes = [/[fF][uU(aA@][cCkK\(\)]+/gi, /[sS]h*[1iI!lL][tT]+/gi];
  let triggered = false;

  function mask(match) {
    return match.charAt(0) + "*".repeat(match.length - 1);
  }

  words.forEach(w => {
    const rx = new RegExp("\\b" + w + "\\b", "gi");
    if (rx.test(output)) {
      triggered = true;
      output = output.replace(rx, m => mask(m));
    }
  });

  regexes.forEach(pattern => {
    if (pattern.test(output)) {
      triggered = true;
      output = output.replace(pattern, m => mask(m));
    }
  });

  return { clearedText: output, violated: triggered };
}

async function recordProfanityViolation(uid, username) {
  try {
    const userRef = doc(db, "users", uid);
    await updateDoc(userRef, {
      profanityViolations: arrayUnion(serverTimestamp())
    });

    // Auto-ban if 3+ violations in 1 hour
    const userDoc = await getDoc(userRef);
    const violations = userDoc.data().profanityViolations || [];
    const recentViolations = violations.filter(v => Date.now() - v < 3600000);

    if (recentViolations.length >= 3) {
      await firebaseEnforceUserBan(uid, "1hr", "Filter alert escalation");
    }
  } catch (error) {
    console.error("Profanity violation recording error:", error);
  }
}

function parseDurationToMs(duration) {
  const match = duration.match(/(\d+)(mins?|hrs?|days?|d|h|m|perm)/i);
  if (!match) return 3600000; // Default 1 hour

  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();

  if (unit.includes("perm")) return 365 * 24 * 60 * 60 * 1000; // 1 year
  if (unit.includes("d")) return value * 24 * 60 * 60 * 1000;
  if (unit.includes("h")) return value * 60 * 60 * 1000;
  if (unit.includes("m")) return value * 60 * 1000;

  return 3600000;
}

// Export all functions
export {
  firebaseRegisterUser,
  firebaseSignInUser,
  firebaseSignOut,
  getCurrentUser,
  firebasePostChatMessage,
  firebaseGetChatHistory,
  firebaseEnforceUserBan,
  firebaseRemoveUserBan,
  firebaseSubmitAppeal,
  firebaseGetAppeals,
  firebaseResolveAppeal,
  firebaseUpdatePassword,
  firebaseDeleteUserAccount,
  firebaseGetUserDirectory,
  firebaseUploadImage,
  auth,
  db,
  storage
};
