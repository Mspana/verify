import heic2any from "heic2any";
import type { ErrorCode } from "@verify/shared";

import { ApiError, postSubmit, postUploadUrl } from "./api";

// End-to-end upload pipeline: validate → (HEIC convert) → presign → PUT →
// submit. Returns a scanId on success. Everything else throws ApiError
// with an ErrorCode matching the catalog in ERRORS.md, so screens can
// branch on `err.code` without re-inventing the mapping.

export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const MIN_FILE_SIZE = 1024;

// Canonical MIME types we accept. We also recognize `image/jpg` because
// some older clients send it even though it isn't the canonical JPEG
// MIME; the helper below normalizes it to `image/jpeg` before the PUT,
// since the presigned URL's signature is scoped to the canonical value.
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);
const HEIC_TYPES = new Set(["image/heic", "image/heif"]);

type ValidationOk = { ok: true; file: File };
type ValidationErr = { ok: false; code: ErrorCode; message: string };

/**
 * Validate a File before we spend a round trip on it. Worker re-validates
 * authoritatively; this is UX. Size checks and type allowlist mirror
 * worker/src/handlers/scan.ts exactly. Filename sanitization is silent —
 * no user-facing error per ERRORS.md "Filename with spaces or unsafe chars".
 */
export function validateFile(file: File): ValidationOk | ValidationErr {
  if (file.size > MAX_FILE_SIZE) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `This image is ${mb} MB. Maximum is 10 MB.`,
    };
  }
  if (file.size < MIN_FILE_SIZE) {
    return {
      ok: false,
      code: "FILE_TOO_SMALL",
      message: "This image is too small to analyze.",
    };
  }

  const type = file.type.toLowerCase();
  if (!ALLOWED_TYPES.has(type)) {
    return {
      ok: false,
      code: "UNSUPPORTED_TYPE",
      message: "This file type isn't supported. Try JPG, PNG, or HEIC.",
    };
  }

  const sanitized = sanitizeFilename(file.name);
  if (sanitized === file.name) return { ok: true, file };
  return { ok: true, file: renameFile(file, sanitized) };
}

/**
 * Replace spaces with `-`, strip everything that isn't ASCII
 * alphanumeric / dot / underscore / dash. If that empties the name,
 * fall back to "upload" so downstream signing can't break.
 */
export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "");
  return cleaned.length > 0 ? cleaned : "upload";
}

function renameFile(file: File, newName: string): File {
  return new File([file], newName, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

/**
 * HEIC/HEIF → JPEG. No-op for other formats. Per ERRORS.md the conversion
 * is transparent; failure (usually unusual HEIC variants) surfaces as
 * UNSUPPORTED_TYPE with iPhone-specific guidance.
 */
export async function maybeConvertHeic(file: File): Promise<File> {
  const type = file.type.toLowerCase();
  if (!HEIC_TYPES.has(type)) return file;

  let blob: Blob;
  try {
    const converted = await heic2any({ blob: file, toType: "image/jpeg" });
    // heic2any returns a single Blob or an array depending on HEIC
    // variant. Flatten to one blob either way.
    blob = Array.isArray(converted) ? converted[0]! : converted;
  } catch {
    throw new ApiError(
      "UNSUPPORTED_TYPE",
      "We couldn't read this HEIC file. Export as JPG from Photos and try again.",
      true,
    );
  }

  const newName = file.name.replace(/\.(heic|heif)$/i, "") + ".jpg";
  return new File([blob], newName, {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

/**
 * The Content-Type we send on the PUT must match what the presigned URL
 * was signed with. TruthScan signs with the canonical MIME; normalizing
 * `image/jpg` → `image/jpeg` here prevents a SignatureDoesNotMatch.
 */
function canonicalContentType(file: File): string {
  const t = file.type.toLowerCase();
  if (t === "image/jpg") return "image/jpeg";
  return t;
}

type UploadOpts = {
  onProgress?: (pct: number) => void;
  /** Injectable for tests; defaults to the global XHR. */
  xhrFactory?: () => XMLHttpRequest;
  /** Injectable for tests; defaults to no-op delay. */
  sleep?: (ms: number) => Promise<void>;
};

const NETWORK_RETRY_BACKOFFS_MS = [1000, 2000, 4000];

/**
 * PUT a File to a Spaces presigned URL via XHR (for upload progress —
 * fetch doesn't expose that). Retries only transient network failures
 * with exp backoff up to 3 attempts, per ERRORS.md "Network offline
 * mid-upload". HTTP non-2xx maps to either UPLOAD_EXPIRED (so the caller
 * can request a fresh presigned URL) or UPLOAD_FAILED.
 */
export async function putToSpaces(
  url: string,
  file: File,
  opts: UploadOpts = {},
): Promise<void> {
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));

  for (let attempt = 0; attempt < NETWORK_RETRY_BACKOFFS_MS.length; attempt++) {
    try {
      await singlePut(url, file, opts);
      return;
    } catch (e) {
      const isNetwork = e instanceof ApiError && e.isNetwork;
      const isLast = attempt === NETWORK_RETRY_BACKOFFS_MS.length - 1;
      if (!isNetwork || isLast) throw e;
      await sleep(NETWORK_RETRY_BACKOFFS_MS[attempt]!);
    }
  }
}

function singlePut(
  url: string,
  file: File,
  opts: UploadOpts,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const xhr = (opts.xhrFactory ?? (() => new XMLHttpRequest()))();
    xhr.open("PUT", url);

    // Both headers are MANDATORY. The presigned URL is signed with
    // x-amz-acl: private in the signed-header list — omitting either
    // flips the signature and Spaces rejects with 400.
    xhr.setRequestHeader("Content-Type", canonicalContentType(file));
    xhr.setRequestHeader("x-amz-acl", "private");

    if (opts.onProgress) {
      xhr.upload.addEventListener("progress", (e) => {
        if (!e.lengthComputable) return;
        opts.onProgress!(Math.round((e.loaded / e.total) * 100));
      });
    }

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      // Presigned URL expired or signature mismatch from the timestamp
      // gate — treated as UPLOAD_EXPIRED so runUpload can retry once
      // with a fresh URL rather than surfacing to the user.
      const bodyText = xhr.responseText ?? "";
      const looksExpired =
        xhr.status === 403 &&
        /SignatureDoesNotMatch|Request has expired|AccessDenied/i.test(bodyText);
      if (looksExpired) {
        reject(
          new ApiError(
            "UPLOAD_EXPIRED",
            "Upload link expired. Retrying.",
            true,
            { status: xhr.status },
          ),
        );
        return;
      }
      reject(
        new ApiError(
          "UPLOAD_FAILED",
          "Upload couldn't finish. Your connection may have dropped.",
          true,
          { status: xhr.status },
        ),
      );
    });

    xhr.addEventListener("error", () => {
      // Distinct from HTTP errors: `error` fires when the transport
      // itself failed (CORS, offline, DNS). Flag isNetwork so the
      // retry loop above knows to back off rather than abandon.
      reject(
        new ApiError("UPLOAD_FAILED", "Network error during upload.", true, {
          isNetwork: true,
        }),
      );
    });

    xhr.addEventListener("abort", () => {
      reject(
        new ApiError("UPLOAD_FAILED", "Upload was cancelled.", false, {
          isNetwork: true,
        }),
      );
    });

    xhr.send(file);
  });
}

/**
 * Run the full upload flow and return the scanId the user's result page
 * should navigate to. Throws ApiError on any failure; `code` identifies
 * which stage failed so the caller can render the right UX.
 */
export async function runUpload(
  input: File,
  opts: UploadOpts = {},
): Promise<{ scanId: string }> {
  const validation = validateFile(input);
  if (!validation.ok) {
    throw new ApiError(validation.code, validation.message, true);
  }
  const converted = await maybeConvertHeic(validation.file);

  // UPLOAD_EXPIRED auto-retry: re-request a fresh presigned URL (and
  // with it a fresh scanId — the Worker generates one per upload-url
  // call) and try the PUT again. Only one retry; a second expiry is
  // a real failure and surfaces per ERRORS.md.
  let presign = await postUploadUrl({
    filename: converted.name,
    fileSize: converted.size,
    fileType: canonicalContentType(converted),
  });
  try {
    await putToSpaces(presign.uploadUrl, converted, opts);
  } catch (e) {
    if (e instanceof ApiError && e.code === "UPLOAD_EXPIRED") {
      presign = await postUploadUrl({
        filename: converted.name,
        fileSize: converted.size,
        fileType: canonicalContentType(converted),
      });
      await putToSpaces(presign.uploadUrl, converted, opts);
    } else {
      throw e;
    }
  }

  const submit = await postSubmit({
    scanId: presign.scanId,
    filePath: presign.filePath,
  });
  return { scanId: submit.scanId };
}
