# Meja by TreonStudio

<br />

Project management interface inspired by Linear. Built with Next.js and shadcn/ui, this application allows tracking of issues, projects and teams with a modern, responsive UI.

## 🛠️ Technologies

- **Framework**: [Next.js](https://nextjs.org/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Backend**: [Firebase](https://firebase.google.com/)
  - Authentication
  - Firestore Database
  - Cloud Storage

## 📦 Installation

### 1. Install dependencies

```shell
pnpm install
```

### 2. Setup Firebase

Follow the [Firebase Setup Guide](./FIREBASE_SETUP.md) to configure Firebase for this project.

Quick setup:
```shell
# Copy environment variables template
cp .env.example .env.local

# Edit .env.local with your Firebase credentials
```

### 3. Start the development server

```shell
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🔥 Firebase Features

This application uses Firebase for backend services:

- **Authentication**: Email/Password and Google Sign-In
- **Firestore**: Real-time database for issues, projects, and teams
- **Storage**: File uploads for avatars and attachments

For detailed Firebase setup instructions, see [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)
