#!/usr/bin/env node
/** Content-graph integrity linter. Astro owns frontmatter schema validation. */
import { readFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { glob } from "glob";
import matter from "gray-matter";

const ROOT = resolve(import.meta.dirname, "..");
const KB_COLLECTIONS = ["concepts", "patterns", "practices"];
const COLLECTIONS = [...KB_COLLECTIONS, "recipes"];
const BASELINE_PATH = resolve(import.meta.dirname, "content-integrity-baseline.json");
const posix = (path) => path.split(sep).join("/");

/** @param {{ root?: string }} options */
export async function findContentIntegrityErrors({ root = ROOT } = {}) {
  const files = await glob(COLLECTIONS.map((name) => `src/content/${name}/**/*.md`), {
    cwd: root,
    absolute: true,
  });
  const documents = new Map();
  for (const file of files) {
    const id = posix(relative(resolve(root, "src/content"), file)).replace(/\.md$/, "");
    documents.set(id, { file, relatedIds: matter(readFileSync(file, "utf8")).data.relatedIds });
  }
  const errors = [];
  for (const [id, document] of documents) {
    for (const relatedId of document.relatedIds ?? []) {
      const related = documents.get(relatedId);
      const file = posix(relative(root, document.file));
      // Recipes may link to KB articles without backlinks (specs/recipes/spec.md).
      const recipeToKb = id.startsWith("recipes/") &&
        KB_COLLECTIONS.some((collection) => relatedId.startsWith(`${collection}/`));
      if (!related) {
        errors.push(`${file}: relatedIds references nonexistent document "${relatedId}"`);
      } else if (!recipeToKb && !related.relatedIds?.includes(id)) {
        errors.push(`${file}: relatedIds relationship with "${relatedId}" is not reciprocal`);
      }
    }
  }
  return errors.sort();
}

/** @param {{ root?: string, baselinePath?: string }} options */
export async function lintContent({ root = ROOT, baselinePath = BASELINE_PATH } = {}) {
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  if (!Array.isArray(baseline) || !baseline.every((entry) => typeof entry === "string")) {
    throw new Error("Content integrity baseline must be an array of diagnostic strings");
  }
  const legacy = new Set(baseline);
  const errors = await findContentIntegrityErrors({ root });
  const current = new Set(errors);
  const unexpected = errors.filter((error) => !legacy.has(error));
  const stale = [...legacy].filter((error) => !current.has(error));
  const remaining = errors.length - unexpected.length;
  if (remaining) console.warn(`! ${remaining} documented legacy relationship defects remain`);
  if (!unexpected.length && !stale.length) return true;
  if (unexpected.length) {
    console.error(`✗ Content integrity lint failed (${unexpected.length} new defects)`);
    for (const error of unexpected) console.error(`  - ${error}`);
  }
  if (stale.length) {
    console.error(`✗ Remove ${stale.length} resolved exemptions from ${baselinePath}:`);
    for (const error of stale) console.error(`  - ${error}`);
  }
  return false;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  lintContent().then((ok) => {
    if (!ok) process.exitCode = 1;
  }).catch((error) => {
    console.error("Content integrity linter crashed:", error);
    process.exitCode = 1;
  });
}
