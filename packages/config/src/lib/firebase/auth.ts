import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  sendEmailVerification,
  onAuthStateChanged,
  type User,
  type UserCredential,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithCredential,
  type AuthProvider,
} from "firebase/auth";
import { auth } from "./config";

// Sign up with email and password
export const signUpWithEmail = async (
  email: string,
  password: string,
  displayName?: string
) => {
  try {
    const userCredential: UserCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    // Update profile with display name if provided
    if (displayName && userCredential.user) {
      await updateProfile(userCredential.user, { displayName });
    }

    return {
      success: true,
      user: userCredential.user,
      error: null,
    };
  } catch (error) {
    console.error("Error signing up:", error);
    return {
      success: false,
      user: null,
      error,
    };
  }
};

// Sign in with email and password
export const signInWithEmail = async (email: string, password: string) => {
  try {
    const userCredential: UserCredential = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    return {
      success: true,
      user: userCredential.user,
      error: null,
    };
  } catch (error) {
    console.error("Error signing in:", error);
    return {
      success: false,
      user: null,
      error,
    };
  }
};

// Sign in with Google (using popup)
export const signInWithGoogle = async () => {
  try {
    const provider = new GoogleAuthProvider();
    const userCredential: UserCredential = await signInWithPopup(auth, provider);

    return {
      success: true,
      user: userCredential.user,
      error: null,
    };
  } catch (error) {
    console.error("Error signing in with Google:", error);
    return {
      success: false,
      user: null,
      error,
    };
  }
};

// Sign in with Google using Chrome Identity API (for Chrome extensions)
export const signInWithGoogleChromeIdentity = async () => {
  try {
    // Get OAuth token from Chrome Identity API
    const token = await new Promise<string>((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(token || "");
        }
      });
    });

    // Create credential from token
    const credential = GoogleAuthProvider.credential(null, token);
    const userCredential = await signInWithCredential(auth, credential);

    return {
      success: true,
      user: userCredential.user,
      error: null,
    };
  } catch (error) {
    console.error("Error signing in with Chrome Identity:", error);
    return {
      success: false,
      user: null,
      error,
    };
  }
};

// Sign out
export const signOutUser = async () => {
  try {
    await signOut(auth);
    return {
      success: true,
      error: null,
    };
  } catch (error) {
    console.error("Error signing out:", error);
    return {
      success: false,
      error,
    };
  }
};

// Send password reset email
export const resetPassword = async (email: string) => {
  try {
    await sendPasswordResetEmail(auth, email);
    return {
      success: true,
      error: null,
    };
  } catch (error) {
    console.error("Error sending password reset email:", error);
    return {
      success: false,
      error,
    };
  }
};

// Send email verification
export const sendVerificationEmail = async (user: User) => {
  try {
    await sendEmailVerification(user);
    return {
      success: true,
      error: null,
    };
  } catch (error) {
    console.error("Error sending verification email:", error);
    return {
      success: false,
      error,
    };
  }
};

// Update user profile
export const updateUserProfile = async (
  user: User,
  data: { displayName?: string; photoURL?: string }
) => {
  try {
    await updateProfile(user, data);
    return {
      success: true,
      error: null,
    };
  } catch (error) {
    console.error("Error updating profile:", error);
    return {
      success: false,
      error,
    };
  }
};

// Get current user
export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

// Subscribe to auth state changes
export const subscribeToAuthState = (
  callback: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, callback);
};

// Export auth instance
export { auth };
export type { User, UserCredential, AuthProvider };
