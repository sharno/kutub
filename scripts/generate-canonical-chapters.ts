import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  cleanupPageText,
  groupHeadingsByPage,
  yamlString,
  type TurathBookPayload,
  type TurathHeading,
  type TurathMetadataPayload,
  type TurathPage,
} from "./turath.ts";

interface BookConfig {
  slug: string;
  canonicalSource?: string;
  canonicalMachineSource?: string;
  canonicalMetaSource?: string;
}

interface DraftChapter {
  title: string;
  lines: string[];
}

interface FinalChapter {
  order: number;
  title: string;
  slug: string;
  excerpt: string;
  body: string;
}

const projectRoot = process.cwd();
const booksDir = path.join(projectRoot, "src", "data", "books");
const generatedRoot = path.join(projectRoot, "src", "generated", "chapters");

const bookFiles = (await readdir(booksDir))
  .filter((entry) => entry.endsWith(".json"))
  .sort((left, right) => left.localeCompare(right));

const generatedBooks: Array<{ slug: string; chapters: number }> = [];

for (const bookFile of bookFiles) {
  const bookPath = path.join(booksDir, bookFile);
  const book = JSON.parse(await readFile(bookPath, "utf8")) as BookConfig;

  if (!book.canonicalSource && !book.canonicalMachineSource) {
    continue;
  }

  const chapters = await loadChapters(book);
  const bookDir = path.join(generatedRoot, book.slug);

  await rm(bookDir, { recursive: true, force: true });
  await mkdir(bookDir, { recursive: true });

  for (const chapter of chapters) {
    const filename = `${chapter.slug}.md`;
    const chapterPath = path.join(bookDir, filename);
    const frontmatter = [
      "---",
      `title: ${yamlString(chapter.title)}`,
      `slug: ${yamlString(chapter.slug)}`,
      `book: ${book.slug}`,
      `order: ${chapter.order}`,
      `excerpt: ${yamlString(chapter.excerpt)}`,
      "---",
      "",
      chapter.body.trim(),
      "",
    ].join("\n");

    await writeFile(chapterPath, frontmatter, "utf8");
  }

  generatedBooks.push({ slug: book.slug, chapters: chapters.length });
}

if (generatedBooks.length === 0) {
  console.log("No canonical books found.");
} else {
  for (const generatedBook of generatedBooks) {
    console.log(`Generated ${generatedBook.chapters} chapters for ${generatedBook.slug}`);
  }
}

async function loadChapters(book: BookConfig): Promise<FinalChapter[]> {
  if (book.canonicalMachineSource && book.canonicalMetaSource) {
    const machinePath = path.resolve(projectRoot, book.canonicalMachineSource);
    const metaPath = path.resolve(projectRoot, book.canonicalMetaSource);
    const [machineSource, metaSource] = await Promise.all([
      readJson<TurathBookPayload>(machinePath),
      readJson<TurathMetadataPayload>(metaPath),
    ]);

    return splitTurathJson({
      headings: metaSource.indexes?.headings ?? [],
      pages: machineSource.pages ?? [],
    });
  }

  if (book.canonicalSource) {
    const canonicalPath = path.resolve(projectRoot, book.canonicalSource);
    const canonicalMarkdown = await readFile(canonicalPath, "utf8");
    return splitCanonicalMarkdown(canonicalMarkdown);
  }

  return [];
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function splitTurathJson({ headings, pages }: { headings: TurathHeading[]; pages: TurathPage[] }): FinalChapter[] {
  const topLevelHeadings = headings.filter((heading) => (heading.level ?? 1) === 1);
  const chapters: FinalChapter[] = [];

  for (const [index, heading] of topLevelHeadings.entries()) {
    const startPage = heading.page;
    const nextHeading = topLevelHeadings[index + 1];
    const endPageExclusive = nextHeading ? nextHeading.page : pages.length + 1;
    const pageSlice = pages.slice(startPage - 1, endPageExclusive - 1);
    const nestedHeadings = headings.filter(
      (candidate) => candidate.page >= startPage && candidate.page < endPageExclusive && (candidate.level ?? 1) > 1,
    );
    const body = renderTurathChapterBody({
      nestedHeadings,
      pages: pageSlice,
      startPage,
    });

    chapters.push(finalizeChapter({ title: heading.title.trim(), lines: body.split("\n") }, index + 1));
  }

  return chapters;
}

function renderTurathChapterBody({
  nestedHeadings,
  pages,
  startPage,
}: {
  nestedHeadings: TurathHeading[];
  pages: TurathPage[];
  startPage: number;
}): string {
  const headingsByPage = groupHeadingsByPage(nestedHeadings);
  const lines: string[] = [];

  for (const [index, page] of pages.entries()) {
    const pageId = startPage + index;
    const pageHeadings = headingsByPage.get(pageId) ?? [];

    for (const heading of pageHeadings) {
      const headingLevel = Math.min((heading.level ?? 1) + 1, 6);
      lines.push(`${"#".repeat(headingLevel)} ${heading.title}`);
      lines.push("");
    }

    const cleanText = cleanupPageText(page?.text ?? "", pageHeadings);
    if (!cleanText) {
      continue;
    }

    lines.push(`<!-- page_id: ${pageId}; volume: ${page?.vol ?? ""}; printed_page: ${page?.page ?? ""} -->`);
    lines.push("");
    lines.push(cleanText);
    lines.push("");
  }

  return lines.join("\n").trim();
}

function splitCanonicalMarkdown(markdown: string): FinalChapter[] {
  const body = stripFrontmatter(markdown);
  const textStart = body.indexOf("\n## النص");

  if (textStart === -1) {
    throw new Error("Canonical markdown does not contain a ## النص section.");
  }

  const textBody = body.slice(textStart).replace(/^## النص\s*/m, "").trim();
  const lines = textBody.split(/\r?\n/);
  const chapters: FinalChapter[] = [];
  let current: DraftChapter | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^## (.+)$/);

    if (headingMatch) {
      if (current) {
        chapters.push(finalizeChapter(current, chapters.length + 1));
      }

      current = {
        title: headingMatch[1].trim(),
        lines: [],
      };
      continue;
    }

    if (!current) {
      continue;
    }

    current.lines.push(line);
  }

  if (current) {
    chapters.push(finalizeChapter(current, chapters.length + 1));
  }

  return chapters;
}

function finalizeChapter(chapter: DraftChapter, order: number): FinalChapter {
  const body = chapter.lines.join("\n").trim();
  const excerpt = extractExcerpt(body);
  const slugBase = slugifyArabic(chapter.title);

  return {
    order,
    title: chapter.title,
    slug: `${String(order).padStart(3, "0")}-${slugBase}`,
    excerpt,
    body,
  };
}

function extractExcerpt(markdown: string): string {
  const plain = markdown
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/[*_`>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return plain.slice(0, 180).trim();
}

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) {
    return markdown;
  }

  const end = markdown.indexOf("\n---", 3);
  if (end === -1) {
    return markdown;
  }

  return markdown.slice(end + 4).replace(/^\s+/, "");
}

function slugifyArabic(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[\[\](){}«»"':،؛!؟.,]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "section";
}
