import { getCollection, type CollectionEntry } from "astro:content";

export type BookEntry = CollectionEntry<"books">;
export type ChapterEntry = CollectionEntry<"chapters">;

export async function getBooks() {
  const books = await getCollection("books");
  return books.sort((left, right) => left.data.title.localeCompare(right.data.title, "ar"));
}

export async function getBookBySlug(slug: string) {
  const books = await getCollection("books", ({ data }) => data.slug === slug);
  return books[0];
}

export async function getChaptersForBook(bookSlug: string) {
  const chapters = await getCollection("chapters", ({ data }) => data.book === bookSlug);
  return chapters.sort((left, right) => left.data.order - right.data.order);
}

export function getBookUrl(book: BookEntry) {
  return `/books/${book.data.slug}`;
}

export function getChapterUrl(chapter: ChapterEntry) {
  return `/books/${chapter.data.book}/${chapter.data.slug}`;
}
