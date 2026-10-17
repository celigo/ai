/**
 * A dependency-free outline of block-style YAML: enough to find, resolve and delete nodes in the
 * integrator-api-specs component files without a YAML parser.
 *
 * Every mapping entry and sequence item becomes a node that knows its lines and its children.
 * Values written inline or on the line after their key — scalars, block scalars (`|`, `>`), flow
 * collections, multi-line plain or quoted scalars — stay opaque text owned by their entry or item.
 * Anchors and tags in front of a key are skipped. Complex keys (`? key`) and multi-document streams
 * are not modeled: a structural line the outline cannot place is listed in `unparsed`, so a caller
 * can refuse to edit a file it does not fully understand.
 */

const indentOf = (line) => line.length - line.trimStart().length;
const stripComment = (value) => value.replace(/(?:^|[ \t]+)#.*$/, "").trim();
const NODE_PROPERTIES = /^(?:[&!]\S*[ \t]+)+/;
const QUOTED_KEY = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')[ \t]*:(?=[ \t]|$)/;
// A plain key may hold `#` and `:` — only ` #` starts a comment and only `: ` ends the key.
const PLAIN_KEY = /^((?:[^\s#'"?:,[\]{}&*!|>%@`-]|-(?=\S))(?:[^\s:]|:(?=\S)|[ \t]+(?=[^\s#]))*?)[ \t]*:(?=[ \t]|$)/;
const DOCUMENT_MARKER = /^(?:---|\.\.\.)(?:[ \t]|$)|^%/;
const FALSY_SCALAR = /^(?:false|False|FALSE|null|Null|NULL|~|""|''|\.nan|\.NaN|\.NAN)?$/;
const KEEP_CHOMPED_SCALAR = /^[|>](?:[1-9]?\+|\+[1-9])/;
const FLOW_REF = /(?:^\{|,)[ \t]*(?:\$ref|"\$ref"|'\$ref')[ \t]*:[ \t]*(['"]?)([^'"\s,}]+)\1[ \t]*(?=[,}])/;

const unescapeDoubleQuoted = (body) =>
	body.replace(/\\(?:x([0-9A-Fa-f]{2})|u([0-9A-Fa-f]{4})|U([0-9A-Fa-f]{8})|(["\\/]))/g, (_, x, u, U, char) =>
		char ?? String.fromCodePoint(Number.parseInt(x ?? u ?? U, 16)),
	);

function unquote(text) {
	if (text.startsWith("'")) return text.slice(1, -1).replaceAll("''", "'");
	if (text.startsWith('"')) return unescapeDoubleQuoted(text.slice(1, -1));
	return text;
}

function splitKey(content) {
	const properties = NODE_PROPERTIES.exec(content)?.[0] ?? "";
	const rest = content.slice(properties.length);
	const quoted = QUOTED_KEY.exec(rest);
	const match = quoted ?? PLAIN_KEY.exec(rest);
	if (!match) return null;
	const key = quoted ? unquote(match[1]) : match[1].trim();
	const length = properties.length + match[0].length;
	return { key, value: stripComment(content.slice(length)), length };
}

const makeNode = (kind, col, start, entry = null) => ({
	kind,
	col,
	start,
	end: start,
	key: entry?.key ?? null,
	value: entry?.value ?? "",
	keyEnd: entry ? col + entry.length : col + 1,
	parent: null,
	children: [],
});

function canHold(parent, node) {
	if (parent.kind === "root") return true;
	if (parent.value) return false;
	if (parent.col < node.col) return true;
	// A block sequence may sit at its key's own indent: `key:\n- a`.
	const sequenceAtKeyIndent = parent.kind === "entry" && node.kind === "item";
	return parent.col === node.col && sequenceAtKeyIndent && parent.children.every((c) => c.kind === "item");
}

const isTrailingTrivia = (line, col) => {
	const content = line.trim();
	return content === "" || (content.startsWith("#") && indentOf(line) <= col);
};

const lastDescendant = (node) => (node.children.length ? lastDescendant(node.children.at(-1)) : node);

function setEnds(lines, order) {
	const position = new Map(order.map((node, i) => [node, i]));
	for (const node of order) {
		const next = order[position.get(lastDescendant(node)) + 1];
		let end = (next ? next.start : lines.length) - 1;
		while (end > node.start && isTrailingTrivia(lines[end], node.col)) end--;
		node.end = end;
	}
}

/** Nodes a structural line opens: an entry, an item, or an item plus the entry written on its dash line. */
function lineNodes(content, col, i) {
	const dash = /^-(?:[ \t]+|$)/.exec(content);
	if (!dash) {
		const entry = splitKey(content);
		return entry ? [makeNode("entry", col, i, entry)] : [];
	}
	const item = makeNode("item", col, i);
	const rest = content.slice(dash[0].length);
	const entry = rest && !rest.startsWith("#") ? splitKey(rest) : null;
	if (entry) return [item, makeNode("entry", col + dash[0].length, i, entry)];
	item.value = stripComment(rest);
	return [item];
}

/** A scalar written on the line after its key (`description:` then `"…"`) is that key's value. */
function claimValueLine(stack, content, col) {
	const owner = stack.findLast((node) => node.col < col);
	const complexKey = /^[?:](?:[ \t]|$)/.test(content);
	if (complexKey || owner.kind === "root" || owner.value || owner.children.length > 0) return null;
	owner.value = stripComment(content);
	return owner.col;
}

/**
 * Outline a YAML text: `{ lines, root, unparsed }`. Each node has `kind`, `key`, `value`, `col`,
 * `start`, `end`, `parent` and `children`; `unparsed` lists the structural lines no node could own.
 */
export function parseBlocks(text) {
	const lines = text.split("\n");
	const root = { ...makeNode("root", -1, -1), end: lines.length - 1 };
	const order = [];
	const unparsed = [];
	const stack = [root];
	let opaqueCol = Number.POSITIVE_INFINITY;
	lines.forEach((line, i) => {
		const content = line.trim();
		const col = indentOf(line);
		if (!content || col > opaqueCol) return;
		opaqueCol = Number.POSITIVE_INFINITY;
		if (content.startsWith("#") || (col === 0 && DOCUMENT_MARKER.test(content))) return;
		const nodes = lineNodes(content, col, i);
		if (nodes.length === 0) {
			const claimed = claimValueLine(stack, content, col);
			if (claimed === null) unparsed.push(i);
			else opaqueCol = claimed;
			return;
		}
		for (const node of nodes) {
			while (!canHold(stack.at(-1), node)) stack.pop();
			node.parent = stack.at(-1);
			node.parent.children.push(node);
			stack.push(node);
			order.push(node);
			if (node.value) opaqueCol = node.col;
		}
	});
	setEnds(lines, order);
	return { lines, root, unparsed };
}

const decodePercent = (text) =>
	text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) =>
		new TextDecoder().decode(Uint8Array.from(run.slice(1).split("%"), (hex) => Number.parseInt(hex, 16))),
	);

/** A JSON pointer's reference tokens (`#/a~1b/0` → ["a/b", "0"]), or null when it is not one. */
function pointerSegments(pointer) {
	const path = pointer.replace(/^#/, "");
	if (path === "") return [];
	if (!path.startsWith("/")) return null;
	return path
		.slice(1)
		.split("/")
		.map((s) => decodePercent(s).replaceAll("~1", "/").replaceAll("~0", "~"));
}

/** The node a JSON pointer (`#/A/b/0`) names in a parsed document, or null. */
export function nodeAt(doc, pointer) {
	const segments = pointerSegments(pointer);
	if (segments === null) return null;
	let node = doc.root;
	for (const segment of segments) {
		const isSequence = node.children.length > 0 && node.children.every((c) => c.kind === "item");
		if (isSequence) node = /^(?:0|[1-9]\d*)$/.test(segment) ? node.children[Number(segment)] : undefined;
		else node = node.children.find((c) => c.kind === "entry" && c.key === segment);
		if (!node) return null;
	}
	return node;
}

/** JavaScript truthiness of a YAML scalar, which is what Redocly tests a flag with. */
function isTruthyScalar(raw) {
	const value = raw.replace(NODE_PROPERTIES, "").trim();
	if (FALSY_SCALAR.test(value)) return false;
	const number = Number(value);
	return Number.isNaN(number) || number !== 0;
}

/** Whether a node's value is a mapping carrying a truthy `x-internal` flag. */
export function isInternal(node) {
	return node.children.some(
		(c) => c.kind === "entry" && c.key === "x-internal" && (c.children.length > 0 || isTruthyScalar(c.value)),
	);
}

/** The `$ref` a node's value is — a block `$ref:` child or a flat flow `{ $ref: … }` — or null. */
export function refOf(node) {
	const entry = node.children.find((c) => c.kind === "entry" && c.key === "$ref");
	const flat = node.value.startsWith("{") && !/[{[]/.test(node.value.slice(1));
	const raw = entry ? unquote(entry.value) : flat ? FLOW_REF.exec(node.value)?.[2] : undefined;
	if (!raw) return null;
	const hash = raw.indexOf("#");
	return { raw, file: hash === -1 ? raw : raw.slice(0, hash), pointer: hash === -1 ? "" : raw.slice(hash) };
}

const isInlineFirstEntry = (node) => node.parent.kind === "item" && node.parent.start === node.start;

function leadingCommentStart(lines, node) {
	let start = node.start;
	if (isInlineFirstEntry(node)) return start;
	while (start > 0 && lines[start - 1].trim().startsWith("#") && indentOf(lines[start - 1]) === node.col) start--;
	return start;
}

/** Lines where a keep-chomped block scalar (`|+`, `>+`) ends: blank lines after them are its text. */
function keepChompedEnds(node, ends = new Set()) {
	for (const child of node.children) {
		if (KEEP_CHOMPED_SCALAR.test(child.value)) ends.add(child.end);
		keepChompedEnds(child, ends);
	}
	return ends;
}

/**
 * A cut node's lines: its leading comments and itself, plus the blank lines after it when the
 * line above is blank or ends a keep-chomped scalar — otherwise those blanks separate what remains.
 */
function cutRange(lines, node, keepEnds) {
	const from = leadingCommentStart(lines, node);
	let end = node.end;
	if (from > 0 && (lines[from - 1].trim() === "" || keepEnds.has(from - 1))) {
		const last = lines.at(-1) === "" ? lines.length - 2 : lines.length - 1;
		while (end < last && lines[end + 1].trim() === "") end++;
	}
	return [from, end];
}

/** Move an item's dash onto its first surviving entry when the entry on the dash line is cut. */
function dashTransfer(lines, node, cuts) {
	const item = node.parent;
	const heir = item.children.find((c) => c !== node && !cuts.has(c));
	if (!heir) return null;
	const dash = lines[item.start].slice(item.col, node.col);
	const line = lines[heir.start];
	return [heir.start, `${line.slice(0, item.col)}${dash}${line.slice(node.col)}`];
}

/** Kept nodes whose every child is cut: their value must still read as an empty mapping or sequence. */
function* emptiedNodes(node, cuts) {
	for (const child of node.children) {
		if (cuts.has(child)) continue;
		if (child.children.length > 0 && child.children.every((c) => cuts.has(c))) yield child;
		else yield* emptiedNodes(child, cuts);
	}
}

function emptyValue(line, node) {
	const empty = node.children[0].kind === "item" ? "[]" : "{}";
	if (node.kind === "entry") return `${line.slice(0, node.keyEnd)} ${empty}${line.slice(node.keyEnd)}`;
	return `${line.slice(0, node.col)}- ${empty}${line.endsWith("\r") ? "\r" : ""}`;
}

function applyCuts(doc, cuts) {
	const { lines, root } = doc;
	const keepEnds = keepChompedEnds(root);
	const dropped = new Set();
	const replaced = new Map();
	for (const node of cuts) {
		if (isInlineFirstEntry(node)) {
			const transfer = dashTransfer(lines, node, cuts);
			if (transfer) replaced.set(...transfer);
		}
		const [from, to] = cutRange(lines, node, keepEnds);
		for (let i = from; i <= to; i++) dropped.add(i);
	}
	for (const node of emptiedNodes(root, cuts)) {
		replaced.set(node.start, emptyValue(replaced.get(node.start) ?? lines[node.start], node));
	}
	return lines
		.flatMap((line, i) => {
			if (replaced.has(i)) return [replaced.get(i)];
			return dropped.has(i) ? [] : [line];
		})
		.join("\n");
}

/** Discriminator mapping entries that name a variant whose `$ref` item was just removed. */
function staleMappingEntries(node, removed, internalRef) {
	if (node.kind !== "entry") return [];
	const refs = new Set(removed.filter((c) => c.kind === "item").map((c) => internalRef(c)?.raw).filter(Boolean));
	if (refs.size === 0) return [];
	const discriminator = node.parent.children.find((c) => c.kind === "entry" && c.key === "discriminator");
	const mapping = discriminator?.children.find((c) => c.kind === "entry" && c.key === "mapping");
	return mapping ? mapping.children.filter((c) => c.kind === "entry" && refs.has(unquote(c.value))) : [];
}

/**
 * Strip `x-internal` nodes the way Redocly's `remove-x-internal` decorator does when
 * integrator-api-specs bundles its public specs: every mapping entry or sequence item whose value
 * carries a truthy `x-internal`, or is a `$ref` to such a node (`isInternalRef({ raw, file, pointer })`
 * decides), is deleted, along with discriminator mapping entries naming a deleted `$ref` variant; a
 * mapping or sequence emptied by those deletions is deleted from its parent in turn, one level up
 * only (a parent emptied that way stays, as `{}` or `[]`); `required` lists are left alone.
 * Comments inside a deleted node and comment lines directly above it at its indent go with it.
 * Unlike Redocly, flags inside example values are stripped too. Returns the text unchanged when
 * nothing is flagged.
 */
export function stripInternal(text, isInternalRef = () => false) {
	const doc = parseBlocks(text);
	const internalRef = (node) => {
		const ref = refOf(node);
		return ref !== null && isInternalRef(ref) ? ref : null;
	};
	const cuts = new Set();
	const visit = (node) => {
		const removed = node.children.filter((child) => isInternal(child) || internalRef(child) !== null);
		for (const entry of staleMappingEntries(node, removed, internalRef)) cuts.add(entry);
		if (removed.length > 0 && removed.length === node.children.length && node.kind !== "root") {
			cuts.add(node);
			return;
		}
		for (const child of node.children) {
			if (removed.includes(child)) cuts.add(child);
			else visit(child);
		}
	};
	visit(doc.root);
	return cuts.size === 0 ? text : applyCuts(doc, cuts);
}

/**
 * Delete every mapping entry named `key`, the way integrator-api-specs' `celigo/strip-canon`
 * decorator deletes `x-celigo-canon` from each schema: the entry and comment lines directly above
 * it at its indent go; a mapping left empty stays, as `{}`. Unlike the decorator, which visits
 * schemas only, entries anywhere go. Returns the text unchanged when no entry has that name.
 */
export function stripKey(text, key) {
	const doc = parseBlocks(text);
	const cuts = new Set();
	const visit = (node) => {
		for (const child of node.children) {
			if (child.kind === "entry" && child.key === key) cuts.add(child);
			else visit(child);
		}
	};
	visit(doc.root);
	return cuts.size === 0 ? text : applyCuts(doc, cuts);
}
