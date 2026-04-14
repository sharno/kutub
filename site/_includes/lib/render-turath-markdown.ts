import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  html: true,
  linkify: false,
  typographer: false,
});

markdown.renderer.rules.softbreak = () => "<br>\n";

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

interface PageMeta {
  pageId: number;
  volume: string;
  printedPage: string;
}

interface Footnote {
  marker: string;
  id: string;
  lines: string[];
}

interface FinalizedPage {
  meta: PageMeta;
  bodyMarkdown: string;
  footnotes: Footnote[];
}

interface WorkingPage {
  meta: PageMeta;
  bodyLines: string[];
  footnoteLines: string[];
  inFootnotes: boolean;
}

interface ParsedFootnoteMarker {
  marker: string;
  text: string;
}

export function renderTurathMarkdown(source: string): string {
  const pages = parsePages(source);

  if (pages.length === 0) {
    return markdown.render(source);
  }

  const output: string[] = [];

  for (const [index, page] of pages.entries()) {
    const nextPage = pages[index + 1] ?? null;
    const footnotesByMarker = new Map(page.footnotes.map((footnote) => [footnote.marker, footnote.id]));
    const bodyMarkdown = replaceInlineFootnotes(page.bodyMarkdown, footnotesByMarker);

    output.push(`<!-- page_id: ${page.meta.pageId}; volume: ${escapeHtml(page.meta.volume)}; printed_page: ${escapeHtml(page.meta.printedPage)} -->`);
    output.push(markdown.render(bodyMarkdown));

    if (page.footnotes.length > 0) {
      output.push(renderFootnotesSection(page.footnotes));
    }

    if (nextPage) {
      output.push(renderPageSeparator(nextPage.meta));
    }
  }

  return output.join("\n");
}

function parsePages(source: string): FinalizedPage[] {
  const lines = source.split(/\r?\n/);
  const pages: FinalizedPage[] = [];
  let currentPage: WorkingPage | null = null;

  for (const line of lines) {
    const pageMeta = parsePageComment(line);

    if (pageMeta) {
      if (currentPage) {
        pages.push(finalizePage(currentPage));
      }

      currentPage = {
        meta: pageMeta,
        bodyLines: [],
        footnoteLines: [],
        inFootnotes: false,
      };
      continue;
    }

    if (!currentPage) {
      continue;
    }

    if (line.trim() === "_________") {
      currentPage.inFootnotes = true;
      continue;
    }

    if (currentPage.inFootnotes) {
      currentPage.footnoteLines.push(line);
    } else {
      currentPage.bodyLines.push(line);
    }
  }

  if (currentPage) {
    pages.push(finalizePage(currentPage));
  }

  return pages;
}

function finalizePage(page: WorkingPage): FinalizedPage {
  return {
    meta: page.meta,
    bodyMarkdown: page.bodyLines.join("\n").trim(),
    footnotes: parseFootnotes(page.footnoteLines, page.meta.pageId),
  };
}

function parsePageComment(line: string): PageMeta | null {
  const match = line.match(/^<!--\s*page_id:\s*(\d+);\s*volume:\s*([^;]*);\s*printed_page:\s*([^;]*)\s*-->$/);
  if (!match) {
    return null;
  }

  return {
    pageId: Number(match[1]),
    volume: match[2].trim(),
    printedPage: match[3].trim(),
  };
}

function parseFootnotes(lines: string[], pageId: number): Footnote[] {
  const blocks = lines.map((line) => line.trimEnd());
  const footnotes: Footnote[] = [];
  let current: Footnote | null = null;

  for (const line of blocks) {
    const marker = parseFootnoteMarker(line.trim());

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

function parseFootnoteMarker(line: string): ParsedFootnoteMarker | null {
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

function replaceInlineFootnotes(markdownSource: string, footnotesByMarker: Map<string, string>): string {
  return markdownSource.replace(/(\(\^[^)]+\)|\[\*\])/g, (segment) => {
    const marker = normalizeInlineMarker(segment);
    if (!marker) {
      return segment;
    }

    const id = footnotesByMarker.get(marker);
    if (!id) {
      return segment;
    }

    return `<sup id="fnref-${id}"><a href="#fn-${id}">${escapeHtml(marker)}</a></sup>`;
  });
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
  return `<p class="page-separator" aria-label="فاصل الصفحة"><span>${escapeHtml(buildPageSeparatorLabel(pageMeta))}</span></p>`;
}

function buildPageSeparatorLabel(pageMeta: PageMeta): string {
  const parts: string[] = [];

  if (pageMeta.volume) {
    parts.push(`ج ${pageMeta.volume}`);
  }

  if (pageMeta.printedPage) {
    parts.push(`ص ${pageMeta.printedPage}`);
  } else {
    parts.push(`صفحة ${pageMeta.pageId}`);
  }

  return parts.join(" · ");
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
