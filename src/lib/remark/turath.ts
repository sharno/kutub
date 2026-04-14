import { toString } from "mdast-util-to-string";
import type { Break, Html, PhrasingContent, Root, RootContent, Text } from "mdast";
import { visit } from "unist-util-visit";
import type { Plugin } from "unified";

const ARABIC_DIGITS: Record<string, string> = {
  "٠": "0",
  "١": "1",
  "٢": "2",
  "٣": "3",
  "٤": "4",
  "٥": "5",
  "٦": "6",
  "٧": "7",
  "٨": "8",
  "٩": "9",
};

interface Footnote {
  marker: string;
  id: string;
  lines: string[];
}

interface FootnoteMarker {
  marker: string;
  text: string;
}

interface PageMeta {
  pageId: number;
  volume: string;
  printedPage: string;
}

export const remarkTurath: Plugin<[], Root> = function remarkTurathPlugin() {
  return function transform(tree) {
    transformTurathPageFootnotes(tree);
    preserveSoftBreaks(tree);
  };
};

function transformTurathPageFootnotes(tree: Root): void {
  const nextChildren: RootContent[] = [];

  for (let index = 0; index < tree.children.length; index += 1) {
    const node = tree.children[index];
    const pageMeta = getPageMeta(node);

    if (!pageMeta) {
      nextChildren.push(node);
      continue;
    }

    nextChildren.push(node);

    const pageNodes: RootContent[] = [];
    let cursor = index + 1;

    while (cursor < tree.children.length && !getPageMeta(tree.children[cursor])) {
      pageNodes.push(tree.children[cursor]);
      cursor += 1;
    }

    index = cursor - 1;

    const separatorIndex = pageNodes.findIndex((child) => child.type === "thematicBreak");
    if (separatorIndex === -1) {
      nextChildren.push(...pageNodes);
      if (cursor < tree.children.length) {
        nextChildren.push({
          type: "html",
          value: renderPageSeparator(pageMeta),
        } satisfies Html);
      }
      continue;
    }

    const bodyNodes = pageNodes.slice(0, separatorIndex);
    const footnoteNodes = pageNodes.slice(separatorIndex + 1);
    const footnotes = parseFootnotes(footnoteNodes, pageMeta.pageId);

    if (footnotes.length === 0) {
      nextChildren.push(...bodyNodes);
      if (cursor < tree.children.length) {
        nextChildren.push({
          type: "html",
          value: renderPageSeparator(pageMeta),
        } satisfies Html);
      }
      continue;
    }

    const footnotesByMarker = new Map(footnotes.map((footnote) => [footnote.marker, footnote.id]));

    for (const bodyNode of bodyNodes) {
      replaceInlineFootnotes(bodyNode, footnotesByMarker);
      nextChildren.push(bodyNode);
    }

    nextChildren.push({
      type: "html",
      value: renderFootnotesSection(footnotes),
    } satisfies Html);
    if (cursor < tree.children.length) {
      nextChildren.push({
        type: "html",
        value: renderPageSeparator(pageMeta),
      } satisfies Html);
    }
  }

  tree.children = nextChildren;
}

function preserveSoftBreaks(tree: Root): void {
  visit(tree, "paragraph", (node) => {
    node.children = splitSoftBreaks(node.children);
  });
}

function splitSoftBreaks(children: PhrasingContent[]): PhrasingContent[] {
  const nextChildren: PhrasingContent[] = [];

  for (const child of children) {
    if (child.type === "text" && /[\r\n]/.test(child.value)) {
      nextChildren.push(...splitTextNode(child));
      continue;
    }

    if ("children" in child && Array.isArray(child.children)) {
      child.children = splitSoftBreaks(child.children);
    }

    nextChildren.push(child);
  }

  return nextChildren;
}

function splitTextNode(node: Text): Array<Text | Break> {
  const parts = node.value.split(/\r?\n/);
  const nodes: Array<Text | Break> = [];

  for (let index = 0; index < parts.length; index += 1) {
    if (parts[index]) {
      nodes.push({ type: "text", value: parts[index] });
    }

    if (index < parts.length - 1) {
      nodes.push({ type: "break" });
    }
  }

  return nodes;
}

function replaceInlineFootnotes(node: RootContent, footnotesByMarker: Map<string, string>): void {
  if (node.type !== "paragraph") {
    return;
  }

  node.children = replaceInlineFootnotesInChildren(node.children, footnotesByMarker);
}

function replaceInlineFootnotesInChildren(
  children: PhrasingContent[],
  footnotesByMarker: Map<string, string>,
): PhrasingContent[] {
  const nextChildren: PhrasingContent[] = [];

  for (const child of children) {
    if (child.type !== "text") {
      if ("children" in child && Array.isArray(child.children)) {
        child.children = replaceInlineFootnotesInChildren(child.children, footnotesByMarker);
      }

      nextChildren.push(child);
      continue;
    }

    const segments = child.value.split(/(\(\^[^)]+\)|\[\*\])/g);

    for (const segment of segments) {
      if (!segment) {
        continue;
      }

      const marker = normalizeInlineMarker(segment);

      if (!marker) {
        nextChildren.push({ type: "text", value: segment } satisfies Text);
        continue;
      }

      const id = footnotesByMarker.get(marker);

      if (!id) {
        nextChildren.push({ type: "text", value: segment } satisfies Text);
        continue;
      }

      nextChildren.push({
        type: "html",
        value: `<sup id="fnref-${id}"><a href="#fn-${id}">${escapeHtml(marker)}</a></sup>`,
      } satisfies Html);
    }
  }

  return nextChildren;
}

function normalizeInlineMarker(segment: string): string | null {
  const parenMatch = segment.match(/^\(\^([^)]+)\)$/);
  if (parenMatch) {
    return parenMatch[1].trim();
  }

  if (segment === "[*]") {
    return "*";
  }

  return null;
}

function parseFootnotes(nodes: RootContent[], pageId: number): Footnote[] {
  const blocks = nodes
    .map((node) => toString(node))
    .map((value) => value.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return [];
  }

  const lines = blocks.flatMap((block, index) => {
    const blockLines = block.split(/\r?\n/);
    return index === 0 ? blockLines : ["", ...blockLines];
  });

  const footnotes: Footnote[] = [];
  let current: Footnote | null = null;

  for (const line of lines) {
    const marker = parseFootnoteMarker(line);

    if (marker) {
      if (current) {
        footnotes.push(current);
      }

      current = {
        marker: marker.marker,
        id: buildFootnoteId(pageId, marker.marker),
        lines: [marker.text],
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    footnotes.push(current);
  }

  return footnotes;
}

function parseFootnoteMarker(line: string): FootnoteMarker | null {
  const parenMatch = line.match(/^\(\^([^)]+)\)\s*(.*)$/);
  if (parenMatch) {
    return {
      marker: parenMatch[1].trim(),
      text: parenMatch[2],
    };
  }

  const starMatch = line.match(/^\[\*\]\s*(.*)$/);
  if (starMatch) {
    return {
      marker: "*",
      text: starMatch[1],
    };
  }

  return null;
}

function renderFootnotesSection(footnotes: Footnote[]): string {
  const items = footnotes
    .map(
      (footnote) =>
        `<li id="fn-${footnote.id}">${renderFootnoteBody(footnote.lines)} <a href="#fnref-${footnote.id}" class="footnote-backref">↩</a></li>`,
    )
    .join("");

  return `<section class="page-footnotes"><ol>${items}</ol></section>`;
}

function renderFootnoteBody(lines: string[]): string {
  const paragraphs: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (line.trim() === "") {
      if (current.length > 0) {
        paragraphs.push(current.join(" ").trim());
        current = [];
      }
      continue;
    }

    current.push(line.trim());
  }

  if (current.length > 0) {
    paragraphs.push(current.join(" ").trim());
  }

  return paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("");
}

function renderPageSeparator(pageMeta: PageMeta): string {
  const parts: string[] = [];

  if (pageMeta.volume) {
    parts.push(`ج ${escapeHtml(pageMeta.volume)}`);
  }

  if (pageMeta.printedPage) {
    parts.push(`ص ${escapeHtml(pageMeta.printedPage)}`);
  } else {
    parts.push(`صفحة ${pageMeta.pageId}`);
  }

  return `<div class="page-separator" aria-label="فاصل الصفحة"><span>${parts.join(" · ")}</span></div>`;
}

function getPageMeta(node: RootContent): PageMeta | null {
  if (node.type !== "html") {
    return null;
  }

  const match = node.value.match(
    /^<!--\s*page_id:\s*(\d+);\s*volume:\s*([^;]*);\s*printed_page:\s*([^;]*)\s*-->$/,
  );

  if (!match) {
    return null;
  }

  return {
    pageId: Number(match[1]),
    volume: match[2].trim(),
    printedPage: match[3].trim(),
  };
}

function buildFootnoteId(pageId: number, marker: string): string {
  return `p${pageId}-${normalizeMarker(marker)}`;
}

function normalizeMarker(marker: string): string {
  if (marker === "*") {
    return "star";
  }

  const digits = marker.replace(/[٠-٩]/g, (digit) => ARABIC_DIGITS[digit] ?? digit);
  const normalized = digits
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "note";
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
