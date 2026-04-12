/**
 * Westlife 主题导航功能模块
 * - 主题切换
 * - Cookie 同意弹窗
 * - 分类与分页 AJAX 加载
 * - 历史回退与分页容器清理
 * 依赖：jQuery, utils.js
 */
(function ($) {
  "use strict";
  function wlIcon(name, attrs = {}) {
    if (
      window.WestlifeIcons &&
      typeof window.WestlifeIcons.icon === "function"
    ) {
      return window.WestlifeIcons.icon(name, attrs);
    }
    return "";
  }

  function faIcon(classes, extraClass = "") {
    var finalClass = ["wl-icon", classes, extraClass].filter(Boolean).join(" ");
    return '<i class="' + finalClass + '" aria-hidden="true"></i>';
  }

  // 动态更新 --vw 变量：避免 100vw 与滚动条宽度差异导致的布局跳动
  function updateViewportVar() {
    var w = window.innerWidth;
    document.documentElement.style.setProperty("--vw", w + "px");
  }
  window.addEventListener(
    "resize",
    function () {
      // rAF 合并，避免频繁写 style
      if (window.__vwRaf) cancelAnimationFrame(window.__vwRaf);
      window.__vwRaf = requestAnimationFrame(updateViewportVar);
    },
    { passive: true }
  );
  // 初始
  updateViewportVar();

  var inited = false;
  var navObserver = null;
  var navTimers = [];

  function rememberTimer(id) {
    navTimers.push(id);
    return id;
  }

  function clearNavTimers() {
    while (navTimers.length) {
      clearTimeout(navTimers.pop());
    }
  }

  function getAjaxConfig() {
    var cfg = window.westlifeSettings || {};

    // 改进 nonce 获取
    const getNonce = () => {
      // 优先从分类导航相关表单获取
      const navNonce = document.querySelector(
        'input[name="nav_nonce"], input[name="category_nonce"]'
      )?.value;
      if (navNonce) return navNonce;

      // 备用：全局设置
      return cfg.nonce || "";
    };

    return {
      url: cfg.ajaxUrl || cfg.ajaxurl || window.ajaxurl || "",
      nonce: getNonce(),
    };
  }

  function hasUtils() {
    return (
      typeof window.WestlifeUtils !== "undefined" &&
      typeof window.WestlifeUtils.scrollTo === "function"
    );
  }

  /* =========================
   * 主导航 Hover 下划线（共享墨迹）
   * ========================= */
  function initNavUnderline() {
    var nav = document.querySelector(
      ".main-navigation:not(.hover-icons) .nav-menu"
    );
    if (!nav) return;

    // 确保存在共享下划线元素
    var ink = nav.querySelector(".nav-ink");
    if (!ink) {
      ink = document.createElement("div");
      ink.className = "nav-ink";
      nav.appendChild(ink);
    }

    var isDesktop = window.matchMedia("(min-width: 769px)");

    function moveInkTo(el, show) {
      if (!el || !nav) return;
      var r = el.getBoundingClientRect();
      var nr = nav.getBoundingClientRect();
      var left = r.left - nr.left + nav.scrollLeft + 10; // 和 CSS padding 对齐
      var width = Math.max(0, r.width - 20);
      ink.style.left = left + "px";
      ink.style.width = width + "px";
      if (show) ink.style.opacity = "1";
    }

    function hideInk() {
      ink.style.opacity = "0";
    }

    function getActiveLink() {
      return (
        nav.querySelector(
          "li.current-menu-item > a, li.current-menu-ancestor > a"
        ) || nav.querySelector("li > a")
      );
    }

    function bind() {
      // 初始定位到当前项
      var current = getActiveLink();
      if (current) moveInkTo(current, true);

      if (!isDesktop.matches) return; // 桌面端才跟随鼠标

      nav.addEventListener("mouseover", function (e) {
        var a = e.target.closest("li > a");
        if (!a || !nav.contains(a)) return;
        moveInkTo(a, true);
      });

      nav.addEventListener("focusin", function (e) {
        var a = e.target.closest("li > a");
        if (!a || !nav.contains(a)) return;
        moveInkTo(a, true);
      });

      nav.addEventListener("mouseleave", function () {
        // 退回到激活项
        var current = getActiveLink();
        if (current) moveInkTo(current, true);
        else hideInk();
      });

      nav.addEventListener("focusout", function () {
        if (!nav.contains(document.activeElement)) {
          var current = getActiveLink();
          if (current) moveInkTo(current, true);
          else hideInk();
        }
      });

      // 窗口变化时重新定位
      var onResize = function () {
        var current = getActiveLink();
        if (current) moveInkTo(current, true);
      };
      window.addEventListener("resize", onResize);
    }

    bind();
  }

  /* =========================
   * 主题切换
   * ========================= */
  function initThemeSwitch() {
    var html = document.documentElement;
    var btn = document.querySelector(".theme-switch");
    if (!btn) return;

    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)");
    var live = document.createElement("span");
    live.className = "sr-only theme-switch-live";
    live.setAttribute("aria-live", "polite");
    btn.appendChild(live);

    function getStoredTheme() {
      try {
        return localStorage.getItem("theme") || "";
      } catch (_) {
        return "";
      }
    }
    function setStoredTheme(theme) {
      try {
        localStorage.setItem("theme", theme);
      } catch (_) {}
    }

    function iconSelector(mode) {
      return mode === "dark"
        ? ".icon-dark"
        : mode === "light"
        ? ".icon-light"
        : ".icon-system";
    }

    function updateIcons(mode) {
      // CSS 已负责布局与可见性 (通过 data-theme + 选择器)；这里只实现一个轻微动画 class
      var target = btn.querySelector(iconSelector(mode));
      if (!target) return;
      try {
        if (
          window.WestlifeUtils &&
          typeof window.WestlifeUtils.shouldReduceMotion === "function" &&
          window.WestlifeUtils.shouldReduceMotion()
        ) {
          return;
        }
      } catch (_) {}
      target.classList.add("is-pulse");
      setTimeout(function () {
        target.classList.remove("is-pulse");
      }, 380);
    }

    function applyTheme(mode) {
      var finalTheme =
        mode === "system" ? (prefersDark.matches ? "dark" : "light") : mode;
      html.setAttribute("data-theme", finalTheme);
      // 为区分“系统”模式与最终渲染，额外设置 data-theme-mode（light/dark/system）
      html.setAttribute("data-theme-mode", mode);
      updateIcons(mode);
      var labelMap = {
        light: "当前：浅色模式，点击切换",
        dark: "当前：深色模式，点击切换",
        system: "当前：跟随系统，点击切换",
      };
      btn.setAttribute("aria-label", labelMap[mode] || "切换主题");
      live.textContent = labelMap[mode].replace("当前：", "已切换到");
      try {
        document.dispatchEvent(
          new CustomEvent("themeChange", { detail: { theme: mode } })
        );
      } catch (_) {}
    }

    function setInitialTheme() {
      var stored = getStoredTheme();
      var mode = stored || "system"; // 默认 system
      applyTheme(mode);
    }

    function cycleTheme() {
      var stored = getStoredTheme() || "system";
      var order = ["light", "dark", "system"];
      var idx = order.indexOf(stored);
      var next = order[(idx + 1) % order.length];

      // 抖动抑制：保持与旧策略一致，但无需再强制重排 icons
      var body = document.body;
      var htmlW = document.documentElement.clientWidth;
      if (
        !html.classList.contains("no-scrollbar") &&
        !body.classList.contains("no-scrollbar")
      ) {
        body.style.overflowY = "scroll";
      }
      body.style.width = htmlW + "px";
      body.style.boxSizing = "border-box";

      requestAnimationFrame(function () {
        setStoredTheme(next);
        applyTheme(next);
        requestAnimationFrame(function () {
          body.style.width = "";
          if (
            !html.classList.contains("no-scrollbar") &&
            !body.classList.contains("no-scrollbar")
          ) {
            body.style.overflowY = "";
          }
        });
      });
    }

    // 当处于 system 模式时（显式存储 'system' 或尚未存储）跟随系统变化
    prefersDark.addEventListener("change", function (e) {
      var stored = getStoredTheme();
      if (stored === "system" || stored === "") {
        applyTheme("system"); // 让 applyTheme 内部重新解析最终 dark/light，并保持 data-theme-mode=system
      }
    });

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      cycleTheme();
    });

    setInitialTheme();

    document.addEventListener("themeChange", function () {
      try {
        updateViewportVar();
      } catch (_) {}
    });
  }

  /* =========================
   * Cookie 同意弹窗（单例）
   * ========================= */
  function initCookieConsent() {
    if (document.querySelector(".cookie-consent")) return;

    var KEY = "westlife_cookie_consent";
    try {
      if (localStorage.getItem(KEY)) return;
    } catch (_) {
      return;
    }

    // 获取之前保存的设置
    function getSavedSettings() {
      try {
        var saved = localStorage.getItem(KEY + "_settings");
        return saved
          ? JSON.parse(saved)
          : { necessary: true, analytics: true, marketing: false };
      } catch (_) {
        return { necessary: true, analytics: true, marketing: false };
      }
    }

    var cfg = Object.assign(
      {
        title: "我们使用 Cookie",
        text: "我们使用 Cookie 来优化您的浏览体验。您可以选择接受所有 Cookie，拒绝非必要 Cookie，或自定义您的偏好设置。",
        acceptText: "接受所有",
        declineText: "仅必要",
        settingsText: "保存设置",
      },
      window.westlifeCookieConsentConfig || {}
    );

    var el = document.createElement("div");
    el.className = "cookie-consent";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("aria-label", "Cookie 提示");

    el.innerHTML =
      '<div class="cookie-icon" aria-hidden="true">' +
      '<svg id="cookieSvg" viewBox="0 0 122.88 122.25" width="40" height="40">' +
      "<defs>" +
      '<circle id="chip1" cx="35" cy="45" r="3" fill="#654321"/>' +
      '<circle id="chip2" cx="75" cy="35" r="2.5" fill="#8B4513"/>' +
      '<circle id="chip3" cx="50" cy="70" r="2" fill="#A0522D"/>' +
      '<circle id="chip4" cx="85" cy="60" r="2.8" fill="#654321"/>' +
      '<circle id="chip5" cx="40" cy="85" r="2.2" fill="#8B4513"/>' +
      "</defs>" +
      "<g>" +
      '<path d="M61.44,0C27.53,0,0,27.53,0,61.44c0,33.91,27.53,61.44,61.44,61.44s61.44-27.53,61.44-61.44C122.88,27.53,95.35,0,61.44,0z M61.44,112.88C33.04,112.88,10,89.84,10,61.44S33.04,10,61.44,10s51.44,23.04,51.44,51.44S89.84,112.88,61.44,112.88z"/>' +
      '<use href="#chip1"/>' +
      '<use href="#chip2"/>' +
      '<use href="#chip3"/>' +
      '<use href="#chip4"/>' +
      '<use href="#chip5"/>' +
      "</g>" +
      "</svg>" +
      "</div>" +
      '<p class="cookie-heading">' +
      cfg.title +
      "</p>" +
      '<p class="cookie-text">' +
      cfg.text +
      "</p>" +
      '<div class="cookie-options">' +
      '<label class="cookie-option">' +
      '<input type="checkbox" checked disabled> 必要 Cookie（无法禁用）' +
      "</label>" +
      '<label class="cookie-option">' +
      '<input type="checkbox" id="analytics-cookies" checked> 分析 Cookie' +
      "</label>" +
      '<label class="cookie-option">' +
      '<input type="checkbox" id="marketing-cookies"> 营销 Cookie' +
      "</label>" +
      "</div>" +
      '<div class="cookie-actions">' +
      '<button class="cookie-btn cookie-accept" type="button">' +
      cfg.acceptText +
      "</button>" +
      '<button class="cookie-btn cookie-decline" type="button">' +
      cfg.declineText +
      "</button>" +
      '<button class="cookie-btn cookie-settings" type="button">' +
      cfg.settingsText +
      "</button>" +
      "</div>";

    document.body.appendChild(el);

    // 应用保存的设置
    var savedSettings = getSavedSettings();
    el.querySelector("#analytics-cookies").checked = savedSettings.analytics;
    el.querySelector("#marketing-cookies").checked = savedSettings.marketing;

    setTimeout(function () {
      el.classList.add("show");
    }, 300);

    function finish(value, settings) {
      var cookieSettings = settings || {
        necessary: true,
        analytics: true,
        marketing: false,
      };

      try {
        localStorage.setItem(KEY, value);
        localStorage.setItem(KEY + "_settings", JSON.stringify(cookieSettings));
      } catch (_) {}

      el.classList.remove("show");
      setTimeout(function () {
        el.remove();
      }, 350);

      try {
        document.dispatchEvent(
          new CustomEvent("cookieConsentChange", {
            detail: {
              value: value,
              settings: cookieSettings,
            },
          })
        );
      } catch (_) {}
    }

    function getCurrentSettings() {
      return {
        necessary: true, // 总是必需的
        analytics: el.querySelector("#analytics-cookies").checked,
        marketing: el.querySelector("#marketing-cookies").checked,
      };
    }

    var allow = el.querySelector(".cookie-accept");
    var deny = el.querySelector(".cookie-decline");
    var settings = el.querySelector(".cookie-settings");

    if (allow)
      allow.addEventListener("click", function () {
        finish("accepted", getCurrentSettings());
      });

    if (deny)
      deny.addEventListener("click", function () {
        finish("declined", {
          necessary: true,
          analytics: false,
          marketing: false,
        });
      });

    if (settings)
      settings.addEventListener("click", function () {
        finish("customized", getCurrentSettings());
      });
  }

  /* =========================
   * 移动端导航菜单
   * ========================= */
  function initMobileMenu() {
    // 如果主题或其它脚本已经输出了按钮，则复用；否则创建
    var mobileToggle = document.querySelector(".mobile-menu-toggle");
    if (!mobileToggle) {
      mobileToggle = document.createElement("button");
      mobileToggle.className = "mobile-menu-toggle";
      mobileToggle.setAttribute("type", "button");
      mobileToggle.setAttribute("aria-label", "切换移动端菜单");
      mobileToggle.setAttribute("aria-expanded", "false");
      mobileToggle.innerHTML = wlIcon("menu");

      // 查找header wrapper并插入按钮
      var headerWrapper = document.querySelector(".header-wrapper");
      if (headerWrapper) {
        // 插入到header-wrapper的第一个位置
        headerWrapper.insertBefore(mobileToggle, headerWrapper.firstChild);
      }
    }

    // 创建或复用移动端菜单覆盖层
    var mobileOverlay = document.querySelector(".mobile-menu-overlay");
    if (!mobileOverlay) {
      mobileOverlay = document.createElement("div");
      mobileOverlay.className = "mobile-menu-overlay";
      document.body.appendChild(mobileOverlay);
    }

    // 创建或复用移动端菜单容器
    var mobileMenu = document.querySelector(".mobile-menu-container");
    var mobileClose;
    if (!mobileMenu) {
      mobileMenu = document.createElement("div");
      mobileMenu.className = "mobile-menu-container";
      // 关闭按钮
      mobileClose = document.createElement("button");
      mobileClose.className = "mobile-menu-close";
      mobileClose.setAttribute("type", "button");
      mobileClose.setAttribute("aria-label", "关闭菜单");
      mobileClose.innerHTML = wlIcon("x");
      mobileMenu.appendChild(mobileClose);
      document.body.appendChild(mobileMenu);
    } else {
      mobileClose = mobileMenu.querySelector(".mobile-menu-close");
      if (!mobileClose) {
        mobileClose = document.createElement("button");
        mobileClose.className = "mobile-menu-close";
        mobileClose.setAttribute("type", "button");
        mobileClose.setAttribute("aria-label", "关闭菜单");
        mobileClose.innerHTML = wlIcon("x");
        mobileMenu.insertBefore(mobileClose, mobileMenu.firstChild);
      }
    }

    // 注入或复用移动端菜单列表
    if (!mobileMenu.querySelector(".mobile-nav-menu")) {
      var mainNav = document.querySelector(".main-navigation .nav-menu");
      var wrap = document.createElement("div");
      wrap.className = "mobile-nav-menu";
      if (mainNav) {
        var cloned = mainNav.cloneNode(true);
        // 避免重复 ID/样式冲突：清除自身及所有后代的 id 属性
        if (cloned.id) cloned.removeAttribute("id");
        try {
          cloned.querySelectorAll("[id]").forEach(function (node) {
            node.removeAttribute("id");
          });
        } catch (_) {}
        cloned.classList.add("is-mobile");
        wrap.appendChild(cloned);
      }
      mobileMenu.appendChild(wrap);
    }

    // 菜单状态管理
    var isMenuOpen = false;

    function toggleMenu() {
      isMenuOpen = !isMenuOpen;

      if (isMenuOpen) {
        document.body.classList.add("mobile-menu-active");
        mobileOverlay.classList.add("active");
        mobileMenu.classList.add("active");
        mobileToggle.setAttribute("aria-expanded", "true");

        // 阻止背景滚动
        document.body.style.overflow = "hidden";
      } else {
        document.body.classList.remove("mobile-menu-active");
        mobileOverlay.classList.remove("active");
        mobileMenu.classList.remove("active");
        mobileToggle.setAttribute("aria-expanded", "false");

        // 恢复背景滚动
        document.body.style.overflow = "";
      }
    }

    function closeMenu() {
      if (isMenuOpen) {
        toggleMenu();
      }
    }

    // 事件绑定
    mobileToggle.addEventListener("click", toggleMenu);
    mobileOverlay.addEventListener("click", closeMenu);
    mobileClose.addEventListener("click", closeMenu);

    // 点击菜单项后关闭菜单
    mobileMenu.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        closeMenu();
      }
    });

    // ESC键关闭菜单
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeMenu();
      }
    });

    // 窗口大小变化时关闭菜单
    window.addEventListener("resize", function () {
      if (window.innerWidth > 768) {
        closeMenu();
      }
    });
  }

  /* =========================
   * 工具函数
   * ========================= */
  function getPageFromUrl(url) {
    var s = String(url || "");
    var m = s.match(/\/page\/(\d+)/i);
    if (m && m[1]) return parseInt(m[1], 10);
    try {
      var u = new URL(s, location.origin);
      var q = parseInt(u.searchParams.get("paged"), 10);
      return Number.isFinite(q) && q > 0 ? q : 1;
    } catch (_) {
      return 1;
    }
  }

  function getActiveCategoryId() {
    var $a = $(".category-list a.active").first();
    var id = parseInt($a.attr("data-category"), 10);
    return Number.isFinite(id) ? id : 0;
  }

  // withLoading 适配：旧版本 main/loader 模块可能提供；若不存在提供轻量实现，避免报错导致分类/分页失效
  function withLoading($el) {
    if (typeof window.withLoading === "function") {
      try {
        return window.withLoading($el);
      } catch (_) {}
    }
    var overlay;
    var count = 0;
    function ensure() {
      if (overlay && overlay.isConnected) return;
      overlay = document.createElement("div");
      overlay.className = "grid-loading-overlay";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      // 使用统一矩形跳动蓝色风格 (wl-loading-spinner)，并包一层用于对齐
      overlay.innerHTML =
        '<div class="wl-loading-spinner" aria-hidden="true">' +
        "<div></div><div></div><div></div><div></div><div></div>" +
        "</div>";
      var node = $el && $el[0];
      if (node) {
        if (getComputedStyle(node).position === "static")
          node.style.position = "relative";
        // 覆盖层样式微调：绝对定位填充网格
        overlay.style.position = "absolute";
        overlay.style.inset = "0";
        overlay.style.display = "flex";
        overlay.style.justifyContent = "center";
        overlay.style.alignItems = "center";
        overlay.style.backdropFilter = "blur(2px)";
        overlay.style.background = "rgba(255,255,255,0.55)";
        overlay.style.zIndex = "15";
        if (document.documentElement.getAttribute("data-theme") === "dark") {
          overlay.style.background = "rgba(0,0,0,0.45)";
        }
        node.appendChild(overlay);
      }
    }
    return {
      start: function () {
        count++;
        ensure();
      },
      end: function () {
        count = Math.max(0, count - 1);
        if (!count && overlay && overlay.parentNode) {
          overlay.remove();
          overlay = null;
        }
      },
    };
  }

  function setActiveCategory(catId) {
    var $list = $(".category-list");
    if (!$list.length) return;
    $list.find("a").removeClass("active");
    $list.find("a").each(function () {
      var id = parseInt($(this).attr("data-category"), 10);
      if ((Number.isFinite(id) ? id : 0) === (catId || 0)) {
        $(this).addClass("active");
      }
    });
  }

  // 扁平化分页（整合 ajax-nav.js 策略）
  function buildFlatPagination(html) {
    if (!html || !html.trim()) return "";
    var tmp = document.createElement("div");
    tmp.innerHTML = html;
    var links = tmp.querySelectorAll(
      ".pagination-wrapper.is-posts a.page-numbers, .pagination-wrapper.is-posts span.page-numbers"
    );
    if (!links.length)
      links = tmp.querySelectorAll("a.page-numbers, span.page-numbers");
    if (!links.length) return "";
    var wrap = document.createElement("div");
    wrap.className = "pagination-wrapper is-posts";
    links.forEach(function (n) {
      wrap.appendChild(n.cloneNode(true));
    });
    return wrap.outerHTML;
  }

  function managePaginationContainer($grid, newPaginationHtml) {
    var $old = $grid.nextAll(".pagination-wrapper.is-posts").first();
    if ($old.length) $old.remove();
    if (!newPaginationHtml || !newPaginationHtml.trim()) return;
    if (/pagination-wrapper\s+is-posts/.test(newPaginationHtml)) {
      $grid.after(newPaginationHtml);
    } else {
      var flat = buildFlatPagination(newPaginationHtml);
      if (flat) $grid.after(flat);
    }
    setTimeout(fixPaginationStyles, 30);
  }

  // 样式修复函数 - 简化版
  function fixPaginationStyles() {
    $(".pagination-wrapper.is-posts").each(function () {
      var $wrapper = $(this);

      // 移除冲突类
      $wrapper.removeClass("pagination posts-navigation wp-pagenavi");

      // 检查嵌套结构
      var $nested = $wrapper.find(
        ".pagination-wrapper, .posts-pagination, .nav-links"
      );
      if ($nested.length > 0) {
        var $pageNumbers = $nested.find("a.page-numbers, span.page-numbers");
        if ($pageNumbers.length > 0) {
          $wrapper.empty().append($pageNumbers);
        }
      }
    });
  }

  // 初始化时标记现有分页容器
  function initializePaginationContainers() {
    $(".posts-grid").siblings(".pagination-wrapper").addClass("is-posts");
    // 初始化时也修复一次
    setTimeout(fixPaginationStyles, 100);
  }

  // 精准滚动（引入 ajax-nav.js 二次校正策略）
  function scrollToGrid() {
    var grid = document.querySelector(".posts-grid");
    var categoryBar = document.querySelector(".category-list");
    var target = categoryBar || grid;
    if (!target) return;
    var header = document.querySelector(".site-header");
    var admin = document.getElementById("wpadminbar");
    var headerOffset =
      (header ? header.getBoundingClientRect().height : 0) +
      (admin ? admin.getBoundingClientRect().height : 0);
    var gapAttr = categoryBar
      ? parseInt(categoryBar.getAttribute("data-scroll-gap"), 10)
      : NaN;
    var marginGap = Number.isFinite(gapAttr) ? gapAttr : 10;
    var compute = function () {
      return (
        target.getBoundingClientRect().top +
        window.pageYOffset -
        headerOffset -
        marginGap
      );
    };
    var targetTop = Math.max(0, compute());
    var diff = window.pageYOffset - targetTop;
    if (diff > 0 && Math.abs(diff) < 16) return; // 避免微抖动
    window.scrollTo({ top: targetTop, behavior: "smooth" });
    var reAdjust = function () {
      var newTarget = Math.max(0, compute());
      var delta = Math.abs(window.pageYOffset - newTarget);
      if (delta > 20) {
        window.scrollTo({ top: newTarget, behavior: "smooth" });
      }
    };
    requestAnimationFrame(function () {
      setTimeout(reAdjust, 90);
    });
    requestAnimationFrame(function () {
      setTimeout(reAdjust, 200);
    });
  }

  function showError(message) {
    var msg = message || "加载失败，请重试";
    // 统一使用 WestlifeUtils.showMessage
    if (
      window.WestlifeUtils &&
      typeof window.WestlifeUtils.showMessage === "function"
    ) {
      window.WestlifeUtils.showMessage(msg, "error");
    } else {
      console.error("通知系统未加载:", msg);
    }
  }

  // 之前为 contain 模式的背景铺底逻辑，现改为 cover，不再需要；保留空实现以避免调用报错
  function refreshContainBackdrop() {}

  /* installImageFadeIn 及缩略图开场/淡入动画已移除 */

  /* =========================
   * 布局切换（两列/一列）
   * ========================= */
  function applyGridLayout(cols) {
    var grid = document.querySelector(".posts-grid");
    if (!grid) return;
    grid.classList.toggle("layout-1", cols === 1);
    grid.classList.toggle("layout-2", cols !== 1);

    // 重新应用缩略图遮罩与进入态，避免切换后视觉不一致
    try {
      grid.querySelectorAll(".post-thumbnail-overlay").forEach(function (ov) {
        ov.style.background =
          "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,.2) 30%, rgba(0,0,0,.6) 100%)";
      });
      if ("IntersectionObserver" in window) {
        var io = new IntersectionObserver(
          function (entries) {
            entries.forEach(function (ent) {
              if (ent.isIntersecting) {
                ent.target.classList.add("is-entered");
                io.unobserve(ent.target);
              }
            });
          },
          { rootMargin: "150px" }
        );
        grid.querySelectorAll("img:not(.is-entered)").forEach(function (img) {
          io.observe(img);
        });
      } else {
        grid.querySelectorAll("img:not(.is-entered)").forEach(function (img) {
          img.classList.add("is-entered");
        });
      }
    } catch (_) {}

    // cover 模式无需额外处理
  }

  function getSavedCols() {
    try {
      var v = parseInt(localStorage.getItem("wl_grid_cols") || "2", 10);
      return v === 1 ? 1 : 2;
    } catch (_) {
      return 2;
    }
  }
  function saveCols(cols) {
    try {
      localStorage.setItem("wl_grid_cols", String(cols === 1 ? 1 : 2));
    } catch (_) {}
  }

  function initGridLayoutToggle() {
    // 始终注册一次全局 resize 监听：小屏移除，放大重建
    if (!window.__wlLtResize) {
      window.__wlLtResize = function () {
        var isMob =
          window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
        if (isMob) {
          document.querySelectorAll(".layout-toggle").forEach(function (el) {
            el.remove();
          });
        } else {
          // 回到桌面端时，重建控件（若不存在）
          if (!document.querySelector(".layout-toggle")) {
            initGridLayoutToggle();
          }
        }
      };
      window.addEventListener("resize", window.__wlLtResize);
    }

    // 小屏不需要布局切换，直接移除并返回
    if (window.matchMedia && window.matchMedia("(max-width: 768px)").matches) {
      document.querySelectorAll(".layout-toggle").forEach(function (el) {
        el.remove();
      });
      return;
    }
    var nav =
      document.querySelector(".category-nav") ||
      (document.querySelector(".category-list") &&
        document.querySelector(".category-list").parentElement);
    if (!nav || nav.querySelector(".layout-toggle")) return;

    var wrap = document.createElement("div");
    wrap.className = "layout-toggle";
    wrap.setAttribute("role", "group");
    wrap.setAttribute("aria-label", "布局切换");
    wrap.innerHTML =
      `<button type="button" class="lt-btn two" title="两列" aria-pressed="false">${faIcon("fa-solid fa-table-columns")}</button>` +
      `<button type="button" class="lt-btn one" title="单列" aria-pressed="false">${faIcon("fa-solid fa-list")}</button>`;

    nav.appendChild(wrap);

    var btnTwo = wrap.querySelector(".lt-btn.two");
    var btnOne = wrap.querySelector(".lt-btn.one");

    var setActive = function (cols) {
      var one = cols === 1;
      btnOne.classList.toggle("active", one);
      btnTwo.classList.toggle("active", !one);
      btnOne.setAttribute("aria-pressed", one ? "true" : "false");
      btnTwo.setAttribute("aria-pressed", one ? "false" : "true");
    };

    var cols = getSavedCols();
    applyGridLayout(cols);
    setActive(cols);

    btnTwo.addEventListener("click", function () {
      applyGridLayout(2);
      saveCols(2);
      setActive(2);
    });
    btnOne.addEventListener("click", function () {
      applyGridLayout(1);
      saveCols(1);
      setActive(1);
    });
  }

  function markCategoryHasCount() {
    try {
      document
        .querySelectorAll(".category-list .category-item")
        .forEach(function (el) {
          if (el.querySelector(".count")) el.classList.add("has-count");
          else el.classList.remove("has-count");
        });
    } catch (_) {}
  }

  /* =========================
   * 分类/分页 AJAX
   * ========================= */
  function loadPosts(category, page, push) {
    // 请求序列控制，防止乱序渲染
    window.__WL_POST_REQ_SEQ = (window.__WL_POST_REQ_SEQ || 0) + 1;
    const reqSeq = window.__WL_POST_REQ_SEQ;
    var $grid = $(".posts-grid");
    if (!$grid.length) {
      // 页面没有 AJAX 容器，回退为正常跳转
      var href =
        $('.category-list a[data-category="' + (category || 0) + '"]').attr(
          "href"
        ) || location.href;
      return fallbackNavigate(href);
    }

    var ajaxConfig = getAjaxConfig();
    if (!ajaxConfig.url) {
      console.error("AJAX URL not configured.");
      return;
    }

    var loader = withLoading($grid);
    loader.start();

    const jqXHR = $.ajax({
      url: ajaxConfig.url,
      type: "POST",
      dataType: "json",
      data: {
        action: "westlife_load_category_posts",
        nonce: ajaxConfig.nonce,
        category: category,
        page: page,
      },
    })
      .done(function (resp) {
        if (reqSeq !== window.__WL_POST_REQ_SEQ) {
          // 过期响应，忽略
          return;
        }
        if (!resp || !resp.success) {
          showError((resp && resp.data && resp.data.message) || "加载失败");
          return;
        }

        // 1) 替换文章网格内容
        $grid.html(resp.data.html || "");

        // 2) 使用新的分页管理函数
        managePaginationContainer($grid, resp.data.pagination || "");

        // 2.0) 为新图片安装淡入过渡
        try {
          /* installImageFadeIn removed */
        } catch (_) {}

        // 2.1) 修复新插入卡片的缩略图遮罩与进入态（避免样式状态不一致）
        try {
          // 覆盖新插入元素的遮罩渐变（与 main.js 保持一致）
          $grid.find(".post-thumbnail-overlay").each(function () {
            this.style.background =
              "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,.2) 30%, rgba(0,0,0,.6) 100%)";
          });

          // 移除骨架屏（处理 AJAX 加载的新卡片）
          $grid.find(".post-thumbnail-wrapper").each(function () {
            var wrapper = this;
            var img = wrapper.querySelector("img.post-thumbnail-img");
            if (!img) return;

            if (img.complete && img.naturalWidth > 0) {
              // 图片已加载完成
              wrapper.classList.add("is-thumb-ready");
            } else {
              // 监听图片加载
              img.addEventListener("load", function () {
                wrapper.classList.add("is-thumb-ready");
              });
              img.addEventListener("error", function () {
                wrapper.classList.add("is-thumb-ready");
              });
            }
          });

          // 观察并标记图片进入视口，触发进入过渡
          if ("IntersectionObserver" in window) {
            var io = new IntersectionObserver(
              function (entries) {
                entries.forEach(function (ent) {
                  if (ent.isIntersecting) {
                    ent.target.classList.add("is-entered");
                    io.unobserve(ent.target);
                  }
                });
              },
              { rootMargin: "150px" }
            );
            $grid.find("img:not(.is-entered)").each(function () {
              io.observe(this);
            });
          } else {
            $grid.find("img:not(.is-entered)").addClass("is-entered");
          }
        } catch (e) {
          // 忽略视觉增强失败
        }

        // 3) 还原布局按钮与列数
        applyGridLayout(getSavedCols());
        initGridLayoutToggle();

        // cover 模式无需额外处理

        // 4) 地址与状态
        if (push && resp.data.url) {
          var url = resp.data.url.replace(/\/+$/, "");
          if (page && page > 1) url += "/page/" + page;
          history.pushState({ category: category, page: page }, "", url);
        }

        setActiveCategory(category);
        scrollToGrid();
        // 刷新徽章（阅读状态）
        try {
          window.WestlifePostBadges &&
            window.WestlifePostBadges.refresh &&
            window.WestlifePostBadges.refresh();
        } catch (_) {}
        // 派发自定义事件供其它脚本监听
        try {
          document.dispatchEvent(
            new CustomEvent("westlifePostsUpdated", {
              detail: { category, page },
            })
          );
        } catch (_) {}
      })
      .fail(function (xhr, status, error) {
        console.error("AJAX 请求失败:", { status: status, error: error });
        showError("网络请求失败，请稍后重试。");
      })
      .always(function () {
        loader.end();
      });
  }

  function fallbackNavigate(href) {
    window.location.href = href;
  }

  /* =========================
   * 事件绑定
   * ========================= */
  function bindEvents() {
    // 移除可能的重复绑定
    $(document).off("click.westlifeNav");

    // 分类点击
    $(document).on(
      "click.westlifeNav",
      ".category-list .category-item",
      function (e) {
        e.preventDefault();
        var $a = $(this);
        if ($a.hasClass("active")) return;
        var cat = parseInt($a.attr("data-category"), 10);
        loadPosts(Number.isFinite(cat) ? cat : 0, 1, true);
      }
    );

    // 分页点击 - 事件更健壮：若无法解析页码则回退默认跳转
    $(document).on(
      "click.westlifeNav",
      ".pagination-wrapper.is-posts a.page-numbers",
      function (e) {
        var href = $(this).attr("href");
        var page = getPageFromUrl(href);
        if (!page) return; // 让浏览器默认跳转
        e.preventDefault();
        var cat = getActiveCategoryId();
        loadPosts(cat, page || 1, true);
      }
    );

    // 历史回退
    $(window)
      .off("popstate.westlifeNav")
      .on("popstate.westlifeNav", function (e) {
        var state = e.originalEvent.state;
        if (state && typeof state.category !== "undefined") {
          loadPosts(state.category, state.page || 1, false);
        }
      });
  }

  /* =========================
   * 启动
   * ========================= */
  function boot() {
    if (inited) return;
    inited = true;

    // 初始化顺序
    initThemeSwitch();
    initCookieConsent();
    initNavUnderline();
    initMobileMenu();

    // 安装图片淡入效果（初始页面）
    /* installImageFadeIn removed */

    // 智能欢迎（代理到 intro 模块）
    if (
      window.westlifeIntro &&
      typeof window.westlifeIntro.init === "function"
    ) {
      window.westlifeIntro.init(document);
    }

    // 关键：插入"两列/单列"按钮并应用上次选择
    initGridLayoutToggle();
    applyGridLayout(getSavedCols());

    // 初始化分页容器标记
    initializePaginationContainers();
    markCategoryHasCount();

    bindEvents();

  }

  if (window.WestlifeApp && typeof window.WestlifeApp.register === "function") {
    window.WestlifeApp.register({
      name: "nav-global",
      match() {
        return true;
      },
      init() {
        boot();
      },
      destroy() {
        destroyNavModule();
      },
    });
  } else {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", boot);
    } else {
      boot();
    }
    document.addEventListener("westlifeUtilsReady", boot);
  }

  // ---- 暴露部分 API，便于外部调用/诊断 ----
  try {
    window.westlifeNav = window.westlifeNav || {};
    Object.assign(window.westlifeNav, {
      applyGridLayout: applyGridLayout,
      initGridLayoutToggle: initGridLayoutToggle,
      loadPosts: loadPosts,
      refreshSmartIntro: function () {
        try {
          if (
            window.westlifeIntro &&
            typeof window.westlifeIntro.refresh === "function"
          ) {
            window.westlifeIntro.refresh();
          }
        } catch (_) {}
      },
      rebind: function () {
        // 允许外部触发重新绑定，内部已做去重保护
        initializePaginationContainers();
        bindEvents();
        initGridLayoutToggle();
        applyGridLayout(getSavedCols());
        // cover 模式无需额外处理
        /* installImageFadeIn removed */
        if (
          window.westlifeIntro &&
          typeof window.westlifeIntro.init === "function"
        ) {
          window.westlifeIntro.init(document);
        }
      },
    });
  } catch (e) {}

  // ---- 自愈：若首次未成功注入控件/绑定事件，短延时重试一次 ----
  rememberTimer(
    setTimeout(function () {
    try {
      var hasToggle = !!document.querySelector(".category-nav .layout-toggle");
      var hasGrid = !!document.querySelector(".posts-grid");
      if (!hasToggle && hasGrid) {
        initGridLayoutToggle();
        applyGridLayout(getSavedCols());
      }
      // 通过命名空间卸载再绑定，避免重复
      $(document).off("click.westlifeNav");
      bindEvents();
      // 重新校正一次下划线位置
      initNavUnderline();
    } catch (_) {}
    }, 600)
  );

  // 晚到的 Cookie/表单变化：二次/三次轻量重试，便于换身份评论后及时更新
  rememberTimer(
    setTimeout(function () {
    try {
      if (window.westlifeIntro) window.westlifeIntro.init(document);
    } catch (_) {}
    }, 900)
  );
  rememberTimer(
    setTimeout(function () {
    try {
      if (window.westlifeIntro) window.westlifeIntro.init(document);
    } catch (_) {}
    }, 3000)
  );

  // ---- 监听分类导航区域变动（例如局部刷新/服务器端缓存片段），自动重建控件 ----
  try {
    var catNav = document.querySelector(".category-nav") || document;
    if (window.MutationObserver && catNav) {
      navObserver = new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var rec = list[i];
          if (rec.type === "childList") {
            var need = !document.querySelector(".category-nav .layout-toggle");
            if (need) {
              initGridLayoutToggle();
              applyGridLayout(getSavedCols());
              // 重新定位下划线
              initNavUnderline();
              break;
            }
          }
        }
      });
      navObserver.observe(catNav, { childList: true, subtree: true });
    }
  } catch (_) {}

  function destroyNavModule() {
    clearNavTimers();
    if (navObserver) {
      navObserver.disconnect();
      navObserver = null;
    }
    $(document).off("click.westlifeNav");
    $(window).off("popstate.westlifeNav");
  }
})(jQuery);
