import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCX-1U4lsujwfW3lCyWM2wNVF7J5tyiLe8",
  authDomain: "g-dept.firebaseapp.com",
  projectId: "g-dept",
  storageBucket: "g-dept.firebasestorage.app",
  messagingSenderId: "4805222551964",
  appId: "1:480522255196:web:619f7abd0f3e70ce4e2359"
};

if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}

export const auth = firebase.auth();
export const db = firebase.firestore();
db.enablePersistence({ synchronizeTabs: true }).catch(() => {});