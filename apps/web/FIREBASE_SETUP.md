# Firebase Setup Guide for Meja

This guide will help you set up Firebase for the Meja application.

## Prerequisites

- A Google account
- Access to [Firebase Console](https://console.firebase.google.com/)

## Step 1: Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" or "Create a project"
3. Enter your project name (e.g., "Meja by TreonStudio")
4. Accept the terms and click "Continue"
5. Choose whether to enable Google Analytics (optional)
6. Click "Create project"

## Step 2: Register Your Web App

1. In your Firebase project dashboard, click the **Web icon** (`</>`)
2. Register your app with a nickname (e.g., "Meja Web App")
3. Check "Also set up Firebase Hosting" if you want to deploy with Firebase Hosting
4. Click "Register app"
5. Copy the Firebase configuration object

## Step 3: Enable Authentication

1. In the Firebase Console, go to **Build > Authentication**
2. Click "Get started"
3. Enable the sign-in methods you want to use:
   - **Email/Password**: For email-based authentication
   - **Google**: For Google sign-in
   - Add other providers as needed

### For Google Sign-In:
1. Click on "Google" provider
2. Toggle "Enable"
3. Select your support email
4. Click "Save"

## Step 4: Set Up Firestore Database

1. In the Firebase Console, go to **Build > Firestore Database**
2. Click "Create database"
3. Choose a starting mode:
   - **Test mode**: For development (allows read/write for 30 days)
   - **Production mode**: For production (requires security rules)
4. Select a Cloud Firestore location closest to your users
5. Click "Enable"

### Security Rules (for production):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Issues collection
    match /issues/{issueId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null;
    }

    // Projects collection
    match /projects/{projectId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      allow update, delete: if request.auth != null;
    }

    // Teams collection
    match /teams/{teamId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
  }
}
```

## Step 5: Set Up Firebase Storage

1. In the Firebase Console, go to **Build > Storage**
2. Click "Get started"
3. Choose security rules:
   - Start in test mode for development
   - Use production mode with custom rules for production
4. Select a storage location
5. Click "Done"

### Storage Security Rules (for production):

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    match /projects/{projectId}/{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }

    match /avatars/{userId}/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId
                  && request.resource.size < 5 * 1024 * 1024 // Max 5MB
                  && request.resource.contentType.matches('image/.*');
    }
  }
}
```

## Step 6: Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Fill in your Firebase configuration values in `.env.local`:
   ```env
   NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
   NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id
   ```

3. You can find these values in:
   - Firebase Console > Project Settings > General
   - Scroll down to "Your apps" section
   - Click on your web app
   - Copy the config values

## Step 7: Test Your Setup

1. Start your development server:
   ```bash
   pnpm dev
   ```

2. Check the browser console for any Firebase errors
3. Try signing in with a test account

## Usage Examples

### Authentication

```typescript
import { signInWithEmail, signUpWithEmail, signInWithGoogle, logout } from '@/lib/firebase';

// Sign up
const user = await signUpWithEmail('user@example.com', 'password123', 'John Doe');

// Sign in
const user = await signInWithEmail('user@example.com', 'password123');

// Sign in with Google
const user = await signInWithGoogle();

// Sign out
await logout();
```

### Using Auth Hook

```typescript
'use client';

import { useAuth } from '@/lib/firebase';

export function MyComponent() {
  const { user, loading } = useAuth();

  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Please sign in</div>;

  return <div>Welcome, {user.displayName}!</div>;
}
```

### Firestore Operations

```typescript
import { addDocument, getDocuments, updateDocument, deleteDocument } from '@/lib/firebase';

// Add a document
await addDocument('issues', {
  title: 'Fix login bug',
  status: 'open',
  priority: 'high',
});

// Get documents
const issues = await getDocuments('issues');

// Update a document
await updateDocument('issues', 'issue-id', { status: 'closed' });

// Delete a document
await deleteDocument('issues', 'issue-id');
```

### Storage Operations

```typescript
import { uploadImage, getFileURL, deleteFile } from '@/lib/firebase';

// Upload an image with progress
const { url, path } = await uploadImage('avatars', file, (progress) => {
  console.log(`Upload is ${progress}% done`);
});

// Get file URL
const url = await getFileURL('avatars/image.jpg');

// Delete file
await deleteFile('avatars/image.jpg');
```

## Important Notes

- Never commit `.env.local` to version control
- The `.env.local` file is already in `.gitignore`
- Use Firebase emulators for local development:
  ```bash
  firebase emulators:start
  ```

## Troubleshooting

### Common Issues

1. **"Firebase not initialized" error**
   - Make sure all environment variables are set in `.env.local`
   - Restart your development server after adding env variables

2. **Permission denied errors**
   - Check your Firestore security rules
   - Make sure the user is authenticated

3. **CORS errors with Storage**
   - Configure CORS settings in Firebase Storage
   - Add your domain to authorized domains

## Additional Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firebase Authentication](https://firebase.google.com/docs/auth)
- [Cloud Firestore](https://firebase.google.com/docs/firestore)
- [Firebase Storage](https://firebase.google.com/docs/storage)
