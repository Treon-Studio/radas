/**
 * Development Tools
 * Auto-expose helpful functions to browser console for debugging
 */

import {
  resetFirebaseDatabase,
  deleteCurrentAuthUser,
  completeReset,
  setupFirebase,
  isFirebaseSetup,
} from "@/features/users";

// Only expose in development
if (import.meta.env.DEV) {
  // Expose to window object for easy console access
  Object.assign(window, {
    // Reset functions
    resetFirebase: resetFirebaseDatabase,
    deleteAuthUser: deleteCurrentAuthUser,
    completeFirebaseReset: completeReset,

    // Setup functions
    setupFirebase,
    isFirebaseSetup,

    // Helper to show available commands
    showDevCommands: () => {
      console.log("\n" + "=".repeat(60));
      console.log("🛠️  DEV TOOLS - Available Commands");
      console.log("=".repeat(60));
      console.log("\n📚 Setup & Reset:");
      console.log("  await resetFirebase()           - Reset database only");
      console.log("  await completeFirebaseReset()   - Reset database + auth user");
      console.log("  await deleteAuthUser()          - Delete current auth user");
      console.log("  await isFirebaseSetup()         - Check if setup complete");
      console.log(
        "\n  await setupFirebase({\n    adminEmail: 'admin@example.com',\n    adminPassword: 'password',\n    adminDisplayName: 'Admin'\n  })"
      );
      console.log("\n💡 Tips:");
      console.log("  - Type showDevCommands() to see this help again");
      console.log("  - All functions are async, use await");
      console.log("  - Check RESET.md for detailed documentation");
      console.log("\n⚠️  Warning: Reset functions delete ALL data!");
      console.log("=".repeat(60) + "\n");
    },
  });

  // Show commands on load
  console.log("\n🎉 Dev Tools loaded! Type showDevCommands() for help\n");
}

export {};
