import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  UploadTaskSnapshot,
} from "firebase/storage";
import { app } from "./config";

const storage = getStorage(app);

export interface UploadProgress {
  progress: number; // 0-100
  bytesTransferred: number;
  totalBytes: number;
}

export interface UploadResult {
  success: boolean;
  downloadUrl?: string;
  storagePath?: string;
  error?: any;
}

/**
 * Upload file to Firebase Storage
 * @param file - File to upload
 * @param path - Storage path (e.g., "projects/projectId/documents/filename.pdf")
 * @param onProgress - Optional progress callback
 * @returns Upload result with download URL
 */
export const uploadFile = async (
  file: File,
  path: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> => {
  try {
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytesResumable(storageRef, file);

    return new Promise((resolve) => {
      uploadTask.on(
        "state_changed",
        (snapshot: UploadTaskSnapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          if (onProgress) {
            onProgress({
              progress,
              bytesTransferred: snapshot.bytesTransferred,
              totalBytes: snapshot.totalBytes,
            });
          }
        },
        (error) => {
          console.error("Upload error:", error);
          resolve({ success: false, error });
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            resolve({
              success: true,
              downloadUrl,
              storagePath: path,
            });
          } catch (error) {
            console.error("Error getting download URL:", error);
            resolve({ success: false, error });
          }
        }
      );
    });
  } catch (error) {
    console.error("Upload file error:", error);
    return { success: false, error };
  }
};

/**
 * Delete file from Firebase Storage
 * @param storagePath - Path to file in storage
 * @returns Success status
 */
export const deleteFile = async (storagePath: string): Promise<{ success: boolean; error?: any }> => {
  try {
    const fileRef = ref(storage, storagePath);
    await deleteObject(fileRef);
    return { success: true };
  } catch (error) {
    console.error("Delete file error:", error);
    return { success: false, error };
  }
};

/**
 * Get download URL for a file
 * @param storagePath - Path to file in storage
 * @returns Download URL
 */
export const getFileDownloadUrl = async (
  storagePath: string
): Promise<{ success: boolean; url?: string; error?: any }> => {
  try {
    const fileRef = ref(storage, storagePath);
    const url = await getDownloadURL(fileRef);
    return { success: true, url };
  } catch (error) {
    console.error("Get download URL error:", error);
    return { success: false, error };
  }
};

/**
 * Format file size to human readable format
 * @param bytes - File size in bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

/**
 * Get file extension from filename
 * @param filename - File name
 * @returns Extension (e.g., "pdf", "jpg")
 */
export const getFileExtension = (filename: string): string => {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
};

/**
 * Generate unique filename with timestamp
 * @param originalName - Original file name
 * @returns Unique filename
 */
export const generateUniqueFilename = (originalName: string): string => {
  const timestamp = Date.now();
  const extension = getFileExtension(originalName);
  const nameWithoutExt = originalName.substring(
    0,
    originalName.lastIndexOf(".")
  );

  return `${nameWithoutExt}-${timestamp}.${extension}`;
};

/**
 * Validate image file type and size
 * @param file - File to validate
 * @param maxSizeMB - Maximum file size in MB (default: 5MB)
 * @returns Validation result
 */
export const validateImageFile = (
  file: File,
  maxSizeMB = 5
): { valid: boolean; error?: string } => {
  // Check file type
  const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"];
  if (!validTypes.includes(file.type)) {
    return {
      valid: false,
      error: "File must be an image (JPEG, PNG, GIF, or WebP)",
    };
  }

  // Check file size
  const maxSize = maxSizeMB * 1024 * 1024;
  if (file.size > maxSize) {
    return {
      valid: false,
      error: `File size must be less than ${maxSizeMB}MB`,
    };
  }

  return { valid: true };
};

/**
 * Upload workspace logo image
 * @param file - Image file to upload
 * @param workspaceId - Workspace ID
 * @param onProgress - Optional progress callback
 * @returns Upload result with download URL
 */
export const uploadWorkspaceLogo = async (
  file: File,
  workspaceId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> => {
  // Validate image
  const validation = validateImageFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const path = `workspaces/${workspaceId}/logo.${getFileExtension(file.name)}`;
  return uploadFile(file, path, onProgress);
};

/**
 * Upload user avatar image
 * @param file - Image file to upload
 * @param userId - User ID
 * @param onProgress - Optional progress callback
 * @returns Upload result with download URL
 */
export const uploadUserAvatar = async (
  file: File,
  userId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> => {
  // Validate image
  const validation = validateImageFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const path = `users/${userId}/avatar.${getFileExtension(file.name)}`;
  return uploadFile(file, path, onProgress);
};

/**
 * Upload project image
 * @param file - Image file to upload
 * @param projectId - Project ID
 * @param onProgress - Optional progress callback
 * @returns Upload result with download URL
 */
export const uploadProjectImage = async (
  file: File,
  projectId: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> => {
  // Validate image
  const validation = validateImageFile(file);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const filename = generateUniqueFilename(file.name);
  const path = `projects/${projectId}/${filename}`;
  return uploadFile(file, path, onProgress);
};
