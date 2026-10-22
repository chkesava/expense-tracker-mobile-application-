/**
 * SPENDLY-519 — finds server secrets in a built app bundle.
 *
 * The read model's only client value is the publishable key
 * (`sb_publishable_…`). Anything below in a shipped bundle is a leak:
 * - a Supabase secret key (`sb_secret_…`);
 * - a legacy Supabase JWT whose payload says `"role":"service_role"`;
 * - a PEM private key or a service-account JSON (`"private_key"`,
 *   `"type":"service_account"`);
 * - the name of a server-only env variable (the code reading it was bundled).
 *
 * Pure: give it file names and contents; `scripts/scan-bundle-secrets.ts`
 * walks a directory.
 */
export type SecretFinding = { file: string; kind: string; sample: string };

const SERVER_ENV_NAMES = [
  "READMODEL_SUPABASE_SERVICE_ROLE_KEY",
  "READMODEL_SUPABASE_DB_URL",
  "READMODEL_FIREBASE_SERVICE_ACCOUNT",
  "SUPABASE_SERVICE_ROLE_KEY",
  "FIREBASE_SERVICE_ACCOUNT",
];

const JWT = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g;

function jwtRole(payload: string): string | null {
  try {
    const json = Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

/** Shortened so a report never re-publishes a real secret. */
const redact = (s: string) => (s.length <= 12 ? s : `${s.slice(0, 10)}…`);

export function scanForSecrets(files: { name: string; content: string }[]): SecretFinding[] {
  const out: SecretFinding[] = [];
  for (const { name, content } of files) {
    for (const m of content.matchAll(/sb_secret_[A-Za-z0-9_-]{4,}/g)) out.push({ file: name, kind: "supabase secret key", sample: redact(m[0]) });
    for (const m of content.matchAll(JWT)) {
      if (jwtRole(m[1]) === "service_role") out.push({ file: name, kind: "service_role JWT", sample: redact(m[0]) });
    }
    if (content.includes("-----BEGIN PRIVATE KEY-----") || content.includes("-----BEGIN RSA PRIVATE KEY-----")) {
      out.push({ file: name, kind: "PEM private key", sample: "-----BEGIN…" });
    }
    if (/"private_key"\s*:/.test(content) || /"type"\s*:\s*"service_account"/.test(content)) {
      out.push({ file: name, kind: "service-account JSON", sample: "\"private_key\"/\"service_account\"" });
    }
    for (const env of SERVER_ENV_NAMES) {
      // EXPO_PUBLIC_ names are client values by definition; match the bare name only.
      const bare = new RegExp(`(?<![A-Z_])${env}(?![A-Z_])`);
      if (bare.test(content)) out.push({ file: name, kind: "server env name", sample: env });
    }
  }
  return out;
}
