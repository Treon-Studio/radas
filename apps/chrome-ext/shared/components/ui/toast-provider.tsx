import React from "react";
import { Toaster } from "sonner";

export function ToastProvider() {
  return (
    <Toaster 
      position="top-center"
      expand={false}
      richColors
      closeButton
      toastOptions={{
        style: {
          fontSize: '14px',
        },
        duration: 2000,
      }}
    />
  );
}