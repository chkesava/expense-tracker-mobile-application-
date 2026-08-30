import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function walkPngs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkPngs(full));
    } else if (entry.name.toLowerCase().endsWith(".png")) {
      out.push(full);
    }
  }
  return out;
}

describe("PNG assets for Android AAPT", () => {
  it("every .png under assets/ is a real PNG, not a JPEG with a .png name", () => {
    const files = walkPngs(path.join(ROOT, "assets"));
    expect(files.length).toBeGreaterThan(0);

    const bad = files.filter((file) => {
      const header = Buffer.alloc(8);
      const fd = fs.openSync(file, "r");
      fs.readSync(fd, header, 0, 8, 0);
      fs.closeSync(fd);
      return !header.equals(PNG_SIGNATURE);
    });

    expect(bad.map((file) => path.relative(ROOT, file))).toEqual([]);
  });
});
