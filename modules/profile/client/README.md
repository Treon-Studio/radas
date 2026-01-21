# Profile Feature

User profile section untuk menampilkan informasi user dan manage account.

## Features

### 1. **User Information Display**
- ✅ Avatar dengan initials fallback
- ✅ Display name
- ✅ Email
- ✅ Status badge (Active/Inactive/Pending)

### 2. **Roles Information**
- ✅ List semua roles yang dimiliki user
- ✅ Badge untuk setiap role
- ✅ Permission count untuk primary role

### 3. **Workspaces Information**
- ✅ List semua workspaces yang user ikuti
- ✅ Badge "Admin" untuk workspace yang user adalah admin
- ✅ Badge "Active" untuk current workspace
- ✅ Workspace slug display

### 4. **Account Status**
- ✅ Status badge
- ✅ Last login date
- ✅ Member since date

### 5. **Logout**
- ✅ Logout button dengan confirmation
- ✅ Loading state saat logout

## Usage

Profile section sudah terintegrasi di bottom navigation:

```tsx
import { ProfileSection } from "@/features/profile";

// Di App.tsx:
<TabsContent value="profile">
  <ProfileSection />
</TabsContent>
```

## UI Structure

```
ProfileSection
├── Header (Gradient background)
│   ├── Avatar (with initials fallback)
│   ├── Display Name
│   └── Email
│
├── Roles Card
│   ├── Role badges
│   └── Permission count
│
├── Workspaces Card
│   ├── Workspace list
│   ├── Admin badge (if applicable)
│   └── Active badge (current workspace)
│
├── Account Status Card
│   ├── Status badge
│   ├── Last login date
│   └── Member since date
│
└── Logout Button (sticky at bottom)
```

## Components Used

- `Avatar` / `AvatarFallback` / `AvatarImage` - User avatar
- `Card` / `CardHeader` / `CardContent` - Section cards
- `Badge` - Status & role indicators
- `Button` - Logout action
- Icons: `User`, `Mail`, `Building2`, `Shield`, `LogOut`

## Data Sources

- `useAuth()` - Firebase auth user
- `useCurrentUser()` - User data with roles
- `useWorkspaces()` - User's workspaces

## Interaction

### Logout Flow
1. User clicks "Logout" button
2. Confirmation dialog appears
3. If confirmed:
   - Button shows "Logging out..." loading state
   - `logout()` function called
   - User redirected to login page

## Future Enhancements

Possible features to add:
- [ ] Edit profile (name, photo)
- [ ] Change password
- [ ] Email preferences
- [ ] Notification settings
- [ ] Language selection
- [ ] Theme toggle (dark/light mode)
- [ ] Account deletion
- [ ] Session management
- [ ] Two-factor authentication

## Notes

- Avatar menggunakan initials dari display name (max 2 characters)
- Roles ditampilkan sebagai badges dengan nama role
- Workspace yang sedang aktif ditandai dengan badge "Active"
- User yang admin di workspace ditandai dengan badge "Admin"
