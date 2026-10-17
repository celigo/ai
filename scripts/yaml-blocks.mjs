/**
 * A dependency-free outline of block-style YAML: enough to find, resolve and delete nodes in the
 * integrator-api-specs component files without a YAML parser.
 *
 * Every mapping entry and sequence item becomes a node that knows its lines and its children.
 * Values written inline — scalars, block scalars (`|`, `>`), flow collections, multi-line plain
 * scalars — stay opaque text owned by their entry or item. Anchors, aliases, tags, complex keys
 * and multi-document streams are not modeled; the IAS component files use none of them.
 */

const indentOf = (line) => line.length - line.trimStart().length;
const stripComment = (value) => value.replace(/(?:^|[ \t]+)#.*$/, "").trim();
const QUOTED_KEY = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*')[ \t]*:(?=[ \t]|$)/;
const PLAIN_KEY = /^([^\s#'"\-?:,[\]{}&*!|>%@`][^#]*?|-[^\s#][^#]*?)[ \t]*:(?=[ \t]|$)/;
const FALSY_SCALAR = /^(?:false|False|FALSE|null|Null|NULL|~|0|""|'')?$/;
const FLOW_REF = /^\{[ \t]*\$ref:[ \t]*(['"]?)([^'"\s,}]+)\1[ \t]*\}$/;

function unquote(text) {
	if (text.startsWith("'")) return text.slice(1, -1).replaceAll("''", "'");
	if (text.startsWith('"')) return text.slice(1, -1).replace(/\\(["\\/])/g, "$1");
	return text;
}

function splitKey(content) {
	const quoted = QUOTED_KEY.exec(content);
	const match = quoted ?? PLAIN_KEY.exec(content);
	if (!match) return null;
	const key = quoted ? unquote(match[1]) : match[1].trim();
	return { key, value: stripComment(content.slice(match[0].length)), length: match[0].length };
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

/** Outline a YAML text: `{ lines, root }`, where each node has `kind`, `key`, `value`, `col`, `start`, `end`, `parent`, `children`. */
export function parseBlocks(text) {
	const lines = text.split("\n");
	const root = { ...makeNode("root", -1, -1), end: lines.length - 1 };
	const order = [];
	const stack = [root];
	let opaqueCol = Number.POSITIVE_INFINITY;
	lines.forEach((line, i) => {
		const content = line.trim();
		const col = indentOf(line);
		if (!content || col > opaqueCol) return;
		opaqueCol = Number.POSITIVE_INFINITY;
		if (content.startsWith("#")) return;
		for (const node of lineNodes(content, col, i)) {
			while (!canHold(stack.at(-1), node)) stack.pop();
			node.parent = stack.at(-1);
			node.parent.children.push(node);
			stack.push(node);
			order.push(node);
			if (node.value) opaqueCol = node.col;
		}
	});
	setEnds(lines, order);
	return { lines, root };
}

function pointerSegments(pointer) {
	const path = pointer.replace(/^#/, "");
	if (path === "") return [];
	return path
		.replace(/^\//, "")
		.split("/")
		.map((s) => decodeURIComponent(s).replaceAll("~1", "/").replaceAll("~0", "~"));
}

/** The node a JSON pointer (`#/A/b/0`) names in a parsed document, or null. */
export function nodeAt(doc, pointer) {
	let node = doc.root;
	for (const segment of pointerSegments(pointer)) {
		const isSequence = node.children.length > 0 && node.children.every((c) => c.kind === "item");
		if (isSequence) node = /^(?:0|[1-9]\d*)$/.test(segment) ? node.children[Number(segment)] : undefined;
		else node = node.children.find((c) => c.kind === "entry" && c.key === segment);
		if (!node) return null;
	}
	return node;
}

/** Whether a node's value is a mapping carrying a truthy `x-internal` flag. */
export function isInternal(node) {
	return node.children.some((c) => c.kind === "entry" && c.key === "x-internal" && !FALSY_SCALAR.test(c.value));
}

function refOf(node) {
	const entry = node.children.find((c) => c.kind === "entry" && c.key === "$ref");
	const target = entry ? unquote(entry.value) : FLOW_REF.exec(node.value)?.[2];
	if (!target) return null;
	const hash = target.indexOf("#");
	return hash === -1 ? { file: target, pointer: "" } : { file: target.slice(0, hash), pointer: target.slice(hash) };
}

const isInlineFirstEntry = (node) => node.parent.kind === "item" && node.parent.start === node.start;

function leadingCommentStart(lines, node) {
	let start = node.start;
	if (isInlineFirstEntry(node)) return start;
	while (start > 0 && lines[start - 1].trim().startsWith("#") && indentOf(lines[start - 1]) === node.col) start--;
	return start;
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
	if (node.kind === "item") return `${line.slice(0, node.col)}- ${empty}`;
	return `${line.slice(0, node.keyEnd)} ${empty}${line.slice(node.keyEnd)}`;
}

function applyCuts(doc, cuts) {
	const { lines, root } = doc;
	const dropped = new Set();
	const replaced = new Map();
	for (const node of cuts) {
		if (isInlineFirstEntry(node)) {
			const transfer = dashTransfer(lines, node, cuts);
			if (transfer) replaced.set(...transfer);
		}
		for (let i = leadingCommentStart(lines, node); i <= node.end; i++) dropped.add(i);
	}
	for (const node of emptiedNodes(root, cuts)) replaced.set(node.start, emptyValue(lines[node.start], node));
	return lines
		.flatMap((line, i) => {
			if (replaced.has(i)) return [replaced.get(i)];
			return dropped.has(i) ? [] : [line];
		})
		.join("\n");
}

/**
 * Strip `x-internal` nodes the way Redocly's `remove-x-internal` decorator does when
 * integrator-api-specs bundles its public specs: every mapping entry or sequence item whose value
 * carries a truthy `x-internal`, or is a `$ref` to such a node (`isInternalRef({ file, pointer })`
 * decides), is deleted; a mapping or sequence emptied by those deletions is deleted from its parent
 * in turn, one level up only (a parent emptied that way stays, as `{}` or `[]`); `required` lists
 * are left alone. Comments inside a deleted node, and comment lines directly above it at its
 * indent, go with it. Returns the text unchanged when nothing is flagged.
 */
export function stripInternal(text, isInternalRef = () => false) {
	const doc = parseBlocks(text);
	const doomed = (node) => {
		if (isInternal(node)) return true;
		const ref = refOf(node);
		return ref !== null && isInternalRef(ref);
	};
	const cuts = new Set();
	const visit = (node) => {
		const removed = node.children.filter(doomed);
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
