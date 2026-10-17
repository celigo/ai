#!/usr/bin/env node
/**
 * Check that every $ref in the skill reference schemas resolves inside its own skill.
 *
 * Each skill installs on its own (`npx skills add --skill`, the MCP server's skill:// resources), so
 * a $ref has to land on a file in the same skill directory. The incident this guards against: in
 * Oct 2026, 66 $refs in 39 synced schemas pointed at files the sync never copied — every
 * `allOf: [$ref: ./base.yml#/ExportBase]`-style request and response schema among them — so agents
 * could not see `filter`, `oneToMany`, `traceKeyTemplate`, the flow `schedule`, and the rest.
 *
 * For each $ref: the target file exists, sits inside the referencing file's skill, and has the
 * component the pointer names first (`#/ExportBase/properties/x` → `ExportBase`) as a top-level key.
 * Text-level and dependency-free; matches block (`$ref: x`, `- $ref: x`) and flow (`{ $ref: x }`)
 * mappings, and ignores prose that merely mentions `$ref`.
 *
 * Usage: node scripts/check-schema-refs.mjs   (checks every yml under skills/)
 * Exits non-zero when any $ref dangles. scripts/sync-schemas.mjs runs the same check on the state a
 * sync would produce, before it writes anything.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Groups: 1 = everything before the value, 2 = quote, 3 = file part, 4 = JSON pointer.
const BLOCK_REF = /^([ \t]*(?:-[ \t]+)?\$ref:[ \t]*)(['"]?)([^'"\s#]*)(#[^'"\s]*)?\2(?=[ \t]*(?:#.*)?$)/gm;
const FLOW_REF = /(\{[ \t]*\$ref:[ \t]*)(['"]?)([^'"\s#,}]*)(#[^'"\s,}]*)?\2(?=[ \t]*\})/g;

/** Every $ref in a YAML text as `{ file, pointer }`; `file` is "" for a ref within the same file. */
export function extractRefs(text) {
	return [...text.matchAll(BLOCK_REF), ...text.matchAll(FLOW_REF)].map((m) => ({
		file: m[3],
		pointer: m[4] ?? "",
	}));
}

/** Replace each $ref's file part with `mapFile(file)`, keeping its quoting and pointer as written. */
export function rewriteRefs(text, mapFile) {
	const swap = (match, prefix, quote, file, pointer = "") => {
		if (!file) return match;
		return `${prefix}${quote}${mapFile(file)}${pointer}${quote}`;
	};
	return text.replace(BLOCK_REF, swap).replace(FLOW_REF, swap);
}

function topLevelComponent(pointer) {
	const first = pointer.replace(/^#\/?/, "").split("/")[0];
	if (!first) return null;
	return decodeURIComponent(first).replaceAll("~1", "/").replaceAll("~0", "~");
}

function hasTopLevelKey(text, key) {
	const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	return new RegExp(`^(['"]?)${escaped}\\1:`, "m").test(text);
}

function danglingReason(files, path, { file, pointer }) {
	const skillDir = `${path.split("/").slice(0, 2).join("/")}/`;
	const target = file ? posix.normalize(posix.join(posix.dirname(path), file)) : path;
	if (!target.startsWith(skillDir)) return `${target} is outside the skill`;
	if (!files.has(target)) return `${target} is not present`;
	const component = topLevelComponent(pointer);
	if (component && !hasTopLevelKey(files.get(target), component)) {
		return `${target} has no top-level ${component}`;
	}
	return null;
}

/**
 * Every $ref that does not resolve inside its skill.
 * `files` maps repo-relative paths (`skills/<skill>/...`) to file text; returns `{ path, ref, reason }`.
 */
export function findDanglingRefs(files) {
	const dangling = [];
	for (const [path, text] of files) {
		for (const ref of extractRefs(text)) {
			const reason = danglingReason(files, path, ref);
			if (reason) dangling.push({ path, ref: `${ref.file}${ref.pointer}`, reason });
		}
	}
	return dangling;
}

function* walk(dir) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) yield* walk(full);
		else if (/\.ya?ml$/.test(entry)) yield full;
	}
}

function main() {
	const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
	const files = new Map();
	for (const full of walk(join(repoRoot, "skills"))) {
		files.set(full.slice(repoRoot.length + 1).replaceAll("\\", "/"), readFileSync(full, "utf8"));
	}
	const dangling = findDanglingRefs(files);
	for (const d of dangling) console.error(`DANGLING ${d.path}: $ref ${d.ref} — ${d.reason}`);
	if (dangling.length > 0) {
		console.error(
			"\nA skill installs on its own, so every $ref must land on a file inside the same skill.",
		);
		console.error(
			"For synced schemas, run scripts/sync-schemas.mjs — it copies $ref targets into the skill.",
		);
		process.exit(1);
	}
	const refCount = [...files.values()].reduce((n, text) => n + extractRefs(text).length, 0);
	console.log(`check-schema-refs: ${refCount} $ref(s) across ${files.size} file(s) resolve`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
