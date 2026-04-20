import { describe, expect, it } from "vitest";

import {
  formatFileSize,
  formatPercent,
  formatRelative,
} from "./format";

const NOW = new Date("2026-04-17T12:00:00Z");

describe("formatRelative", () => {
  it("renders 'Just now' inside 45 seconds", () => {
    expect(formatRelative("2026-04-17T11:59:40Z", NOW)).toBe("Just now");
  });
  it("renders '1 minute ago' between 45 and 90 seconds", () => {
    expect(formatRelative("2026-04-17T11:58:50Z", NOW)).toBe("1 minute ago");
  });
  it("renders 'N minutes ago' up to 45 minutes", () => {
    expect(formatRelative("2026-04-17T11:30:00Z", NOW)).toBe("30 minutes ago");
  });
  it("renders 'N hours ago' inside the day", () => {
    expect(formatRelative("2026-04-17T06:00:00Z", NOW)).toBe("6 hours ago");
  });
  it("renders 'Yesterday' one calendar day back", () => {
    expect(formatRelative("2026-04-16T10:00:00Z", NOW)).toBe("Yesterday");
  });
  it("renders 'N days ago' within the week", () => {
    expect(formatRelative("2026-04-14T10:00:00Z", NOW)).toBe("3 days ago");
  });
  it("falls back to an absolute short date past a week", () => {
    const s = formatRelative("2026-03-01T10:00:00Z", NOW);
    expect(s).toMatch(/Mar/);
  });
});

describe("formatPercent", () => {
  it("rounds to whole percentages by default", () => {
    expect(formatPercent(90.24)).toBe("90%");
  });
  it("respects the decimals parameter", () => {
    expect(formatPercent(90.24, 1)).toBe("90.2%");
    expect(formatPercent(90.24, 2)).toBe("90.24%");
  });
  it("clamps to 0..100", () => {
    expect(formatPercent(-5)).toBe("0%");
    expect(formatPercent(150)).toBe("100%");
  });
});

describe("formatFileSize", () => {
  it("uses bytes under 1 KB", () => {
    expect(formatFileSize(999)).toBe("999 bytes");
  });
  it("uses KB up to 1 MB", () => {
    expect(formatFileSize(5 * 1024)).toBe("5 KB");
  });
  it("uses MB with one decimal above 1 MB", () => {
    expect(formatFileSize(2.4 * 1024 * 1024)).toBe("2.4 MB");
  });
});

