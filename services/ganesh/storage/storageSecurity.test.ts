import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { env } from "@/lib/env";

const root = path.resolve(__dirname, "../../..");

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("ganesh storage security", () => {
  it("does not put a service role key in the Expo client", () => {
    expect("serviceRole" in env.supabase).toBe(false);
    expect(Object.keys(env.supabase)).toEqual(["url", "publishableKey"]);
    const scanned = [
      "lib/env.ts",
      "lib/supabase.ts",
      ".env.example",
      "services/ganesh/storage/supabaseStorage.ts",
      "services/ganesh/storage/storageService.ts",
    ]
      .map(read)
      .join("\n");
    expect(scanned).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(scanned).not.toMatch(/serviceRole\s*:/);
  });

  it("uses signed URLs instead of public URLs", () => {
    const source = read("services/ganesh/storage/supabaseStorage.ts");
    expect(source).toContain("createSignedUrl");
    expect(source).not.toContain("getPublicUrl");
  });
});
