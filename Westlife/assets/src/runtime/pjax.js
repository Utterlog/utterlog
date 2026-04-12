(function (w, d) {
  "use strict";

  let isNavigating = false;
  let popstateNavigation = false;

  function getSettings() {
    return w.westlifeSettings || {};
  }

  function shouldEnable() {
    return !!getSettings().enablePjax;
  }

  function getContainerSelector() {
    return getSettings().pjaxContainerSelector || "main.site-main";
  }

  function isEligibleLink(link) {
    if (!link || !link.href) return false;
    if (link.target && link.target !== "_self") return false;
    if (link.hasAttribute("download")) return false;
    if ((link.getAttribute("rel") || "").includes("external")) return false;
    if (link.closest("[data-no-pjax]")) return false;
    if (link.closest("form")) return false;

    const url = new URL(link.href, w.location.href);
    if (url.origin !== w.location.origin) return false;
    if (url.pathname.startsWith("/wp-admin")) return false;
    if (url.pathname.includes("/wp-login")) return false;
    if (url.searchParams.has("preview")) return false;
    if (url.hash && url.pathname === w.location.pathname) return false;

    return true;
  }

  function syncBody(nextDoc) {
    if (!nextDoc.body) return;
    d.body.className = nextDoc.body.className;
    Array.from(d.body.attributes).forEach((attr) => {
      if (attr.name === "class") return;
      d.body.removeAttribute(attr.name);
    });
    Array.from(nextDoc.body.attributes).forEach((attr) => {
      if (attr.name === "class") return;
      d.body.setAttribute(attr.name, attr.value);
    });
  }

  function syncDocument(nextDoc) {
    d.title = nextDoc.title || d.title;
    syncBody(nextDoc);
  }

  async function navigate(url) {
    if (isNavigating) return;
    isNavigating = true;
    const selector = getContainerSelector();
    const currentContainer = d.querySelector(selector);
    if (!currentContainer) {
      isNavigating = false;
      return w.location.assign(url);
    }

    d.dispatchEvent(
      new CustomEvent("westlife:before-navigate", {
        detail: { url, container: currentContainer },
      })
    );

    if (w.WestlifeApp) {
      w.WestlifeApp.destroy(currentContainer);
    }

    const response = await fetch(url, {
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    if (!response.ok) {
      isNavigating = false;
      return w.location.assign(url);
    }

    const html = await response.text();
    const parser = new DOMParser();
    const nextDoc = parser.parseFromString(html, "text/html");
    const nextContainer = nextDoc.querySelector(selector);

    if (!nextContainer) {
      isNavigating = false;
      return w.location.assign(url);
    }

    currentContainer.replaceWith(nextContainer);
    syncDocument(nextDoc);

    d.dispatchEvent(
      new CustomEvent("westlife:ajax:content-replaced", {
        detail: { url, container: nextContainer },
      })
    );

    if (!popstateNavigation) {
      w.history.pushState({ url }, "", url);
    }

    d.dispatchEvent(
      new CustomEvent("westlife:after-navigate", {
        detail: { url, container: nextContainer },
      })
    );

    if (w.WestlifeApp) {
      w.WestlifeApp.init(nextContainer);
    }

    w.scrollTo({ top: 0, behavior: "auto" });
    isNavigating = false;
  }

  function initPjax() {
    if (!shouldEnable()) return;
    if (w.__WESTLIFE_PJAX_INITED__) return;
    w.__WESTLIFE_PJAX_INITED__ = true;

    d.addEventListener("click", (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const link = event.target.closest("a[href]");
      if (!isEligibleLink(link)) return;

      event.preventDefault();
      navigate(link.href).catch(() => {
        isNavigating = false;
        w.location.assign(link.href);
      });
    });

    w.addEventListener("popstate", () => {
      popstateNavigation = true;
      navigate(w.location.href).catch(() => {
        w.location.reload();
      }).finally(() => {
        popstateNavigation = false;
      });
    });
  }

  if (w.WestlifeApp && typeof w.WestlifeApp.register === "function") {
    w.WestlifeApp.register({
      name: "pjax",
      match() {
        return true;
      },
      init() {
        initPjax();
      },
      destroy() {},
    });
  } else {
    d.addEventListener("DOMContentLoaded", initPjax);
  }
})(window, document);
