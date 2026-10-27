import { describe, it, expect } from "vitest";
import { parseFileDataUrl, isSafeUploadName, uploadMimeByName } from "@/lib/uploads";

describe("Upload utilities", () => {
  it("parses a valid JPEG data URL", () => {
    const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;
    const parsed = parseFileDataUrl(dataUrl);
    expect(parsed).not.toBeNull();
    expect(parsed?.mime).toBe("image/jpeg");
    expect(parsed?.bytes.length).toBe(bytes.length);
  });

  it("rejects data URLs without matching magic bytes", () => {
    const bytes = Buffer.from("hello world");
    const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
    expect(parseFileDataUrl(dataUrl)).toBeNull();
  });

  it("rejects oversized payloads", () => {
    const huge = Buffer.alloc(3 * 1024 * 1024 + 10, 0xff);
    huge[0] = 0xff; huge[1] = 0xd8;
    const dataUrl = `data:image/jpeg;base64,${huge.toString("base64")}`;
    expect(parseFileDataUrl(dataUrl)).toBeNull();
  });

  it("validates safe upload names", () => {
    expect(isSafeUploadName("12345678-1234-1234-1234-123456789abc.jpg")).toBe(true);
    expect(isSafeUploadName("../x.jpg")).toBe(false);
    expect(isSafeUploadName("foo.png")).toBe(false);
  });

  it("returns mime by extension", () => {
    expect(uploadMimeByName("abc.pdf")).toBe("application/pdf");
    expect(uploadMimeByName("abc.unknown")).toBe("application/octet-stream");
  });
});