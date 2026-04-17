import { ImagePlus } from "lucide-react";
import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";

// Drag-and-drop + tap-to-select upload target. Keyboard accessible:
// focusable, Enter/Space trigger the hidden file input. The component
// owns only presentation state (drag-highlight, input ref) — file
// selection is reported upward via onFile, and the parent page owns
// everything else (validation errors, upload progress, submit).

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
  selectedFile?: File | null;
};

const ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif";

export function UploadArea({ onFile, disabled, selectedFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const open = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open();
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const base =
    "relative flex flex-col items-center justify-center gap-3 rounded-frame border-2 border-dashed px-6 py-16 text-center transition-colors";
  const state = disabled
    ? "border-paper-edge bg-paper text-ink-muted cursor-not-allowed"
    : dragging
      ? "border-cobalt bg-cobalt/5 text-ink cursor-pointer"
      : "border-ink/15 bg-paper hover:bg-paper-edge text-ink cursor-pointer";

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label="Upload an image to scan"
      aria-disabled={disabled}
      onClick={open}
      onKeyDown={onKeyDown}
      onDragEnter={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`${base} ${state}`}
    >
      <ImagePlus className="h-8 w-8" aria-hidden />
      {selectedFile ? (
        <>
          <div className="text-sm font-medium">{selectedFile.name}</div>
          <div className="text-xs text-ink-muted">
            Tap to choose a different image
          </div>
        </>
      ) : (
        <>
          <div className="text-base font-medium">
            Tap to upload, or drop an image
          </div>
          <div className="text-xs text-ink-muted">
            JPG, PNG, HEIC — up to 10 MB
          </div>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          // Clear the value so picking the same file twice in a row
          // still fires the change event.
          e.target.value = "";
        }}
      />
    </div>
  );
}
