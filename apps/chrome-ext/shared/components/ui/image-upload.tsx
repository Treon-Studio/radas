import { useState, useRef } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { Button } from "./button";
import { Progress } from "./progress";
import { cn } from "@/shared/lib/utils";
import type { UploadProgress } from "@/shared/lib/firebase/storage";

interface ImageUploadProps {
  value?: string; // Current image URL
  onChange: (url: string | undefined) => void;
  onUpload: (file: File, onProgress?: (progress: UploadProgress) => void) => Promise<{
    success: boolean;
    downloadUrl?: string;
    error?: any;
  }>;
  disabled?: boolean;
  className?: string;
  previewClassName?: string;
  label?: string;
  description?: string;
}

export function ImageUpload({
  value,
  onChange,
  onUpload,
  disabled = false,
  className,
  previewClassName,
  label = "Upload Image",
  description = "Click to upload or drag and drop (Max 5MB)",
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | undefined>(value);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (file: File) => {
    setError(null);
    setUploading(true);
    setProgress(0);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);

    try {
      const result = await onUpload(file, (progressData) => {
        setProgress(progressData.progress);
      });

      if (result.success && result.downloadUrl) {
        onChange(result.downloadUrl);
        setPreview(result.downloadUrl);
      } else {
        setError(result.error?.message || "Upload failed");
        setPreview(value);
      }
    } catch (err: any) {
      setError(err.message || "Upload failed");
      setPreview(value);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleClick = () => {
    if (!disabled && !uploading) {
      fileInputRef.current?.click();
    }
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(undefined);
    setPreview(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled || uploading) return;

    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("image/")) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && <label className="text-sm font-medium">{label}</label>}

      <div
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={cn(
          "relative border-2 border-dashed rounded-lg overflow-hidden transition-colors cursor-pointer",
          disabled || uploading
            ? "opacity-50 cursor-not-allowed"
            : "hover:border-primary hover:bg-muted/50",
          error ? "border-destructive" : "border-muted-foreground/25",
          previewClassName
        )}
      >
        {preview ? (
          <div className="relative">
            <img
              src={preview}
              alt="Preview"
              className="w-full h-40 object-cover"
            />
            {!disabled && !uploading && (
              <Button
                type="button"
                size="icon"
                variant="destructive"
                className="absolute top-2 right-2 h-6 w-6"
                onClick={handleRemove}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 p-4 text-center">
            {uploading ? (
              <>
                <Upload className="h-8 w-8 mb-2 text-muted-foreground animate-pulse" />
                <p className="text-sm text-muted-foreground mb-2">
                  Uploading... {Math.round(progress)}%
                </p>
                <Progress value={progress} className="w-full max-w-xs" />
              </>
            ) : (
              <>
                <ImageIcon className="h-8 w-8 mb-2 text-muted-foreground" />
                <p className="text-sm font-medium mb-1">{label}</p>
                {description && (
                  <p className="text-xs text-muted-foreground">{description}</p>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={disabled || uploading}
        className="hidden"
      />
    </div>
  );
}
