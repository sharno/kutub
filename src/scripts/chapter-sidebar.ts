const SIDEBAR_SELECTOR = "[data-chapter-sidebar]";

type SidebarElement = HTMLElement & {
  dataset: DOMStringMap & {
    scrollKey?: string;
  };
};

function getStorageKey(sidebar: SidebarElement) {
  return `chapter-sidebar-scroll:${sidebar.dataset.scrollKey ?? ""}`;
}

function revealSidebar(sidebar: SidebarElement) {
  requestAnimationFrame(() => {
    sidebar.style.visibility = "";
  });
}

function restoreSidebarScroll(sidebar: SidebarElement) {
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

function persistSidebarScroll(sidebar: SidebarElement) {
  sessionStorage.setItem(getStorageKey(sidebar), String(sidebar.scrollTop));
}

function waitForFonts() {
  if ("fonts" in document && "ready" in document.fonts) {
    return document.fonts.ready;
  }

  return Promise.resolve();
}

export function initChapterSidebar() {
  const sidebar = document.querySelector<SidebarElement>(SIDEBAR_SELECTOR);
  if (!sidebar) {
    return;
  }

  const persistScroll = () => {
    persistSidebarScroll(sidebar);
  };

  sidebar.addEventListener("scroll", persistScroll, { passive: true });
  sidebar.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      persistScroll();
    }
  });
  window.addEventListener("pagehide", persistScroll, { passive: true });

  waitForFonts().then(() => {
    requestAnimationFrame(() => {
      restoreSidebarScroll(sidebar);
    });
  });
}

initChapterSidebar();
