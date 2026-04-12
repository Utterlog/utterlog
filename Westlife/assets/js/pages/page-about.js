/**
 * Westlife 主题关于页面脚本
 * 纯原生实现：关于页交互与动效（已彻底移除 Umami 相关逻辑）
 * @package Westlife
 * @version 2.2.0
 */

(function (global) {
  "use strict";

  let aboutInitialized = false;

  // 工具函数
  const prefersReduce = () => {
    try {
      if (
        window.WestlifeUtils &&
        typeof window.WestlifeUtils.shouldReduceMotion === "function"
      ) {
        return !!window.WestlifeUtils.shouldReduceMotion();
      }
      const htmlEl = document.documentElement;
      const forced =
        (htmlEl && htmlEl.getAttribute("data-force-motion") === "true") ||
        window.WESTLIFE_FORCE_MOTION === true;
      if (forced) return false;
      return !!(
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      );
    } catch (e) {
      return false;
    }
  };

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function animateNumber(el, to, dur = 900) {
    if (!el) return;
    const end = Number(to) || 0;
    if (prefersReduce()) {
      el.textContent = end.toLocaleString();
      return;
    }
    const t0 = performance.now();
    const from = parseInt((el.textContent || "0").replace(/,/g, ""), 10) || 0;
    const tick = (t) => {
      const p = clamp((t - t0) / dur, 0, 1);
      const v = Math.round(from + (end - from) * p);
      el.textContent = v.toLocaleString();
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // 十年进度条动画
  function animateDecadeBar() {
    const sec = document.querySelector(".decade-section");
    if (!sec) return;

    const bar = sec.querySelector(".decade-progress .decade-fill");
    if (!bar) return;

    const startTxt = (
      sec.querySelector(".start-date")?.textContent || ""
    ).trim();
    const endTxt = (sec.querySelector(".end-date")?.textContent || "").trim();

    let percent = 0;
    let daysLeft = null;

    if (startTxt && endTxt) {
      const start = new Date(startTxt + "T00:00:00");
      const end = new Date(endTxt + "T00:00:00");
      const now = new Date();
      const total = Math.max(1, end - start);
      const past = clamp(now - start, 0, total);
      percent = clamp((past / total) * 100, 0, 100);
      daysLeft = Math.max(0, Math.ceil((end - now) / 86400000));
    }

    const pctEl = sec.querySelector(".decade-percent");
    if (pctEl) {
      const show = percent >= 99.9 ? percent.toFixed(0) : percent.toFixed(1);
      pctEl.textContent = `${show}%`;
    }
    if (daysLeft !== null) {
      const leftEl = sec.querySelector(".days-left");
      if (leftEl) animateNumber(leftEl, daysLeft, 700);
    }

    const target = `${percent.toFixed(2)}%`;
    if (!prefersReduce()) {
      bar.style.transition = "width 900ms cubic-bezier(.25,.8,.25,1)";
      bar.style.width = "0%";
      requestAnimationFrame(() => {
        void bar.offsetWidth;
        bar.style.width = target;
      });
    } else {
      bar.style.width = target;
    }
  }

  function initRollingWords() {
    const el = document.querySelector(".rolling-dynamic");
    if (!el) return;

    // 数据来源优先级：
    let list = [];
    const aboutRoot = document.querySelector(".about-page");
    const jsonStr = aboutRoot?.getAttribute("data-rolling-words-json") || "";
    if (jsonStr) {
      try {
        const parsed = JSON.parse(jsonStr);
        if (Array.isArray(parsed) && parsed.length) list = parsed;
      } catch (_) {}
    }
    if (!list.length) {
      if (
        window.westlifeAbout &&
        Array.isArray(window.westlifeAbout.rollingWords) &&
        window.westlifeAbout.rollingWords.length
      ) {
        list = window.westlifeAbout.rollingWords;
      } else if (
        Array.isArray(window.rolling_words) &&
        window.rolling_words.length
      ) {
        list = window.rolling_words;
      }
    }

    // 读取 about-page 容器 data 兜底
    if (!list.length && aboutRoot) {
      const ds = aboutRoot.dataset?.rollingWords || "";
      if (ds)
        list = ds
          .split("|")
          .map((s) => s.trim())
          .filter(Boolean);
    }

    if (!list.length) return;

    // 同步首个词并开始轮播
    el.textContent = String(list[0] || "");
    if (list.length > 1) {
      let idx = 0;
      setInterval(() => {
        idx = (idx + 1) % list.length;
        el.textContent = String(list[idx] || "");
      }, 3000);
    }
  }

  // 右侧双卡：第三行垂直轮播
  function initAboutDuoCardRotation() {
    const card = document.querySelector(".about-card--rotating");
    if (!card) return;

    const viewport = card.querySelector(".rotate-viewport");
    const list = card.querySelector(".rotate-list");
    let items = list ? Array.from(list.querySelectorAll(".rotate-item")) : [];
    if (!viewport || !list || items.length <= 1) return; // 至少2项才轮播

    const prefersNoMotion = prefersReduce();
    let index = 0;
    let itemH = 0;
    let timer = null;
    let paused = false;

    // 计算并锁定高度，避免抖动
    function recalc() {
      const first = items[0];
      const h = first ? first.offsetHeight : 0;
      if (h > 0) {
        itemH = h;
        viewport.style.height = h + "px";
        list.style.transform = "translateY(" + -index * itemH + "px)";
      }
    }

    // 执行下一项（无缝循环：在末尾多滚动一格到克隆项，然后瞬时跳回首项）
    function next() {
      if (paused) return;
      index = index + 1;
      if (!prefersNoMotion) {
        list.classList.add("is-animating");
      }
      list.style.transform = "translateY(" + -index * itemH + "px)";

      // 当滚动到克隆项（第 items.length 个位置）时，在过渡结束后瞬时跳回 0
      if (index === items.length) {
        const onEnd = () => {
          list.removeEventListener("transitionend", onEnd);
          // 关闭过渡，瞬时归位
          list.classList.remove("is-animating");
          index = 0;
          list.style.transform = "translateY(0px)";
          // 读强制回流以应用样式，然后恢复过渡
          void list.offsetHeight;
          if (!prefersNoMotion) {
            list.classList.add("is-animating");
          }
        };
        list.addEventListener("transitionend", onEnd);
      }
    }

    // 自动轮播
    function start() {
      stop();
      const interval =
        parseInt(card.getAttribute("data-rotate-interval"), 10) || 3000;
      if (prefersNoMotion) return; // 尊重减少动画
      timer = setInterval(next, interval);
    }
    function stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    }

    // 悬停暂停
    card.addEventListener("mouseenter", () => {
      paused = true;
      stop();
    });
    card.addEventListener("mouseleave", () => {
      paused = false;
      start();
    });

    // 在列表末尾克隆首个元素，形成无缝循环
    const firstClone = items[0].cloneNode(true);
    list.appendChild(firstClone);

    // 首次计算与启动
    recalc();
    // 若初次未能测到高度（比如字体加载前），延迟重算一次
    setTimeout(recalc, 100);
    setTimeout(recalc, 300);
    // 监听窗口尺寸变化
    window.addEventListener("resize", recalc);
    // 启动
    start();
  }

  // 修复：环绕词动态注入（若 SVG 文本未正确渲染）
  function fixRingText() {
    const svg = document.querySelector(".avatar-ring");
    if (!svg) return;
    const textEl = svg.querySelector("text.ring-text");
    const textPath = svg.querySelector("textPath");
    if (!textPath) return;
    // 为整个 SVG 设置中文语言标签，帮助浏览器选择简体中文本地化字形
    try {
      svg.setAttribute("lang", "zh-CN");
      svg.setAttribute("xml:lang", "zh-CN");
    } catch (_) {}
    // 强制为 SVG 文本设置内联字体家族，覆盖外部 CSS 失效或被第三方覆盖的情况
    if (textEl) {
      // 优先使用简体中文无衬线字体，移除衬线宋体，避免小字号沿路径可读性差
      const cnFontStack =
        '"PingFang SC", "Microsoft YaHei", sans-serif';
      try {
        textEl.style.fontFamily = cnFontStack;
        // East Asian 本地化与 OpenType 特性，确保按语言选择正确字形（如“开”）
        textEl.style.fontVariantEastAsian = "simplified";
        textEl.style.fontFeatureSettings = '"locl" 1, "kern" 1';
        textEl.style.fontKerning = "normal";
        // 提升矢量文本的清晰度
        textEl.style.textRendering = "optimizeLegibility";
      } catch (_) {}
      // 同时设置属性，兼容部分浏览器对 SVG 的应用差异
      try {
        textEl.setAttribute("font-family", cnFontStack);
        textEl.setAttribute("lang", "zh-CN");
        textEl.setAttribute("xml:lang", "zh-CN");
      } catch (_) {}
    }
    let txt = (textPath.textContent || "").trim();
    const ds = (svg.getAttribute("data-ring-text") || "").trim();
    const json = svg.getAttribute("data-circle-words-json") || "";

    // 1) data-ring-text 优先级最高
    if (ds) {
      textPath.textContent = ds;
      return;
    }

    // 2) 扩展乱码检测（保底）
    const looksGarbled = /Ã|Â|ï¼|â|�|å|æ|ç|é|è/.test(txt);

    // 3) data 为空时且存在 JSON：无条件用 JSON 重建（避免误判导致不覆盖）
    if (json) {
      try {
        const arr = JSON.parse(json);
        if (Array.isArray(arr) && arr.length) {
          const built =
            arr
              .filter((s) => !!s)
              .map((s) => String(s))
              .join(" · ") + " · ";
          if (built.trim()) textPath.textContent = built;
          return;
        }
      } catch (_) {}

      // 4) 兜底：如果文本疑似乱码且没有可用数据源，尝试用常见方式修复编码错位
      if (looksGarbled && txt) {
        try {
          // 将可能的 Latin-1 错位通过 escape -> decodeURIComponent 逆变换
          const fixed = decodeURIComponent(escape(txt));
          // 简单判断是否包含中文（基本汉字区）
          if (/[\u4E00-\u9FFF]/.test(fixed)) {
            textPath.textContent = fixed;
          }
        } catch (_) {}
      }
    }
  }

  function initAdminOnlineBadge() {
    const dot = document.querySelector(".online-dot");
    if (!dot) return;

    const AJAX_URL =
      (window.westlifeSettings && window.westlifeSettings.ajaxUrl) ||
      window.ajaxurl ||
      "/wp-admin/admin-ajax.php";

    let timer = null;

    const update = () => {
      const url = `${AJAX_URL}?action=westlife_admin_status&ttl=300&_=${Date.now()}`;
      fetch(url, { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (!res || !res.success || !res.data) return;
          const { online, statusTitle } = res.data;
          dot.classList.toggle("offline", !online);
          if (statusTitle) {
            dot.title = statusTitle;
            dot.setAttribute("aria-label", statusTitle);
          }
        })
        .catch(() => {});
    };

    const start = () => {
      if (timer) return;
      update();
      timer = setInterval(update, 60_000);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) stop();
      else start();
    });

    start();
  }

  // 检查是否为关于页面
  const isAboutPage = () =>
    document.body.classList.contains("page-template-page-about") ||
    !!document.querySelector(".about-page");

  // 初始化技能与工具卡片动效
  function initSkillsToolsCards() {
    // 愿望清单项目点击效果
    const wishlistItems = document.querySelectorAll(".about-wishlist-list li");
    wishlistItems.forEach((item, index) => {
      // 延迟显示动画
      setTimeout(() => {
        item.style.opacity = "0";
        item.style.transform = "translateX(-20px)";
        item.style.transition = "all 0.5s ease";
        requestAnimationFrame(() => {
          item.style.opacity = "1";
          item.style.transform = "translateX(0)";
        });
      }, index * 150);

      // 点击效果
      item.addEventListener("click", () => {
        const status = item.querySelector(".wish-status");
        if (status && status.classList.contains("pending")) {
          status.textContent = "已关注";
          status.classList.remove("pending");
          status.classList.add("in-progress");

          // 添加成功动画
          item.style.transform = "scale(1.02)";
          setTimeout(() => {
            item.style.transform = "scale(1)";
          }, 200);
        }
      });

      // 悬停进度条效果
      item.addEventListener("mouseenter", () => {
        if (!item.classList.contains("animate-progress")) {
          item.classList.add("animate-progress");
        }
      });
    });

    // 兴趣爱好项目悬停效果
    const hobbyItems = document.querySelectorAll(".about-hobbies-list li");
    hobbyItems.forEach((item, index) => {
      // 入场动画
      setTimeout(() => {
        item.style.opacity = "0";
        item.style.transform = "translateY(20px)";
        item.style.transition = "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)";
        requestAnimationFrame(() => {
          item.style.opacity = "1";
          item.style.transform = "translateY(0)";
        });
      }, index * 100);

      // 点击波纹效果
      item.addEventListener("click", (e) => {
        const ripple = document.createElement("div");
        const rect = item.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;

        ripple.style.width = ripple.style.height = size + "px";
        ripple.style.left = x + "px";
        ripple.style.top = y + "px";
        ripple.style.position = "absolute";
        ripple.style.borderRadius = "50%";
        ripple.style.background = "rgba(255, 255, 255, 0.6)";
        ripple.style.transform = "scale(0)";
        ripple.style.animation = "ripple 0.6s linear";
        ripple.style.pointerEvents = "none";

        item.style.position = "relative";
        item.appendChild(ripple);

        setTimeout(() => {
          if (ripple.parentNode) {
            ripple.parentNode.removeChild(ripple);
          }
        }, 600);
      });
    });

    // 添加波纹动画样式
    if (!document.querySelector("#ripple-animation-style")) {
      const style = document.createElement("style");
      style.id = "ripple-animation-style";
      style.textContent = `
        @keyframes ripple {
          to {
            transform: scale(4);
            opacity: 0;
          }
        }
      `;
      document.head.appendChild(style);
    }

    // 卡片入场动画
    const cards = document.querySelectorAll(".about-card");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, index) => {
          if (entry.isIntersecting) {
            setTimeout(() => {
              entry.target.style.opacity = "0";
              entry.target.style.transform = "translateY(30px)";
              entry.target.style.transition =
                "all 0.6s cubic-bezier(0.4, 0, 0.2, 1)";
              requestAnimationFrame(() => {
                entry.target.style.opacity = "1";
                entry.target.style.transform = "translateY(0)";
                // 动画结束后清理内联样式，避免与 :hover 的 scale transform 竞争
                const target = entry.target;
                const cleanup = () => {
                  target.style.transition = "";
                  target.style.transform = ""; // 释放给 CSS :hover 控制
                };
                setTimeout(cleanup, 700); // 过渡 600ms + 缓冲
              });
            }, index * 200);
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
      }
    );

    cards.forEach((card) => {
      observer.observe(card);
    });
  }

  // 初始化愿望清单展开/收起功能
  function initWishlistToggle() {
    const toggleButtons = document.querySelectorAll(".wishlist-toggle");

    toggleButtons.forEach((button) => {
      button.addEventListener("click", function () {
        const target = this.getAttribute("data-target");
        const wishlistElement = document.querySelector(
          `[data-wishlist="${target}"]`
        );
        const toggleText = this.querySelector(".toggle-text");
        const chevronIcon = this.querySelector("i");

        if (wishlistElement) {
          const isCollapsed = wishlistElement.classList.contains("collapsed");

          if (isCollapsed) {
            // 展开
            wishlistElement.classList.remove("collapsed");
            toggleText.textContent = "收起";
            chevronIcon.className = "fas fa-chevron-up";
            this.classList.add("expanded");
          } else {
            // 收起
            wishlistElement.classList.add("collapsed");
            toggleText.textContent = "显示全部";
            chevronIcon.className = "fas fa-chevron-down";
            this.classList.remove("expanded");
          }
        }
      });
    });
  }

  // 关于页面初始化
  function init() {
    if (!isAboutPage()) return;
    initTypewriter();
    animateDecadeBar();
    initRollingWords();
    initAdminOnlineBadge();
    initSkillsToolsCards();
    fixRingText();
    initTraitTooltips();
    initAboutDuoCardRotation();
  }

  // 打字机效果：多名字循环
  function initTypewriter() {
    var nodes = document.querySelectorAll(".typewriter");
    if (!nodes.length) return;
    nodes.forEach(function (el) {
      var raw = el.getAttribute("data-names") || "[]";
      var list;
      try {
        list = JSON.parse(raw);
      } catch (e) {
        list = [];
      }
      if (!Array.isArray(list) || list.length === 0) {
        list = ["博主"];
      }
      // 颜色循环：蓝、灰、浅蓝、黄（可根据需要调整）
      var colorPalette = [
        "#3b82f6", // 蓝 (tailwind blue-500)
        "#9ca3af", // 灰 (gray-400)
        "#60a5fa", // 浅蓝 (blue-400)
        "#eab308", // 黄 (yellow-500)
      ];
      // 如果只有一个名称，仍然允许颜色循环（增强动态感）
      var colorIndex = 0;
      var idx = 0,
        pos = 0,
        dir = 1; // dir: 1 打字, -1 退格
      var typing = false;
      var pauseAfterType = 1200; // 完整显示后停顿
      var pauseAfterErase = 350; // 擦除后停顿
      var typeSpeed = 85; // 打字速度
      var eraseSpeed = 55; // 退格速度

      // 让光标随文字长度移动：使用元素内容宽度作为偏移
      function updateCaretPosition() {
        try {
          // 强制读取以获取最新宽度
          var w = el.scrollWidth || el.offsetWidth || 0;
          el.style.setProperty("--tw-caret-x", w + "px");
        } catch (_) {}
      }

      function step() {
        var word = String(list[idx] || "");
        if (dir === 1) {
          // 正向打字
          if (pos < word.length) {
            el.textContent = word.slice(0, pos + 1);
            updateCaretPosition();
            pos++;
            setTimeout(step, typeSpeed);
          } else {
            // 完成一个词，稍作停顿后开始退格
            setTimeout(function () {
              dir = -1;
              step();
            }, pauseAfterType);
          }
        } else {
          // 退格阶段
          if (pos > 0) {
            el.textContent = word.slice(0, pos - 1);
            updateCaretPosition();
            pos--;
            setTimeout(step, eraseSpeed);
          } else {
            // 下一个词前：切换词索引并更新颜色
            idx = (idx + 1) % list.length;
            colorIndex = (colorIndex + 1) % colorPalette.length;
            el.style.color = colorPalette[colorIndex];
            setTimeout(function () {
              dir = 1;
              step();
            }, pauseAfterErase);
          }
        }
      }
      // 初始颜色：如果尚未设置则使用 palette[0]
      if (!el.style.color) {
        el.style.color = colorPalette[0];
      }
      // 启用动态光标定位样式
      el.classList.add("has-dynamic-caret");
      // 首次定位
      updateCaretPosition();
      step();
    });
  }

  // 人格特征悬浮提示框
  function initTraitTooltips() {
    const traitItems = document.querySelectorAll(".trait-item");

    traitItems.forEach((item, index) => {
      const tooltip = item.querySelector(".trait-desc-tooltip");

      if (!tooltip) return;

      // 鼠标悬浮事件
      item.addEventListener("mouseenter", () => {
        tooltip.style.display = "block";
        // 延迟显示，避免闪烁
        setTimeout(() => {
          tooltip.style.opacity = "1";
        }, 50);
      });

      item.addEventListener("mouseleave", () => {
        tooltip.style.opacity = "0";
        setTimeout(() => {
          tooltip.style.display = "none";
        }, 200);
      });
    });
  }

  // DOM 加载完成后执行
  // 暴露少量 API 供后续可能的懒加载或调试使用
  const API = {
    init,
    animateDecadeBar,
    initRollingWords,
    initTypewriter,
  };
  global.WestlifeAbout = API;

  function initAboutPage() {
    if (aboutInitialized) return;
    aboutInitialized = true;
    init();
  }

  function destroyAboutPage() {
    aboutInitialized = false;
  }

  if (window.WestlifeApp && typeof window.WestlifeApp.register === "function") {
    window.WestlifeApp.register({
      name: "about-page",
      match(context) {
        const root =
          context && context.nodeType === 1 ? context : document;
        return !!root.querySelector(".about-page, .decade-section, .rolling-dynamic");
      },
      init() {
        initAboutPage();
      },
      destroy() {
        destroyAboutPage();
      },
    });
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAboutPage, { once: true });
  } else {
    initAboutPage();
  }
})(window);
