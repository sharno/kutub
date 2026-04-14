import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const booksDir = path.join(projectRoot, "src", "data", "books");
const generatedChaptersRoot = path.join(projectRoot, "src", "generated", "chapters");

const GITHUB_REPO_URL = "https://github.com/sharno/kutub";
const GITHUB_DEFAULT_BRANCH = "main";

interface BookData {
  slug: string;
  title: string;
  author?: string;
  description?: string;
  canonicalChapterSource?: string;
  [key: string]: unknown;
}

interface ChapterFrontmatter {
  title: string;
  slug: string;
  order: number;
  excerpt: string;
}

export interface ChapterRecord extends ChapterFrontmatter {
  content: string;
  url: string;
}

export interface BookRecord extends BookData {
  url: string;
  downloadUrl: string;
  chapters: ChapterRecord[];
}

export interface ChapterPageRecord extends ChapterRecord {
  book: BookRecord;
  chapters: ChapterRecord[];
  previousChapter: ChapterRecord | null;
  nextChapter: ChapterRecord | null;
  editUrl: string | null;
}

export interface LibraryData {
  books: BookRecord[];
  chapterPages: ChapterPageRecord[];
}

interface ParsedCanonicalChapter {
  frontmatter: ChapterFrontmatter;
  body: string;
}

export async function loadLibrary(): Promise<LibraryData> {
  const bookFiles = (await readdir(booksDir))
    .filter((entry) => entry.endsWith(".json"))
    .sort((left, right) => left.localeCompare(right, "ar"));

  const books: BookRecord[] = [];
  const chapterPages: ChapterPageRecord[] = [];

  for (const bookFile of bookFiles) {
    const bookPath = path.join(booksDir, bookFile);
    const book = JSON.parse(await readFile(bookPath, "utf8")) as BookData;
    const chapters = await loadChapters(book.slug);

    const bookRecord: BookRecord = {
      ...book,
      url: `/books/${book.slug}`,
      downloadUrl: `/downloads/${book.slug}.md`,
      chapters,
    };

    books.push(bookRecord);

    for (const [index, chapter] of chapters.entries()) {
      chapterPages.push({
        ...chapter,
        book: bookRecord,
        chapters,
        previousChapter: index > 0 ? chapters[index - 1] : null,
        nextChapter: index < chapters.length - 1 ? chapters[index + 1] : null,
        editUrl: getChapterEditUrl(bookRecord, chapter),
      });
    }
  }

  books.sort((left, right) => left.title.localeCompare(right.title, "ar"));

  return {
    books,
    chapterPages,
  };
}

async function loadChapters(bookSlug: string): Promise<ChapterRecord[]> {
  const chapterDir = path.join(generatedChaptersRoot, bookSlug);
  const chapterFiles = (await readdir(chapterDir))
    .filter((entry) => entry.endsWith(".md"))
    .sort((left, right) => left.localeCompare(right, "ar"));

  const chapters: ChapterRecord[] = [];

  for (const chapterFile of chapterFiles) {
    const chapterPath = path.join(chapterDir, chapterFile);
    const markdown = await readFile(chapterPath, "utf8");
    const { frontmatter, body } = parseCanonicalChapterMarkdown(markdown);

    chapters.push({
      ...frontmatter,
      content: body,
      url: `/books/${bookSlug}/${frontmatter.slug}`,
    });
  }

  return chapters.sort((left, right) => left.order - right.order);
}

function parseCanonicalChapterMarkdown(markdown: string): ParsedCanonicalChapter {
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
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    values.set(key, value);
  }

  const frontmatter = {
    title: parseFrontmatterString(values.get("title"), "title"),
    slug: parseFrontmatterString(values.get("slug"), "slug"),
    order: Number(values.get("order")),
    excerpt: parseFrontmatterString(values.get("excerpt"), "excerpt"),
  };

  if (!Number.isFinite(frontmatter.order)) {
    throw new Error("Canonical chapter markdown has an invalid order.");
  }

  return { frontmatter, body };
}

function parseFrontmatterString(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`Canonical chapter markdown is missing ${key}.`);
  }

  return JSON.parse(value);
}

function getChapterEditUrl(book: BookRecord, chapter: ChapterRecord): string | null {
  if (!book.canonicalChapterSource) {
    return null;
  }

  const chapterPath = `${book.canonicalChapterSource}/${chapter.slug}.md`.replace(/\\/g, "/");
  return encodeURI(`${GITHUB_REPO_URL}/edit/${GITHUB_DEFAULT_BRANCH}/${chapterPath}`);
}
