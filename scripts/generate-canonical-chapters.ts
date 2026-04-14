import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { splitTurathJsonToChapters, yamlString, type TurathBookPayload, type TurathMetadataPayload } from "./turath.ts";

interface BookConfig {
  slug: string;
  canonicalSource?: string;
  canonicalChapterSource?: string;
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

interface CanonicalChapterFrontmatter {
  title: string;
  slug: string;
  order: number;
  excerpt: string;
}

const projectRoot = process.cwd();
const booksDir = path.join(projectRoot, "src", "data", "books");
const generatedRoot = path.join(projectRoot, "src", "generated", "chapters");
const downloadsRoot = path.join(projectRoot, "public", "downloads");

const bookFiles = (await readdir(booksDir))
  .filter((entry) => entry.endsWith(".json"))
  .sort((left, right) => left.localeCompare(right));

const generatedBooks: Array<{ slug: string; chapters: number }> = [];

for (const bookFile of bookFiles) {
  const bookPath = path.join(booksDir, bookFile);
  const book = JSON.parse(await readFile(bookPath, "utf8")) as BookConfig;

  if (!book.canonicalSource && !book.canonicalChapterSource && !book.canonicalMachineSource) {
    continue;
  }

  const chapters = await loadChapters(book);
  const bookDir = path.join(generatedRoot, book.slug);

  await rm(bookDir, { recursive: true, force: true });
  await mkdir(bookDir, { recursive: true });
  await mkdir(downloadsRoot, { recursive: true });

  if (book.canonicalSource) {
    const canonicalPath = path.resolve(projectRoot, book.canonicalSource);
    const canonicalMarkdown = await readFile(canonicalPath, "utf8");
    const downloadPath = path.join(downloadsRoot, `${book.slug}.md`);
    await writeFile(downloadPath, sanitizePublicDownload(canonicalMarkdown), "utf8");
  }

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
  if (book.canonicalChapterSource) {
    return loadCanonicalChapterDirectory(path.resolve(projectRoot, book.canonicalChapterSource));
  }

  if (book.canonicalMachineSource && book.canonicalMetaSource) {
    const machinePath = path.resolve(projectRoot, book.canonicalMachineSource);
    const metaPath = path.resolve(projectRoot, book.canonicalMetaSource);
    const [machineSource, metaSource] = await Promise.all([
      readJson<TurathBookPayload>(machinePath),
      readJson<TurathMetadataPayload>(metaPath),
    ]);

    return splitTurathJsonToChapters({
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

async function loadCanonicalChapterDirectory(directoryPath: string): Promise<FinalChapter[]> {
  const chapterFiles = (await readdir(directoryPath))
    .filter((entry) => entry.endsWith(".md"))
    .sort((left, right) => left.localeCompare(right));

  const chapters: FinalChapter[] = [];

  for (const chapterFile of chapterFiles) {
    const chapterPath = path.join(directoryPath, chapterFile);
    const markdown = await readFile(chapterPath, "utf8");
    const parsed = parseCanonicalChapterMarkdown(markdown);

    chapters.push({
      order: parsed.frontmatter.order,
      title: parsed.frontmatter.title,
      slug: parsed.frontmatter.slug,
      excerpt: parsed.frontmatter.excerpt,
      body: parsed.body,
    });
  }

  return chapters.sort((left, right) => left.order - right.order);
}

function parseCanonicalChapterMarkdown(markdown: string): { frontmatter: CanonicalChapterFrontmatter; body: string } {
  if (!markdown.startsWith("---")) {
    throw new Error("Canonical chapter markdown is missing frontmatter.");
  }

  const end = markdown.indexOf("\n---", 3);
  if (end === -1) {
    throw new Error("Canonical chapter markdown has an unterminated frontmatter block.");
  }

  const rawFrontmatter = markdown.slice(3, end).trim();
  const body = markdown.slice(end + 4).replace(/^\s+/, "").trim();
  const values = new Map<string, string>();

  for (const line of rawFrontmatter.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) continue;

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    values.set(key, value);
  }

  const title = parseFrontmatterString(values.get("title"), "title");
  const slug = parseFrontmatterString(values.get("slug"), "slug");
  const excerpt = parseFrontmatterString(values.get("excerpt"), "excerpt");
  const order = Number(values.get("order"));

  if (!Number.isFinite(order)) {
    throw new Error("Canonical chapter markdown has an invalid order.");
  }

  return {
    frontmatter: {
      title,
      slug,
      order,
      excerpt,
    },
    body,
  };
}

function parseFrontmatterString(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`Canonical chapter markdown is missing ${key}.`);
  }

  return JSON.parse(value) as string;
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
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

function sanitizePublicDownload(markdown: string): string {
  return markdown
    .replace(/^source:\s*.*\r?\n/gm, "")
    .replace(/^turath_book_id:\s*.*\r?\n/gm, "")
    .replace(/^- المصدر:\s*.*\r?\n/gm, "")
    .replace(/\n{3,}/g, "\n\n");
}

function slugifyArabic(value: string): string {
  const normalized = value
    .normalize("NFKC")
    .replace(/[[\](){}«»"':،؛!؟.,]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "section";
}
