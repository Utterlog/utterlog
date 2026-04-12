/**
 * Westlife 主题：单篇文章页面脚本 (single.js)
 * --------------------------------------------------
 * 模块职责：为单篇文章页提供目录、相关文章、复制链接、二维码、分享弹窗、点赞表情、AI 摘要等交互增强。
 *
 * 依赖：
 *   - jQuery 3.6+
 *   - window.WestlifeUtils （工具函数：throttle / debounce / showMessage 等）
 *   - 可选：QRCode (若页面存在 .qrcode-box 则用于生成二维码)
 *
 * 结构（按出现顺序）：
 *   0. 初始化防重 & 基础工具（依赖检测 / 重复 ID 清理）
 *   1. initSingle() 入口与内部 init() 调度
 *   2. 目录功能 initTOC()
 *   3. 相关文章 initRelatedPosts()
 *   4. 复制链接 initCopyLink()
 *   5. 二维码 initQRCode()
 *   6. GitHub 星标 initGitHubStars()
 *   7. 外链 Favicon initLinkFavicons()
 *   8. 分享弹窗 initSharePopup()
 *   9. 表情/点赞 initReactions()
 *
 * 维护说明：
 *   - 仅调整注释统一 & 顺序说明，不改变原有执行逻辑。
 *   - 若新增模块，请同步更新上面“结构”索引，保持可读性。
 */

(function ($) {
  "use strict";

  // ==================================================
  // 0. 防重复初始化 & DOM 工具
  // ==================================================
  let isInitialized = false;
  let cleanupSingleModule = null;

  // DOM 清理函数 - 修复重复 ID（全局可用，供相关文章等复用）
  function cleanupDuplicateIds() {
    // 修复重复的 nonce ID
    const nonceInputs = document.querySelectorAll('input[id="nonce"]');
    if (nonceInputs.length > 1) {
      nonceInputs.forEach((input, index) => {
        if (index > 0) {
          let newId = `nonce_${index}`;
          const parentContainer =
            input.closest(
              '[class*="comment"], [class*="reaction"], [class*="related"], [id*="comment"], [id*="react"]'
            ) || input.parentElement;
          if (parentContainer) {
            if (parentContainer.id) {
              newId = `nonce_${parentContainer.id}`;
            } else if (
              parentContainer.className &&
              parentContainer.className.includes("comment")
            ) {
              newId = `nonce_comment_${index}`;
            } else if (
              parentContainer.className &&
              parentContainer.className.includes("react")
            ) {
              newId = `nonce_reaction_${index}`;
            } else if (
              parentContainer.className &&
              parentContainer.className.includes("related")
            ) {
              newId = `nonce_related_${index}`;
            }
          }
          input.id = newId;
        }
      });
    }
    // 检查其他可能重复的 ID
    const allElements = document.querySelectorAll("[id]");
    const idCounts = {};
    allElements.forEach((el) => {
      const id = el.id;
      idCounts[id] = (idCounts[id] || 0) + 1;
    });
    // 检查重复 ID（生产环境静默）
    Object.keys(idCounts).forEach((id) => {
      if (idCounts[id] > 1) {
        // 仅在开发环境警告
      }
    });
  }

  // 依赖检测：缺失时阻止继续初始化，避免后续报错污染控制台
  function checkDependencies() {
    if (typeof jQuery === "undefined") {
      console.error("WestLife单篇文章页面需要jQuery支持");
      return false;
    }
    if (typeof window.WestlifeUtils === "undefined") {
      console.error("WestLife单篇文章页面需要WestlifeUtils支持");
      return false;
    }
    return true;
  }

  // ==================================================
  // 1. 单页总初始化封装（仅执行一次）
  // ==================================================
  function initSingle() {
    if (!checkDependencies() || isInitialized) return;
    isInitialized = true; // 防止重复初始化

    const {
      scrollTo,
      setLoading,
      ajax,
      debounce,
      throttle,
      showMessage,
      showNotice,
      storage,
    } = window.WestlifeUtils;

    // -----------------------------
    // 内部 init(): 按顺序调度各子模块
    // -----------------------------
    function init() {
      const cleanups = [];
      try {
        // 首先清理重复 ID
        cleanupDuplicateIds();

        // --- 核心功能模块 ---
        const tocCleanup = initTOC(); // 目录
        if (typeof tocCleanup === "function") cleanups.push(tocCleanup);
        initAsyncViewCount(); // 浏览量异步写入
        initRelatedPosts(); // 相关文章（AJAX）
        initCopyLink(); // 复制当前链接
        initQRCode(); // 二维码（存在 .qrcode-box 时生成）
        initGitHubStars(); // GitHub star 计数
        initLinkFavicons(); // 外链 favicon 装饰
        initSharePopup(); // 分享弹窗/窗口
        initReactions(); // 表情 / 点赞

        cleanupSingleModule = () => {
          cleanups.forEach((fn) => {
            try {
              fn();
            } catch (_) {}
          });
          cleanups.length = 0;
        };
      } catch (error) {
        console.error("单篇文章页面初始化失败:", error);
        cleanupSingleModule = null;
      }
    }

    function destroy() {
      isInitialized = false;
      if (typeof cleanupSingleModule === "function") {
        try {
          cleanupSingleModule();
        } catch (_) {}
      }
      cleanupSingleModule = null;
      $(document).off("westlife:ajax:content-replaced.single");
      window.removeEventListener("westlife:single:reinit", init);
    }

    // ==================================================
    // 2. 文章目录功能 (initTOC)
    // ==================================================
    function initTOC() {
      const tocList = document.getElementById("toc");
      const content = document.querySelector(".entry-content");
      const toc = document.querySelector(".article-toc");
      const main = document.querySelector(".main-content");
      const entryHeader = document.querySelector(".entry-header");
      if (!tocList || !content || !toc || !main) return;
      const cleanupFns = [];
      let restoreWheelSmooth = false;
      let tocAnimatedIn = false;
      const addWindowListener = (type, handler, options) => {
        window.addEventListener(type, handler, options);
        cleanupFns.push(() => window.removeEventListener(type, handler, options));
      };

      if (
        window.WestlifeUtils &&
        typeof window.WestlifeUtils.destroyWheelSmooth === "function"
      ) {
        window.WestlifeUtils.destroyWheelSmooth();
        restoreWheelSmooth = true;
      }

      // 计算头部占位，统一用于 TOC 定位和锚点滚动
      const getHeaderOffset = () => {
        const header = document.querySelector(".site-header");
        const adminBar = document.getElementById("wpadminbar");
        const hh = header ? Math.max(0, header.offsetHeight || header.getBoundingClientRect().height) : 0;
        const ah = adminBar
          ? Math.max(0, adminBar.getBoundingClientRect().height)
          : 0;
        return Math.max(0, hh + ah + 12);
      };

      // 注入 scroll-margin-top 变量
      const applyHeaderOffsetVar = () => {
        document.documentElement.style.setProperty(
          "--fixed-header-offset",
          getHeaderOffset() + "px"
        );
      };
      applyHeaderOffsetVar();

      // 生成目录
      const headings = content.querySelectorAll("h2, h3, h4, h5, h6");
      if (!headings.length) {
        toc.classList.add("is-hidden");
        return;
      }
      const tocItems = [];
      tocList.innerHTML = "";

      function scrollToHeading(heading) {
        if (!heading) return;
        const offset = getHeaderOffset();
        const targetTop =
          heading.getBoundingClientRect().top + window.pageYOffset - offset;

        window.scrollTo({
          top: Math.max(0, Math.round(targetTop)),
          behavior: "smooth",
        });
      }

      // 创建目录项
      headings.forEach((heading, index) => {
        const id = heading.id || `heading-${index}`;
        heading.id = id;

        const li = document.createElement("li");
        const level = parseInt(heading.tagName.charAt(1), 10);
        li.className = `toc-item level-${level}`;

        const a = document.createElement("a");
        a.href = `#${id}`;
        a.className = "toc-link";
        a.textContent = heading.textContent;

        a.addEventListener("click", (e) => {
          e.preventDefault();
          scrollToHeading(heading);
          history.replaceState(null, "", `#${id}`);
        });

        li.appendChild(a);
        tocList.appendChild(li);
        tocItems.push({ id, element: heading, listItem: li });
      });

      // 激活态更新
      const updateActiveItem = () => {
        if (!tocItems.length) return;
        const threshold = window.pageYOffset + getHeaderOffset() + 18;
        let currentItem = tocItems[0];

        for (const item of tocItems) {
          const itemTop =
            item.element.getBoundingClientRect().top + window.pageYOffset;
          if (itemTop <= threshold) {
            currentItem = item;
          } else {
            break;
          }
        }

        tocItems.forEach((item) => {
          item.listItem
            .querySelector(".toc-link")
            ?.classList.toggle("active", item === currentItem);
        });
      };

      const MIN_WIDTH = 1400;
      const TOC_WIDTH_FALLBACK = 220;
      const EDGE_OFFSET = -1;
      const VIEWPORT_GUTTER = 24;
      const hasTocItems = () => tocItems.length > 0;

      function positionToc() {
        if (window.innerWidth < MIN_WIDTH || !hasTocItems()) {
          toc.classList.add("is-hidden");
          toc.classList.remove("is-ready");
          tocAnimatedIn = false;
          return;
        }

        const rect = main.getBoundingClientRect();
        const headerOffset = Math.max(16, Math.round(getHeaderOffset()));
        let top = headerOffset;
        if (entryHeader) {
          const entryHeaderRect = entryHeader.getBoundingClientRect();
          const dividerTop = Math.round(entryHeaderRect.bottom + 1);
          top = Math.max(headerOffset, dividerTop);
        }
        const left = Math.round(rect.right + EDGE_OFFSET);
        const tocWidth = toc.offsetWidth || TOC_WIDTH_FALLBACK;
        const willOverflow = left + tocWidth + VIEWPORT_GUTTER > window.innerWidth;

        if (willOverflow) {
          toc.classList.add("is-hidden");
          toc.classList.remove("is-ready");
          tocAnimatedIn = false;
          return;
        }

        toc.classList.remove("is-hidden");
        toc.style.top = `${top}px`;
        toc.style.left = `${left}px`;
        if (!tocAnimatedIn) {
          requestAnimationFrame(() => {
            toc.classList.add("is-ready");
          });
          tocAnimatedIn = true;
        }
      }

      // 修正 hash 进入（或 hash 变化）被头部遮挡
      function fixHashScroll() {
        const id = decodeURIComponent(location.hash || "").replace(/^#/, "");
        if (!id) return;
        const el = document.getElementById(id);
        if (!el) return;
        requestAnimationFrame(() => scrollToHeading(el));
      }
      const handleHashChange = () => {
        applyHeaderOffsetVar();
        fixHashScroll();
      };
      addWindowListener("hashchange", handleHashChange);

      let scrollTicking = false;
      function onScroll() {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(() => {
          updateActiveItem();
          scrollTicking = false;
        });
      }

      const handleResize = () => {
        applyHeaderOffsetVar();
        positionToc();
      };
      addWindowListener("resize", handleResize);
      addWindowListener("scroll", onScroll, { passive: true });

      positionToc();
      requestAnimationFrame(positionToc);
      updateActiveItem();

      // 若页面自带 hash，进入后修正一次
      if (location.hash) setTimeout(fixHashScroll, 0);

      return () => {
        cleanupFns.forEach((fn) => {
          try {
            fn();
          } catch (_) {}
        });
        if (
          restoreWheelSmooth &&
          window.WestlifeUtils &&
          typeof window.WestlifeUtils.initWheelSmooth === "function"
        ) {
          try {
            window.WestlifeUtils.initWheelSmooth();
          } catch (_) {}
        }
      };
    }

    // ==================================================
    // 3. 相关文章 (initRelatedPosts)
    // ==================================================

    function initRelatedPosts() {
      let relatedContainer = document.querySelector(".related-grid");
      let randomBtn = document.querySelector(".related-random-btn");

      // 如果容器或按钮未渲染，监听 DOM 变化，出现后自动初始化
      if (!relatedContainer || !randomBtn) {
        const observer = new MutationObserver(() => {
          relatedContainer = document.querySelector(".related-grid");
          randomBtn = document.querySelector(".related-random-btn");
          if (relatedContainer && randomBtn) {
            observer.disconnect();
            setTimeout(() => initRelatedPosts(), 0);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
        return;
      }

      // 处理相关推荐图片的像素化效果（移除黑影遮罩）
      function fixRelatedImages() {
        relatedContainer
          .querySelectorAll(".related-thumb img.thumb-pixelate")
          .forEach(function (img) {
            img.classList.remove("thumb-pixelate");
            if (!img.complete) {
              img.addEventListener(
                "load",
                function () {
                  img.style.opacity = "1";
                },
                { once: true }
              );
              img.addEventListener(
                "error",
                function () {
                  img.style.opacity = "1";
                },
                { once: true }
              );
            } else {
              img.style.opacity = "1";
            }
          });
      }

      // 初始化时立即处理一次
      fixRelatedImages();

      // Spinner/刷新图标
      const spinnerIcon = randomBtn.querySelector(
        ".fa-circle-notch, .fa-spinner"
      );
      const normalIcon = randomBtn.querySelector(".icon-refresh, .fa-sync-alt");
      let spinnerAnim = null;

      // 获取当前 postId
      function getPostId() {
        const postId =
          randomBtn.dataset.postId ||
          document.querySelector(".article-content")?.id?.replace("post-", "");
        return parseInt(postId, 10);
      }

      // 加载相关文章
      async function loadRelatedPosts() {
        const postId = getPostId();

        if (!postId || isNaN(postId)) return;

        // 已展示的相关文章ID
        const seenIds = Array.from(
          relatedContainer.querySelectorAll(".related-item[data-post-id]")
        )
          .map((el) => parseInt(el.getAttribute("data-post-id"), 10))
          .filter((id) => !isNaN(id) && id > 0);
        const seenIdsString = seenIds.length > 0 ? seenIds.join(",") : "";
        const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

        try {
          relatedContainer.classList.add("u-loading");
          if (relatedContainer.classList.contains("loading")) {
            relatedContainer.classList.remove("loading");
          }
          randomBtn.disabled = true;
          randomBtn.classList.add("u-loading");
          if (randomBtn.classList.contains("loading")) {
            randomBtn.classList.remove("loading");
          }
          randomBtn.setAttribute("aria-busy", "true");
          if (spinnerIcon) {
            spinnerIcon.style.display = "inline-block";
            spinnerIcon.classList.add("fa-spin");
            spinnerIcon.style.animation = "fa-spin 1s linear infinite";
            const an = getComputedStyle(spinnerIcon).animationName;
            if (!an || an === "none") {
              spinnerAnim = spinnerIcon.animate(
                [
                  { transform: "rotate(0deg)" },
                  { transform: "rotate(360deg)" },
                ],
                { duration: 1000, iterations: Infinity, easing: "linear" }
              );
            }
          }
          if (normalIcon) normalIcon.style.display = "none";

          const ajaxUrl =
            window.westlifeSettings?.ajaxUrl ||
            window.westlifeSettings?.ajaxurl ||
            window.ajaxurl;

          const requestData = {
            action: "westlife_load_random_related",
            post_id: postId,
            seen: seenIdsString,
            seed,
            nonce: window.westlifeSettings?.nonce,
          };

          const response = await jQuery.ajax({
            url: ajaxUrl,
            type: "POST",
            data: requestData,
          });

          if (!response) throw new Error("服务器响应为空");
          if (response.success) {
            let htmlContent = "";
            if (typeof response.data === "string") {
              htmlContent = response.data;
            } else if (
              response.data &&
              typeof response.data === "object" &&
              typeof response.data.html === "string"
            ) {
              htmlContent = response.data.html;
            } else {
              throw new Error("响应数据格式不正确或缺少 html 字段");
            }

            if (htmlContent) {
              relatedContainer.innerHTML = htmlContent;

              // 处理新加载的相关推荐图片，移除像素化效果
              relatedContainer
                .querySelectorAll(".related-thumb img.thumb-pixelate")
                .forEach(function (img) {
                  // 移除像素化类，避免黑影遮罩
                  img.classList.remove("thumb-pixelate");

                  // 如果图片还没加载，添加加载监听
                  if (!img.complete) {
                    img.addEventListener(
                      "load",
                      function () {
                        img.style.opacity = "1";
                      },
                      { once: true }
                    );
                    img.addEventListener(
                      "error",
                      function () {
                        img.style.opacity = "1";
                      },
                      { once: true }
                    );
                  } else {
                    img.style.opacity = "1";
                  }
                });

              // 通知其它模块（image-effects.js）重新初始化懒加载遮罩 / fancybox
              try {
                document.dispatchEvent(
                  new CustomEvent("westlife:ajax:content-replaced", {
                    detail: { scope: "related-posts" },
                  })
                );
              } catch (e) {}
              setTimeout(cleanupDuplicateIds, 0);
            } else {
              throw new Error("HTML 内容为空");
            }
          } else {
            throw new Error(response.data?.message || "加载失败");
          }
        } catch (error) {
          relatedContainer.innerHTML = `
            <div class="no-results">
              ${window.WestlifeIcons.icon("circle-alert")}
              <span>${error.message || "加载失败，请重试"}</span>
            </div>
          `;
        } finally {
          relatedContainer.classList.remove("u-loading", "loading");
          randomBtn.disabled = false;
          randomBtn.classList.remove("u-loading", "loading");
          randomBtn.removeAttribute("aria-busy");
          if (spinnerIcon) {
            spinnerIcon.style.display = "none";
            spinnerIcon.classList.remove("fa-spin");
            spinnerIcon.style.animation = "";
          }
          if (spinnerAnim && typeof spinnerAnim.cancel === "function") {
            spinnerAnim.cancel();
            spinnerAnim = null;
          }
          if (normalIcon) normalIcon.style.display = "inline-block";
        }
      }

      // 绑定按钮点击事件
      randomBtn.addEventListener("click", (e) => {
        e.preventDefault();
        if (randomBtn.disabled) return;
        loadRelatedPosts();
      });

      // 首屏自动加载（始终触发，因为模板不再预渲染内容）

      setTimeout(loadRelatedPosts, 300);
    }

    // ==================================================
    // 4. 浏览量异步写入 (initAsyncViewCount)
    // ==================================================
    function initAsyncViewCount() {
      const article = document.querySelector(".article-content");
      const counter = document.querySelector(".single-post-views .views-count");
      const postId = parseInt(
        article?.id?.replace("post-", "") ||
          document.querySelector(".related-random-btn")?.dataset?.postId ||
          "0",
        10
      );
      if (!postId || Number.isNaN(postId)) return;

      const viewKey = `westlife:view-sent:${postId}:${window.location.pathname}`;
      if (window.__westlifeViewSent?.[viewKey]) return;
      try {
        if (sessionStorage.getItem(viewKey) === "1") return;
      } catch (_) {}

      window.__westlifeViewSent = window.__westlifeViewSent || {};

      const send = async () => {
        if (window.__westlifeViewSent[viewKey]) return;
        window.__westlifeViewSent[viewKey] = true;
        try {
          const ajaxUrl =
            window.westlifeSettings?.ajaxUrl ||
            window.westlifeSettings?.ajaxurl ||
            window.ajaxurl;
          const response = await $.ajax({
            url: ajaxUrl,
            type: "POST",
            dataType: "json",
            data: {
              action: "westlife_update_visit_count",
              post_id: postId,
              nonce: window.westlifeSettings?.nonce,
            },
          });
          if (response?.success && counter) {
            counter.textContent =
              response.data?.formatted_views || response.data?.views || counter.textContent;
          }
          try {
            sessionStorage.setItem(viewKey, "1");
          } catch (_) {}
        } catch (_) {
          delete window.__westlifeViewSent[viewKey];
        }
      };

      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(send, { timeout: 1500 });
      } else {
        setTimeout(send, 300);
      }
    }

    // ==================================================
    // 5. 复制链接 (initCopyLink)
    // ==================================================
    function initCopyLink() {
      const copyButtons = document.querySelectorAll(".copy-link-btn");

      copyButtons.forEach((button) => {
        button.addEventListener("click", async () => {
          const url = button.dataset.url;
          if (!url) return;

          try {
            let success = false;

            // 尝试使用 Clipboard API
            if (navigator.clipboard && window.isSecureContext) {
              await navigator.clipboard.writeText(url);
              success = true;
            } else {
              // 降级使用 execCommand
              const textarea = document.createElement("textarea");
              textarea.value = url;
              textarea.style.position = "fixed";
              textarea.style.left = "-9999px";
              textarea.style.top = "0";
              document.body.appendChild(textarea);
              textarea.focus();
              textarea.select();

              try {
                success = document.execCommand("copy");
                document.body.removeChild(textarea);
              } catch (err) {
                document.body.removeChild(textarea);
                throw new Error("复制失败");
              }
            }

            if (success) {
              // 更新按钮状态
              const originalIcon = button.innerHTML;
              button.innerHTML = window.WestlifeIcons.icon("check");
              button.classList.add("success");

              // 显示成功提示
              showMessage("复制成功!", "success");

              // 2秒后恢复原始状态
              setTimeout(() => {
                button.innerHTML = originalIcon;
                button.classList.remove("success");
              }, 2000);
            } else {
              throw new Error("复制失败");
            }
          } catch (err) {
            showMessage("复制失败，请重试", "error");
          }
        });
      });
    }

    // ==================================================
    // 6. 二维码 (initQRCode) - 简单生成，支持单实例
    // ==================================================
    function initQRCode() {
      // 支持 .qrcode-box 与 .wechat-qr（结构：内部包含 .qrcode-content）
      if (typeof QRCode === "undefined") return;
      const containers = document.querySelectorAll(".qrcode-box, .wechat-qr");
      if (!containers.length) return;
      containers.forEach((wrap) => {
        const target = wrap.querySelector(".qrcode-content") || wrap;
        // 已有 canvas / img 则视为已生成，避免重复
        if (target.querySelector("canvas, img")) return;
        const url = wrap.dataset.url || window.location.href;
        // 支持通过 data-qr-size="96" 自定义（最小 64 最大 160）
        let size = parseInt(
          wrap.dataset.qrSize || wrap.dataset.qrsize || "100",
          10
        );
        if (isNaN(size)) size = 100;
        size = Math.min(160, Math.max(64, size));
        try {
          new QRCode(target, {
            text: url,
            width: size,
            height: size,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H,
          });
        } catch (e) {
          console.error("生成二维码失败", e);
        }
      });
    }

    // ==================================================
    // 7. GitHub 星标 (initGitHubStars)
    // ==================================================
    function initGitHubStars() {
      const starCountElements = document.querySelectorAll(".star-count");

      starCountElements.forEach(async (element) => {
        const repo = element.dataset.repo;
        if (!repo) return;

        try {
          const response = await fetch(`https://api.github.com/repos/${repo}`);
          if (!response.ok) throw new Error("Failed to fetch");

          const data = await response.json();
          const stars = new Intl.NumberFormat().format(data.stargazers_count);
          element.textContent = stars;
        } catch (error) {
          element.textContent = "⭐";
        }
      });
    }

    // ==================================================
    // 8. 外链 favicon (initLinkFavicons)
    // ==================================================
    function initLinkFavicons() {
      document
        .querySelectorAll('.entry-content a[href^="http"]')
        .forEach((link) => {
          // 排除特殊按钮和媒体链接
          if (
            link.classList.contains("download-btn") ||
            link.classList.contains("github-btn")
          ) {
            return;
          }

          const href = link.getAttribute("href");
          const domain = new URL(href).hostname;

          const faviconUrl = `https://ico.yite.net/${encodeURIComponent(domain)}`;
          link.style.setProperty("--favicon-url", `url(${faviconUrl})`);

          link.classList.add("has-favicon");
        });
    }

    // ==================================================
    // 9. 分享弹窗 (initSharePopup)
    // ==================================================
    function initSharePopup() {
      const wrapper = document.querySelector(".post-share");
      if (!wrapper) return;

      const isMobile =
        /Android|iPhone|iPad|iPod|IEMobile|BlackBerry|Opera Mini/i.test(
          navigator.userAgent
        );

      function openSharePopup(url, w = 680, h = 540) {
        const dualLeft =
          window.screenLeft !== undefined ? window.screenLeft : window.screenX;
        const dualTop =
          window.screenTop !== undefined ? window.screenTop : window.screenY;
        const screenW =
          window.innerWidth ||
          document.documentElement.clientWidth ||
          screen.width;
        const screenH =
          window.innerHeight ||
          document.documentElement.clientHeight ||
          screen.height;
        const left = dualLeft + Math.max(0, Math.round((screenW - w) / 2));
        const top = dualTop + Math.max(0, Math.round((screenH - h) / 2));
        const features =
          `width=${w},height=${h},left=${left},top=${top},` +
          `status=0,toolbar=0,menubar=0,location=1,resizable=1,scrollbars=1`;
        const win = window.open(url, "westlife_share", features);
        if (win)
          try {
            win.focus();
          } catch (_) {}
      }

      const sizeMap = {
        x: [680, 480],
        mastodon: [680, 540],
        weibo: [650, 500],
        telegram: [600, 600],
        bluesky: [680, 540],
        facebook: [680, 540],
        email: [600, 480],
      };

      wrapper.addEventListener(
        "click",
        (e) => {
          const a = e.target.closest("a.share-icon");
          if (!a) return;
          const platform =
            a.dataset.platform ||
            (
              Array.from(a.classList).find((c) =>
                c.startsWith("share-icon--")
              ) || ""
            ).replace("share-icon--", "") ||
            "x";

          // 微信：点击复制链接（PC & Mobile），不弹窗口
          if (platform === "wechat") {
            const url = a.getAttribute("data-copy-url") || window.location.href;
            let copied = false;
            if (navigator.clipboard && window.isSecureContext) {
              navigator.clipboard
                .writeText(url)
                .then(() => {
                  copied = true;
                  if (window.WestlifeUtils?.showMessage) {
                    window.WestlifeUtils.showMessage(
                      "链接已复制，可在微信粘贴发送",
                      "success"
                    );
                  }
                })
                .catch(() => {});
            }
            if (!copied) {
              const ta = document.createElement("textarea");
              ta.value = url;
              ta.style.position = "fixed";
              ta.style.left = "-9999px";
              document.body.appendChild(ta);
              ta.focus();
              ta.select();
              try {
                document.execCommand("copy");
                if (window.WestlifeUtils?.showMessage) {
                  window.WestlifeUtils.showMessage(
                    "链接已复制，可在微信粘贴发送",
                    "success"
                  );
                }
              } catch (_) {}
              document.body.removeChild(ta);
            }
            e.preventDefault();
            return; // 不再继续默认弹窗
          }

          if (isMobile) return; // 其它平台移动端保留新标签
          e.preventDefault();
          const [w, h] = sizeMap[platform] || [680, 540];
          openSharePopup(a.href, w, h);
        },
        { passive: false }
      );
    }

    // ==================================================

    // ==================================================
    // 9. 表情 / 点赞 (initReactions)
    // ==================================================
    function initReactions() {
      const list = document.querySelector(".reactions");
      if (!list) return;

      const postId = parseInt(list.dataset.postId || 0, 10);
      if (!postId) return;

      const ajaxUrl =
        window.westlifeSettings?.ajaxUrl ||
        window.westlifeSettings?.ajaxurl ||
        window.ajaxurl;

      // 改进 nonce 获取
      const getNonce = () => {
        // 优先从反应表单获取
        const reactionNonce = document.querySelector(
          'input[name="reaction_nonce"]'
        )?.value;
        if (reactionNonce) return reactionNonce;

        // 备用：全局设置
        return window.westlifeSettings?.nonce || "";
      };

      const nonce = getNonce();
      const visitorCfg = window.westlifeVisitorConfig || {};
      const visitorData = visitorCfg.visitorData || {};
      const homeProfile = visitorCfg.homeProfile || {};

      // 本地键：westlife_react_{postId}_{type}
      const keyOf = (type) => `westlife_react_${postId}_${type}`;
      const isActive = (type) => localStorage.getItem(keyOf(type)) === "1";
      const setActive = (type, v) => {
        if (v) localStorage.setItem(keyOf(type), "1");
        else localStorage.removeItem(keyOf(type));
      };

      // 统一通知
      const notify = (type, added) => {
        const mapAdd = {
          like: "点赞成功",
          clap: "收到你的鼓掌",
          party: "撒花成功",
        };
        const mapRemove = {
          like: "已取消点赞",
          clap: "已取消鼓掌",
          party: "已取消撒花",
        };
        const text = added ? mapAdd[type] : mapRemove[type];
        if (!text) return;
        if (showMessage) {
          showMessage(text, added ? "success" : "info");
        }

        // Cookie 统计：点赞次数（仅统计 like 类型的“加一”）
        try {
          if (type === "like") {
            const getCookie = (n) => {
              const m = document.cookie.match(
                new RegExp(
                  "(?:^|; )" +
                    n.replace(/([.$?*|{}()\[\]\\\/\+^])/g, "\\$1") +
                    "=([^;]*)"
                )
              );
              return m ? decodeURIComponent(m[1]) : null;
            };
            const setCookie = (n, v, days) => {
              const d = new Date();
              d.setTime(d.getTime() + (days || 365) * 24 * 60 * 60 * 1000);
              document.cookie =
                n +
                "=" +
                encodeURIComponent(v) +
                "; path=/; expires=" +
                d.toUTCString();
            };
            const cur = parseInt(getCookie("wl_likes") || "0", 10) || 0;
            const next = added ? cur + 1 : Math.max(0, cur - 1);
            setCookie("wl_likes", String(next));
            // 顺带刷新首页访客卡片的点赞数（如果存在）
            const el = document.getElementById("hf-likes");
            if (el) el.textContent = String(next);
          }
        } catch (_) {}
      };

      // 生成 +1/-1 漂浮气泡
      const spawnPlusOne = (btn, sign = "+1") => {
        const target = btn.querySelector(".react-emoji") || btn;
        const r = target.getBoundingClientRect();
        const x = r.left + r.width / 2 + window.scrollX;
        const y = r.top + window.scrollY;

        const el = document.createElement("span");
        el.className = "plus-one-animation"; // 修改类名，匹配CSS动画
        el.textContent = sign;
        el.style.cssText = `
          position: absolute;
          left: ${x}px;
          top: ${y}px;
          z-index: 9999;
          pointer-events: none;
          font-size: 14px;
          font-weight: bold;
          color: ${sign === "+1" ? "#4CAF50" : "#999"};
        `;
        document.body.appendChild(el);

        // 动画结束后移除元素
        el.addEventListener("animationend", () => el.remove());

        // 如果CSS动画没有定义，提供备用动画
        if (!el.style.animation) {
          el.style.transition = "all 0.8s ease-out";
          el.style.opacity = "1";
          requestAnimationFrame(() => {
            el.style.transform = "translateY(-30px)";
            el.style.opacity = "0";
            setTimeout(() => el.remove(), 800);
          });
        }
      };

      // 初始激活状态
      list.querySelectorAll(".react-btn").forEach((btn) => {
        const type = btn.dataset.type;
        if (isActive(type)) btn.classList.add("active");
      });

      list.addEventListener("click", (e) => {
        const btn = e.target.closest(".react-btn");
        if (!btn) return;
        e.preventDefault();
        if (btn.disabled) return;

        const type = btn.dataset.type;
        const countEl = btn.querySelector(".react-count");
        let current = parseInt(countEl?.textContent || "0", 10);
        const already = isActive(type);
        const op = already ? "remove" : "add";

        // 乐观更新
        const optimistic = Math.max(0, current + (op === "add" ? 1 : -1));
        if (countEl) countEl.textContent = String(optimistic);
        btn.classList.toggle("active", op === "add");
        btn.disabled = true;

        // +1/-1 漂浮
        spawnPlusOne(btn, op === "add" ? "+1" : "-1");

        jQuery
          .ajax({
            url: ajaxUrl,
            type: "POST",
            dataType: "json",
            data: {
              action: "westlife_react",
              post_id: postId,
              type,
              op,
              nonce,
              email: homeProfile.email || visitorData.email || "",
              name: homeProfile.display_name || visitorData.name || "",
              url: visitorData.url || "",
            },
          })
          .done((res) => {
            if (res?.success && res.data?.counts) {
              const c = res.data.counts;
              // 以服务端为准覆盖三项
              list.querySelectorAll(".react-btn").forEach((b) => {
                const t = b.dataset.type;
                const el = b.querySelector(".react-count");
                if (el && Object.prototype.hasOwnProperty.call(c, t)) {
                  el.textContent = String(c[t]);
                }
              });
              setActive(type, op === "add");
              notify(type, op === "add");
            } else {
              throw new Error(res?.data?.message || "操作失败");
            }
          })
          .catch((err) => {
            // 回滚
            if (countEl) countEl.textContent = String(current);
            btn.classList.toggle("active", already);
            if (showMessage) {
              showMessage("操作失败，请重试", "error");
            }
          })
          .always(() => {
            btn.disabled = false;
          });
      });
    }
    // 初始化执行
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  // ==================================================
  // 1.x 外部尝试初始化入口 attemptInit()
  // ==================================================
  function attemptInit() {
    if (window.WestlifeUtils && !isInitialized) {
      initSingle();
    }
  }

  function destroySingle() {
    if (typeof cleanupSingleModule === "function") {
      cleanupSingleModule();
    } else {
      isInitialized = false;
    }
  }

  if (window.WestlifeApp && typeof window.WestlifeApp.register === "function") {
    window.WestlifeApp.register({
      name: "single",
      match(context) {
        const root =
          context && context.nodeType === 1 ? context : document;
        return !!root.querySelector(
          ".single-post, .single .entry-content, .article-toc, .post-reactions"
        );
      },
      init() {
        attemptInit();
      },
      destroy() {
        destroySingle();
      },
    });
  } else {
    // 监听工具函数准备就绪
    $(document).on("westlifeUtilsReady", attemptInit);

    // 如果工具函数已经加载完成，直接尝试初始化
    attemptInit();
  }
})(jQuery);
