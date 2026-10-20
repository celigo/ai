#!/usr/bin/env node
/**
 * Sync skill reference schemas from celigo/integrator-api-specs (IAS) — the source of truth.
 *
 * Reads scripts/sync-map.json and copies every mapped component file from the IAS checkout's git
 * ref (no working-tree files are read, so any checkout state works), along with every file those
 * components $ref, transitively: a skill installs on its own, so whatever its schemas point at has
 * to ship inside it. Files in the map's `editorial` object are hand-maintained (each entry records
 * why it cannot be synced) and are never touched.
 *
 * Where a referenced file lands in a skill (first rule that applies):
 *  1. The skill maps that IAS file (`synced` or `quarantined`) — the mapped path.
 *  2. A mapped file from the same IAS directory kept its name — beside it, so `./base.yml`
 *     from request.yml lands next to request.yml.
 *  3. Otherwise `references/<dir>-schemas/`, <dir> naming the IAS directory: `common/schemas`
 *     → `common-schemas`, `guardrail/components/schemas` → `guardrail-schemas`.
 * Files are copied verbatim apart from three changes:
 *  - x-internal nodes are stripped the way integrator-api-specs' public bundle build strips them
 *    (Redocly's `remove-x-internal` decorator; see stripInternal in yaml-blocks.mjs), before
 *    their refs are followed, so nothing only an internal property points at is pulled in.
 *  - Every `x-celigo-*` key outside PUBLIC_VENDOR_KEYS (lint-schemas.mjs) is deleted (stripKey):
 *    `x-celigo-canon` records (validation-decision notes for spec maintainers), as upstream's
 *    `celigo/strip-canon` decorator deletes them from the bundles, and the tags upstream's
 *    bundles keep to steer Celigo's own authoring tooling, which nothing in a skill reads. A key
 *    upstream adds is stripped until it's listed there.
 *  - $ref paths are rewritten to run from where the file lands to where the target lands
 *    (`../../../common/schemas/filter.yml` → `../common-schemas/filter.yml`); a ref that already
 *    resolves stays as written.
 * The map's `referenced` object records every file pulled in through a $ref — the sync writes it,
 * never edit it by hand — and a file that drops out of it is deleted.
 *
 * Guards — any failure stops the run before it writes anything:
 *  1. Every mapped source and every $ref target must exist at the ref — a rename/removal upstream
 *     fails the run so the map is re-pointed deliberately, never silently dropped.
 *  2. Every source domain must be published (present in the IAS `dist` ref, which holds the
 *     x-internal-filtered public bundles) — internal specs must never ship in skills. Shared
 *     component directories (`common`) belong to no API and have no bundle of their own.
 *  3. A file carrying `x-internal` or an `x-celigo-*` key the sync strips, with YAML the stripper
 *     can't outline, is refused rather than risk cutting the wrong lines.
 *  4. Every file must pass lint-schemas.mjs once stripped — a poisoned regeneration upstream
 *     (e.g. the Aug 2026 Mongoose responseMapping leak) stops the sync instead of shipping, and so
 *     does any marker the stripper left behind, or text upstream wrote for its own tooling.
 *  5. No two IAS files may land on one path, and no referenced file on an editorial one.
 *  6. Once the sync is applied, every $ref in every skill must resolve inside its skill
 *     (check-schema-refs.mjs, which the PR workflow also runs).
 * Any schema file on disk that is neither mapped, referenced, nor editorial is reported, so new
 * files get a conscious owner instead of rotting unmanaged.
 *
 * When an upstream file is known-bad (spec bug filed, fix pending), move its entry to the map's
 * `quarantined` object with the source, the reason, and the fix PR — the file is left untouched
 * and reported on every run, and everything else keeps syncing. A referenced file is quarantined
 * the same way, at the path rule 2 or 3 gives it and with its $ref paths written for that spot
 * (guard 6 checks them). Move the entry back to `synced` (or delete it, for a referenced file)
 * when the upstream fix merges.
 *
 * Usage: node scripts/sync-schemas.mjs --ias <integrator-api-specs checkout>
 *          [--ref origin/main] [--dist-ref origin/dist] [--check]
 * --check writes nothing and exits 1 if a sync would change anything.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extractRefs, findDanglingRefs, rewriteRefs } from "./check-schema-refs.mjs";
import { isStrippedVendorKey, lintText } from "./lint-schemas.mjs";
import { isInternal, nodeAt, parseBlocks, refOf, stripInternal, stripKey } from "./yaml-blocks.mjs";

// IAS directories under specs/v1 that hold shared components rather than an API of their own.
const SHARED_COMPONENT_DIRS = new Set(["common"]);
const INTERNAL_FLAG = "x-internal";

/** The first x-internal flag or stripped `x-celigo-*` key mentioned in a file, if any. */
const strippedMarkerIn = (text) =>
	[...text.matchAll(/x-internal|x-celigo-[\w-]+/g)]
		.map((m) => m[0])
		.find((m) => m === INTERNAL_FLAG || isStrippedVendorKey(m));

const skillOf = (aiPath) => aiPath.split("/")[1];
const domainOf = (iasPath) => iasPath.split("/")[2];
const resolveFrom = (path, file) => posix.normalize(posix.join(posix.dirname(path), file));

function groupBySkill(synced, quarantined) {
	const skills = new Map();
	const add = (aiPath, iasPath, isQuarantined) => {
		const entries = skills.get(skillOf(aiPath)) ?? [];
		entries.push({ aiPath, iasPath, isQuarantined });
		skills.set(skillOf(aiPath), entries);
	};
	for (const [aiPath, iasPath] of Object.entries(synced)) add(aiPath, iasPath, false);
	for (const [aiPath, q] of Object.entries(quarantined)) add(aiPath, q.source, true);
	return skills;
}

function groupDirName(iasDir) {
	const group = iasDir.replace(/^specs\/v\d+\//, "").replace(/\/(components\/)?schemas$/, "");
	return `${group.replaceAll("/", "-")}-schemas`;
}

/** Destinations of a skill's mapped files, and the directory each IAS directory keeps its names in. */
function mappedLayout(entries, errors) {
	const dest = new Map();
	const homes = new Map();
	for (const { aiPath, iasPath } of entries) {
		if (dest.has(iasPath)) {
			errors.push(`${aiPath}: ${iasPath} is already mapped in this skill as ${dest.get(iasPath)}`);
			continue;
		}
		dest.set(iasPath, aiPath);
		if (posix.basename(aiPath) !== posix.basename(iasPath)) continue;
		const iasDir = posix.dirname(iasPath);
		const home = posix.dirname(aiPath);
		if (homes.has(iasDir) && homes.get(iasDir) !== home) {
			errors.push(`${aiPath}: files from ${iasDir} keep their names in both ${homes.get(iasDir)} and ${home}`);
		} else homes.set(iasDir, home);
	}
	return { dest, homes };
}

function landingPath(skill, iasPath, homes) {
	const iasDir = posix.dirname(iasPath);
	const dir = homes.get(iasDir) ?? `skills/${skill}/references/${groupDirName(iasDir)}`;
	return posix.join(dir, posix.basename(iasPath));
}

/** Whether a $ref written in `fromIasPath` lands, through any chain of $refs, on a flagged node. */
function refsInternalNode(ias, fromIasPath, { file, pointer }, seen = new Set()) {
	const target = file ? resolveFrom(fromIasPath, file) : fromIasPath;
	if (seen.has(`${target}${pointer}`) || !ias.has(target)) return false;
	seen.add(`${target}${pointer}`);
	const node = nodeAt(ias.outline(target), pointer);
	if (node === null) return false;
	if (isInternal(node)) return true;
	const next = refOf(node);
	return next !== null && refsInternalNode(ias, target, next, seen);
}

/** Upstream text minus x-internal nodes and every `x-celigo-*` key the skills don't ship. */
function publicText(ias, iasPath) {
	const withoutInternal = stripInternal(ias.read(iasPath), (ref) => refsInternalNode(ias, iasPath, ref));
	return stripKey(withoutInternal, isStrippedVendorKey);
}

/** Fetch a file the sync will write; on a guard failure, record why and return null. */
function fetchChecked(ias, aiPath, iasPath, via, errors) {
	const what = via ? `$ref target ${iasPath} (from ${via})` : `source ${iasPath}`;
	if (!ias.has(iasPath)) {
		const fix = via ? "" : " — re-point the map entry";
		errors.push(`${aiPath}: ${what} missing at ${ias.ref}${fix}`);
		return null;
	}
	const domain = domainOf(iasPath);
	if (!SHARED_COMPONENT_DIRS.has(domain) && !ias.isPublished(domain)) {
		errors.push(`${aiPath}: ${what} is in domain '${domain}', which has no dist bundle (internal?)`);
		return null;
	}
	const unplaced = ias.outline(iasPath).unparsed;
	const marker = strippedMarkerIn(ias.read(iasPath));
	if (marker && unplaced.length > 0) {
		errors.push(`${aiPath}: ${what} has ${marker} and YAML the stripper can't outline (line ${unplaced[0] + 1})`);
		return null;
	}
	const content = publicText(ias, iasPath);
	const hits = lintText(content);
	for (const hit of hits) errors.push(`${aiPath}: ${what} fails lint: ${hit}`);
	return hits.length > 0 ? null : content;
}

function claimLanding(layout, skill, target, editorial, errors) {
	const landing = landingPath(skill, target, layout.homes);
	if (layout.owner.has(landing)) {
		errors.push(`${landing}: both ${layout.owner.get(landing)} and ${target} land here`);
		return false;
	}
	if (Object.hasOwn(editorial, landing)) {
		errors.push(`${landing}: ${target} would overwrite this editorial file`);
		return false;
	}
	layout.dest.set(target, landing);
	layout.owner.set(landing, target);
	return true;
}

function relativeRef(fromAiPath, targetAiPath, written) {
	if (!targetAiPath || resolveFrom(fromAiPath, written) === targetAiPath) return written;
	const rel = posix.relative(posix.dirname(fromAiPath), targetAiPath);
	return rel.startsWith(".") ? rel : `./${rel}`;
}

/** Plan one skill: its mapped files plus their $ref closure, with refs rewritten to the skill layout. */
function planSkill(skill, entries, { ias, editorial, errors }) {
	const layout = mappedLayout(entries, errors);
	layout.owner = new Map([...layout.dest].map(([iasPath, aiPath]) => [aiPath, iasPath]));
	const quarantined = new Set(entries.filter((e) => e.isQuarantined).map((e) => e.iasPath));
	const referenced = new Map();
	const sources = new Map();
	const queue = entries.map((e) => ({ iasPath: e.iasPath, via: null }));

	while (queue.length > 0) {
		const { iasPath, via } = queue.shift();
		if (sources.has(iasPath)) continue;
		// A quarantined file keeps its local copy, but its upstream refs still say what it needs.
		const content = quarantined.has(iasPath)
			? (ias.has(iasPath) ? publicText(ias, iasPath) : "")
			: fetchChecked(ias, layout.dest.get(iasPath), iasPath, via, errors);
		sources.set(iasPath, content);
		if (content === null) continue;

		for (const { file } of extractRefs(content)) {
			if (!file) continue;
			const target = resolveFrom(iasPath, file);
			if (!layout.dest.has(target)) {
				if (!claimLanding(layout, skill, target, editorial, errors)) continue;
				referenced.set(layout.dest.get(target), target);
			}
			queue.push({ iasPath: target, via: iasPath });
		}
	}

	const files = new Map();
	for (const [iasPath, content] of sources) {
		if (content === null || quarantined.has(iasPath)) continue;
		const aiPath = layout.dest.get(iasPath);
		const toLanding = (file) => relativeRef(aiPath, layout.dest.get(resolveFrom(iasPath, file)), file);
		files.set(aiPath, rewriteRefs(content, toLanding));
	}
	return { files, referenced };
}

const sortedObject = (entries) => Object.fromEntries([...entries].sort(([a], [b]) => (a < b ? -1 : 1)));

/**
 * Plan a sync without touching disk.
 * `ias` reads the upstream ref: `{ ref, has(path), read(path), outline(path), isPublished(domain) }`,
 * where `outline` is yaml-blocks' parseBlocks of the file.
 * `localFiles` maps every yml under skills/ (repo-relative) to its text.
 * Returns the content of every file the sync owns (`files`), the paths to delete (`deletes`), the
 * new `referenced` map section, schema files nobody owns (`unmanaged`), and `errors`.
 */
export function planSync({ map, ias, localFiles }) {
	const { synced, editorial = {}, quarantined = {}, referenced: previous = {} } = map;
	const errors = [];
	const files = new Map();
	const referenced = [];
	for (const [skill, entries] of groupBySkill(synced, quarantined)) {
		const plan = planSkill(skill, entries, { ias, editorial, errors });
		for (const [aiPath, content] of plan.files) files.set(aiPath, content);
		referenced.push(...plan.referenced);
	}

	const owned = new Set([
		...Object.keys(synced),
		...Object.keys(editorial),
		...Object.keys(quarantined),
		...referenced.map(([aiPath]) => aiPath),
	]);
	const deletes = Object.keys(previous).filter((p) => !owned.has(p) && localFiles.has(p));

	const after = new Map(localFiles);
	for (const [aiPath, content] of files) after.set(aiPath, content);
	for (const p of deletes) after.delete(p);
	for (const d of findDanglingRefs(after)) errors.push(`${d.path}: $ref ${d.ref} — ${d.reason}`);
	const unmanaged = [...after.keys()].filter((p) => /schemas\/[^/]+\.ya?ml$/.test(p) && !owned.has(p));

	return { files, deletes, referenced: sortedObject(referenced), unmanaged, errors };
}

function gitIas(iasDir, ref, distRef) {
	const git = (...args) =>
		execFileSync("git", ["-C", iasDir, ...args], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
	const exists = (spec) => {
		try {
			execFileSync("git", ["-C", iasDir, "cat-file", "-e", spec], { stdio: "ignore" });
			return true;
		} catch {
			return false;
		}
	};
	const cached = (fn) => {
		const cache = new Map();
		return (key) => {
			if (!cache.has(key)) cache.set(key, fn(key));
			return cache.get(key);
		};
	};
	const read = cached((path) => git("show", `${ref}:${path}`));
	return {
		ref,
		sha: () => git("rev-parse", "--short", ref).trim(),
		has: cached((path) => exists(`${ref}:${path}`)),
		read,
		outline: cached((path) => parseBlocks(read(path))),
		// dist bundles are named <domain>.yml.
		isPublished: cached((domain) => exists(`${distRef}:${domain}.yml`)),
	};
}

function readSkillFiles(repoRoot) {
	const files = new Map();
	const walk = (dir) => {
		for (const entry of readdirSync(dir)) {
			const full = join(dir, entry);
			if (statSync(full).isDirectory()) walk(full);
			else if (/\.ya?ml$/.test(entry)) {
				files.set(full.slice(repoRoot.length + 1).replaceAll("\\", "/"), readFileSync(full, "utf8"));
			}
		}
	};
	walk(join(repoRoot, "skills"));
	return files;
}

function applyPlan(repoRoot, plan, changed) {
	for (const aiPath of changed) {
		const dest = join(repoRoot, aiPath);
		mkdirSync(dirname(dest), { recursive: true });
		writeFileSync(dest, plan.files.get(aiPath));
	}
	for (const aiPath of plan.deletes) rmSync(join(repoRoot, aiPath));
}

function main() {
	const args = process.argv.slice(2);
	const opt = (name, fallback) => {
		const i = args.indexOf(name);
		return i === -1 ? fallback : args[i + 1];
	};
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
	const map = JSON.parse(readFileSync(mapFile, "utf8"));
	for (const [aiPath, q] of Object.entries(map.quarantined ?? {})) {
		console.warn(`QUARANTINED ${aiPath} — not synced: ${q.reason}`);
	}

	const ias = gitIas(iasDir, ref, distRef);
	const localFiles = readSkillFiles(repoRoot);
	const plan = planSync({ map, ias, localFiles });
	for (const f of plan.unmanaged) {
		console.warn(`UNMANAGED ${f} — add it to sync-map.json as synced (with a source) or editorial`);
	}
	if (plan.errors.length > 0) {
		for (const e of plan.errors) console.error(`ERROR ${e}`);
		process.exit(1);
	}

	const changed = [...plan.files.keys()].filter((p) => localFiles.get(p) !== plan.files.get(p));
	const mapChanged = JSON.stringify(map.referenced ?? {}) !== JSON.stringify(plan.referenced);
	const iasSha = ias.sha();
	if (changed.length === 0 && plan.deletes.length === 0 && !mapChanged) {
		console.log(`In sync with ${ref} (${iasSha}) — nothing to do.`);
		return;
	}
	if (!checkOnly) {
		applyPlan(repoRoot, plan, changed);
		if (mapChanged) {
			writeFileSync(mapFile, `${JSON.stringify({ ...map, referenced: plan.referenced }, null, 2)}\n`);
		}
	}
	const verb = checkOnly ? "Would update" : "Updated";
	console.log(`${verb} ${changed.length} file(s) from ${ref} (${iasSha}):`);
	for (const c of changed) console.log(`  ${c}`);
	if (plan.deletes.length > 0) {
		console.log(`${checkOnly ? "Would remove" : "Removed"} ${plan.deletes.length} file(s) no longer referenced:`);
		for (const d of plan.deletes) console.log(`  ${d}`);
	}
	if (mapChanged) console.log(`${verb} the referenced section of scripts/sync-map.json`);
	if (checkOnly) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
