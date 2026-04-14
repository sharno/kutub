import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { remarkTurath } from "./src/lib/remark/turath";

export default defineConfig({
  markdown: {
    remarkPlugins: [remarkTurath],
  },
  vite: {
    plugins: [tailwindcss()],
  },
  output: "static",
  trailingSlash: "never",
});
