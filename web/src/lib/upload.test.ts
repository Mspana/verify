import { describe, expect, it, vi } from "vitest";

// heic2any pulls in a Web Worker at import time, which jsdom doesn't
// provide. These tests don't exercise HEIC conversion directly, so we
// stub the module out rather than adding a `canvas` native dep.
vi.mock("heic2any", () => ({
  default: vi.fn(async () => new Blob()),
}));

import { ApiError } from "./api";
import {
  MAX_FILE_SIZE,
  MIN_FILE_SIZE,
  putToSpaces,
  sanitizeFilename,
  validateFile,
} from "./upload";

function makeFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("sanitizeFilename", () => {
  it("replaces spaces with dashes", () => {
    expect(sanitizeFilename("my cat photo.jpg")).toBe("my-cat-photo.jpg");
  });
  it("strips unsafe punctuation", () => {
    expect(sanitizeFilename('a"b/c?d.jpg')).toBe("abcd.jpg");
  });
  it("strips non-ASCII characters", () => {
    expect(sanitizeFilename("你好-photo.jpg")).toBe("-photo.jpg");
  });
  it("falls back to 'upload' when stripping empties the name", () => {
    expect(sanitizeFilename("你好")).toBe("upload");
  });
  it("preserves a clean filename untouched", () => {
    expect(sanitizeFilename("portrait-outdoor.jpeg")).toBe("portrait-outdoor.jpeg");
  });
});

describe("validateFile", () => {
  it("accepts a plain JPEG in range", () => {
    const f = makeFile("photo.jpg", "image/jpeg", 2 * 1024 * 1024);
    const r = validateFile(f);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.name).toBe("photo.jpg");
  });

  it("accepts every allowlisted MIME", () => {
    for (const t of [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ]) {
      const f = makeFile("x.bin", t, 2048);
      expect(validateFile(f).ok).toBe(true);
    }
  });

  it("rejects files > 10 MB as FILE_TOO_LARGE", () => {
    const f = makeFile("big.jpg", "image/jpeg", MAX_FILE_SIZE + 1);
    const r = validateFile(f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects files < 1 KB as FILE_TOO_SMALL", () => {
    const f = makeFile("tiny.jpg", "image/jpeg", MIN_FILE_SIZE - 1);
    const r = validateFile(f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("FILE_TOO_SMALL");
  });

  it("rejects unknown MIME types as UNSUPPORTED_TYPE", () => {
    const f = makeFile("video.mov", "video/quicktime", 4096);
    const r = validateFile(f);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("UNSUPPORTED_TYPE");
  });

  it("silently sanitizes filenames with spaces", () => {
    const f = makeFile("my cat.jpg", "image/jpeg", 4096);
    const r = validateFile(f);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.name).toBe("my-cat.jpg");
  });

  it("silently sanitizes non-ASCII filenames", () => {
    const f = makeFile("你好.jpg", "image/jpeg", 4096);
    const r = validateFile(f);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.name).toBe(".jpg");
  });
});

// === PUT header invariant ===
//
// The single most failure-prone bit of the upload flow: if we forget
// either Content-Type or x-amz-acl the Spaces PUT fails with a 400 that
// looks unrelated. Pin both headers explicitly.

class FakeXhr {
  readonly upload = { addEventListener: () => {} };
  private listeners: Record<string, Array<() => void>> = {};
  openedUrl = "";
  openedMethod = "";
  readonly setRequestHeader = vi.fn();
  status = 200;
  responseText = "";

  open(method: string, url: string) {
    this.openedMethod = method;
    this.openedUrl = url;
  }
  addEventListener(event: string, cb: () => void) {
    (this.listeners[event] ??= []).push(cb);
  }
  send() {
    queueMicrotask(() => {
      for (const cb of this.listeners.load ?? []) cb();
    });
  }
}

describe("putToSpaces", () => {
  it("sends Content-Type and x-amz-acl headers on every PUT", async () => {
    const xhr = new FakeXhr();
    const file = makeFile("photo.jpg", "image/jpeg", 4096);
    await putToSpaces("https://spaces.example/upload", file, {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
    });
    const headers = Object.fromEntries(
      xhr.setRequestHeader.mock.calls.map(([k, v]) => [k.toLowerCase(), v]),
    );
    expect(headers["content-type"]).toBe("image/jpeg");
    expect(headers["x-amz-acl"]).toBe("private");
    expect(xhr.openedMethod).toBe("PUT");
    expect(xhr.openedUrl).toBe("https://spaces.example/upload");
  });

  it("normalizes image/jpg to image/jpeg on the PUT (matches the signed MIME)", async () => {
    const xhr = new FakeXhr();
    const file = makeFile("photo.jpg", "image/jpg", 4096);
    await putToSpaces("https://spaces.example/upload", file, {
      xhrFactory: () => xhr as unknown as XMLHttpRequest,
    });
    const ct = xhr.setRequestHeader.mock.calls.find(
      ([k]) => k.toLowerCase() === "content-type",
    )?.[1];
    expect(ct).toBe("image/jpeg");
  });

  it("maps a 403 SignatureDoesNotMatch response to UPLOAD_EXPIRED", async () => {
    class ExpiredXhr extends FakeXhr {
      constructor() {
        super();
        this.status = 403;
        this.responseText =
          "<Error><Code>SignatureDoesNotMatch</Code></Error>";
      }
    }
    const xhr = new ExpiredXhr();
    const file = makeFile("photo.jpg", "image/jpeg", 4096);
    await expect(
      putToSpaces("https://spaces.example/upload", file, {
        xhrFactory: () => xhr as unknown as XMLHttpRequest,
      }),
    ).rejects.toMatchObject({
      code: "UPLOAD_EXPIRED",
    });
  });

  it("wraps non-expiry PUT failures as UPLOAD_FAILED", async () => {
    class FailXhr extends FakeXhr {
      constructor() {
        super();
        this.status = 400;
      }
    }
    const xhr = new FailXhr();
    const file = makeFile("photo.jpg", "image/jpeg", 4096);
    await expect(
      putToSpaces("https://spaces.example/upload", file, {
        xhrFactory: () => xhr as unknown as XMLHttpRequest,
      }),
    ).rejects.toMatchObject({
      code: "UPLOAD_FAILED",
    });
  });

  it("retries transient network errors up to 3 times with backoff before failing", async () => {
    let attempts = 0;
    class NetworkXhr extends FakeXhr {
      send() {
        attempts++;
        queueMicrotask(() => {
          for (const cb of (this as unknown as { listeners: Record<string, Array<() => void>> })
            .listeners.error ?? []) cb();
        });
      }
    }
    const file = makeFile("photo.jpg", "image/jpeg", 4096);
    await expect(
      putToSpaces("https://spaces.example/upload", file, {
        xhrFactory: () => new NetworkXhr() as unknown as XMLHttpRequest,
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(attempts).toBe(3);
  });
});
