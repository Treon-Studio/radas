import {
  ref,
  uploadBytes,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject,
  listAll,
  type UploadResult,
  type StorageReference,
  type UploadTask,
} from 'firebase/storage';
import { storage } from './config';

/**
 * Upload a file to Firebase Storage
 */
export async function uploadFile(
  path: string,
  file: File | Blob,
  metadata?: Record<string, string>
): Promise<UploadResult> {
  const storageRef = ref(storage, path);
  return await uploadBytes(storageRef, file, { customMetadata: metadata });
}

/**
 * Upload file with progress tracking
 */
export function uploadFileWithProgress(
  path: string,
  file: File | Blob,
  onProgress?: (progress: number) => void,
  metadata?: Record<string, string>
): UploadTask {
  const storageRef = ref(storage, path);
  const uploadTask = uploadBytesResumable(storageRef, file, { customMetadata: metadata });

  if (onProgress) {
    uploadTask.on('state_changed', (snapshot) => {
      const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      onProgress(progress);
    });
  }

  return uploadTask;
}

/**
 * Get download URL for a file
 */
export async function getFileURL(path: string): Promise<string> {
  const storageRef = ref(storage, path);
  return await getDownloadURL(storageRef);
}

/**
 * Delete a file from Firebase Storage
 */
export async function deleteFile(path: string): Promise<void> {
  const storageRef = ref(storage, path);
  return await deleteObject(storageRef);
}

/**
 * List all files in a directory
 */
export async function listFiles(path: string): Promise<StorageReference[]> {
  const storageRef = ref(storage, path);
  const result = await listAll(storageRef);
  return result.items;
}

/**
 * Get storage reference
 */
export function getStorageRef(path: string): StorageReference {
  return ref(storage, path);
}

/**
 * Upload image with automatic path generation
 */
export async function uploadImage(
  folder: string,
  file: File,
  onProgress?: (progress: number) => void
): Promise<{ url: string; path: string }> {
  const timestamp = Date.now();
  const fileName = `${timestamp}-${file.name}`;
  const path = `${folder}/${fileName}`;

  const uploadTask = uploadFileWithProgress(path, file, onProgress);

  await uploadTask;

  const url = await getFileURL(path);

  return { url, path };
}
