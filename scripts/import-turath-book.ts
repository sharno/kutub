import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  extractInfoField,
  renderMarkdown,
  type TurathBookPayload,
  type TurathMetadataPayload,
} from "./turath.ts";

const [, , rawBookId, rawOutputPath] = process.argv;

if (!rawBookId || !/^\d+$/.test(rawBookId)) {
  console.error("Usage: node scripts/import-turath-book.ts <book-id> [output-path]");
  process.exit(1);
}

const bookId = Number(rawBookId);
const sourceUrl = `https://app.turath.io/book/${bookId}`;
const metadataUrl = `https://api.turath.io/book?id=${bookId}&include=indexes&ver=3`;
const pagesUrl = `https://files.turath.io/books-v3/${bookId}.json`;
const outputPath = path.resolve(rawOutputPath ?? `sources/turath/book-${bookId}.md`);
const outputDir = path.dirname(outputPath);
const metadataPath = path.resolve(outputDir, `${bookId}.meta.json`);
const machinePath = path.resolve(outputDir, `${bookId}.book.json`);

const [metadata, rawBook] = await Promise.all([
  fetchJson<TurathMetadataPayload>(metadataUrl),
  fetchJson<TurathBookPayload>(pagesUrl),
]);

const author = extractInfoField(metadata.meta?.info, "المؤلف") ?? "";
const publisher = extractInfoField(metadata.meta?.info, "الناشر") ?? "";
const edition = extractInfoField(metadata.meta?.info, "الطبعة") ?? "";
const pageCount = Array.isArray(rawBook.pages) ? rawBook.pages.length : 0;

const markdown = renderMarkdown({
  author,
  bookId,
  edition,
  headings: metadata.indexes?.headings ?? [],
  info: metadata.meta?.info ?? "",
  pageCount,
  pages: rawBook.pages ?? [],
  printedPdfFiles: metadata.meta?.pdf_links?.files ?? [],
  publisher,
  sourceUrl,
  title: metadata.meta?.name ?? `كتاب ${bookId}`,
  volumes: metadata.indexes?.volumes ?? [],
});

await mkdir(outputDir, { recursive: true });
await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
await writeFile(machinePath, `${JSON.stringify(rawBook, null, 2)}\n`, "utf8");
await writeFile(outputPath, markdown, "utf8");

console.log(`Saved ${pageCount} pages to ${outputPath}`);
console.log(`Saved metadata to ${metadataPath}`);
console.log(`Saved machine source to ${machinePath}`);

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "kutub-importer/1.0",
      accept: "application/json,text/plain,*/*",
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}
