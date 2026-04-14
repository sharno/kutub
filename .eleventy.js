import MarkdownIt from "markdown-it";
import { renderTurathMarkdown } from "./site/_includes/lib/render-turath-markdown.ts";

export default function eleventyConfig(eleventyConfig) {
  const markdown = new MarkdownIt({
    html: true,
    linkify: false,
    typographer: false,
  });

  markdown.renderer.rules.softbreak = () => "<br>\n";

  eleventyConfig.setLibrary("md", markdown);
  eleventyConfig.addFilter("renderChapter", renderTurathMarkdown);
  eleventyConfig.addPassthroughCopy({ public: "." });
  eleventyConfig.addPassthroughCopy({ "site/assets": "assets" });
  eleventyConfig.addWatchTarget("./src/data/books");
  eleventyConfig.addWatchTarget("./src/generated/chapters");
  eleventyConfig.addWatchTarget("./src/styles/global.css");

  return {
    dir: {
      input: "site",
      includes: "_includes",
      data: "_data",
      output: "dist",
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
    templateFormats: ["njk", "md", "html"],
  };
}
