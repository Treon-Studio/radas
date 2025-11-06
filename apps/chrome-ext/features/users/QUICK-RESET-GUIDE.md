# 🚀 Quick Reset Guide (Copy-Paste Ready)

## 📋 Step-by-Step

### 1. Open Extension Popup
Click extension icon in toolbar

### 2. Open Developer Console
Right-click → **Inspect** (or press **F12**)

### 3. Run Reset Command

**Copy & Paste ONE of these:**

#### Option A: Reset Database Only ⚡
```javascript
await resetFirebase()
```

#### Option B: Complete Reset (Database + Auth) 🔥
```javascript
await completeFirebaseReset()
```

#### Option C: Show Available Commands 📚
```javascript
showDevCommands()
```

### 4. Wait for Completion
You'll see progress in console:
```
✅ Database reset completed successfully!
Total documents deleted: 53
```

### 5. Reload Extension
Click reload icon in Chrome Extensions page

### 6. Setup Fresh Database
Fill in form:
- **Email**: admin@example.com
- **Password**: (min 6 chars)
- **Name**: Admin User

Click **"Initialize Firebase"**

### 7. Done! 🎉
Login with your new credentials

---

## 🆘 Troubleshooting

| Problem | Solution |
|---------|----------|
| Command not found | Type `showDevCommands()` first |
| Permission denied | Check Firestore rules |
| Setup page not showing | Hard reload (Ctrl+Shift+R) |
| Auth error "requires-recent-login" | Logout and login again |

---

## 📱 Quick Commands Reference

```javascript
// Show help
showDevCommands()

// Reset database
await resetFirebase()

// Complete reset
await completeFirebaseReset()

// Delete auth user only
await deleteAuthUser()

// Check setup status
await isFirebaseSetup()
```

---

## ⚠️ Remember
- **ALL DATA WILL BE DELETED**
- Cannot be undone
- Development only
- Reload extension after reset

---

**Need detailed docs?** See `RESET.md`
