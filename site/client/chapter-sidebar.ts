const SIDEBAR_SELECTOR = "[data-chapter-sidebar]";

function getStorageKey(sidebar: HTMLElement): string {
  return `chapter-sidebar-scroll:${sidebar.dataset.scrollKey ?? ""}`;
}

function revealSidebar(sidebar: HTMLElement): void {
  requestAnimationFrame(() => {
    sidebar.style.visibility = "";
  });
}

function restoreSidebarScroll(sidebar: HTMLElement): void {
  const savedScrollTop = sessionStorage.getItem(getStorageKey(sidebar));
  if (savedScrollTop !== null) {
    sidebar.scrollTop = Number(savedScrollTop);
    revealSidebar(sidebar);
    return;
  }

  const activeLink = sidebar.querySelector<HTMLElement>('[aria-current="page"]');
  if (activeLink) {
    activeLink.scrollIntoView({ block: "nearest" });
  }

  revealSidebar(sidebar);
}

function persistSidebarScroll(sidebar: HTMLElement): void {
  sessionStorage.setItem(getStorageKey(sidebar), String(sidebar.scrollTop));
}

function waitForFonts(): Promise<void> {
  if ("fonts" in document && "ready" in document.fonts) {
    return document.fonts.ready.then(() => undefined);
  }

  return Promise.resolve();
}

function initChapterSidebar(): void {
  const sidebar = document.querySelector<HTMLElement>(SIDEBAR_SELECTOR);
  if (!sidebar) {
    return;
  }

  const persistScroll = (): void => {
    persistSidebarScroll(sidebar);
  };

  sidebar.addEventListener("scroll", persistScroll, { passive: true });
  sidebar.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      persistScroll();
    }
  });
  window.addEventListener("pagehide", persistScroll, { passive: true });

  void waitForFonts().then(() => {
    requestAnimationFrame(() => {
      restoreSidebarScroll(sidebar);
    });
  });
}

initChapterSidebar();
