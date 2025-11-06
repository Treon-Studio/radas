# Firebase Setup Guide

This guide will help you set up Firebase with Firestore and Authentication in your Chrome extension.

## Prerequisites

1. A Firebase account (https://firebase.google.com/)
2. A Firebase project created in the Firebase Console

## Setup Steps

### 1. Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or select an existing project
3. Follow the setup wizard to create your project

### 2. Enable Firestore

1. In your Firebase project, go to **Build** > **Firestore Database**
2. Click "Create database"
3. Choose a location for your database
4. Start in **production mode** or **test mode** (you can change security rules later)

### 3. Enable Authentication

1. In your Firebase project, go to **Build** > **Authentication**
2. Click "Get started"
3. Enable the authentication methods you want to use:
   - **Email/Password**: For basic email authentication
   - **Google**: For Google Sign-In (recommended for Chrome extensions)

### 4. Register Your Web App

1. In your Firebase project settings, click "Add app" and select the **Web** platform (</> icon)
2. Register your app with a nickname
3. Copy the Firebase configuration object

### 5. Configure Environment Variables

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Fill in your Firebase configuration values in `.env`:
   ```env
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   VITE_FIREBASE_MEASUREMENT_ID=your_measurement_id
   ```

### 6. Configure Chrome Extension (for Google Sign-In)

If you're using Google Sign-In with Chrome Identity API, you need to add OAuth credentials:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your Firebase project
3. Go to **APIs & Services** > **Credentials**
4. Click "Create Credentials" > "OAuth client ID"
5. Select "Chrome App" as the application type
6. Add your Chrome extension ID
7. Update your `manifest.json` (or `wxt.config.ts`) with:
   ```json
   {
     "oauth2": {
       "client_id": "YOUR_CLIENT_ID.apps.googleusercontent.com",
       "scopes": [
         "https://www.googleapis.com/auth/userinfo.email",
         "https://www.googleapis.com/auth/userinfo.profile"
       ]
     },
     "permissions": ["identity"]
   }
   ```

### 7. Firestore Security Rules

Set up security rules for your Firestore database:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Allow users to read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }

    // Add more rules as needed
  }
}
```

## Usage Examples

### Authentication

#### Using the Hook (Recommended)

```tsx
import { useFirebaseAuth } from "@/shared/hooks/use-firebase-auth";

function LoginComponent() {
  const { user, loading, login, signup, loginWithGoogle, logout, isAuthenticated } = useFirebaseAuth();

  const handleEmailLogin = async () => {
    const result = await login("user@example.com", "password123");
    if (result.success) {
      console.log("Logged in:", result.user);
    } else {
      console.error("Login failed:", result.error);
    }
  };

  const handleGoogleLogin = async () => {
    const result = await loginWithGoogle();
    if (result.success) {
      console.log("Logged in with Google:", result.user);
    }
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div>
      {isAuthenticated ? (
        <div>
          <p>Welcome, {user?.displayName || user?.email}</p>
          <button onClick={logout}>Logout</button>
        </div>
      ) : (
        <div>
          <button onClick={handleEmailLogin}>Login with Email</button>
          <button onClick={handleGoogleLogin}>Login with Google</button>
        </div>
      )}
    </div>
  );
}
```

#### Direct API Usage

```typescript
import {
  signInWithEmail,
  signUpWithEmail,
  signInWithGoogle,
  signInWithGoogleChromeIdentity,
  signOutUser,
  getCurrentUser,
} from "@/shared/lib/firebase";

// Sign up
const result = await signUpWithEmail("user@example.com", "password123", "John Doe");

// Sign in
const loginResult = await signInWithEmail("user@example.com", "password123");

// Google Sign-In (for Chrome extension)
const googleResult = await signInWithGoogleChromeIdentity();

// Get current user
const currentUser = getCurrentUser();

// Sign out
await signOutUser();
```

### Firestore Database

#### Using Hooks (Recommended)

```tsx
import {
  useFirestoreDoc,
  useFirestoreCollection,
  useFirestoreMutations,
} from "@/shared/hooks/use-firestore";

function UserProfile({ userId }: { userId: string }) {
  // Fetch a single document with real-time updates
  const { data: user, loading, error } = useFirestoreDoc(
    "users",
    userId,
    true // Enable real-time updates
  );

  // Fetch a collection with filters
  const { data: posts } = useFirestoreCollection(
    "posts",
    {
      field: "userId",
      operator: "==",
      value: userId,
      orderByField: "createdAt",
      orderByDirection: "desc",
      limitCount: 10,
    },
    true // Enable real-time updates
  );

  // CRUD operations
  const { create, update, remove } = useFirestoreMutations("posts");

  const handleCreatePost = async () => {
    const result = await create({
      title: "New Post",
      content: "Post content",
      userId: userId,
    });

    if (result.success) {
      console.log("Post created with ID:", result.id);
    }
  };

  const handleUpdatePost = async (postId: string) => {
    await update(postId, { title: "Updated Title" });
  };

  const handleDeletePost = async (postId: string) => {
    await remove(postId);
  };

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      <h1>{user?.name}</h1>
      <button onClick={handleCreatePost}>Create Post</button>
      {posts.map((post) => (
        <div key={post.id}>
          <h3>{post.title}</h3>
          <button onClick={() => handleUpdatePost(post.id)}>Edit</button>
          <button onClick={() => handleDeletePost(post.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

#### Direct API Usage

```typescript
import {
  createDocument,
  getDocument,
  updateDocument,
  deleteDocument,
  queryDocuments,
  subscribeToCollection,
} from "@/shared/lib/firebase";

// Create a document
const result = await createDocument("users", {
  name: "John Doe",
  email: "john@example.com",
});

// Get a document
const { data: user } = await getDocument("users", "userId123");

// Update a document
await updateDocument("users", "userId123", {
  name: "Jane Doe",
});

// Delete a document
await deleteDocument("users", "userId123");

// Query documents
const { data: users } = await queryDocuments("users", {
  field: "age",
  operator: ">=",
  value: 18,
  orderByField: "name",
  orderByDirection: "asc",
  limitCount: 10,
});

// Real-time subscription
const unsubscribe = subscribeToCollection(
  "posts",
  (posts) => {
    console.log("Posts updated:", posts);
  },
  { orderByField: "createdAt", orderByDirection: "desc" }
);

// Cleanup
unsubscribe();
```

## Project Structure

```
shared/
├── lib/
│   └── firebase/
│       ├── config.ts          # Firebase initialization
│       ├── auth.ts            # Authentication functions
│       ├── firestore.ts       # Firestore CRUD operations
│       └── index.ts           # Exports all Firebase utilities
└── hooks/
    ├── use-firebase-auth.ts   # React hook for authentication
    └── use-firestore.ts       # React hooks for Firestore
```

## Available Functions

### Authentication

- `signUpWithEmail(email, password, displayName?)` - Create a new user with email/password
- `signInWithEmail(email, password)` - Sign in with email/password
- `signInWithGoogle()` - Sign in with Google (popup)
- `signInWithGoogleChromeIdentity()` - Sign in with Google using Chrome Identity API
- `signOutUser()` - Sign out the current user
- `resetPassword(email)` - Send password reset email
- `sendVerificationEmail(user)` - Send email verification
- `updateUserProfile(user, data)` - Update user profile
- `getCurrentUser()` - Get the current user
- `subscribeToAuthState(callback)` - Subscribe to auth state changes

### Firestore

- `createDocument(collection, data)` - Create a document with auto-generated ID
- `setDocument(collection, docId, data, merge?)` - Create/update a document with specific ID
- `getDocument(collection, docId)` - Get a single document
- `updateDocument(collection, docId, data)` - Update a document
- `deleteDocument(collection, docId)` - Delete a document
- `getAllDocuments(collection)` - Get all documents in a collection
- `queryDocuments(collection, options)` - Query documents with filters
- `subscribeToDocument(collection, docId, callback)` - Real-time document listener
- `subscribeToCollection(collection, callback, options?)` - Real-time collection listener

## Troubleshooting

### Common Issues

1. **Firebase not initialized**: Make sure you've set up the `.env` file with correct values
2. **Authentication errors**: Check that you've enabled the authentication method in Firebase Console
3. **Firestore permission denied**: Update your Firestore security rules
4. **Chrome Identity API not working**: Ensure you've added OAuth credentials and updated manifest.json

### Debug Mode

To enable Firebase debug mode, add this to your code:

```typescript
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Enable auth debug mode
const auth = getAuth();
auth.settings.appVerificationDisabledForTesting = true;

// Enable Firestore debug mode
const db = getFirestore();
// Add debugging as needed
```

## Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Documentation](https://firebase.google.com/docs/firestore)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Chrome Extension Identity API](https://developer.chrome.com/docs/extensions/reference/identity/)
