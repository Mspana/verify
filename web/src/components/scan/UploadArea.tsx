import { Plus } from "lucide-react";
import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

// Drag-and-drop + tap-to-select upload target matching 01-home.html
// upload-area / upload-area-d. Bg is true white (distinct from the
// paper page bg) with a 1px dashed border tokenized as `border`.
// Keyboard accessible: focusable, Enter/Space trigger the hidden input.

type Props = {
  onFile: (file: File) => void;
  disabled?: boolean;
  selectedFile?: File | null;
};

const ACCEPT = "image/jpeg,image/jpg,image/png,image/webp,image/heic,image/heif";

export function UploadArea({ onFile, disabled, selectedFile }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { t } = useTranslation();

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
    "flex h-full flex-col items-center justify-center rounded-card border border-dashed px-4 py-[30px] text-center transition-colors md:px-6 md:py-[38px]";
  const state = disabled
    ? "border-border bg-white text-ink/55 cursor-not-allowed"
    : dragging
      ? "border-cobalt bg-cobalt/5 text-ink cursor-pointer"
      : "border-border bg-white hover:bg-paper-alt text-ink cursor-pointer";

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={t("upload.ariaLabel")}
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
      <div
        aria-hidden
        className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-paper-alt"
      >
        <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
      </div>
      {selectedFile ? (
        <>
          <div className="mt-2.5 max-w-full truncate text-[13px] font-medium">
            {selectedFile.name}
          </div>
          <div className="mt-0.5 text-[11px] text-ink/55">
            {t("upload.tapToChange")}
          </div>
        </>
      ) : (
        <>
          <div className="mt-2.5 text-[13px] font-medium">
            <span className="md:hidden">{t("upload.tapToUpload")}</span>
            <span className="hidden md:inline">
              {t("upload.dragOrClick")}
            </span>
          </div>
          <div className="mt-0.5 text-[11px] text-ink/55">
            {t("upload.hint")}
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
          e.target.value = "";
        }}
      />
    </div>
  );
}
