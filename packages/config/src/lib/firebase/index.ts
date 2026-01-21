// Export Firebase configuration
export { app, auth, db } from "./config";
export type { FirebaseConfig } from "./config";

// Export Authentication utilities
export {
  signUpWithEmail,
  signInWithEmail,
  signInWithGoogle,
  signInWithGoogleChromeIdentity,
  signOutUser,
  resetPassword,
  sendVerificationEmail,
  updateUserProfile,
  getCurrentUser,
  subscribeToAuthState,
} from "./auth";
export type { User, UserCredential, AuthProvider } from "./auth";

// Export Firestore utilities
export {
  getCollection,
  getDocRef,
  createDocument,
  setDocument,
  getDocument,
  updateDocument,
  deleteDocument,
  getAllDocuments,
  queryDocuments,
  subscribeToDocument,
  subscribeToCollection,
  serverTimestamp,
  Timestamp,
} from "./firestore";
export type { Unsubscribe, DocumentData } from "./firestore";
