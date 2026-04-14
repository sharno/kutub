import { expect, test } from "@playwright/test";

test.describe("kutub site", () => {
  test("home page lists the library and links to the book", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/كُتُب/);
    await expect(page.getByRole("heading", { level: 1, name: "المكتبة" })).toBeVisible();
    await expect(page.locator("section.hero-panel").getByRole("link", { name: "البحث" })).toHaveAttribute("href", "/search");

    const bookCard = page.locator("article").filter({ has: page.getByRole("link", { name: "الرسالة" }) }).first();
    await expect(bookCard).toBeVisible();
    await expect(bookCard.getByText("محمد بن إدريس الشافعي")).toBeVisible();
    await expect(bookCard.getByRole("link", { name: "قراءة" })).toHaveAttribute("href", "/books/al-risala");
    await expect(bookCard.getByRole("link", { name: "تنزيل" })).toHaveAttribute("href", "/downloads/al-risala.md");
  });

  test("search page loads pagefind and returns chapter results", async ({ page }) => {
    await page.goto("/search");

    await expect(page.getByRole("heading", { level: 2, name: "بحث نصي سريع داخل الكتب العربية" })).toBeVisible();
    await expect(page.locator("#search-status")).toHaveText("البحث جاهز.");

    const input = page.locator(".pagefind-ui__search-input");
    await expect(input).toBeVisible();
    await input.fill("الشافعي");

    const results = page.locator(".pagefind-ui__result");
    await expect(results.first()).toBeVisible();
    await expect(results.first()).toContainText("الشافعي");
    await expect(results.first().locator("a")).toHaveAttribute("href", /\/books\/al-risala\//);
  });

  test("book page shows metadata, download, and chapter listing", async ({ page }) => {
    await page.goto("/books/al-risala");

    await expect(page.getByRole("heading", { level: 1, name: "الرسالة" })).toBeVisible();
    await expect(page.getByText("المؤلف: محمد بن إدريس الشافعي")).toBeVisible();
    await expect(page.getByText("56 فصل")).toBeVisible();

    const downloadLink = page.getByRole("link", { name: "تنزيل الكتاب بصيغة Markdown" });
    await expect(downloadLink).toHaveAttribute("href", "/downloads/al-risala.md");

    const firstChapterLink = page.getByRole("link", { name: "مقدمة المحقق" }).first();
    await expect(firstChapterLink).toHaveAttribute("href", "/books/al-risala/001-مقدمة-المحقق");
  });

  test("chapter page renders reading tools, footnotes, and navigation", async ({ page }) => {
    await page.goto("/books/al-risala/029-%D9%81%D9%8A-%D8%A7%D9%84%D8%B9%D8%AF%D8%AF");

    await expect(page.getByRole("heading", { level: 1, name: "[في العدد]" })).toBeVisible();
    await expect(page.getByRole("link", { name: "<تحرير>" })).toHaveAttribute(
      "href",
      /github\.com\/sharno\/kutub\/edit\/main\/sources\/turath\/book-8180\/029-/,
    );
    await expect(page.locator(".page-footnotes").first()).toBeVisible();
    await expect(page.locator(".page-footnotes").first()).toContainText("في ب «إلى سنة رسول الله ﷺ».");
    await expect(page.locator(".page-separator").first()).toContainText("ج 1");
    await expect(page.locator(".page-separator").first()).toContainText("ص 200");

    const chapterNav = page.getByRole("navigation", { name: "التنقل بين الفصول" });
    await expect(chapterNav.getByRole("link", { name: /في الحج/ })).toHaveAttribute(
      "href",
      "/books/al-risala/028-في-الحج",
    );
    await expect(chapterNav.getByRole("link", { name: /\[في محرمات النساء\]/ })).toHaveAttribute(
      "href",
      "/books/al-risala/030-في-محرمات-النساء",
    );
  });
});
