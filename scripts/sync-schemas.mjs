#!/usr/bin/env node
/**
 * Sync skill reference schemas from celigo/integrator-api-specs (IAS) — the source of truth.
 *
 * Reads scripts/sync-map.json and copies every mapped component file verbatim from the IAS
 * checkout's git ref (no working-tree files are read, so any checkout state works). Files in
 * the map's `editorial` object are hand-maintained (each entry records why it cannot be
 * verbatim-synced) and are never touched.
 *
 * Guards, in order:
 *  1. Every mapped source must exist at the ref — a rename/removal upstream fails the run
 *     so the map is re-pointed deliberately, never silently dropped.
 *  2. Every source domain must be published (present in the IAS `dist` ref, which holds the
 *     x-internal-filtered public bundles) — internal specs must never ship in skills.
 *  3. Every fetched file must pass lint-schemas.mjs — a poisoned regeneration upstream
 *     (e.g. the Aug 2026 Mongoose responseMapping leak) stops the sync instead of shipping.
 *  4. Any schema file on disk that is neither mapped nor listed as editorial is reported,
 *     so new files get a conscious owner instead of rotting unmanaged.
 *
 * When an upstream file is known-bad (spec bug filed, fix pending), move its entry to the
 * map's `quarantined` object with the source, the reason, and the fix PR — the file is left
 * untouched and reported on every run, and everything else keeps syncing. Move it back to
 * `synced` when the upstream fix merges.
 *
 * Usage: node scripts/sync-schemas.mjs --ias <integrator-api-specs checkout>
 *          [--ref origin/main] [--dist-ref origin/dist] [--check]
 * --check writes nothing and exits 1 if a sync would change anything.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lintText } from "./lint-schemas.mjs";

const args = process.argv.slice(2);
function opt(name, fallback) {
	const i = args.indexOf(name);
	return i === -1 ? fallback : args[i + 1];
}
const iasDir = opt("--ias");
const ref = opt("--ref", "origin/main");
const distRef = opt("--dist-ref", "origin/dist");
const checkOnly = args.includes("--check");

if (!iasDir || !existsSync(iasDir)) {
	console.error("Pass --ias <path to an integrator-api-specs checkout>.");
	process.exit(2);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const mapFile = join(repoRoot, "scripts", "sync-map.json");
const { synced, editorial, quarantined = {} } = JSON.parse(readFileSync(mapFile, "utf8"));

for (const [aiPath, q] of Object.entries(quarantined)) {
	console.warn(`QUARANTINED ${aiPath} — not synced: ${q.reason}`);
}

function gitShow(spec) {
	return execFileSync("git", ["-C", iasDir, "show", spec], {
		encoding: "utf8",
		maxBuffer: 16 * 1024 * 1024,
	});
}

function gitHas(spec) {
	try {
		execFileSync("git", ["-C", iasDir, "cat-file", "-e", spec], { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

const errors = [];
const changed = [];

// Guard 2 needs the domain → published-bundle check; dist bundles are named <domain>.yml.
const publishedDomains = new Set();
for (const [aiPath, iasPath] of Object.entries(synced)) {
	const domain = iasPath.split("/")[2];
	if (!publishedDomains.has(domain)) {
		if (gitHas(`${distRef}:${domain}.yml`)) publishedDomains.add(domain);
		else {
			errors.push(`${aiPath}: source domain '${domain}' has no ${distRef} bundle (internal?)`);
			continue;
		}
	}

	if (!gitHas(`${ref}:${iasPath}`)) {
		errors.push(`${aiPath}: source ${iasPath} missing at ${ref} — re-point the map entry`);
		continue;
	}

	const content = gitShow(`${ref}:${iasPath}`);
	const hits = lintText(content);
	if (hits.length > 0) {
		for (const hit of hits) errors.push(`${aiPath}: source ${iasPath} fails lint: ${hit}`);
		continue;
	}

	const dest = join(repoRoot, aiPath);
	if (readFileSync(dest, "utf8") !== content) {
		changed.push(aiPath);
		if (!checkOnly) writeFileSync(dest, content);
	}
}

// Guard 4: schema files on disk that nobody owns.
function* schemaFiles(dir) {
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) yield* schemaFiles(full);
		else if (/schemas\/[^/]+\.ya?ml$/.test(full.replaceAll("\\", "/"))) yield full;
	}
}
const known = new Set([
	...Object.keys(synced),
	...Object.keys(editorial),
	...Object.keys(quarantined),
]);
const unmanaged = [...schemaFiles(join(repoRoot, "skills"))]
	.map((f) => f.slice(repoRoot.length + 1).replaceAll("\\", "/"))
	.filter((f) => !known.has(f));

for (const f of unmanaged) {
	console.warn(`UNMANAGED ${f} — add it to sync-map.json as synced (with a source) or editorial`);
}

if (errors.length > 0) {
	for (const e of errors) console.error(`ERROR ${e}`);
	process.exit(1);
}

const iasSha = execFileSync("git", ["-C", iasDir, "rev-parse", "--short", ref], {
	encoding: "utf8",
}).trim();
if (changed.length === 0) {
	console.log(`In sync with ${ref} (${iasSha}) — nothing to do.`);
} else {
	console.log(`${checkOnly ? "Would update" : "Updated"} ${changed.length} file(s) from ${ref} (${iasSha}):`);
	for (const c of changed) console.log(`  ${c}`);
	if (checkOnly) process.exit(1);
}
