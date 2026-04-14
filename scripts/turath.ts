export interface TurathHeading {
  title: string;
  level: number;
  page: number;
}

export interface TurathPage {
  text: string;
  vol?: string;
  page?: number;
}

export interface TurathBookPayload {
  pages?: TurathPage[];
}

export interface TurathBookMeta {
  id?: number;
  name?: string;
  info?: string;
  pdf_links?: {
    files?: string[];
  };
}

export interface TurathMetadataPayload {
  meta?: TurathBookMeta;
  indexes?: {
    headings?: TurathHeading[];
    volumes?: string[];
  };
}

export interface RenderMarkdownInput {
  author: string;
  bookId: number;
  edition: string;
  headings: TurathHeading[];
  info: string;
  pageCount: number;
  pages: TurathPage[];
  printedPdfFiles: string[];
  publisher: string;
  sourceUrl: string;
  title: string;
  volumes: string[];
}

export function extractInfoField(info: string | undefined, label: string): string | null {
  if (!info) return null;

  const pattern = new RegExp(`^${escapeRegExp(label)}:\\s*(.+)$`, "m");
  const match = info.match(pattern);
  return match?.[1]?.trim() ?? null;
}

export function groupHeadingsByPage(headings: TurathHeading[]): Map<number, TurathHeading[]> {
  const grouped = new Map<number, TurathHeading[]>();

  for (const heading of headings) {
    if (!heading?.page) continue;
    const list = grouped.get(heading.page) ?? [];
    list.push(heading);
    grouped.set(heading.page, list);
  }

  return grouped;
}

export function cleanupPageText(text: string, pageHeadings: TurathHeading[]): string {
  let output = text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<em>(.*?)<\/em>/gis, "*$1*")
    .replace(/<span[^>]*data-type="title"[^>]*>(.*?)<\/span>/gis, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();

  const headingTitles = new Set(pageHeadings.map((heading) => heading.title.trim()));
  const lines = output.split("\n");

  while (lines.length > 0 && headingTitles.has(lines[0].trim())) {
    lines.shift();
  }

  output = lines
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return output;
}

export function renderMarkdown({
  author,
  bookId,
  edition,
  headings,
  info,
  pageCount,
  pages,
  printedPdfFiles,
  publisher,
  sourceUrl,
  title,
  volumes,
}: RenderMarkdownInput): string {
  const lines: string[] = [];
  const importedAt = new Date().toISOString().slice(0, 10);
  const headingsByPage = groupHeadingsByPage(headings);

  lines.push("---");
  lines.push(`title: ${yamlString(title)}`);
  lines.push(`author: ${yamlString(author)}`);
  lines.push(`source: ${yamlString(sourceUrl)}`);
  lines.push(`turath_book_id: ${bookId}`);
  lines.push(`imported_at: ${yamlString(importedAt)}`);
  lines.push(`page_count: ${pageCount}`);
  lines.push("volumes:");
  for (const volume of volumes) {
    lines.push(`  - ${yamlString(volume)}`);
  }
  lines.push("---");
  lines.push("");
  lines.push(`# ${title}`);
  lines.push("");
  lines.push("## بيانات المصدر");
  lines.push("");
  if (author) lines.push(`- المؤلف: ${author}`);
  if (edition) lines.push(`- الطبعة: ${edition}`);
  if (publisher) lines.push(`- الناشر: ${publisher}`);
  lines.push(`- المصدر: ${sourceUrl}`);
  lines.push(`- صفحات النص المستوردة: ${pageCount}`);

  if (printedPdfFiles.length > 0) {
    lines.push(`- ملفات الـ PDF في المصدر: ${printedPdfFiles.join("، ")}`);
  }

  if (info) {
    lines.push("");
    lines.push("## وصف المصدر");
    lines.push("");
    lines.push(info.trim());
  }

  if (headings.length > 0) {
    lines.push("");
    lines.push("## الفهرس");
    lines.push("");

    for (const heading of headings) {
      const depth = Math.min(Math.max((heading.level ?? 1) - 1, 0), 4);
      const indent = "  ".repeat(depth);
      lines.push(`${indent}- ${heading.title} [صورة الصفحة ${heading.page}]`);
    }
  }

  lines.push("");
  lines.push("## النص");
  lines.push("");

  for (const [index, page] of pages.entries()) {
    const pageId = index + 1;
    const pageHeadings = headingsByPage.get(pageId) ?? [];

    for (const heading of pageHeadings) {
      const headingLevel = Math.min((heading.level ?? 1) + 1, 6);
      lines.push(`${"#".repeat(headingLevel)} ${heading.title}`);
      lines.push("");
    }

    const cleanText = cleanupPageText(page?.text ?? "", pageHeadings);
    if (!cleanText) continue;

    lines.push(`<!-- page_id: ${pageId}; volume: ${page?.vol ?? ""}; printed_page: ${page?.page ?? ""} -->`);
    lines.push("");
    lines.push(cleanText);
    lines.push("");
  }

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

export function yamlString(value: string | number | null | undefined): string {
  return JSON.stringify(value ?? "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
