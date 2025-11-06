import React, { useState, useRef } from "react";
import {
  Upload,
  Download,
  Trash2,
  FileText,
  File,
  Image,
  Video,
  Music,
  Archive,
  Code,
  X,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/shared/components/ui/alert-dialog";
import { useProjectDocuments, useDocumentMutations } from "../hooks";
import type { Document, CreateDocumentDto } from "../entity";
import {
  uploadFile,
  deleteFile,
  formatFileSize,
  generateUniqueFilename,
} from "@/shared/lib/firebase/storage";
import { toast } from "sonner";

interface DocumentsSectionProps {
  projectId: string;
}

// Get icon based on file type
function getFileIcon(fileType: string) {
  if (fileType.startsWith("image/")) return <Image size={20} className="text-blue-500" />;
  if (fileType.startsWith("video/")) return <Video size={20} className="text-purple-500" />;
  if (fileType.startsWith("audio/")) return <Music size={20} className="text-pink-500" />;
  if (fileType.includes("pdf")) return <FileText size={20} className="text-red-500" />;
  if (fileType.includes("zip") || fileType.includes("rar")) return <Archive size={20} className="text-yellow-500" />;
  if (fileType.includes("javascript") || fileType.includes("typescript") || fileType.includes("json")) {
    return <Code size={20} className="text-green-500" />;
  }
  return <File size={20} className="text-gray-500" />;
}

export function DocumentsSection({ projectId }: DocumentsSectionProps) {
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [documentDescription, setDocumentDescription] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingDocId, setDeletingDocId] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { documents, loading } = useProjectDocuments(projectId);
  const documentMutations = useDocumentMutations();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setDocumentName(file.name);
      setUploadDialogOpen(true);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      // Generate unique filename
      const uniqueFilename = generateUniqueFilename(selectedFile.name);
      const storagePath = `projects/${projectId}/documents/${uniqueFilename}`;

      // Upload to Firebase Storage
      const uploadResult = await uploadFile(selectedFile, storagePath, (progress) => {
        setUploadProgress(progress.progress);
      });

      if (!uploadResult.success || !uploadResult.downloadUrl) {
        toast.error("Failed to upload file");
        setUploading(false);
        return;
      }

      // Create document record in Firestore
      const documentData: CreateDocumentDto = {
        name: documentName,
        description: documentDescription || undefined,
        fileName: selectedFile.name,
        fileType: selectedFile.type,
        fileSize: selectedFile.size,
        downloadUrl: uploadResult.downloadUrl,
        storagePath: uploadResult.storagePath!,
      };

      const result = await documentMutations.create(projectId, documentData);

      if (result.success) {
        toast.success("File uploaded successfully");
        handleCloseDialog();
      } else {
        toast.error("Failed to save document");
        // Clean up uploaded file
        await deleteFile(uploadResult.storagePath!);
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const handleCloseDialog = () => {
    setUploadDialogOpen(false);
    setSelectedFile(null);
    setDocumentName("");
    setDocumentDescription("");
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDownload = (doc: Document) => {
    window.open(doc.downloadUrl, "_blank");
  };

  const handleDelete = async (doc: Document) => {
    try {
      // Delete from Firestore
      const result = await documentMutations.remove(doc.id);

      if (result.success) {
        // Delete from Storage
        await deleteFile(doc.storagePath);
        toast.success("Document deleted");
        setDeletingDocId(undefined);
      } else {
        toast.error("Failed to delete document");
      }
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Delete failed");
    }
  };

  const formatDate = (date: any): string => {
    if (!date) return "";
    try {
      const d = date.toDate ? date.toDate() : new Date(date);
      return d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return "";
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Loading documents...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b bg-background">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">Documents</h3>
            <p className="text-xs text-muted-foreground">
              {documents.length} file{documents.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div>
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              className="hidden"
              id="file-upload"
            />
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} className="mr-1" />
              Upload File
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {documents.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <FileText size={64} className="mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-4">No documents yet</p>
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload size={16} className="mr-2" />
                Upload First Document
              </Button>
            </div>
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            <div className="grid gap-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className="p-4 border rounded-lg bg-background hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {getFileIcon(doc.fileType)}
                    </div>

                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{doc.name}</h4>
                      {doc.description && (
                        <p className="text-xs text-muted-foreground mt-1">{doc.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                        <span>{doc.fileName}</span>
                        <span>{formatFileSize(doc.fileSize)}</span>
                        <span>{formatDate(doc.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDownload(doc)}
                        className="h-8"
                      >
                        <Download size={14} className="mr-1" />
                        Download
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setDeletingDocId(doc.id)}
                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={(open) => !open && handleCloseDialog()}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
            <DialogDescription>Add a file to your project</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {selectedFile && (
              <div className="p-3 border rounded-lg bg-muted/50">
                <div className="flex items-center gap-2">
                  {getFileIcon(selectedFile.type)}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCloseDialog}
                    className="h-6 w-6 p-0"
                  >
                    <X size={14} />
                  </Button>
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="doc-name">
                Document Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="doc-name"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                placeholder="Enter document name"
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="doc-description">Description (Optional)</Label>
              <Textarea
                id="doc-description"
                value={documentDescription}
                onChange={(e) => setDocumentDescription(e.target.value)}
                placeholder="Add a description..."
                rows={3}
              />
            </div>

            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Uploading...</span>
                  <span>{Math.round(uploadProgress)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleCloseDialog} disabled={uploading}>
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!documentName.trim() || !selectedFile || uploading}
            >
              {uploading ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingDocId}
        onOpenChange={(open) => !open && setDeletingDocId(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this document from storage. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const doc = documents.find((d) => d.id === deletingDocId);
                if (doc) handleDelete(doc);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
