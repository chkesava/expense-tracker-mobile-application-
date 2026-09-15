/**
 * Finds user-facing English string literals still hardcoded in Ganesh screens.
 *
 * Ganesh Seva's copy is migrating into `shared/i18n/ganesh` one screen area at
 * a time, which takes several passes over ~140 files. The risk in a migration
 * that long is not the code already moved — it is the new screen someone adds
 * halfway through with its strings inline, quietly growing the backlog.
 *
 * So this module powers a ratchet: `lib/ganeshI18nGuard.test.ts` holds a
 * per-file baseline count that may only shrink. It is a plain regex scan rather
 * than an AST parse because there is no TS parser in the test toolchain and a
 * false positive is cheap — annotate the line and move on.
 *
 * A vitest test rather than an ESLint rule because this repo has no ESLint at
 * all; `lib/ganeshSplash.test.ts` set the precedent for source assertions that
 * run inside the existing `npm test` gate.
 */
import fs from "fs";
import path from "path";

/** Opt a line out with a trailing `// i18n-exempt: <why>`. */
export const EXEMPT_MARKER = "i18n-exempt";

/**
 * Props and calls that carry copy a committee member reads.
 *
 * Only double-quoted literals starting with a capital are matched. Lowercase
 * values are overwhelmingly ids, testIDs, icon names and log labels, and
 * sweeping those in would bury the real findings.
 */
const PATTERNS: RegExp[] = [
  /\b(?:title|subtitle|label|placeholder|message|description|meta|heading|help)\s*[:=]\s*"[A-Z][^"]{2,}"/g,
  /\btoast\.(?:error|success|info|warn)\(\s*"[A-Z][^"]{2,}"/g,
  /\bAlert\.alert\(\s*"[A-Z][^"]{2,}"/g,
];

export type Finding = { file: string; line: number; text: string };

export function scanFile(root: string, relative: string): Finding[] {
  const lines = fs.readFileSync(path.join(root, relative), "utf8").split(/\r?\n/);
  const findings: Finding[] = [];
  lines.forEach((line, index) => {
    if (line.includes(EXEMPT_MARKER)) return;
    for (const pattern of PATTERNS) {
      pattern.lastIndex = 0;
      const match = pattern.exec(line);
      if (match) {
        findings.push({ file: relative, line: index + 1, text: match[0].trim() });
        break;
      }
    }
  });
  return findings;
}

/** Every `.ts`/`.tsx` under `dir`, excluding tests, as root-relative paths. */
export function sourceFiles(root: string, dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(path.join(root, current), { withFileTypes: true })) {
      const next = path.posix.join(current, entry.name);
      if (entry.isDirectory()) {
        walk(next);
      } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        out.push(next);
      }
    }
  };
  walk(dir);
  return out.sort();
}

export function scanAll(root: string, dirs: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const dir of dirs) {
    for (const file of sourceFiles(root, dir)) {
      const findings = scanFile(root, file);
      if (findings.length > 0) counts.set(file, findings.length);
    }
  }
  return counts;
}
