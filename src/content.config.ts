import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const books = defineCollection({
  loader: glob({ pattern: "*.json", base: "./src/data/books" }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    author: z.string(),
    description: z.string(),
    language: z.literal("ar"),
    direction: z.literal("rtl"),
    sourceFormat: z.enum(["markdown", "typst"]),
    canonicalSource: z.string().optional(),
    canonicalMachineSource: z.string().optional(),
    canonicalMetaSource: z.string().optional(),
    sourceUrl: z.string().url().optional(),
    tags: z.array(z.string()).default([]),
    status: z.enum(["seed", "published"]).default("published"),
  }),
});

const chapters = defineCollection({
  loader: glob({ pattern: "{data/chapters,generated/chapters}/**/*.md", base: "./src" }),
  schema: z.object({
    title: z.string(),
    slug: z.string(),
    book: z.string(),
    order: z.number(),
    excerpt: z.string().optional(),
  }),
});

export const collections = { books, chapters };
