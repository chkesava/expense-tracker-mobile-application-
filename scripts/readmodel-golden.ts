/** SPENDLY-510 — regenerates supabase-readmodel/tests/golden.sql (see lib/readmodelGolden.ts). */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { buildGoldenSql } from "./lib/readmodelGolden";

const target = path.resolve(__dirname, "../supabase-readmodel/tests/golden.sql");
writeFileSync(target, buildGoldenSql());
console.log(`wrote ${path.relative(process.cwd(), target)}`);
