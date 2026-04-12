(function ($) {
  "use strict";

  const PUZZLE_COLS = 4;
  const PUZZLE_ROWS = 4;

  function buildPuzzle(wrapper, img) {
    if (!wrapper || wrapper.querySelector(".puzzle-layer")) return;
    const layer = document.createElement("span");
    layer.className = "puzzle-layer puzzle-cols-4";
    const total = PUZZLE_COLS * PUZZLE_ROWS;
    // 计算中心优先：距离中心越小 delay 越小，中心块最先消失 -> 避免残留黑点聚焦
    const centerR = (PUZZLE_ROWS - 1) / 2;
    const centerC = (PUZZLE_COLS - 1) / 2;
    const cells = [];
    for (let r = 0; r < PUZZLE_ROWS; r++) {
      for (let c = 0; c < PUZZLE_COLS; c++) {
        const dist = Math.hypot(r - centerR, c - centerC);
        cells.push({ r, c, dist });
      }
    }
    cells.sort((a, b) => a.dist - b.dist || Math.random() - 0.5);
    const delayMap = new Array(total);
    cells.forEach((cell, i) => {
      const flat = cell.r * PUZZLE_COLS + cell.c;
      delayMap[flat] = i; // i 越小越早揭开
    });
    for (let r = 0; r < PUZZLE_ROWS; r++) {
      for (let c = 0; c < PUZZLE_COLS; c++) {
        const flat = r * PUZZLE_COLS + c;
        const piece = document.createElement("i");
        piece.className = "puzzle-piece";
        piece.style.setProperty("--delay", delayMap[flat]);
        layer.appendChild(piece);
      }
    }
    wrapper.classList.add("puzzle-wrapper");
    wrapper.appendChild(layer);
  }

  function markLoaded(img) {
    const wrapper = img.closest(".wl-img-outer");
    if (!wrapper) return;
    wrapper.classList.add("is-loaded");
  }

  // --------------------------------------------------
  // LazySizes 兜底：当 CDN 上的 lazysizes 未加载时
  // - 将 data-src/data-srcset/data-sizes 回填
  // - 手动补齐 .lazyloaded 与 lazyloaded 事件
  // 这样可以避免图片/缩略图因为 CSS 初始 opacity:0 而“永远不可见”。
  // --------------------------------------------------
  function initLazySizesFallback() {
    // lazysizes 已存在则不做任何事
    if (window.lazySizes) return;

    const imgs = Array.from(
      document.querySelectorAll(
        "img.lazyload[data-src], img.lazyload[data-srcset], img[data-src][loading], img[data-srcset]"
      )
    );
    const sources = Array.from(
      document.querySelectorAll("source[data-srcset]")
    );

    if (!imgs.length && !sources.length) return;

    // 触发与 lazysizes 接近的 lazyloaded 事件（冒泡到 document）
    function emitLazyLoaded(target) {
      try {
        target.classList.add("lazyloaded");
      } catch (e) {}
      try {
        const ev = new Event("lazyloaded", { bubbles: true });
        target.dispatchEvent(ev);
      } catch (e) {
        try {
          const ev2 = document.createEvent("Event");
          ev2.initEvent("lazyloaded", true, true);
          target.dispatchEvent(ev2);
        } catch (e2) {}
      }
    }

    // 回填 <source>
    sources.forEach(function (s) {
      if (s.dataset && s.dataset.srcset && !s.getAttribute("srcset")) {
        s.setAttribute("srcset", s.dataset.srcset);
      }
    });

    // 回填 <img>
    imgs.forEach(function (img) {
      if (!img || img.classList.contains("lazyloaded")) return;

      const dataSrc = img.getAttribute("data-src");
      const dataSrcset = img.getAttribute("data-srcset");
      const dataSizes = img.getAttribute("data-sizes");

      if (dataSizes && !img.getAttribute("sizes")) {
        img.setAttribute("sizes", dataSizes);
      }
      if (dataSrcset && !img.getAttribute("srcset")) {
        img.setAttribute("srcset", dataSrcset);
      }

      // 仅在需要时回填 src：避免重复触发已有图片加载
      if (dataSrc && (!img.getAttribute("src") || img.src.indexOf("data:image") === 0)) {
        img.setAttribute("src", dataSrc);
      }

      // 成功/失败都要解除“不可见”状态，避免一直 opacity:0
      const onDone = function () {
        emitLazyLoaded(img);
      };

      if (img.complete) {
        // 已完成（可能是缓存命中）
        onDone();
      } else {
        img.addEventListener("load", onDone, { once: true });
        img.addEventListener("error", onDone, { once: true });
      }
    });
  }

  function initContentPuzzle() {
    document
      .querySelectorAll(".wl-img-outer > img.wl-content-img")
      .forEach(function (img) {
        const wrapper = img.closest(".wl-img-outer");
        if (!wrapper || wrapper.dataset._puzzleBuilt) return;
        wrapper.dataset._puzzleBuilt = "1";
        buildPuzzle(wrapper, img);
        if (img.complete && img.naturalWidth > 0) {
          markLoaded(img);
        } else {
          img.addEventListener("load", () => markLoaded(img), { once: true });
          img.addEventListener("error", () => markLoaded(img), { once: true });
        }
      });
  }

  document.addEventListener("lazyloaded", function (e) {
    if (e && e.target && e.target.classList.contains("wl-content-img")) {
      markLoaded(e.target);
    }
  });

  // 缩略图淡入效果
  function initThumbnailFade() {
    document.querySelectorAll("img.thumb-fade").forEach(function (img) {
      if (img.dataset._fadeInit) return;
      img.dataset._fadeInit = "1";

      // 如果图片已经加载完成
      if (img.complete && img.naturalWidth > 0) {
        img.classList.add("loaded");
      } else {
        // 监听加载完成事件
        img.addEventListener(
          "load",
          function () {
            img.classList.add("loaded");
          },
          { once: true }
        );
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    // 先兜底一次，避免图片永远处于隐藏状态
    initLazySizesFallback();
    initContentPuzzle();
    bindContentImageFallback();
    initViewportAnimations();
    initThumbnailFade(); // 初始化缩略图淡入
    initImageViewer(); // 初始化本地图片预览

    // 再兜底一次：给 async 加载 lazysizes 留时间；若失败则 1.2s 后强制回填
    setTimeout(initLazySizesFallback, 1200);
  });
  document.addEventListener("westlife:ajax:content-replaced", function () {
    initLazySizesFallback();
    initContentPuzzle();
    bindContentImageFallback();
    initViewportAnimations();
    initThumbnailFade(); // 重新初始化缩略图淡入
    initImageViewer(); // 重新初始化本地图片预览
  });

  function bindContentImageFallback() {
    document.querySelectorAll("img.wl-content-img").forEach(function (img) {
      if (img.dataset._wlBound) return;
      img.dataset._wlBound = "1";
      img.addEventListener(
        "error",
        function () {
          const wrapper = img.closest(".wl-img-outer");
          if (wrapper) wrapper.classList.add("is-error");
          const fb =
            img.getAttribute("data-fallback") ||
            "https://via.placeholder.com/800x450?text=IMAGE";
          if (img.src !== fb) img.src = fb;
        },
        { once: true }
      );
    });
  }

  // 视口进入触发：头像淡入
  function initViewportAnimations() {
    const avatarSelector = "img.avatar-fade";

    function forceAvatarVisible(el) {
      if (!el || !el.classList) return;
      el.classList.add("is-in");
    }

    function normalizeGravatarUrl(url) {
      if (!url || typeof url !== "string") return url;
      // 仅在 bluecdn gravatar 失败时回退到官方 secure.gravatar.com
      return url.replace(/(^https?:)?\/\/gravatar\.bluecdn\.com\//i, function (_m, proto) {
        return (proto || "https:") + "//secure.gravatar.com/";
      });
    }

    function bindAvatarLoadError(el) {
      if (!el || !el.addEventListener) return;
      if (el.dataset && el.dataset._wlAvatarBound) return;
      if (el.dataset) el.dataset._wlAvatarBound = "1";

      // 已加载完成则直接显示
      if (el.complete && el.naturalWidth > 0) {
        forceAvatarVisible(el);
        return;
      }

      el.addEventListener(
        "load",
        function () {
          forceAvatarVisible(el);
        },
        { once: true }
      );

      el.addEventListener(
        "error",
        function () {
          const tried = el.dataset && el.dataset._wlAvatarTriedFallback === "1";
          const src = el.currentSrc || el.src || "";
          const nextSrc = normalizeGravatarUrl(src);
          if (!tried && nextSrc && nextSrc !== src) {
            if (el.dataset) el.dataset._wlAvatarTriedFallback = "1";
            try {
              el.src = nextSrc;
              const srcset = el.getAttribute("srcset") || "";
              if (srcset && srcset.indexOf("gravatar.bluecdn.com") !== -1) {
                el.setAttribute("srcset", srcset.replace(/gravatar\.bluecdn\.com/gi, "secure.gravatar.com"));
              }
              return;
            } catch (e) {}
          }

          // 最终兜底：不让 CSS 永久锁死透明（即使加载失败也可见占位/破图标）
          forceAvatarVisible(el);
          try {
            el.style.opacity = "1";
            el.style.filter = "none";
            el.style.transform = "none";
          } catch (e) {}
        },
        { once: false }
      );
    }

    // 若浏览器不支持 IntersectionObserver（或被策略禁用），直接显示
    if (typeof window.IntersectionObserver !== "function") {
      document.querySelectorAll(avatarSelector).forEach(function (el) {
        bindAvatarLoadError(el);
        forceAvatarVisible(el);
      });
      return;
    }

    // 全局复用一个 observer：首次创建；后续调用继续 observe 新增元素
    function getAvatarObserver() {
      if (window._wlAvatarIO) return window._wlAvatarIO;
      const threshold = 0.1;
      const io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            if (el && el.classList && el.classList.contains("avatar-fade")) {
              el.classList.add("is-in");
            }
            try {
              io.unobserve(el);
            } catch (e) {}
          });
        },
        { threshold }
      );
      window._wlAvatarIO = io;
      return io;
    }

    const io = getAvatarObserver();

    // 监听头像淡入动画（可重复调用，持续绑定新元素）
    document.querySelectorAll(avatarSelector).forEach(function (el) {
      if (!el || (el.dataset && el.dataset._ioBound)) return;
      el.dataset._ioBound = "1";
      bindAvatarLoadError(el);
      io.observe(el);

      // 兜底：如果元素已经在视口内，立即显示（避免某些布局下 IO 回调延迟）
      try {
        const r = el.getBoundingClientRect();
        const inView = r.bottom > 0 && r.right > 0 && r.top < window.innerHeight;
        if (inView) forceAvatarVisible(el);
      } catch (e) {}
    });
  }

  function initImageViewer() {
    if (
      window.WestlifeViewImages &&
      typeof window.WestlifeViewImages.init === "function"
    ) {
      window.WestlifeViewImages.init();
    }
  }

  function initImageModule() {
    initLazySizesFallback();
    initContentPuzzle();
    bindContentImageFallback();
    initViewportAnimations();
    initThumbnailFade();
    initImageViewer();
    setTimeout(initLazySizesFallback, 1200);
  }

  if (window.WestlifeApp && typeof window.WestlifeApp.register === "function") {
    window.WestlifeApp.register({
      name: "image-module",
      match(context) {
        const root = context && context.nodeType === 1 ? context : document;
        return !!root.querySelector(
          ".wl-img-outer, img.wl-content-img, img.thumb-fade, img.avatar-fade"
        );
      },
      init() {
        initImageModule();
      },
      destroy() {},
    });
  }
})(jQuery);
