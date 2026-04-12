/**
 * Westlife主题工具函数
 * @package Westlife
 */
(function ($, w, d) {
  "use strict";

  if (typeof jQuery === "undefined") {
    console.error("WestlifeUtils requires jQuery");
    return;
  }

  function initUtils() {
    // 复用已存在对象，避免被覆盖
    const WestlifeUtils = w.WestlifeUtils || {};
    const WestlifeIcons = w.WestlifeIcons || {};

    const iconToFaMap = {
      search: "fa-sharp fa-solid fa-magnifying-glass",
      bell: "fa-sharp fa-solid fa-bell",
      calendar: "fa-sharp fa-solid fa-calendar-days",
      x: "fa-sharp fa-solid fa-xmark",
      "circle-user-round": "fa-sharp fa-solid fa-circle-user",
      "user-round-pen": "fa-sharp fa-solid fa-user-pen",
      "user-pen": "fa-sharp fa-solid fa-user-pen",
      users: "fa-sharp fa-solid fa-users",
      "user-round": "fa-sharp fa-solid fa-user",
      user: "fa-sharp fa-solid fa-user",
      "id-card": "fa-sharp fa-solid fa-id-card",
      "log-in": "fa-sharp fa-solid fa-right-to-bracket",
      "log-out": "fa-sharp fa-solid fa-right-from-bracket",
      "layout-dashboard": "fa-sharp fa-solid fa-gauge",
      "layout-grid": "fa-sharp fa-solid fa-table-cells-large",
      "sliders-horizontal": "fa-sharp fa-solid fa-sliders",
      "square-pen": "fa-sharp fa-solid fa-pen-to-square",
      "pen-tool": "fa-sharp fa-solid fa-pen-nib",
      pencil: "fa-sharp fa-solid fa-pen",
      "message-circle-more": "fa-sharp fa-solid fa-comment-dots",
      "messages-square": "fa-sharp fa-solid fa-comments",
      "message-square-off": "fa-sharp fa-solid fa-comment-slash",
      "message-square": "fa-sharp fa-solid fa-comment",
      "message-circle": "fa-sharp fa-solid fa-comment",
      reply: "fa-sharp fa-solid fa-reply",
      "calendar-x-2": "fa-sharp fa-solid fa-calendar-xmark",
      "calendar-days": "fa-sharp fa-solid fa-calendar-days",
      "clock-3": "fa-regular fa-clock",
      "file-text": "fa-sharp fa-solid fa-file-lines",
      folder: "fa-sharp fa-solid fa-folder",
      tags: "fa-sharp fa-solid fa-tags",
      tag: "fa-sharp fa-solid fa-tag",
      eye: "fa-regular fa-eye",
      "eye-off": "fa-regular fa-eye-slash",
      flame: "fa-sharp fa-solid fa-fire",
      "circle-alert": "fa-sharp fa-solid fa-circle-info",
      "triangle-alert": "fa-sharp fa-solid fa-triangle-exclamation",
      "circle-check": "fa-sharp fa-solid fa-circle-check",
      "circle-x": "fa-sharp fa-solid fa-circle-xmark",
      check: "fa-sharp fa-solid fa-check",
      copy: "fa-regular fa-copy",
      "trash-2": "fa-sharp fa-solid fa-trash-can",
      bookmark: "fa-sharp fa-solid fa-bookmark",
      heart: "fa-sharp fa-solid fa-heart",
      "loader-circle": "fa-sharp fa-solid fa-circle-notch",
      "refresh-cw": "fa-sharp fa-solid fa-rotate-right",
      shuffle: "fa-sharp fa-solid fa-shuffle",
      plus: "fa-sharp fa-solid fa-plus",
      "arrow-left": "fa-sharp fa-solid fa-arrow-left",
      "arrow-right": "fa-sharp fa-solid fa-arrow-right",
      "arrow-up": "fa-sharp fa-solid fa-arrow-up",
      "chevron-left": "fa-sharp fa-solid fa-chevron-left",
      "chevron-right": "fa-sharp fa-solid fa-chevron-right",
      "circle-arrow-up": "fa-sharp fa-solid fa-circle-up",
      "layers-3": "fa-sharp fa-solid fa-layer-group",
      rss: "fa-sharp fa-solid fa-square-rss",
      unlink: "fa-sharp fa-solid fa-link-slash",
      link: "fa-sharp fa-solid fa-link",
      "external-link": "fa-sharp fa-solid fa-up-right-from-square",
      database: "fa-sharp fa-solid fa-database",
      cloud: "fa-sharp fa-solid fa-cloud",
      globe: "fa-sharp fa-solid fa-globe",
      mail: "fa-sharp fa-solid fa-envelope",
      send: "fa-sharp fa-solid fa-paper-plane",
      zap: "fa-sharp fa-solid fa-bolt",
      mountain: "fa-sharp fa-solid fa-mountain",
      "gamepad-2": "fa-sharp fa-solid fa-gamepad",
      crosshair: "fa-sharp fa-solid fa-crosshairs",
      swords: "fa-sharp fa-solid fa-chess-knight",
      "notebook-pen": "fa-sharp fa-solid fa-blog",
      "badge-check": "fa-sharp fa-solid fa-badge-check",
      "badge-plus": "fa-sharp fa-solid fa-circle-star",
      star: "fa-sharp fa-solid fa-star",
      moon: "fa-sharp fa-solid fa-moon",
      sun: "fa-sharp fa-solid fa-sun",
      crown: "fa-sharp fa-solid fa-crown",
      menu: "fa-sharp fa-solid fa-bars",
      "columns-2": "fa-sharp fa-solid fa-table-columns",
      list: "fa-sharp fa-solid fa-list",
      "tram-front": "fa-sharp fa-solid fa-train",
      "train-front": "fa-sharp fa-solid fa-train",
      compass: "fa-sharp fa-solid fa-compass",
      monitor: "fa-sharp fa-solid fa-desktop",
      house: "fa-sharp fa-solid fa-house",
      ghost: "fa-sharp fa-solid fa-ghost",
      inbox: "fa-sharp fa-solid fa-inbox",
      "chart-column": "fa-sharp fa-solid fa-chart-line",
      archive: "fa-sharp fa-solid fa-archive",
      hash: "fa-sharp fa-solid fa-hashtag",
      wifi: "fa-sharp fa-solid fa-wifi",
      download: "fa-sharp fa-solid fa-download",
      "git-branch": "fa-sharp fa-solid fa-code-branch",
      weight: "fa-sharp fa-solid fa-weight-hanging",
      blocks: "fa-brands fa-wordpress",
      "code-xml": "fa-brands fa-php",
      twitter: "fa-brands fa-twitter",
      github: "fa-brands fa-github",
      youtube: "fa-brands fa-youtube",
      instagram: "fa-brands fa-instagram",
      tv: "fa-brands fa-bilibili",
      "dice-5": "fa-sharp fa-solid fa-dice",
      palette: "fa-sharp fa-solid fa-palette",
      "brush-cleaning": "fa-sharp fa-solid fa-paint-brush",
      smartphone: "fa-sharp fa-solid fa-mobile-screen",
      "book-open": "fa-sharp fa-solid fa-book",
      history: "fa-sharp fa-solid fa-clock-rotate-left",
      headset: "fa-sharp fa-solid fa-headset",
      "circle-help": "fa-sharp fa-solid fa-circle-question",
      sofa: "fa-sharp fa-solid fa-couch",
    };

    function normalizeFontAwesomeClasses(value) {
      const replacements = {
        fas: "fa-solid",
        far: "fa-regular",
        fab: "fa-brands",
        fal: "fa-light",
        fat: "fa-thin",
        fad: "fa-duotone",
        fass: "fa-sharp fa-solid",
        fasr: "fa-sharp fa-regular",
        fasl: "fa-sharp fa-light",
        fast: "fa-sharp fa-thin",
        fasd: "fa-sharp-duotone",
      };

      return String(value || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .flatMap((part) => {
          const normalized = replacements[part.toLowerCase()];
          return normalized ? normalized.split(/\s+/) : [part.toLowerCase()];
        })
        .filter((part, index, list) => list.indexOf(part) === index)
        .join(" ");
    }

    function resolveFontAwesomeClass(value) {
      const iconValue = String(value || "").toLowerCase().trim();
      if (
        /\b(?:fa-solid|fa-regular|fa-brands|fa-light|fa-thin|fa-duotone|fa-sharp|fa-sharp-solid|fa-sharp-regular|fa-sharp-light|fa-sharp-thin|fa-sharp-duotone|fas|far|fab|fal|fat|fad|fass|fasr|fasl|fast|fasd)\b/.test(
          iconValue,
        )
      ) {
        return normalizeFontAwesomeClasses(iconValue);
      }
      if (iconValue.includes("fa-")) {
        const mappedName = (function mapLegacyFaToKey(raw) {
          const map = {
            "fa-search": "search",
            "fa-times": "x",
            "fa-xmark": "x",
            "fa-close": "x",
            "fa-user-circle": "circle-user-round",
            "fa-user-edit": "user-round-pen",
            "fa-user-friends": "users",
            "fa-users": "users",
            "fa-user": "user-round",
            "fa-id-badge": "id-card",
            "fa-left-to-bracket": "log-in",
            "fa-right-to-bracket": "log-in",
            "fa-sign-out": "log-out",
            "fa-gauge": "layout-dashboard",
            "fa-sliders-h": "sliders-horizontal",
            "fa-edit": "square-pen",
            "fa-pen-nib": "pen-tool",
            "fa-pen": "pencil",
            "fa-comment-dots": "message-circle-more",
            "fa-comments-alt": "messages-square",
            "fa-comments": "messages-square",
            "fa-comment-slash": "message-square-off",
            "fa-comment": "message-square",
            "fa-reply": "reply",
            "fa-calendar-times": "calendar-x-2",
            "fa-calendar-alt": "calendar-days",
            "fa-clock": "clock-3",
            "fa-file-word": "file-text",
            "fa-folder": "folder",
            "fa-tags": "tags",
            "fa-tag": "tag",
            "fa-eye": "eye",
            "fa-fire-flame": "flame",
            "fa-info-circle": "circle-alert",
            "fa-exclamation-circle": "circle-alert",
            "fa-exclamation-triangle": "triangle-alert",
            "fa-circle-info": "circle-alert",
            "fa-check-circle": "circle-check",
            "fa-circle-check": "circle-check",
            "fa-circle-xmark": "circle-x",
            "fa-check": "check",
            "fa-copy": "copy",
            "fa-trash": "trash-2",
            "fa-trash-alt": "trash-2",
            "fa-bookmark": "bookmark",
            "fa-heart": "heart",
            "fa-spinner": "loader-circle",
            "fa-circle-notch": "loader-circle",
            "fa-sync-alt": "refresh-cw",
            "fa-rotate-right": "refresh-cw",
            "fa-shuffle": "shuffle",
            "fa-plus": "plus",
            "fa-arrow-left": "arrow-left",
            "fa-arrow-right": "arrow-right",
            "fa-arrow-up": "arrow-up",
            "fa-chevron-left": "chevron-left",
            "fa-chevron-right": "chevron-right",
            "fa-circle-up": "circle-arrow-up",
            "fa-layer-group": "layers-3",
            "fa-rss": "rss",
            "fa-square-rss": "rss",
            "fa-link-slash": "unlink",
            "fa-link": "link",
            "fa-external-link-alt": "external-link",
            "fa-database": "database",
            "fa-cloud": "cloud",
            "fa-globe-asia": "globe",
            "fa-globe": "globe",
            "fa-envelope": "mail",
            "fa-paper-plane": "send",
            "fa-bolt": "zap",
            "fa-mountain": "mountain",
            "fa-gamepad": "gamepad-2",
            "fa-crosshairs": "crosshair",
            "fa-chess-knight": "swords",
            "fa-blog": "notebook-pen",
            "fa-star": "star",
            "fa-moon": "moon",
            "fa-sun": "sun",
            "fa-crown": "crown",
            "fa-bars": "menu",
            "fa-table-columns": "columns-2",
            "fa-list": "list",
            "fa-train-tunnel": "tram-front",
            "fa-train": "train-front",
            "fa-compass": "compass",
            "fa-desktop": "monitor",
            "fa-home": "house",
            "fa-ghost": "ghost",
            "fa-inbox": "inbox",
            "fa-chart-line": "chart-column",
            "fa-archive": "archive",
            "fa-hashtag": "hash",
            "fa-wifi": "wifi",
            "fa-download": "download",
            "fa-code-branch": "git-branch",
            "fa-weight-hanging": "weight",
            "fa-wordpress": "blocks",
            "fa-php": "code-xml",
            "fa-twitter": "twitter",
            "fa-x-twitter": "twitter",
            "fa-github": "github",
            "fa-youtube": "youtube",
            "fa-instagram": "instagram",
            "fa-bilibili": "tv",
            "fa-dice": "dice-5",
            "fa-palette": "palette",
            "fa-mobile-screen": "smartphone",
            "fa-book": "book-open",
            "fa-clock-rotate-left": "history",
            "fa-headset": "headset",
            "fa-circle-question": "circle-help",
            "fa-couch": "sofa",
          };
          for (const key in map) {
            if (raw.includes(key)) return map[key];
          }
          return raw;
        })(iconValue);
        return iconToFaMap[mappedName] || "fa-sharp fa-solid fa-circle";
      }
      return iconToFaMap[iconValue] || "fa-sharp fa-solid fa-circle";
    }

    function buildIconMarkup(name, attrs = {}) {
      const extraClass = String(attrs.class || "").trim();
      const baseClass = `wl-icon ${resolveFontAwesomeClass(name)}`.trim();
      const finalAttrs = {
        "aria-hidden": "true",
        ...attrs,
        class: extraClass ? `${baseClass} ${extraClass}` : baseClass,
      };
      if (String(name || "").toLowerCase().includes("fa-spin")) {
        finalAttrs.class = `${finalAttrs.class || ""} is-spin`.trim();
      }
      const attrText = Object.entries(finalAttrs)
        .filter(([, value]) => value !== null && value !== undefined && value !== "")
        .map(([key, value]) => `${key}="${String(value).replace(/"/g, "&quot;")}"`)
        .join(" ");
      return `<i ${attrText}></i>`;
    }

    function refreshLucideIcons(root = d) {
      return root;
    }

    Object.assign(WestlifeIcons, {
      icon: buildIconMarkup,
      resolve: resolveFontAwesomeClass,
      refresh: refreshLucideIcons,
      migrateLegacy: () => {},
    });

    // ---- 全局通知容器与定位（右上角，位于 header 下方） ----
    const TOAST_STACK_ID = "wl-toast-stack";
    function ensureToastStack() {
      let stack = d.getElementById(TOAST_STACK_ID);
      if (!stack) {
        stack = d.createElement("div");
        stack.id = TOAST_STACK_ID;
        stack.setAttribute("aria-live", "polite");
        stack.setAttribute("aria-atomic", "false");
        // 位置由 CSS 控制，顶部偏移通过 JS 动态计算
        d.body.appendChild(stack);
      }
      return $(stack);
    }
    function updateToastTopOffset() {
      const stack = d.getElementById(TOAST_STACK_ID);
      if (!stack) return;
      const header = d.querySelector(".site-header, #masthead.site-header");
      let top = 72; // 默认高度
      try {
        if (header) {
          const rect = header.getBoundingClientRect();
          // rect.height 在 sticky 场景下最准确；加 12px 间距
          top = Math.max(12, Math.round(rect.height) + 12);
        }
      } catch {}
      stack.style.top = top + "px";
    }

    Object.assign(WestlifeUtils, {
      // 平滑滚动
      scrollTo(target, offset = 0, duration = 300) {
        try {
          if (typeof target === "number") {
            $("html, body").animate(
              { scrollTop: Math.max(0, target - offset) },
              duration
            );
            return true;
          }
          const $target = target instanceof jQuery ? target : $(target);
          if (!$target.length) {
            console.warn("ScrollTo: 目标元素未找到:", target);
            return false;
          }
          const top = $target.offset()?.top;
          if (typeof top !== "number") {
            console.warn("ScrollTo: 无法获取目标元素位置");
            return false;
          }
          $("html, body").animate(
            { scrollTop: Math.max(0, top - offset) },
            duration
          );
          return true;
        } catch (e) {
          console.error("ScrollTo 失败:", e);
          return false;
        }
      },

      // 设置加载状态 (Phase B: 仅输出 wl-loading-* 结构前缀)
      // 精简：不再创建未前缀 .loading-message；仅使用 wl-loading-message
      // a11y: role=status + aria-live=polite；aria-busy 同步在容器上
      // text=false 可隐藏文本（纯图标场景）
      setLoading(el, isLoading, text = "加载中...") {
        const $el = el instanceof jQuery ? el : $(el);
        if (!$el.length) return;
        try {
          // 若是按钮，尝试自动识别内部结构
          const isButton = $el.is("button, .button, .submit-btn");
          const $iconWrapper = isButton
            ? $el.find(".loading-icon").first()
            : $();
          const $btnText = isButton ? $el.find(".btn-text").first() : $();
          if (isLoading) {
            $el.addClass("u-loading").attr({ "aria-busy": "true" });
            if ($btnText.length && text === false) {
              // 显式要求隐藏文本
              $btnText.addClass("u-hidden");
            }
            if ($iconWrapper.length) {
              $iconWrapper.removeClass("u-hidden").addClass("u-spinner");
            }
            // 仅查找/创建 wl-loading-message
            let $msg = $el.find(".wl-loading-message").first();
            if (!$msg.length) {
              $msg = $(
                `<div class="wl-loading-message" role="status" aria-live="polite"></div>`
              );
              $el.append($msg);
            }
            if (text !== false && typeof text === "string") {
              $msg.text(text);
            } else if (text === false) {
              // 允许传 false 隐藏文本（仅旋转图标场景）
              $msg.empty();
            }
          } else {
            $el.removeClass("u-loading").removeAttr("aria-busy");
            // 移除 prefixed message 容器
            $el.find(".wl-loading-message").remove();
            if ($btnText.length) $btnText.removeClass("u-hidden");
            if ($iconWrapper.length)
              $iconWrapper.addClass("u-hidden").removeClass("u-spinner");
          }
        } catch (e) {
          console.error("setLoading 失败:", e);
        }
      },

      /**
       * toggleHidden: 统一控制显示/隐藏 + 可访问状态
       * @param {HTMLElement|jQuery|string} el 目标元素或选择器
       * @param {boolean} hide true=隐藏 / false=显示
       * @param {object} opts { inert:boolean=false, focus?:boolean }
       * 行为：
       *  - 添加/移除 u-hidden 类
       *  - 同步 aria-hidden
       *  - 可选 inert (阻止聚焦/交互)
       *  - 可选显示后聚焦首个可聚焦元素（或自身）
       */
      toggleHidden(el, hide = true, opts = {}) {
        const $el = el instanceof jQuery ? el : $(el);
        if (!$el.length) return false;
        const { inert = false, focus = false } = opts;
        try {
          $el
            .toggleClass("u-hidden", !!hide)
            .attr("aria-hidden", hide ? "true" : "false");
          if (inert) {
            // inert 只在现代浏览器支持；使用属性方式优先
            if (hide) {
              $el.attr("inert", "");
            } else {
              $el.removeAttr("inert");
            }
          }
          if (!hide && focus) {
            // 尝试聚焦内部第一个可聚焦元素
            const focusable =
              $el.find(
                'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
              )[0] || $el[0];
            if (focusable && typeof focusable.focus === "function") {
              focusable.focus({ preventScroll: false });
            }
          }
          return true;
        } catch (e) {
          console.error("toggleHidden 失败:", e);
          return false;
        }
      },

      // AJAX 包装
      ajax(action, data = {}, opts = {}) {
        const settings = w.westlifeSettings || w.westlifeAdmin || {};
        const url = settings.ajaxurl || settings.ajaxUrl || w.ajaxurl;
        if (!url) {
          return Promise.reject(new Error("无效的 AJAX 配置"));
        }
        const { method = "POST", dataType = "json" } = opts;

        // 改进 nonce 获取逻辑
        const getNonce = () => {
          // 优先从表单中获取具体的 nonce
          const formNonce = document.querySelector(
            'input[name*="nonce"]:not([name="nonce"])'
          )?.value;
          if (formNonce) return formNonce;

          // 备用：从全局设置获取
          return settings.nonce || "";
        };

        const payload = { action, nonce: getNonce(), ...data };
        return $.ajax({ url, type: method, dataType, data: payload });
      },

      // 防抖/节流（改进：保留 this/返回值；可选 leading/trailing）
      debounce(fn, wait = 300, immediate = false) {
        let t, result;
        return function (...args) {
          const ctx = this;
          const callNow = immediate && !t;
          clearTimeout(t);
          t = setTimeout(() => {
            t = null;
            if (!immediate) result = fn.apply(ctx, args);
          }, wait);
          if (callNow) result = fn.apply(ctx, args);
          return result;
        };
      },
      throttle(fn, wait = 300, { leading = true, trailing = true } = {}) {
        let last = 0,
          t,
          savedArgs,
          savedCtx,
          result;
        function invoke(time) {
          last = time;
          result = fn.apply(savedCtx, savedArgs);
          savedArgs = savedCtx = null;
        }
        return function (...args) {
          const now = Date.now();
          if (!last && leading === false) last = now;
          const remaining = wait - (now - last);
          savedCtx = this;
          savedArgs = args;

          if (remaining <= 0 || remaining > wait) {
            if (t) {
              clearTimeout(t);
              t = null;
            }
            invoke(now);
          } else if (!t && trailing !== false) {
            t = setTimeout(() => {
              t = null;
              if (trailing && savedArgs) invoke(Date.now());
            }, remaining);
          }
          return result;
        };
      },

      // 顶部右侧卡片式提示（Uiverse 风格变体）
      // API: showMessage(text, type='info'|'success'|'error'|'warning', duration=3000, opts?: { subText?: string })
      showMessage(message, type = "info", duration = 3000, opts = {}) {
        const $stack = ensureToastStack();
        updateToastTopOffset();

        const t = (type || "info").toLowerCase();
        const isAssertive = t === "error" || t === "warning";
        const role = isAssertive ? "alert" : "status";
        const sub = opts.subText
          ? `<p class="sub-text">${opts.subText}</p>`
          : "";

        const iconSvg =
          {
            success: buildIconMarkup("circle-check", { class: "icon" }),
            error: buildIconMarkup("circle-x", { class: "icon" }),
            info: buildIconMarkup("circle-alert", { class: "icon" }),
            warning: buildIconMarkup("triangle-alert", { class: "icon" }),
          }[t] || buildIconMarkup("circle-alert", { class: "icon" });

        const $toast = $(`
          <div class="wl-toast wl-${t} card" role="${role}" aria-live="${
          isAssertive ? "assertive" : "polite"
        }" aria-atomic="true">
            <div class="glass-ripple"></div>
            <div class="icon-container">${iconSvg}</div>
            <div class="message-text-container">
              <p class="message-text">${message}</p>
              ${sub}
            </div>
            <button class="close" type="button" aria-label="关闭">
              ${buildIconMarkup("x", { class: "cross-icon" })}
            </button>
            <div class="progress" aria-hidden="true"></div>
          </div>
        `);

        // 插入栈顶，最新的在最上方
        $stack.prepend($toast);
        refreshLucideIcons($toast[0]);
        // 入场动画
        setTimeout(() => $toast.addClass("show"), 10);

        // 自动关闭（悬停暂停）
        let remaining = Math.max(800, Number(duration) || 2600);
        // 绑定进度条动画时长
        $toast.find(".progress").css("animation-duration", `${remaining}ms`);
        let timer = setTimeout(close, remaining);
        let lastTick = Date.now();

        function close() {
          $toast.addClass("leaving");
          setTimeout(() => $toast.remove(), 240);
        }
        $toast.on("mouseenter", () => {
          clearTimeout(timer);
          remaining -= Date.now() - lastTick;
          $toast.addClass("paused");
        });
        $toast.on("mouseleave", () => {
          lastTick = Date.now();
          timer = setTimeout(close, remaining);
          $toast.removeClass("paused");

          // 统一暴露主题主色（在 main.css 和 header 注入变量之后执行）
          try {
            var cs = getComputedStyle(document.documentElement);
            var primary =
              cs.getPropertyValue("--color-primary").trim() ||
              cs.getPropertyValue("--primary-color").trim();
            var primaryRgb =
              cs.getPropertyValue("--color-primary-rgb").trim() ||
              cs.getPropertyValue("--primary-color-rgb").trim();
            w.westlifeTheme = Object.assign(w.westlifeTheme || {}, {
              primary: primary,
              primaryRgb: primaryRgb,
              get: function (key) {
                return this[key];
              },
            });
          } catch (e) {
            console.warn("[westlifeTheme] init failed", e);
          }
        });
        $toast.find(".close").on("click", () => {
          clearTimeout(timer);
          close();
        });
      },

      // 相对/格式化时间
      formatDate(date, fmt = "YYYY-MM-DD") {
        date = new Date(date);
        const map = {
          YYYY: date.getFullYear(),
          MM: String(date.getMonth() + 1).padStart(2, "0"),
          DD: String(date.getDate()).padStart(2, "0"),
          HH: String(date.getHours()).padStart(2, "0"),
          mm: String(date.getMinutes()).padStart(2, "0"),
          ss: String(date.getSeconds()).padStart(2, "0"),
        };
        return fmt.replace(/YYYY|MM|DD|HH|mm|ss/g, (k) => map[k]);
      },
      getRelativeTime(date) {
        const diff = Date.now() - new Date(date).getTime();
        const s = Math.floor(diff / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const d = Math.floor(h / 24);
        const mo = Math.floor(d / 30);
        const y = Math.floor(mo / 12);
        if (y > 0) return `${y}年前`;
        if (mo > 0) return `${mo}个月前`;
        if (d > 0) return `${d}天前`;
        if (h > 0) return `${h}小时前`;
        if (m > 0) return `${m}分钟前`;
        return "刚刚";
      },

      // 视口检测
      isInViewport(el, offset = 0) {
        const r = el.getBoundingClientRect();
        return (
          r.top >= 0 - offset &&
          r.left >= 0 &&
          r.bottom <=
            (w.innerHeight || d.documentElement.clientHeight) + offset &&
          r.right <= (w.innerWidth || d.documentElement.clientWidth)
        );
      },

      // Cookie
      cookie: {
        set(name, value, days = 7) {
          const exp = new Date(Date.now() + days * 864e5).toUTCString();
          document.cookie = `${name}=${encodeURIComponent(
            value
          )}; expires=${exp}; path=/`;
        },
        get(name) {
          const m = document.cookie.match(
            "(^|;)\\s*" + name + "\\s*=\\s*([^;]+)"
          );
          return m ? decodeURIComponent(m.pop()) : null;
        },
        remove(name) {
          this.set(name, "", -1);
        },
      },

      // 存储
      storage: {
        set(k, v) {
          try {
            localStorage.setItem(
              k,
              typeof v === "string" ? v : JSON.stringify(v)
            );
          } catch (e) {
            console.error(e);
          }
        },
        get(k, def = null) {
          try {
            const v = localStorage.getItem(k);
            if (v === null) return def;
            try {
              return JSON.parse(v);
            } catch {
              return v;
            }
          } catch (e) {
            console.error(e);
            return def;
          }
        },
        remove(k) {
          try {
            localStorage.removeItem(k);
          } catch (e) {
            console.error(e);
          }
        },
        clear() {
          try {
            localStorage.clear();
          } catch (e) {
            console.error(e);
          }
        },
      },

      // 通知（后台页面沿用 WP 样式；前台回退到 toast 卡片）
      showNotice(type, message, duration = 3000) {
        const $anchor = $(".wrap > h1");
        if ($anchor.length) {
          const $n = $(
            `<div class="notice notice-${type} is-dismissible"><p>${message}</p></div>`
          )
            .insertAfter($anchor)
            .hide()
            .slideDown();
          setTimeout(() => $n.slideUp(() => $n.remove()), duration);
        } else {
          // 非后台页：使用全局 toast
          this.showMessage(message, type, duration);
        }
      },

      // 进度条
      progress: {
        update($bar, percent) {
          $bar.find(".bar").css("width", `${percent}%`);
          $bar.find(".percent").text(`${percent}%`);
        },
        reset($bar) {
          this.update($bar, 0);
        },
      },
    });

    // 绑定方法/别名
    window.WestlifeUtils = WestlifeUtils;
    window.WestlifeIcons = WestlifeIcons;
    window.wlScrollTo = WestlifeUtils.scrollTo.bind(WestlifeUtils);

    // 初始化通知容器并设置定位
    ensureToastStack();
    updateToastTopOffset();
    w.addEventListener("resize", updateToastTopOffset, { passive: true });
    w.addEventListener("load", updateToastTopOffset, { once: true });

    // 触发 ready 事件
    $(document).trigger("westlifeUtilsReady");
    d.dispatchEvent(new CustomEvent("westlifeUtilsReady"));

    // 自适应隐藏滚动条逻辑已禁用（全局强制隐藏滚动条，无需动态 class）
    (function initAutoHideScrollbars() {
      /* disabled */
    })();

    // 标签云角标：从 aria-label/title 解析数量 -> 写入 data-count
    (function initTagCountBadges() {
      function apply(ctx = d) {
        $(".panel-tags a", ctx).each(function () {
          const $a = $(this);
          if ($a.attr("data-count")) return;
          const label = $a.attr("aria-label") || $a.attr("title") || "";
          // 常见格式示例：'标签名 (12)' 或 '标签名，12 个项目'
          let m =
            label.match(/\((\d+)\)/) ||
            label.match(/(\d+)\D*$/) ||
            label.match(/(\d+)/);
          if (m && m[1]) $a.attr("data-count", m[1]);
        });
      }
      apply();
      // 异步更新（如果面板内容通过 AJAX 更新）
      $(d).on("ajaxComplete", () => apply());
    })();
  }

  $(initUtils);
})(jQuery, window, document);

/* ----------------------------------------------------
 * Smooth Wheel Scroll (migrated from smooth-scroll.js)
 * 提供可控初始化 / 卸载，尊重 prefers-reduced-motion
 * 依赖：无（不强制 jQuery，可与上方工具独立）
 * API:
 *   WestlifeUtils.initWheelSmooth(options?)
 *   WestlifeUtils.destroyWheelSmooth()
 * 关闭方式：
 *   1) 在 <html data-disable-wheel-smooth>
 *   2) 设置 window.WestlifeDisableSmoothWheel = true
 *   3) prefers-reduced-motion: reduce 自动跳过
 * ---------------------------------------------------- */
(function (w, d) {
  if (!w || !d) return;
  const prefersReduced =
    w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const htmlEl = d.documentElement;
  const WL_FLAG = "WL_WHEEL_SMOOTH_BOUND";
  let state = null; // { onWheel, update, ticking, targetY, currentY }

  // Windows 端“系统减少动态效果”经常被默认开启，导致站点所有动效被降级。
  // 站点策略：在 Windows 且检测到 reduce 时，自动强制开启动效（可被后端 data-force-motion 或全局变量覆盖）。
  try {
    if (htmlEl && htmlEl.getAttribute("data-force-motion") !== "true") {
      const ua = (w.navigator && w.navigator.userAgent) || "";
      const isWindows = /windows/i.test(ua);
      if (
        isWindows &&
        w.matchMedia &&
        w.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        htmlEl.setAttribute("data-force-motion", "true");
      }
    }
  } catch (e) {}

  function ensureUtils() {
    if (!w.WestlifeUtils) w.WestlifeUtils = {};
    return w.WestlifeUtils;
  }

  // 统一的“是否减少动画”判断：默认尊重系统设置；允许站点级强制开启动画。
  // 覆盖条件：
  //  - <html data-force-motion="true">（后端可注入）
  //  - window.WESTLIFE_FORCE_MOTION === true
  function shouldReduceMotion() {
    try {
      const forced =
        (htmlEl && htmlEl.getAttribute("data-force-motion") === "true") ||
        w.WESTLIFE_FORCE_MOTION === true;
      if (forced) return false;
      return (
        w.matchMedia && w.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    } catch (e) {
      return false;
    }
  }

  function isScrollable(el) {
    if (!el || el === d.body || el === d.documentElement) return false;
    const style = w.getComputedStyle(el);
    const oy = style.overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight)
      return true;
    return isScrollable(el.parentElement);
  }

  function init(opts = {}) {
    if (state) return; // already active
    if (shouldReduceMotion()) {
      return;
    }
    if (
      d.body &&
      (d.body.classList.contains("single") ||
        d.body.classList.contains("single-post"))
    ) {
      return;
    }
    if (htmlEl.dataset.disableWheelSmooth === "true") return;
    if (w.WestlifeDisableSmoothWheel) return;
    if (d.readyState === "loading") {
      d.addEventListener("DOMContentLoaded", () => init(opts), { once: true });
      return;
    }

    const EASE = typeof opts.ease === "number" ? opts.ease : 0.16;
    const STEP_MULTIPLIER = typeof opts.step === "number" ? opts.step : 1;
    const MAX_DELTA = typeof opts.maxDelta === "number" ? opts.maxDelta : 120;
    const docEl = d.documentElement;
    let targetY = w.scrollY;
    let currentY = w.scrollY;
    let ticking = false;

    function onWheel(e) {
      // 触控板上快速手势可能已经足够平滑；可基于 deltaY 微分特征跳过（简单阈值保留原实现）
      if (isScrollable(e.target)) return; // 内部滚动容器不劫持
      // Mac 触控板长连续极小 delta 时仍交给原生可选：略 —— 保持一致性
      let delta = e.deltaY;
      if (delta > MAX_DELTA) delta = MAX_DELTA;
      else if (delta < -MAX_DELTA) delta = -MAX_DELTA;
      targetY += delta * STEP_MULTIPLIER;
      const maxScroll = docEl.scrollHeight - w.innerHeight;
      if (targetY < 0) targetY = 0;
      if (targetY > maxScroll) targetY = maxScroll;
      if (!ticking) {
        ticking = true;
        w.requestAnimationFrame(update);
      }
      // 阻止默认
      e.preventDefault();
    }

    function update() {
      const diff = targetY - currentY;
      if (Math.abs(diff) < 0.6) {
        currentY = targetY;
        w.scrollTo(0, currentY);
        ticking = false;
        return;
      }
      currentY += diff * EASE;
      w.scrollTo(0, currentY);
      w.requestAnimationFrame(update);
    }

    w.addEventListener("wheel", onWheel, { passive: false });
    state = { onWheel, ticking: false };
    htmlEl.dataset[WL_FLAG] = "1";
  }

  function destroy() {
    if (!state) return;
    w.removeEventListener("wheel", state.onWheel, { passive: false });
    delete htmlEl.dataset[WL_FLAG];
    state = null;
  }

  const U = ensureUtils();
  U.initWheelSmooth = init;
  U.destroyWheelSmooth = destroy;
  U.shouldReduceMotion = shouldReduceMotion;

  // 默认自动启用（可通过 data-disable-wheel-smooth / 全局变量 阻止）
  try {
    init();
  } catch (e) {
    console.warn("[SmoothWheel] init failed", e);
  }
})(window, document);
