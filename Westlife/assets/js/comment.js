// 修改文件开头的拦截器

(function () {
  "use strict";

  let lastNotificationTime = 0;
  let lastNotificationMessage = "";

  // 简化的拦截控制
  window.commentNotificationController = {
    setEnabled: function (enabled) {
      // 保留用于调试
    },
  };

  // 简化的去重拦截器
  if (
    window.WestlifeUtils &&
    typeof window.WestlifeUtils.showMessage === "function"
  ) {
    const originalShowMessage = window.WestlifeUtils.showMessage;

    window.WestlifeUtils.showMessage = function (message, type, options) {
      const now = Date.now();
      const commentKeywords = ["评论", "回复", "发布", "提交", "审核"];
      const isCommentRelated = commentKeywords.some(
        (keyword) => message && message.includes && message.includes(keyword)
      );

      if (isCommentRelated) {
        // 如果是相同消息且在2秒内，则拦截
        if (
          message === lastNotificationMessage &&
          now - lastNotificationTime < 2000
        ) {
          return;
        }

        // 更新记录
        lastNotificationTime = now;
        lastNotificationMessage = message;
      }

      // 显示通知
      return originalShowMessage.call(this, message, type, options);
    };
  }
})();

/**
 * Cookie 和 LocalStorage 双重存储工具
 * 同时支持 Cookie 和 LocalStorage，确保最大兼容性
 */
(function () {
  "use strict";

  // Cookie 工具函数
  const CookieUtils = {
    // 获取 WordPress COOKIEHASH
    getCookieHash: function () {
      // 优先从配置读取
      if (
        window.westlifeVisitorConfig &&
        window.westlifeVisitorConfig.cookieHash
      ) {
        return window.westlifeVisitorConfig.cookieHash;
      }

      // 降级方案：从已存在的Cookie中提取HASH
      // 查找类似 comment_author_xxxxx 格式的Cookie
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i].trim();
        const match = cookie.match(/^comment_author_([a-f0-9]{32})=/);
        if (match) {
          return match[1];
        }
      }

      // 如果都没有，返回空字符串（会在保存时警告）
      return "";
    },

    // 获取 WordPress 格式的 Cookie 名称
    getWordPressCookieName: function (type) {
      const hash = this.getCookieHash();
      if (!hash) {
      }
      const names = {
        author: "comment_author_" + hash,
        email: "comment_author_email_" + hash,
        url: "comment_author_url_" + hash,
      };
      return names[type] || "";
    },

    // 设置 Cookie
    set: function (name, value, days) {
      try {
        let expires = "";
        if (days) {
          const date = new Date();
          date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
          expires = "; expires=" + date.toUTCString();
        }
        document.cookie =
          encodeURIComponent(name) +
          "=" +
          encodeURIComponent(value) +
          expires +
          "; path=/; SameSite=Lax";
        return true;
      } catch (e) {
        return false;
      }
    },

    // 获取 Cookie
    get: function (name) {
      try {
        const nameEQ = encodeURIComponent(name) + "=";
        const ca = document.cookie.split(";");
        for (let i = 0; i < ca.length; i++) {
          let c = ca[i];
          while (c.charAt(0) === " ") c = c.substring(1, c.length);
          if (c.indexOf(nameEQ) === 0) {
            return decodeURIComponent(c.substring(nameEQ.length, c.length));
          }
        }
        return null;
      } catch (e) {
        return null;
      }
    },

    // 删除 Cookie
    remove: function (name) {
      this.set(name, "", -1);
    },
  };

  // 双重存储管理器
  window.CommentStorageManager = {
    // 保存评论者信息（同时写入 Cookie 和 LocalStorage）
    saveGuestInfo: function (name, email, url, remember) {
      if (!remember) {
        // 不记住，清除所有存储
        this.clearGuestInfo();
        return;
      }

      if (!name || !email) {
        return;
      }

      // 1. 写入 WordPress 标准格式 Cookie（优先级最高，365天）
      const authorCookie = CookieUtils.getWordPressCookieName("author");
      const emailCookie = CookieUtils.getWordPressCookieName("email");
      const urlCookie = CookieUtils.getWordPressCookieName("url");

      if (authorCookie) CookieUtils.set(authorCookie, name, 365);
      if (emailCookie) CookieUtils.set(emailCookie, email, 365);
      if (url && urlCookie) CookieUtils.set(urlCookie, url, 365);

      // 记录"记住我"状态（使用简单格式，因为这不是WordPress标准）
      CookieUtils.set("guest_comment_remember", "1", 365);

      // 2. 写入 LocalStorage（作为备用）
      try {
        localStorage.setItem("guest_comment_author", name);
        localStorage.setItem("guest_comment_email", email);
        if (url) localStorage.setItem("guest_comment_url", url);
        localStorage.setItem("guest_comment_remember", "1");

        // 保存到配置文件列表
        const raw = localStorage.getItem("guest_comment_profiles");
        const list = raw ? JSON.parse(raw) : [];
        const profile = { name, email, url };

        if (Array.isArray(list)) {
          const idx = list.findIndex(
            (x) => (x.email || "").toLowerCase() === email.toLowerCase()
          );
          if (idx >= 0) {
            list[idx] = profile;
          } else {
            list.push(profile);
          }
          localStorage.setItem("guest_comment_profiles", JSON.stringify(list));
        }

        localStorage.setItem("guest_comment_last_email", email);
      } catch (e) {}
    },

    // 读取评论者信息（优先 Cookie，LocalStorage 作为备用）
    loadGuestInfo: function () {
      // 1. 优先从 WordPress 标准格式 Cookie 读取
      const authorCookie = CookieUtils.getWordPressCookieName("author");
      const emailCookie = CookieUtils.getWordPressCookieName("email");
      const urlCookie = CookieUtils.getWordPressCookieName("url");

      let name = authorCookie ? CookieUtils.get(authorCookie) : null;
      let email = emailCookie ? CookieUtils.get(emailCookie) : null;
      let url = urlCookie ? CookieUtils.get(urlCookie) : null;

      if (name || email) {
        return { name: name || "", email: email || "", url: url || "" };
      }

      // 2. Cookie 不存在，尝试从 LocalStorage 读取
      try {
        name = localStorage.getItem("guest_comment_author");
        email = localStorage.getItem("guest_comment_email");
        url = localStorage.getItem("guest_comment_url");

        if (name || email) {
          // 如果从 LocalStorage 读取成功，同步到 WordPress 标准 Cookie
          if (name && authorCookie) CookieUtils.set(authorCookie, name, 365);
          if (email && emailCookie) CookieUtils.set(emailCookie, email, 365);
          if (url && urlCookie) CookieUtils.set(urlCookie, url, 365);

          return { name: name || "", email: email || "", url: url || "" };
        }
      } catch (e) {}

      return { name: "", email: "", url: "" };
    },

    // 清除评论者信息
    clearGuestInfo: function () {
      // 清除 WordPress 标准格式 Cookie
      const authorCookie = CookieUtils.getWordPressCookieName("author");
      const emailCookie = CookieUtils.getWordPressCookieName("email");
      const urlCookie = CookieUtils.getWordPressCookieName("url");

      if (authorCookie) CookieUtils.remove(authorCookie);
      if (emailCookie) CookieUtils.remove(emailCookie);
      if (urlCookie) CookieUtils.remove(urlCookie);
      CookieUtils.remove("guest_comment_remember");

      // 清除 LocalStorage
      try {
        localStorage.removeItem("guest_comment_author");
        localStorage.removeItem("guest_comment_email");
        localStorage.removeItem("guest_comment_url");
        localStorage.removeItem("guest_comment_remember");
        localStorage.removeItem("guest_comment_last_email");
      } catch (e) {}
    },

    // 检查是否勾选了"记住我"
    isRememberEnabled: function () {
      // 优先检查 Cookie
      const cookieRemember = CookieUtils.get("guest_comment_remember");
      if (cookieRemember === "1") return true;

      // 检查 LocalStorage
      try {
        return localStorage.getItem("guest_comment_remember") === "1";
      } catch (e) {
        return false;
      }
    },
  };
})();

/**
 * Westlife 评论功能初始化模块
 * 防重复：如果已存在 CommentHandler（被 bundle + 独立同时加载），跳过重新声明
 */
if (typeof window.CommentHandler !== "undefined") {
  console.warn(
    "[Westlife][Comment] Duplicate comment.js load detected, skip redefining CommentHandler"
  );
} else {
  class CommentHandler {
    constructor() {
      if (!window.westlifeComment) {
        console.error("评论配置未找到");
        return;
      }

      this.form = document.querySelector("#commentform");
      if (!this.form) {
        console.error("评论表单未找到");
        return;
      }

      this.config = {
        ajaxUrl: westlifeComment.ajaxUrl,
        postId: this.form.querySelector('input[name="comment_post_ID"]')?.value,
        nonce: westlifeComment.nonce,
      };

      if (!this.validateConfig()) {
        return;
      }

      // 预先初始化一次内联访客字段状态（确保在验证码逻辑与后续刷新前已有基础样式）
      setTimeout(() => this.initGuestInlineFieldStates(), 0);

      this.i18n = westlifeComment.i18n || {
        loading: "发布中...",
        success: "评论发布成功！",
        waiting: "评论已提交，等待审核中...",
        error: "评论发布失败",
        loadMore: "加载更多评论",
        noMore: "所有评论已加载完毕",
        loadError: "加载失败，请重试",
        loadSuccess: "评论加载成功",
      };

      this.isSubmitting = false;
      this.initEvents();
      this.initReplyEvents();
      // 编辑器工具栏/表情功能已合并进 comment.js
      this.initLoadMoreComments();
      // this.initCommentNotifier(); // 删除这行，移除重复通知源头
      // 初始化Turnstile验证码
      this.initTurnstile();
      // 回复@ 高亮目标评论
      this.initReplyMentionPreview();
      // 顶级评论楼层号
      this.numberTopLevelFloors();
      // 加强：指针进入评论项时强制显现右上角回复按钮（避免 CSS :hover 命中不稳定）
      this.initReplyHoverVisibility();
      // 现代编辑器: 内容规范化与占位符清理
      this.initModernEditorCleanup();
    }

    destroy() {
      if (this.turnstile && typeof this.turnstile.destroy === "function") {
        try {
          this.turnstile.destroy();
        } catch (_) {}
      }
      this.turnstile = null;
      this.isSubmitting = false;
    }

    validateConfig() {
      if (!this.config.ajaxUrl) {
        console.error("评论配置错误: 缺少 AJAX URL");
        return false;
      }
      if (!this.config.postId) {
        console.error("评论配置错误: 缺少文章ID");
        return false;
      }
      if (!this.config.nonce) {
        console.error("评论配置错误: 缺少安全验证");
        return false;
      }
      return true;
    }

    // 初始化Turnstile验证码
    initTurnstile() {
      // 检查是否已加载Turnstile模块
      if (typeof window.WestlifeTurnstile === "undefined") {
        // Turnstile验证码是可选功能，未配置时不会加载
        // console.warn("[Comment] Turnstile模块未加载");
        return;
      }

      // 创建Turnstile实例
      this.turnstile = new window.WestlifeTurnstile(this.form);

      // 初始注入
      this.turnstile.inject();

      // 延迟检查（适配浏览器自动填充）
      setTimeout(() => this.turnstile.inject(), 800);
      setTimeout(() => this.turnstile.inject(), 2500);
    }

    /**
     * 注入验证码（封装方法，兼容Turnstile未加载的情况）
     */
    injectCaptcha(options) {
      if (this.turnstile && typeof this.turnstile.inject === "function") {
        this.turnstile.inject(options);
      }
    }

    validateEmail(email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      return emailRegex.test(email);
    }

    initEvents() {
      this.form.addEventListener("submit", this.submitComment.bind(this));

      // Ctrl+Enter 快捷键提交评论
      const editor = this.form.querySelector("#comment-editor");
      if (editor) {
        editor.addEventListener("keydown", (e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            this.form.dispatchEvent(new Event("submit", { cancelable: true }));
          }
        });
      }

      // 添加修改信息链接事件
      const changeInfoLink = this.form.querySelector(".change-info");
      if (changeInfoLink) {
        changeInfoLink.addEventListener("click", (e) => {
          e.preventDefault();
          const infoForm = this.form.querySelector(".comment-form-info");
          const welcomeMsg = this.form.querySelector(".comment-welcome");

          if (infoForm && welcomeMsg) {
            welcomeMsg.style.display = "none";
            infoForm.style.display = "grid";
          }
        });
      }

      if (typeof jQuery !== "undefined") {
        jQuery(document).ready(function ($) {
          $("#edit-commenter-info").click(function (e) {
            e.preventDefault();
            $("#author").focus(); // 聚焦到昵称输入框
          });
        });
      }
    }

    // 悬浮/点击评论中的“@昵称（.reply-to）”时，高亮被指向的评论气泡
    initReplyMentionPreview() {
      const container = document.querySelector(".comments-area");
      if (!container) return;

      let lastElem = null;
      let timer = null;

      function getTargetFromAnchor(a) {
        try {
          const href = a.getAttribute("href") || "";
          const id = href.split("#")[1];
          if (!id) return null;
          const li = document.getElementById(id);
          if (!li) return null;
          return li.querySelector(".comment-bubble") || li;
        } catch (_) {
          return null;
        }
      }

      function highlight(elem, duration = 1800) {
        if (!elem) return;
        if (lastElem && lastElem !== elem) {
          lastElem.classList.remove("mention-highlight");
        }
        elem.classList.add("mention-highlight");
        lastElem = elem;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          elem.classList.remove("mention-highlight");
          if (lastElem === elem) lastElem = null;
        }, duration);
      }

      container.addEventListener("mouseover", (e) => {
        const a = e.target.closest("a.reply-to");
        if (!a) return;
        const t = getTargetFromAnchor(a);
        if (t) highlight(t, 1200);
      });

      container.addEventListener("focusin", (e) => {
        const a = e.target.closest("a.reply-to");
        if (!a) return;
        const t = getTargetFromAnchor(a);
        if (t) highlight(t, 1500);
      });

      container.addEventListener("click", (e) => {
        const a = e.target.closest("a.reply-to");
        if (!a) return;
        const href = a.getAttribute("href") || "";
        const id = href.split("#")[1];
        if (!id) return;
        const li = document.getElementById(id);
        if (!li) return;
        e.preventDefault();
        const headerHeight =
          document.querySelector(".site-header")?.offsetHeight || 0;
        const y =
          li.getBoundingClientRect().top +
          window.pageYOffset -
          Math.max(0, headerHeight - 8);
        window.scrollTo({ top: y, behavior: "smooth" });
        const bubble = li.querySelector(".comment-bubble") || li;
        setTimeout(() => highlight(bubble, 2200), 300);
      });
    }

    // 初始化回复事件
    initReplyEvents() {
      // 委托到评论区域
      document
        .querySelector(".comments-area")
        ?.addEventListener("click", (e) => {
          // 回复链接点击
          const replyLink = e.target.closest(".comment-reply-link");
          if (replyLink) {
            e.preventDefault();
            this.handleReply(replyLink);
          }

          // 取消回复链接点击 - 修改选择器
          const cancelReply = e.target.closest(
            ".cancel-reply-inline, #cancel-comment-reply-link"
          );
          if (cancelReply) {
            e.preventDefault();
            this.resetReplyForm();
            // 隐藏按钮通过 CSS 控制，这里不再强制内联
          }
        });
    }

    // 为每个评论项在指针进入/离开时切换“显现回复按钮”的类，避免动态插入时 :hover 选择器匹配不稳
    initReplyHoverVisibility() {
      const area = document.querySelector(".comments-area");
      if (!area) return;
      const pickLi = (el) =>
        el && el.closest("li.comment-item, li[id^='comment-']");
      let lastLi = null;
      const setActive = (li) => {
        if (lastLi && lastLi !== li) {
          lastLi.classList.remove("reply-visible");
        }
        if (li && !li.classList.contains("reply-visible")) {
          li.classList.add("reply-visible");
        }
        lastLi = li || null;
      };
      const onOver = (e) => {
        const li = pickLi(e.target);
        if (!li) return;
        setActive(li);
      };
      const onOut = (e) => {
        const li = pickLi(e.target);
        if (!li) return;
        const to = e.relatedTarget;
        if (to && li.contains(to)) return; // 仍在同一项内
        if (lastLi === li) {
          li.classList.remove("reply-visible");
          lastLi = null;
        }
      };
      area.addEventListener("mouseover", onOver);
      area.addEventListener("mouseout", onOut);
      // 额外增强：用 mousemove 追踪当前指针所在评论项，确保第二页+的评论也能触发
      let raf = 0;
      area.addEventListener("mousemove", (e) => {
        if (raf) return; // throttle to next frame
        raf = requestAnimationFrame(() => {
          raf = 0;
          const li = pickLi(e.target);
          if (li) setActive(li);
        });
      });
      area.addEventListener("mouseleave", () => {
        if (lastLi) lastLi.classList.remove("reply-visible");
        lastLi = null;
      });
      // 触屏兜底：轻触时短暂显现
      area.addEventListener(
        "touchstart",
        (e) => {
          const li = pickLi(e.target);
          if (!li) return;
          setActive(li);
          setTimeout(() => {
            if (li === lastLi) {
              li.classList.remove("reply-visible");
              lastLi = null;
            } else {
              li.classList.remove("reply-visible");
            }
          }, 1500);
        },
        { passive: true }
      );
    }

    // 处理评论回复
    handleReply(replyLink) {
      try {
        // 获取必要的数据
        const commentId = replyLink.getAttribute("data-commentid");
        const respondId = "respond";
        const parent = document.getElementById(`comment-${commentId}`);
        const respond = document.getElementById(respondId);

        if (!parent || !respond) {
          console.error("回复元素未找到");
          return;
        }

        // 获取被回复者的名字
        const authorElement = parent.querySelector(
          ".comment-author .comment-author-link, .comment-author cite, .comment-author"
        );
        const authorName = authorElement
          ? authorElement.textContent.trim()
          : "该用户";

        // 更新回复标题
        this.updateReplyTitle(authorName);

        // 设置父评论ID
        const parentInput = this.form.querySelector(
          'input[name="comment_parent"]'
        );
        if (parentInput) {
          parentInput.value = commentId;
        }

        // 添加回复状态类，取消回复按钮的显示通过CSS控制
        respond.classList.add("is-replying");
        // 去除内联隐藏样式，让 CSS 生效
        const cancelBtn = respond.querySelector(".cancel-reply-inline");
        if (cancelBtn) cancelBtn.style.display = "";

        // 移动评论表单
        parent.appendChild(respond);

        // 确保验证码仅一个且位置正确（幂等）
        this.injectCaptcha();

        // 平滑滚动到评论框 - 但不强制聚焦
        respond.scrollIntoView({
          behavior: "smooth",
          block: "nearest", // 改为 nearest，减少滚动干扰
        });
      } catch (error) {
        console.error("处理回复失败:", error);
        this.showMessage("回复操作失败，请重试", "error");
      }
    }

    /**
     * 更新回复标题
     */
    updateReplyTitle(authorName) {
      const titleElement = this.form.querySelector(
        ".comment-editor-status .welcome-title"
      );
      if (titleElement) {
        titleElement.textContent = `回复给 @${authorName}`;
      }

      const welcomeText = this.form.querySelector(
        ".comment-editor-status .welcome-right .welcome-text"
      );
      if (welcomeText) {
        welcomeText.textContent = "回复模式已开启，发送后将自动回到评论框。";
      }

      const replyContextBar = this.form.querySelector(
        ".comment-editor-status .reply-context-bar"
      );
      const replyContextText = this.form.querySelector(
        ".comment-editor-status .reply-context-text"
      );
      if (replyContextText) {
        replyContextText.textContent = `正在回复 @${authorName}`;
      }
      if (replyContextBar) {
        replyContextBar.classList.remove("u-hidden");
      }
    }

    // 修改评论提交处理
    async submitComment(e) {
      e.preventDefault();
      if (this.isSubmitting) return;

      // 提交前强制同步一次编辑器内容
      const editor = this.form.querySelector("#comment-editor");
      const typingZone = this.form.querySelector(
        "#comment-editor .editor-typing-zone"
      );
      const hidden = this.form.querySelector("#comment");

      // 手动同步编辑器内容到隐藏的 textarea
      if (typingZone && hidden) {
        try {
          // 克隆节点进行处理
          const clone = typingZone.cloneNode(true);

          // 保留格式标签（strong, em, del, code）的 HTML
          let html = clone.innerHTML;

          // 转换换行标签
          html = html.replace(/<\/(div|p|li)>/gi, "\n");
          html = html.replace(/<br\s*\/?>/gi, "\n");

          // 清理多余的换行
          html = html.replace(/\n{3,}/g, "\n\n").trim();

          // 直接设置隐藏textarea的值（保留HTML标签）
          hidden.value = html;
        } catch (err) {
          console.error("[评论提交] 同步异常:", err);
        }
      }

      // 兼容多种主题按钮选择器
      const submitBtn = this.form.querySelector(
        '.submit-comment, #submit, input[type="submit"], button[type="submit"]'
      );

      try {
        // 添加加载状态
        this.isSubmitting = true;
        if (submitBtn) {
          submitBtn.classList.add("u-loading", "submitting");
          if (submitBtn.classList.contains("loading"))
            submitBtn.classList.remove("loading");
          submitBtn.disabled = true;
          // 切换图标为旋转圆圈
          const icon = submitBtn.querySelector(".submit-icon i");
          if (icon) {
            icon.setAttribute("data-original-class", icon.className);
            icon.outerHTML =
              window.WestlifeIcons && typeof window.WestlifeIcons.icon === "function"
                ? window.WestlifeIcons.icon("fa-circle-notch fa-spin")
                : icon.outerHTML;
          }
        }

        const formData = new FormData(this.form);
        const commentValue = formData.get("comment");

        // 简单验证 - 只检查是否为空
        if (!commentValue || !commentValue.trim()) {
          throw new Error("请输入评论内容");
        }

        // 验证Turnstile验证码（未登录用户）
        if (this.turnstile && !this.turnstile.isVerified()) {
          throw new Error("请先完成人机验证");
        }

        // 游客资料：在“记住我”开启时保存本地与常用列表
        try {
          const authorEl = this.form.querySelector(
            '#author, input[name="author"]'
          );
          const emailEl = this.form.querySelector(
            '#email, input[name="email"]'
          );
          const urlEl = this.form.querySelector(
            '#url, input[name="url"], input[name="website"]'
          );
          const nameVal = (authorEl?.value || "").trim();
          const emailVal = (emailEl?.value || "").trim();
          const urlVal = (urlEl?.value || "").trim();

          // 使用统一的存储管理器保存信息（同时写入 Cookie 和 LocalStorage）
          const rememberCheckbox = this.form.querySelector(
            '#wp-comment-cookies-consent, input[name="wp-comment-cookies-consent"]'
          );
          const remember = rememberCheckbox ? rememberCheckbox.checked : false;

          if (window.CommentStorageManager) {
            window.CommentStorageManager.saveGuestInfo(
              nameVal,
              emailVal,
              urlVal,
              remember
            );
          } else {
            // 降级：使用旧方法（仅 LocalStorage）
            const rememberLegacy =
              localStorage.getItem("guest_comment_remember") === "1";
            if (rememberLegacy && nameVal && emailVal) {
              localStorage.setItem("guest_comment_author", nameVal);
              localStorage.setItem("guest_comment_email", emailVal);
              if (urlEl) localStorage.setItem("guest_comment_url", urlVal);
              const raw = localStorage.getItem("guest_comment_profiles");
              const list = raw ? JSON.parse(raw) : [];
              const p = { name: nameVal, email: emailVal, url: urlVal };
              if (Array.isArray(list)) {
                const idx = list.findIndex(
                  (x) =>
                    (x.email || "").toLowerCase() === emailVal.toLowerCase()
                );
                if (idx >= 0) list[idx] = p;
                else list.push(p);
                localStorage.setItem(
                  "guest_comment_profiles",
                  JSON.stringify(list)
                );
              } else {
                localStorage.setItem(
                  "guest_comment_profiles",
                  JSON.stringify([p])
                );
              }
              try {
                localStorage.setItem("guest_comment_last_email", emailVal);
              } catch (_) {}
            }
          }
        } catch (_) {}

        // 更稳健的登录态判断
        const isLoggedIn =
          this.config && typeof this.config.isLoggedIn !== "undefined"
            ? !!this.config.isLoggedIn
            : typeof window.westlifeComment?.isLoggedIn !== "undefined"
            ? !!window.westlifeComment.isLoggedIn
            : !!window.westlifeSettings?.isLoggedIn ||
              document.body.classList.contains("logged-in");

        // 游客评论验证（仅在未登录时要求昵称/邮箱）
        if (!isLoggedIn) {
          const authorInput = this.form.querySelector("#author");
          const emailInput = this.form.querySelector("#email");

          if (!authorInput?.value.trim()) throw new Error("请输入昵称");
          if (!emailInput?.value.trim()) throw new Error("请输入邮箱");
          if (!this.validateEmail(emailInput.value))
            throw new Error("邮箱格式不正确");
        }

        // 添加必要参数
        formData.set("action", "westlife_ajax_comment_submit");
        formData.set("comment_nonce", this.config.nonce);

        const response = await fetch(this.config.ajaxUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
          body: formData,
        });

        if (!response.ok) {
          // 尝试获取详细错误信息
          const errorText = await response.text();
          console.error("服务器错误响应:", errorText);
          throw new Error(
            `服务器错误 (${response.status}): ${response.statusText}`
          );
        }

        const result = await response.json();
        // 简化 submitComment 方法中的成功处理部分

        if (result.success) {
          // 清空评论框（隐藏域与可视编辑器）
          const hiddenTextarea = this.form.querySelector("#comment");
          if (hiddenTextarea) hiddenTextarea.value = "";

          // 只清空 typing-zone 的内容，保留编辑器结构
          const typingZone = this.form.querySelector(
            "#comment-editor .editor-typing-zone"
          );
          if (typingZone) {
            typingZone.innerHTML = "";
          }

          // 如果评论已通过审核，更新评论列表
          if (result.data.approved && result.data.comment_html) {
            const parentId = formData.get("comment_parent");

            await this.handleNewCommentPlacement(
              result.data.comment_html,
              parentId
            );

            // 简化计数更新调用
            if (result.data.total_count !== undefined) {
              this.updateCommentCount(
                result.data.total_count,
                result.data.unique_count
              );
            }

            // 如果是回复评论，重置表单位置
            if (parentId && parentId !== "0") {
              this.resetReplyForm();
            }

            // 显示成功消息
            this.showMessage(
              result.data.message || "评论发布成功！",
              "success"
            );

            // 统计评论次数（基于邮箱），并刷新问候条
            try {
              const emailEl = this.form.querySelector(
                '#email, input[name="email"]'
              );
              const emailVal = (emailEl?.value || "").trim().toLowerCase();
              if (emailVal) {
                const map = JSON.parse(
                  localStorage.getItem("guest_comment_counts") || "{}"
                );
                if (!map[emailVal]) map[emailVal] = 0;
                map[emailVal] = Number(map[emailVal]) + 1;
                localStorage.setItem(
                  "guest_comment_counts",
                  JSON.stringify(map)
                );
                document.dispatchEvent(
                  new CustomEvent("westlife:guest-profile-refresh")
                );
                // 评论成功（且已获批并内联插入）后，可能达到信任阈值，重新评估验证码
                try {
                  if (typeof this.injectCaptcha === "function") {
                    // 先本地快速决定
                    this.injectCaptcha({ skipAsync: true });
                    // 再异步校准
                    setTimeout(() => this.injectCaptcha(), 0);
                  }
                } catch (_) {}
              }
            } catch (_) {}

            // Cookie 统计：评论次数（仅在提交成功时自增）
            try {
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
              const cur = parseInt(getCookie("wl_comments") || "0", 10) || 0;
              const next = cur + 1;
              setCookie("wl_comments", String(next));
              // 同步首页访客卡片数值（若存在）
              const el = document.getElementById("hf-comments");
              if (el) el.textContent = String(next);
            } catch (_) {}
          } else {
            // 待审核的情况
            this.showMessage("评论已提交，等待审核中...", "info");
            // 审核中也刷新验证码，避免题目复用
            try {
              this.injectCaptcha({ skipAsync: true });
              setTimeout(() => this.injectCaptcha(), 0);
            } catch (_) {}
          }
        } else {
          throw new Error(result.data?.message || this.i18n.error);
        }
      } catch (error) {
        console.error("评论提交错误:", error);
        this.showMessage(error.message, "error");
      } finally {
        // 移除加载状态
        this.isSubmitting = false;
        if (submitBtn) {
          submitBtn.classList.remove("u-loading", "loading", "submitting");
          submitBtn.disabled = false;
          // 恢复原始图标
          const icon = submitBtn.querySelector(".submit-icon i");
          if (icon && icon.getAttribute("data-original-class")) {
            icon.className = icon.getAttribute("data-original-class");
            icon.removeAttribute("data-original-class");
          }
        }
        // 重置验证码状态
        if (this.turnstile) {
          this.turnstile.reset();
        }
      }
    }

    /**
     * 处理新评论插入位置（支持嵌套）
     */
    async handleNewCommentPlacement(commentHtml, parentId) {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = commentHtml.trim();
      const newComment = tempDiv.firstElementChild;

      if (!newComment) {
        console.error("无法解析评论HTML");
        return;
      }

      // 添加新评论标识类（用于CSS动画）
      newComment.classList.add("comment-new");

      if (parentId && parentId !== "0") {
        // 这是回复评论，插入到父评论下方
        const parentComment = document.getElementById(`comment-${parentId}`);
        if (parentComment) {
          // 查找父评论的子评论容器
          let childrenContainer =
            parentComment.querySelector(".comment-children");

          if (!childrenContainer) {
            // 如果没有子评论容器，创建一个
            childrenContainer = document.createElement("ol");
            childrenContainer.className = "comment-children";
            parentComment.appendChild(childrenContainer);
          }

          // *** 关键修复：确保回复评论有正确的类名 ***
          const commentMain = newComment.querySelector(".comment-main");
          if (commentMain) {
            commentMain.classList.add("is-child"); // 添加回复评论标识类
          }

          // 将新回复插入到子评论容器的顶部
          childrenContainer.insertBefore(
            newComment,
            childrenContainer.firstChild
          );

          // 轻量滚动到新评论 - 不打断用户
          setTimeout(() => {
            newComment.scrollIntoView({
              behavior: "smooth",
              block: "nearest", // 改为 nearest，减少滚动干扰
            });
          }, 100);

          return;
        }
      }

      // 顶级评论处理
      const commentList = document.getElementById("comment-list");
      const commentsArea = document.querySelector(".comments-area");
      const noComments = commentsArea?.querySelector(".no-comments");

      if (noComments) {
        const newList = document.createElement("ol");
        newList.className = "comment-list";
        newList.id = "comment-list";
        noComments.replaceWith(newList);
        newList.appendChild(newComment);
        if (typeof window.westlifeTooltipsRefresh === "function") {
          window.westlifeTooltipsRefresh(newComment);
        }
      } else if (commentList) {
        // ASC：新顶级评论追加到末尾
        commentList.appendChild(newComment);
      }

      // 顶级评论插入后，重排楼层号
      try {
        this.numberTopLevelFloors();
      } catch (_) {}
      // 轻量滚动到新评论
      setTimeout(() => {
        newComment.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 100);
    }

    // 修改 showMessage 方法 - 统一使用 WestlifeUtils
    showMessage(message, type = "info") {
      // 优先使用 WestlifeUtils.showMessage
      if (
        window.WestlifeUtils &&
        typeof window.WestlifeUtils.showMessage === "function"
      ) {
        window.WestlifeUtils.showMessage(message, type);
        return;
      }

      // 如果 WestlifeUtils 不可用，记录错误但不创建通知
      console.error("WestlifeUtils.showMessage 不可用，无法显示通知:", message);
    }

    /**
     * 初始化加载更多功能
     */
    initLoadMoreComments() {
      const loadMoreBtn = document.getElementById("load-more-comments");
      if (!loadMoreBtn) {
        return;
      }

      loadMoreBtn.addEventListener("click", this.loadMoreComments.bind(this));
    }

    /**
     * 加载更多评论
     */
    async loadMoreComments(e) {
      e.preventDefault();

      const loadMoreBtn = document.getElementById("load-more-comments");
      if (!loadMoreBtn || loadMoreBtn.disabled) {
        return;
      }

      /* 首帧就移除背景，避免视觉蓝底闪一下 */
      if (!loadMoreBtn.classList.contains("no-initial-bg")) {
        loadMoreBtn.classList.add("no-initial-bg");
      }
      // 立即标记 busy（先于异步逻辑，减少一次重绘）
      if (!loadMoreBtn.classList.contains("is-busy")) {
        loadMoreBtn.classList.add("is-busy");
      }

      const page = parseInt(loadMoreBtn.dataset.page) || 2;
      const postId = loadMoreBtn.dataset.postId || this.config.postId;

      try {
        this.setLoadMoreState(true);
        // A11y: 标记 busy 状态
        loadMoreBtn.setAttribute("aria-busy", "true");
        loadMoreBtn.setAttribute("aria-disabled", "true");

        const startTime = Date.now();
        const minDisplay = 1500 + Math.floor(Math.random() * 500); // 1.5s - 2.0s

        const formData = new FormData();
        formData.append("action", "westlife_load_more_comments");
        formData.append("post_id", postId);
        formData.append("page", page);
        formData.append("nonce", this.config.nonce);

        const responsePromise = fetch(this.config.ajaxUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "X-Requested-With": "XMLHttpRequest",
          },
          body: formData,
        });
        // 等待接口返回
        const response = await responsePromise;
        // 计算是否需要额外延迟以满足最小展示时长
        const elapsed = Date.now() - startTime;
        const remain = minDisplay - elapsed;
        if (remain > 0) {
          await new Promise((r) => setTimeout(r, remain));
        }

        if (!response.ok) {
          throw new Error(`请求失败: ${response.status}`);
        }

        const result = await response.json();

        if (result.success) {
          if (result.data.comments) {
            // 插入新评论
            const commentList = document.getElementById("comment-list");
            const tempDiv = document.createElement("div");
            tempDiv.innerHTML = result.data.comments;

            // 将新评论添加到列表
            while (tempDiv.firstChild) {
              const node = tempDiv.firstChild;
              // ASC：更多评论（更“新”的在后续页？这里我们首屏是最旧→较新，后续页继续更“新”的排在后面）
              commentList.appendChild(node);
              if (typeof window.westlifeTooltipsRefresh === "function") {
                window.westlifeTooltipsRefresh(node);
              }
            }

            // 显示成功消息
            if (result.data.message) {
              this.showMessage(result.data.message, "success");
            }

            // 加载更多后重排楼层
            try {
              this.numberTopLevelFloors();
            } catch (_) {}
          }

          // 更新按钮状态
          if (result.data.has_more) {
            loadMoreBtn.dataset.page = page + 1;
          } else {
            // 隐藏按钮
            loadMoreBtn.parentElement.style.display = "none";
            this.showMessage("所有评论已加载完毕", "info");
          }
        } else {
          throw new Error(result.data?.message || "加载失败");
        }
      } catch (error) {
        console.error("加载失败:", error);
        this.showMessage(error.message || "加载失败，请重试", "error");
      } finally {
        this.setLoadMoreState(false);
        loadMoreBtn.removeAttribute("aria-busy");
        loadMoreBtn.removeAttribute("aria-disabled");
      }
    }

    // 为顶级评论计算/渲染楼层：若后端提供 data-index（全局楼层），优先使用；否则回退为按时间从最早到最新分配
    numberTopLevelFloors() {
      const list = document.getElementById("comment-list");
      if (!list) return;
      const liAll = Array.from(list.children).filter((li) =>
        li.matches("li.comment, li.comment-item, li[id^='comment-']")
      );

      // 过滤出顶级评论
      const topLevel = liAll.filter((li) => {
        const isReply =
          li.classList.contains("is-reply") ||
          li.querySelector(":scope > .comment-main.is-child");
        return !isReply;
      });

      // 提取时间戳（优先 span.comment-time 的 datetime 属性，回退为 ID 数字）
      const getTs = (li) => {
        try {
          const tEl = li.querySelector(":scope .comment-time");
          const iso = tEl?.getAttribute("datetime");
          const ts = iso ? Date.parse(iso) : NaN;
          if (Number.isFinite(ts)) return ts;
        } catch (_) {}
        // 回退：尝试从 id="comment-123" 解析数字作为相对时序
        const id = li.id || "";
        const m = id.match(/comment-(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
      };

      // 如果后端已提供全局索引 data-index，则直接用它来渲染并跳过本地排序
      const hasServerIndex = topLevel.some((li) => {
        const el = li.querySelector(":scope .comment-floor[data-floor]");
        return el && el.hasAttribute("data-index");
      });

      let sorted = [];
      if (!hasServerIndex) {
        // 生成排序数组（按时间从早到晚，即升序）
        sorted = topLevel
          .map((li) => ({ li, ts: getTs(li) }))
          .sort((a, b) => a.ts - b.ts);
      }

      // 生成楼层标签（4 起前缀 #）
      const labelOf = (n) => {
        if (n === 1) return "沙发";
        if (n === 2) return "板凳";
        if (n === 3) return "地板";
        return `#${n}`;
      };

      // 先清空所有已有占位与标识类（避免回复误显示/类名残留）
      liAll.forEach((li) => {
        const el = li.querySelector(":scope .comment-floor[data-floor]");
        if (el) {
          el.textContent = "";
          el.classList.remove("is-floor-1", "is-floor-2", "is-floor-3");
        }
      });

      // 依排序写入标签
      if (hasServerIndex) {
        // 直接根据 data-index 渲染
        topLevel.forEach((li) => {
          const el = li.querySelector(":scope .comment-floor[data-floor]");
          if (!el) return;
          const idx = parseInt(el.getAttribute("data-index") || "0", 10);
          if (!Number.isFinite(idx) || idx <= 0) return;
          el.textContent = labelOf(idx);
          el.classList.remove("is-floor-1", "is-floor-2", "is-floor-3");
          if (idx === 1) el.classList.add("is-floor-1");
          else if (idx === 2) el.classList.add("is-floor-2");
          else if (idx === 3) el.classList.add("is-floor-3");
        });
      } else {
        let n = 1;
        for (const { li } of sorted) {
          const bubble = li.querySelector(":scope .comment-bubble");
          const el = li.querySelector(":scope .comment-floor[data-floor]");
          if (bubble && el) {
            el.textContent = labelOf(n);
            // 标注前三楼用于样式区分
            if (n === 1) el.classList.add("is-floor-1");
            else if (n === 2) el.classList.add("is-floor-2");
            else if (n === 3) el.classList.add("is-floor-3");
            n++;
          }
        }
      }
    }

    /**
     * 添加评论到列表
     */
    async appendComments(commentsHtml) {
      if (!commentsHtml) {
        return;
      }

      const commentList = document.getElementById("comment-list");
      if (!commentList) {
        return;
      }

      // 创建临时容器
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = commentsHtml;

      // 获取新评论元素
      const newComments = tempDiv.querySelectorAll('li[id^="comment-"]');

      // 添加到评论列表
      newComments.forEach((comment, index) => {
        comment.classList.add("new-loaded");
        commentList.appendChild(comment);
        if (typeof window.westlifeTooltipsRefresh === "function") {
          window.westlifeTooltipsRefresh(comment);
        }

        // 延迟触发动画
        setTimeout(() => {
          comment.style.animationDelay = `${index * 0.1}s`;
        }, 50);
      });
    }

    /**
     * 显示无更多评论提示
     */
    showNoMoreComments() {
      const loadMoreWrapper = document.querySelector(
        ".load-more-comments-wrapper"
      );

      if (loadMoreWrapper) {
        loadMoreWrapper.style.display = "none";
      }

      // 简单的文字提示，不创建额外元素
    }

    /**
     * 设置加载更多按钮状态
     */
    setLoadMoreState(isLoading) {
      const loadMoreBtn = document.getElementById("load-more-comments");
      if (!loadMoreBtn) {
        return;
      }

      if (isLoading) {
        // 设置加载状态
        loadMoreBtn.classList.add("u-loading");
        if (loadMoreBtn.classList.contains("loading"))
          loadMoreBtn.classList.remove("loading");
        loadMoreBtn.disabled = true;
        loadMoreBtn.classList.add("is-busy");
        // 使用内部两个 span 切换而不是直接覆盖文本
        const textSpan = loadMoreBtn.querySelector(".load-text");
        const loadingSpan = loadMoreBtn.querySelector(".wl-loading-text");
        if (textSpan) textSpan.classList.add("u-hidden");
        if (loadingSpan) loadingSpan.classList.remove("u-hidden");
      } else {
        // 恢复正常状态
        loadMoreBtn.classList.remove("u-loading", "loading");
        loadMoreBtn.disabled = false;
        loadMoreBtn.classList.remove("is-busy");
        // 不再恢复宽度：加载态允许按钮收缩已自动还原
        const textSpan = loadMoreBtn.querySelector(".load-text");
        const loadingSpan = loadMoreBtn.querySelector(".wl-loading-text");
        if (loadingSpan) loadingSpan.classList.add("u-hidden");
        if (textSpan) textSpan.classList.remove("u-hidden");
      }
    }

    /**
     * 重置回复表单到原始位置
     */
    resetReplyForm() {
      try {
        const respond = document.getElementById("respond");
        if (!respond) {
          return;
        }

        // 重置父评论ID
        const parentInput = this.form.querySelector(
          'input[name="comment_parent"]'
        );
        if (parentInput) {
          parentInput.value = "0";
        }

        // 重置回复标题
        const titleElement = this.form.querySelector(
          ".comment-editor-status .welcome-title"
        );
        if (titleElement) {
          titleElement.textContent = "发表评论";
        }

        const welcomeText = this.form.querySelector(
          ".comment-editor-status .welcome-right .welcome-text"
        );
        if (welcomeText) {
          welcomeText.textContent = "欢迎交流观点，保持礼貌与理性。";
        }

        const replyContextBar = this.form.querySelector(
          ".comment-editor-status .reply-context-bar"
        );
        const replyContextText = this.form.querySelector(
          ".comment-editor-status .reply-context-text"
        );
        if (replyContextText) {
          replyContextText.textContent = "";
        }
        if (replyContextBar) {
          replyContextBar.classList.add("u-hidden");
        }

        // 移除回复状态类，显示/隐藏通过CSS控制
        respond.classList.remove("is-replying");
        // 恢复按钮为隐藏，由 CSS 控制
        const cancelBtn2 = respond.querySelector(".cancel-reply-inline");
        if (cancelBtn2) cancelBtn2.style.display = "";

        // 查找原始容器位置
        const respondOriginal =
          document.getElementById("respond-original") ||
          document.querySelector(".comment-respond-container") ||
          document.querySelector(".comment-form-wrapper");

        if (respondOriginal) {
          respondOriginal.appendChild(respond);
        } else {
          // 备用方案
          const commentsArea = document.querySelector(".comments-area");
          if (commentsArea) {
            commentsArea.appendChild(respond);
          }
        }

        // 校正验证码（幂等，不会产生重复）
        this.injectCaptcha();
      } catch (error) {
        console.error("重置回复表单失败:", error);
      }
    }

    /**
     * 更新评论计数显示
     */
    updateCommentCount(totalCount, uniqueCount) {
      try {
        // 修正元素选择器，匹配实际HTML
        const totalCountElements = document.querySelectorAll(
          ".total-comments-count, .comments-count, [data-total-count]"
        );
        const uniqueCountElements = document.querySelectorAll(
          ".unique-commenters-count, .unique-commenters, [data-unique-count]"
        );

        // 更新总评论数
        totalCountElements.forEach((element) => {
          if (element.dataset.totalCount !== undefined) {
            element.dataset.totalCount = totalCount;
          }
          this.animateCountUpdate(element, totalCount);
        });

        // 更新独立评论者数量
        if (typeof uniqueCount !== "undefined") {
          uniqueCountElements.forEach((element) => {
            if (element.dataset.uniqueCount !== undefined) {
              element.dataset.uniqueCount = uniqueCount;
            }
            this.animateCountUpdate(element, uniqueCount);
          });
        }
      } catch (error) {
        console.error("更新评论计数失败:", error);
      }
    }

    /**
     * 动画更新计数 - 使用CSS类控制
     */
    animateCountUpdate(element, newValue) {
      try {
        // 添加更新动画类
        element.classList.add("updating");
        element.textContent = newValue;

        // 动画完成后移除类
        setTimeout(() => {
          element.classList.remove("updating");
        }, 600);
      } catch (error) {
        console.error("动画更新失败:", error);
        // 降级处理：直接更新文本
        element.textContent = newValue;
      }
    }

    // 初始化/刷新 游客内联字段的状态交互（可多次调用，自动防重复绑定）
    initGuestInlineFieldStates() {
      const container = document.querySelector(
        ".inline-guest-fields--inside.minimal.no-row, .inline-guest-fields--inside.minimal"
      );
      if (!container) return;
      const inputs = Array.from(
        container.querySelectorAll(
          "input[name=author], input[name=email], input[name=url]"
        )
      );
      if (!inputs.length) return;
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i;
      const urlRegex = /^(https?:\/\/)?([\w-]+\.)+[\w-]{2,}(\/[^\s]*)?$/i;

      function updateState(input) {
        const field = input.closest(".igf-field");
        if (!field) return;
        const val = input.value.trim();
        field.classList.toggle("has-value", !!val);
        let valid = true;
        if (input.name === "email" && val) {
          valid = emailRegex.test(val);
        } else if (input.name === "url" && val) {
          valid = urlRegex.test(val.replace(/^https?:\/\//i, ""));
        }
        if (input.name === "author" && !val) valid = false;
        field.classList.remove("is-valid", "is-invalid");
        if (val) field.classList.add(valid ? "is-valid" : "is-invalid");
        input.setAttribute("aria-invalid", valid ? "false" : "true");
      }

      inputs.forEach((input) => {
        if (input.dataset._igfBound === "1") return; // 防重复
        input.dataset._igfBound = "1";
        const field = input.closest(".igf-field");
        if (!field) return;
        if (input.value.trim()) field.classList.add("has-value");
        input.addEventListener("focus", () => field.classList.add("is-focus"));
        input.addEventListener("blur", () => {
          field.classList.remove("is-focus");
          updateState(input);
        });
        input.addEventListener("input", () => updateState(input));
      });
    }

    /**
     * 现代编辑器清理: 移除冗余 <br>, 合并空行, 保持占位符逻辑。
     */
    initModernEditorCleanup() {
      const zone = document.querySelector(
        ".comment-editor.editor-modern .editor-typing-zone"
      );
      if (!zone) return;
      if (zone.dataset._modernBound === "1") return;
      zone.dataset._modernBound = "1";

      // 彻底清除所有空白节点（初始化时执行一次）
      const removeWhitespaceNodes = () => {
        const iterator = document.createNodeIterator(
          zone,
          NodeFilter.SHOW_TEXT,
          null
        );
        let node;
        const nodesToRemove = [];
        while ((node = iterator.nextNode())) {
          // 如果文本节点只包含空白字符，标记删除
          if (node.nodeValue && /^\s*$/.test(node.nodeValue)) {
            nodesToRemove.push(node);
          }
        }
        nodesToRemove.forEach((n) => {
          if (n.parentNode) n.parentNode.removeChild(n);
        });
      };

      const collapseBreaks = (html) => {
        // 多个 <br> 连续压缩为单个
        html = html.replace(/(?:<br\s*\/?>(?:\s|&nbsp;)*){2,}/gi, "<br>");
        // 末尾多余 <br> 去掉
        html = html.replace(/(<br>\s*)+$/i, "");
        // 开头多余 <br> 去掉
        html = html.replace(/^(\s*<br>)+/i, "");
        return html;
      };

      const normalize = () => {
        // 检查是否有实际内容
        const hasContent = zone.textContent.trim().length > 0;

        // 如果有内容，只做最小限度的清理
        if (hasContent) {
          // 只删除开头连续的多余 <br>
          let leadingBrCount = 0;
          while (zone.firstChild && zone.firstChild.nodeName === "BR") {
            leadingBrCount++;
            if (leadingBrCount > 1) {
              zone.removeChild(zone.firstChild);
            } else {
              break; // 保留第一个
            }
          }
          return; // 有内容时不做更多干预
        }

        // 只有在完全空白时才清理
        if (zone.textContent.trim() === "") {
          const raw = zone.innerHTML.replace(/&nbsp;/gi, "").trim();
          if (/^(<br\s*\/?>(\s*)?)*$/i.test(raw)) {
            zone.innerHTML = ""; // 完全清空，显示占位符
          }
        }
      };

      // 初始化：先清除空白节点，再规范化
      removeWhitespaceNodes();
      normalize();

      zone.addEventListener("input", normalize);
      zone.addEventListener("blur", normalize);
      zone.addEventListener("paste", () => setTimeout(normalize, 0));
    }
  }

  function initCommentModule() {
    if (
      window.__westlifeCommentInstance &&
      typeof window.__westlifeCommentInstance.destroy === "function"
    ) {
      try {
        window.__westlifeCommentInstance.destroy();
      } catch (e) {}
    }
    window.__westlifeCommentInstance = new CommentHandler();

    // ===== 从 single.js 迁移：滚动到评论区 =====
    (function initCommentScroll() {
      if (typeof jQuery === "undefined") return;
      jQuery(document)
        .off("click.commentScroll")
        .on("click.commentScroll", (e) => {
          const commentLink = e.target.closest(".scroll-to-comments");
          if (commentLink) {
            e.preventDefault();
            const comments = document.querySelector("#comments");
            if (comments) {
              const headerHeight =
                document.querySelector(".site-header")?.offsetHeight || 0;
              const offset = headerHeight + 0;
              const targetPosition =
                comments.getBoundingClientRect().top +
                window.pageYOffset -
                offset;
              window.scrollTo({ top: targetPosition, behavior: "smooth" });
            }
          }
        });
    })();
  }

  function destroyCommentModule() {
    if (
      window.__westlifeCommentInstance &&
      typeof window.__westlifeCommentInstance.destroy === "function"
    ) {
      try {
        window.__westlifeCommentInstance.destroy();
      } catch (_) {}
    }
    window.__westlifeCommentInstance = null;
    if (typeof jQuery !== "undefined") {
      jQuery(document).off("click.commentScroll");
    }
  }

  if (window.WestlifeApp && typeof window.WestlifeApp.register === "function") {
    window.WestlifeApp.register({
      name: "comments",
      match(context) {
        const root =
          context && context.nodeType === 1 ? context : document;
        return !!root.querySelector("#commentform, .comments-area");
      },
      init() {
        initCommentModule();
      },
      destroy() {
        destroyCommentModule();
      },
    });
  } else {
    // 初始化：防止重复实例；若已有实例尝试销毁
    document.addEventListener("DOMContentLoaded", () => {
      initCommentModule();
    });
  }
    // ===== 从 single.js 迁移：友好访客模式（资料条/头像/验证码） =====
    (function initGuestProfile() {
      const form = document.querySelector("#commentform");
      const respond = document.querySelector("#respond, .comment-respond");
      if (!respond || !form) return;

      const inputAuthor = form.querySelector('#author, input[name="author"]');
      const inputEmail = form.querySelector('#email, input[name="email"]');
      const inputUrl = form.querySelector(
        '#url, input[name="url"], input[name="website"]'
      );
      if (!inputAuthor || !inputEmail) return;

      const LS = {
        name: "guest_comment_author",
        email: "guest_comment_email",
        url: "guest_comment_url",
        remember: "guest_comment_remember",
        profiles: "guest_comment_profiles",
        lastEmail: "guest_comment_last_email",
        seen: "guest_comment_seen",
        lastSeenAt: "guest_comment_last_seen",
        counts: "guest_comment_counts",
      };

      const getCookieMap = () => {
        const map = {};
        document.cookie.split(/;\s*/).forEach((pair) => {
          const [k, v] = pair.split("=");
          if (!k) return;
          map[decodeURIComponent(k)] = decodeURIComponent(v || "");
        });
        return map;
      };

      function loadProfile() {
        // 使用统一的存储管理器读取（优先 Cookie，LocalStorage 作为备用）
        if (window.CommentStorageManager) {
          const info = window.CommentStorageManager.loadGuestInfo();
          return info;
        }

        // 降级：使用旧方法
        let name = localStorage.getItem(LS.name) || "";
        let email = localStorage.getItem(LS.email) || "";
        let url = localStorage.getItem(LS.url) || "";
        if (!name || !email || !url) {
          const cookies = getCookieMap();
          const find = (p) => {
            const key = Object.keys(cookies).find((k) => k.startsWith(p));
            return key ? cookies[key] : "";
          };
          name = name || find("comment_author_");
          email = email || find("comment_author_email_");
          url = url || find("comment_author_url_");
        }
        return { name, email, url };
      }

      function saveProfile({ name, email, url }) {
        // 使用统一的存储管理器保存
        if (window.CommentStorageManager) {
          const remember = window.CommentStorageManager.isRememberEnabled();
          window.CommentStorageManager.saveGuestInfo(
            name,
            email,
            url,
            remember
          );
          return;
        }

        // 降级：使用旧方法（仅 LocalStorage）
        if (typeof name === "string")
          localStorage.setItem(LS.name, String(name).trim());
        if (typeof email === "string")
          localStorage.setItem(LS.email, String(email).trim());
        if (typeof url === "string")
          localStorage.setItem(LS.url, String(url).trim());
      }

      function clearProfile() {
        // 使用统一的存储管理器清除
        if (window.CommentStorageManager) {
          window.CommentStorageManager.clearGuestInfo();
        }

        // 降级：使用旧方法
        [LS.name, LS.email, LS.url, LS.remember].forEach((k) =>
          localStorage.removeItem(k)
        );
        const cfg = (window.westlifeSettings &&
          window.westlifeSettings.commentCookieScopes) || {
          domains: [],
          paths: [],
        };
        const domains = [
          ...new Set([
            location.hostname,
            `.${location.hostname}`,
            ...(Array.isArray(cfg.domains) ? cfg.domains : []),
          ]),
        ];
        const paths = [
          ...new Set([
            "/",
            location.pathname,
            ...(Array.isArray(cfg.paths) ? cfg.paths : []),
          ]),
        ];
        document.cookie.split(/;\s*/).forEach((pair) => {
          const [k] = pair.split("=");
          if (!k) return;
          if (
            k.startsWith("comment_author_") ||
            k.startsWith("comment_author_email_") ||
            k.startsWith("comment_author_url_")
          ) {
            domains.forEach((d) =>
              paths.forEach(
                (p) =>
                  (document.cookie =
                    encodeURIComponent(k) +
                    "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=" +
                    p +
                    (d ? "; domain=" + d : ""))
              )
            );
          }
        });

        // 修复：清除头像的懒加载残留
        const img = bar?.querySelector(".guest-avatar");
        const fallback = bar?.querySelector(".guest-avatar-fallback");
        const wrap = bar?.querySelector(".guest-avatar-wrap");
        if (img) {
          img.removeAttribute("src"); // 移除 src 属性
          img.removeAttribute("data-src"); // 移除懒加载属性
          img.removeAttribute("data-loaded"); // 移除加载标记
          img.classList.remove("is-loaded"); // 移除加载状态类
          img.alt = "访客头像";
          img.onload = null; // 清除事件
          img.onerror = null;
        }
        if (wrap) {
          wrap.classList.remove("has-avatar"); // 移除头像状态类
        }
        if (fallback) {
          fallback.style.display = "flex"; // 显示占位图标
        }
      }
      const maskEmail = (e) => {
        if (!e) return "";
        const [u, d] = e.split("@");
        if (!d) return e;
        const u2 = u.length <= 2 ? u[0] + "*" : u.slice(0, 2) + "***";
        return `${u2}@${d}`;
      };
      const urlHost = (u) => {
        try {
          return u ? new URL(u).hostname : "";
        } catch (_) {
          return u || "";
        }
      };
      const escapeHtml = (s) =>
        String(s)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      const pickRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];
      // 工具：日期格式化
      const pad2 = (n) => String(n).padStart(2, "0");
      const dateToYMD = (date = new Date()) =>
        `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
          date.getDate()
        )}`;
      const dateToMD = (date = new Date()) =>
        `${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
      const inRange = (ymd, start, end) => ymd >= start && ymd <= end; // 依赖 YYYY-MM-DD 格式的字典序

      // 节假日配置（可根据年份维护）；支持三类：固定具体日期/日期区间、每年固定月日（公历）、调休工作日
      const holidayConfig = {
        // 具体日期或区间（示例为 2025，可按需在主题里维护）
        holidays: [
          {
            name: "元旦",
            dates: ["2025-01-01"],
            phrases: [
              "元旦快乐",
              "新年快乐",
              "新的一年顺顺利利",
              "愿你满载喜悦开启新篇章",
            ],
          },
          {
            name: "劳动节",
            range: ["2025-05-01", "2025-05-05"],
            phrases: [
              "五一快乐",
              "劳有所获，心有所安",
              "向每一份热爱致敬",
              "愿你假期惬意",
            ],
          },
          {
            name: "国庆节",
            range: ["2025-10-01", "2025-10-07"],
            phrases: [
              "国庆快乐",
              "共祝祖国繁荣昌盛",
              "阖家团圆，出行顺利",
              "愿你假期愉快",
            ],
          },
          // 如需精准春节/清明/端午/中秋等，请在此按当年实际放假安排补充 date 或 range
        ],
        // 每年固定月日（公历）
        specialDays: {
          "02-14": {
            name: "情人节",
            phrases: ["情人节快乐", "愿爱与温暖常伴", "与喜欢的一切双向奔赴"],
          },
          "03-08": {
            name: "女神节",
            phrases: ["女神节快乐", "致敬每份独立与美好", "愿你自信闪耀"],
          },
          "06-01": {
            name: "儿童节",
            phrases: ["儿童节快乐", "愿童心永驻", "保持热爱，奔赴山海"],
          },
          "09-10": {
            name: "教师节",
            phrases: ["教师节快乐", "致敬每一束微光", "桃李芬芳，春晖四方"],
          },
        },
        // 调休工作日（即使是周末也按工作日文案处理）
        workMakeup: [
          // 示例："2025-10-12"
        ],
      };

      const isWorkMakeup = (date = new Date()) =>
        holidayConfig.workMakeup.includes(dateToYMD(date));

      const isWeekend = (date = new Date()) => {
        const d = date.getDay();
        const weekend = d === 0 || d === 6; // 周日/周六
        // 若为调休工作日，则不视作周末
        if (weekend && isWorkMakeup(date)) return false;
        return weekend;
      };

      // 返回当天节假日信息（优先具体日期/区间，其次每年固定月日），未命中返回 null
      function getHolidayInfo(date = new Date()) {
        const ymd = dateToYMD(date);
        // 1) 命中具体日期/区间
        for (const h of holidayConfig.holidays) {
          if (Array.isArray(h.dates) && h.dates.includes(ymd))
            return { name: h.name, phrases: h.phrases };
          if (Array.isArray(h.range) && inRange(ymd, h.range[0], h.range[1]))
            return { name: h.name, phrases: h.phrases };
        }
        // 2) 命中每年固定月日（公历）
        const md = dateToMD(date);
        if (holidayConfig.specialDays[md]) return holidayConfig.specialDays[md];
        return null;
      }
      const weightedPick = (pairs) => {
        const total = pairs.reduce((s, [, w]) => s + (w || 0), 0);
        if (total <= 0) return pairs[0]?.[0];
        let r = Math.random() * total;
        for (const [val, w] of pairs) {
          r -= w || 0;
          if (r <= 0) return val;
        }
        return pairs[pairs.length - 1]?.[0];
      };
      const daysSince = (ts) => {
        if (!Number.isFinite(ts)) return Infinity;
        const diff = Date.now() - ts;
        return diff / (24 * 60 * 60 * 1000);
      };
      const greetingConfig = {
        prefixes: ["Hi", "Hello", "Hey", "嗨", "哈喽", "您好"],
        weekend: ["周末愉快", "周末快乐"],
        workday: ["工作顺利", "一切顺利", "心情愉快"],
        night: ["注意休息", "早点休息", "劳逸结合"],
        thanks: ["很高兴再次见到你", "感谢你的持续关注", "感谢你的互动"],
        firstTime: ["期待你的第一条评论", "欢迎留下你的第一条评论"],
        avatarPraise: ["头像很酷", "头像不错"],
      };
      function isReturningVisitor() {
        try {
          if (localStorage.getItem(LS.seen) === "1") return true;
          if (localStorage.getItem(LS.lastEmail)) return true;
          const listRaw = localStorage.getItem(LS.profiles);
          if (listRaw) {
            const arr = JSON.parse(listRaw || "[]");
            if (Array.isArray(arr) && arr.length > 0) return true;
          }
        } catch (_) {}
        // 回退到 Cookie
        const cookies = (function () {
          const map = {};
          document.cookie.split(/;\s*/).forEach((pair) => {
            const [k, v] = pair.split("=");
            if (!k) return;
            map[decodeURIComponent(k)] = decodeURIComponent(v || "");
          });
          return map;
        })();
        return Object.keys(cookies).some((k) =>
          k.startsWith("comment_author_email_")
        );
      }
      function shouldShowWelcomeBack() {
        try {
          const last = parseInt(localStorage.getItem(LS.lastSeenAt) || "", 10);
          const d = daysSince(last);
          if (!(d > 1)) return false; // 必须超过 1 天
          const chance = d > 7 ? 0.6 : 0.35; // 大于 7 天提高概率
          return Math.random() < chance;
        } catch (_) {
          return false;
        }
      }
      // 基于当前时间的问候语
      function getGreeting(date = new Date()) {
        const h = date.getHours();
        if (h < 5) return "夜深了"; // 0-4
        if (h < 9) return "早上好"; // 5-8
        if (h < 12) return "上午好"; // 9-11
        if (h < 14) return "中午好"; // 12-13
        if (h < 18) return "下午好"; // 14-17
        if (h < 22) return "晚上好"; // 18-21
        return "夜深了"; // 22-23
      }
      function getCommentCountByEmail(email) {
        if (!email) return 0;
        try {
          const map = JSON.parse(localStorage.getItem(LS.counts) || "{}");
          if (!map || typeof map !== "object" || Array.isArray(map)) return 0;
          return Number(map[email.toLowerCase()]) || 0;
        } catch (_) {
          return 0;
        }
      }

      const authorFieldWrap =
        inputAuthor.closest("p, .form-field, .field") || form;
      const bar = document.createElement("div");
      bar.className = "guest-profile-bar";
      bar.innerHTML = `
        <div class="guest-profile-content">
          <div class="guest-avatar-wrap">
            <span class="guest-avatar-fallback" aria-hidden="true">
              ${window.WestlifeIcons.icon("user")}
            </span>
            <img class="guest-avatar" alt="访客头像" />
          </div>
          <span class="guest-profile-text"></span>
          <div class="guest-profile-actions">
            <select class="guest-profile-select" aria-label="常用资料"></select>
            <div class="guest-profile-menu" role="menu" aria-label="常用资料列表" hidden></div>
            <button type="button" class="guest-profile-save icon-btn" aria-label="保存为常用" title="保存为常用">
              ${window.WestlifeIcons.icon("bookmark")}
              <span class="sr-only">保存为常用</span>
            </button>
            <button type="button" class="guest-profile-edit icon-btn" aria-label="编辑资料" title="编辑资料">
              ${window.WestlifeIcons.icon("user-pen")}
              <span class="sr-only">编辑资料</span>
            </button>
            <button type="button" class="guest-profile-clear icon-btn" aria-label="清除资料" title="清除资料">
              ${window.WestlifeIcons.icon("trash-2")}
              <span class="sr-only">清除资料</span>
            </button>
          </div>
        </div>`;

      async function updateAvatar() {
        const img = bar.querySelector(".guest-avatar");
        const fallback = bar.querySelector(".guest-avatar-fallback");
        const wrap = bar.querySelector(".guest-avatar-wrap");
        if (!img) return;
        const emailCurrent = (inputEmail?.value || "").trim();
        const emailStorage = loadProfile().email || "";
        const email = emailCurrent || emailStorage;
        // 默认显示占位，待真实头像加载成功后再切换
        if (fallback) fallback.style.display = "flex";
        if (!email) {
          // 清理所有头像状态
          img.removeAttribute("src");
          img.removeAttribute("data-src");
          img.removeAttribute("data-loaded");
          img.classList.remove("is-loaded");
          img.alt = "访客头像";
          img.onload = null;
          img.onerror = null;
          if (wrap) wrap.classList.remove("has-avatar");
          if (fallback) fallback.style.display = "flex";
          return;
        }
        try {
          const ajaxUrl =
            (window.westlifeComment && window.westlifeComment.ajaxUrl) ||
            (window.westlifeSettings &&
              (westlifeSettings.ajaxUrl || westlifeSettings.ajaxurl)) ||
            window.ajaxurl ||
            "/wp-admin/admin-ajax.php";
          const nonce =
            // 通用 AJAX nonce（用于 inc-ajax.php 的接口，如头像获取等）
            (window.westlifeComment && window.westlifeComment.ajaxNonce) ||
            (window.westlifeAjax && window.westlifeAjax.nonce) ||
            (window.westlifeComment && window.westlifeComment.nonce) ||
            "";
          const form = new FormData();
          form.append("action", "westlife_get_avatar_url");
          form.append("email", email);
          form.append("size", "40");
          form.append("nonce", nonce);
          const resp = await fetch(ajaxUrl, { method: "POST", body: form });
          const data = await resp.json();
          if (data && data.success && data.data && data.data.url) {
            // 等图片真正加载成功后再隐藏占位
            img.onload = () => {
              img.classList.add("is-loaded");
              if (wrap) wrap.classList.add("has-avatar");
              if (fallback) fallback.style.display = "none";
            };
            img.onerror = () => {
              img.classList.remove("is-loaded");
              if (wrap) wrap.classList.remove("has-avatar");
              img.removeAttribute("src");
              if (fallback) fallback.style.display = "flex";
            };
            img.src = data.data.url;
            img.alt = `头像：${email}`;
            // 若命中缓存（complete=true 且 naturalWidth>0）立即应用
            if (img.complete && img.naturalWidth > 0) {
              img.classList.add("is-loaded");
              if (wrap) wrap.classList.add("has-avatar");
              if (fallback) fallback.style.display = "none";
            }
          } else {
            // 失败时不报错，仅清空，避免 404
            img.removeAttribute("src");
            img.alt = "访客头像";

            if (fallback) fallback.style.display = "flex";
          }
        } catch (e) {
          img.removeAttribute("src");
          img.alt = "访客头像";

          if (fallback) fallback.style.display = "flex";
        }
      }
      const profileSlot = document.querySelector(".comment-profile-slot");
      if (profileSlot) {
        profileSlot.appendChild(bar);
      } else {
        authorFieldWrap.parentElement?.insertBefore(bar, authorFieldWrap);
      }

      function loadProfiles() {
        try {
          const raw = localStorage.getItem(LS.profiles);
          const arr = raw ? JSON.parse(raw) : [];
          return Array.isArray(arr) ? arr : [];
        } catch (_) {
          return [];
        }
      }
      function saveProfiles(arr) {
        try {
          localStorage.setItem(LS.profiles, JSON.stringify(arr || []));
        } catch (_) {}
      }
      // 渲染下拉选项
      function renderProfileSelect(list, activeEmail) {
        const sel = bar.querySelector(".guest-profile-select");
        if (!sel) return;
        const arr = Array.isArray(list) ? list : loadProfiles();
        const aEmail = (activeEmail || "").toLowerCase();
        const opt = [
          '<option value="">常用资料</option>',
          ...arr.map((p) => {
            const email = (p.email || "").trim();
            const name = (p.name || "").trim() || "未命名";
            const label = `${name} · ${maskEmail(email)}`;
            const selAttr =
              aEmail && email.toLowerCase() === aEmail ? " selected" : "";
            return `<option value="${email.replace(
              /"/g,
              "&quot;"
            )}"${selAttr}>${label}</option>`;
          }),
        ];
        sel.innerHTML = opt.join("");
      }
      // 渲染自定义菜单
      function renderProfileMenu(list) {
        const menu = bar.querySelector(".guest-profile-menu");
        if (!menu) return;
        const arr = Array.isArray(list) ? list : loadProfiles();
        if (!arr.length) {
          menu.innerHTML = '<div class="menu-empty">暂无常用资料</div>';
          return;
        }
        menu.innerHTML = arr
          .map((p) => {
            const email = (p.email || "").trim();
            const name = (p.name || "").trim() || "未命名";
            const url = (p.url || "").trim();
            const meta = [maskEmail(email), urlHost(url)]
              .filter(Boolean)
              .join(" · ");
            return (
              `<div class="profile-row" role="menuitem" tabindex="0" data-email="${email.replace(
                /"/g,
                "&quot;"
              )}">` +
              `<div class="profile-info"><span class="profile-name">${name}</span><span class="profile-meta">${meta}</span></div>` +
              `<button type="button" class="profile-del" data-email="${email.replace(
                /"/g,
                "&quot;"
              )}" aria-label="删除该资料" title="删除">` +
              `${window.WestlifeIcons.icon("trash-2")}</button>` +
              `</div>`
            );
          })
          .join("");

        // 不在这里绑定事件，移到openMenu中统一绑定
      }

      // 为删除按钮添加事件监听
      function attachDeleteHandlers() {
        const menu = bar.querySelector(".guest-profile-menu");
        if (!menu) return;

        // 移除旧的事件监听器，避免重复绑定
        menu.querySelectorAll(".profile-del").forEach((btn) => {
          const newBtn = btn.cloneNode(true);
          btn.parentNode.replaceChild(newBtn, btn);
        });

        // 重新绑定事件
        menu.querySelectorAll(".profile-del").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.stopPropagation(); // 阻止冒泡，避免触发选择
            const email = btn.getAttribute("data-email");
            if (!email) return;
            showDeleteConfirm(email);
          });
        });
      }

      // 显示删除确认弹窗
      function showDeleteConfirm(email) {
        // 先关闭下拉菜单
        const menu = bar.querySelector(".guest-profile-menu");
        const sel = bar.querySelector(".guest-profile-select");
        if (menu) {
          menu.classList.remove("open");
          menu.hidden = true;
        }
        if (sel) {
          sel.setAttribute("aria-expanded", "false");
        }

        const list = loadProfiles();
        const profile = list.find((p) => p.email === email);
        if (!profile) return;

        const name = profile.name || "未命名";
        const maskedEmail = maskEmail(email);

        // 创建弹窗
        const modal = document.createElement("div");
        modal.className = "delete-profile-confirm";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.innerHTML = `
          <div class="delete-profile-confirm-inner">
            <h3 class="delete-profile-title">删除常用资料</h3>
            <p class="delete-profile-desc">确定要删除 <strong>${name}</strong> (${maskedEmail}) 的资料吗？此操作无法撤销。</p>
            <div class="delete-profile-actions">
              <button type="button" class="btn-delete-cancel">取消</button>
              <button type="button" class="btn-delete-confirm">确认删除</button>
            </div>
          </div>
        `;

        document.body.appendChild(modal);

        // 取消按钮
        modal.querySelector(".btn-delete-cancel").addEventListener(
          "click",
          (e) => {
            e.stopPropagation(); // 阻止冒泡
            modal.setAttribute("aria-hidden", "true");
            setTimeout(() => modal.remove(), 300);
          },
          { once: true }
        ); // 只执行一次

        // 确认删除按钮
        modal.querySelector(".btn-delete-confirm").addEventListener(
          "click",
          (e) => {
            e.stopPropagation(); // 阻止冒泡
            deleteProfile(email);
            modal.setAttribute("aria-hidden", "true");
            setTimeout(() => modal.remove(), 300);
          },
          { once: true }
        ); // 只执行一次

        // 点击背景关闭
        modal.addEventListener("click", (e) => {
          if (e.target === modal) {
            e.stopPropagation(); // 阻止冒泡
            modal.setAttribute("aria-hidden", "true");
            setTimeout(() => modal.remove(), 300);
          }
        });

        // ESC 键关闭
        const handleEsc = (e) => {
          if (e.key === "Escape") {
            modal.setAttribute("aria-hidden", "true");
            setTimeout(() => modal.remove(), 300);
            document.removeEventListener("keydown", handleEsc);
          }
        };
        document.addEventListener("keydown", handleEsc);
      }

      // 删除资料
      function deleteProfile(email) {
        if (!email) return;

        // 1. 从资料列表中删除
        let list = loadProfiles();
        list = list.filter((p) => p.email !== email);
        saveProfiles(list);

        // 2. 如果删除的是上次使用的邮箱，清除记录
        try {
          const lastEmail = localStorage.getItem(LS.lastEmail);
          if (lastEmail && lastEmail.toLowerCase() === email.toLowerCase()) {
            localStorage.removeItem(LS.lastEmail);
          }
        } catch (e) {
          console.error("[删除资料] 清除 lastEmail 失败:", e);
        }

        // 3. 如果删除的是当前使用的资料，完整清理
        const currentEmail = (inputEmail?.value || "").trim();
        if (currentEmail.toLowerCase() === email.toLowerCase()) {
          // 清空表单
          if (inputAuthor) inputAuthor.value = "";
          if (inputEmail) inputEmail.value = "";
          if (inputUrl) inputUrl.value = "";

          // 清理 localStorage
          try {
            localStorage.removeItem(LS.name);
            localStorage.removeItem(LS.email);
            localStorage.removeItem(LS.url);
            localStorage.removeItem(LS.remember);
          } catch (e) {
            console.error("[删除资料] 清除 localStorage 失败:", e);
          }

          // 清理 Cookie
          try {
            const authorCookie = CookieUtils.getWordPressCookieName("author");
            const emailCookie = CookieUtils.getWordPressCookieName("email");
            const urlCookie = CookieUtils.getWordPressCookieName("url");

            if (authorCookie) CookieUtils.remove(authorCookie);
            if (emailCookie) CookieUtils.remove(emailCookie);
            if (urlCookie) CookieUtils.remove(urlCookie);
          } catch (e) {
            console.error("[删除资料] 清除 Cookie 失败:", e);
          }

          // 清理头像状态
          const img = bar?.querySelector(".guest-avatar");
          const fallback = bar?.querySelector(".guest-avatar-fallback");
          const wrap = bar?.querySelector(".guest-avatar-wrap");
          if (img) {
            img.removeAttribute("src");
            img.removeAttribute("data-src");
            img.removeAttribute("data-loaded");
            img.classList.remove("is-loaded");
            img.alt = "访客头像";
            img.onload = null;
            img.onerror = null;
          }
          if (wrap) {
            wrap.classList.remove("has-avatar");
          }
          if (fallback) {
            fallback.style.display = "flex";
          }

          // 显示字段（因为清空了表单）
          if (typeof setFieldsVisible === "function") {
            setFieldsVisible(true);
          }
        }

        // 4. 刷新UI
        renderProfileSelect(list);
        renderProfileMenu(list);
        refreshBar();
        updateAvatar();
      }

      // 刷新顶部资料条文案（智能问候 + 回访 + 个性化）
      function refreshBar() {
        const text = bar.querySelector(".guest-profile-text");
        if (!text) return;
        const nameIn = (inputAuthor?.value || "").trim();
        const emailIn = (inputEmail?.value || "").trim();
        const urlIn = (inputUrl?.value || "").trim();
        const { name: nameSt, email: emailSt, url: urlSt } = loadProfile();
        const name = nameIn || nameSt;
        const email = emailIn || emailSt;
        const url = urlIn || urlSt;
        const greeting = getGreeting();
        const returning = isReturningVisitor();
        const displayName = name || "朋友";
        const hasAvatar = !!bar.querySelector(".guest-avatar[src]");
        const count = getCommentCountByEmail(email);

        const basePrefixes = greetingConfig.prefixes;
        let prefix = pickRandom(basePrefixes);
        if (returning && shouldShowWelcomeBack()) {
          // 用权重方式降低“欢迎回来”出现频率
          prefix = weightedPick([
            ["欢迎回来", 1],
            [pickRandom(basePrefixes), 3],
          ]);
        }
        const isNight = greeting === "夜深了";
        let dayPhrase = "";
        if (isNight) {
          dayPhrase = pickRandom(greetingConfig.night);
        } else {
          const holiday = getHolidayInfo();
          if (
            holiday &&
            Array.isArray(holiday.phrases) &&
            holiday.phrases.length
          ) {
            dayPhrase = pickRandom(holiday.phrases);
          } else if (isWeekend()) {
            dayPhrase = pickRandom(greetingConfig.weekend);
          } else {
            dayPhrase = pickRandom(greetingConfig.workday);
          }
        }

        // 个性化尾句（基于是否评论过/是否有头像）
        const thanksPool = greetingConfig.thanks;
        const firstPool = greetingConfig.firstTime;
        const avatarPool = greetingConfig.avatarPraise;
        let tail = count > 0 ? pickRandom(thanksPool) : pickRandom(firstPool);
        if (hasAvatar && count === 0) tail = pickRandom([tail, ...avatarPool]);

        const nameHtml = `<span class="guest-name">${escapeHtml(
          displayName
        )}</span>`;
        let headline = "";
        if (prefix === "欢迎回来") {
          if (isNight)
            headline = `欢迎回来，${nameHtml}。${greeting}，${dayPhrase}～`;
          else
            headline = `欢迎回来，${nameHtml}。${greeting}，${dayPhrase}，${tail}～`;
        } else {
          if (isNight)
            headline = `${prefix} ${nameHtml}，${greeting}，${dayPhrase}～`;
          else
            headline = `${prefix} ${nameHtml}，${greeting}，${dayPhrase}，${tail}～`;
        }
        text.innerHTML = headline;
        // 悬浮提示：显示评论次数与感谢语
        text.title =
          count > 0
            ? `你已在本站评论 ${count} 次，感谢你的互动与支持！`
            : "还没有评论记录，期待你的第一条评论。";
      }
      // 外部刷新入口（评论提交后可触发）
      document.addEventListener("westlife:guest-profile-refresh", refreshBar);
      // 将当前输入保存/更新到常用资料
      function addOrUpdateCurrentProfile() {
        const nameVal = (inputAuthor.value || "").trim();
        const emailVal = (inputEmail.value || "").trim();
        const urlVal = inputUrl ? (inputUrl.value || "").trim() : "";
        if (!nameVal || !emailVal) return;
        const list = loadProfiles();
        const idx = list.findIndex(
          (x) => (x.email || "").toLowerCase() === emailVal.toLowerCase()
        );
        if (idx >= 0) {
          list[idx] = {
            ...list[idx],
            name: nameVal,
            email: emailVal,
            url: urlVal,
          };
        } else {
          list.push({ name: nameVal, email: emailVal, url: urlVal });
        }
        saveProfiles(list);
        renderProfileSelect(list, emailVal);
        renderProfileMenu(list);
      }
      (function () {
        const sel = bar.querySelector(".guest-profile-select");
        const menu = bar.querySelector(".guest-profile-menu");
        if (!sel || !menu) return;
        const closeMenu = () => {
          if (menu.classList.contains("open")) {
            menu.classList.remove("open");
          }
          menu.hidden = true;
          sel.setAttribute("aria-expanded", "false");
          document.removeEventListener("click", onDocClick, true);
        };
        const onDocClick = (ev) => {
          if (!menu.contains(ev.target) && !sel.contains(ev.target)) {
            closeMenu();
          }
        };
        const openMenu = () => {
          renderProfileMenu();
          attachDeleteHandlers(); // 重新绑定删除按钮事件
          menu.hidden = false;
          menu.classList.add("open");
          sel.setAttribute("aria-expanded", "true");
          document.addEventListener("click", onDocClick, true);
        };
        // 用自定义菜单替代原生下拉：阻止原生弹出
        sel.setAttribute("aria-haspopup", "menu");
        sel.setAttribute("aria-expanded", "false");
        sel.addEventListener("mousedown", (e) => {
          e.preventDefault();
          sel.blur();
          if (menu.hidden) openMenu();
          else closeMenu();
        });
        sel.addEventListener("keydown", (e) => {
          if (["Enter", " ", "Space", "ArrowDown"].includes(e.key)) {
            e.preventDefault();
            if (menu.hidden) openMenu();
            else closeMenu();
          }
          if (e.key === "Escape") {
            if (!menu.hidden) {
              e.preventDefault();
              closeMenu();
            }
          }
        });
        // ESC 关闭菜单（全局）
        menu.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            closeMenu();
            sel.focus();
          }
        });
        // 选择与删除事件委托
        menu.addEventListener("click", (e) => {
          const delBtn = e.target.closest(".profile-del");
          const row = e.target.closest(".profile-row");
          if (delBtn) {
            const email = delBtn.getAttribute("data-email") || "";
            if (!email) return;
            const list = (function () {
              try {
                const raw = localStorage.getItem(LS.profiles);
                const arr = raw ? JSON.parse(raw) : [];
                return Array.isArray(arr) ? arr : [];
              } catch (_) {
                return [];
              }
            })();
            const next = list.filter(
              (x) => (x.email || "").toLowerCase() !== email.toLowerCase()
            );
            saveProfiles(next);
            renderProfileSelect(next);
            renderProfileMenu(next);
            // 若删除的是当前或列表为空，清空并回到未保存
            const curr = loadProfile();
            const inEmail = (inputEmail?.value || "").trim();
            const matchCurrent =
              (curr.email || "").toLowerCase() === email.toLowerCase();
            const matchInput =
              (inEmail || "").toLowerCase() === email.toLowerCase();
            if (next.length === 0 || matchCurrent || matchInput) {
              if (inputAuthor) inputAuthor.value = "";
              if (inputEmail) inputEmail.value = "";
              if (inputUrl) inputUrl.value = "";
              clearProfile();
              try {
                localStorage.removeItem(LS.lastEmail);
              } catch (_) {}
              if (typeof syncRemember === "function") syncRemember(true);
              refreshBar();
              setFieldsVisible(true);
              updateAvatar();
            }
            if (window.WestlifeUtils?.showMessage)
              window.WestlifeUtils.showMessage("已删除该常用资料", "success");
            return;
          }
          if (row && !delBtn) {
            const email = row.getAttribute("data-email") || "";
            if (!email) return;
            const list = (function () {
              try {
                const raw = localStorage.getItem(LS.profiles);
                const arr = raw ? JSON.parse(raw) : [];
                return Array.isArray(arr) ? arr : [];
              } catch (_) {
                return [];
              }
            })();
            const p = list.find(
              (x) => (x.email || "").toLowerCase() === email.toLowerCase()
            );
            if (!p) return;
            inputAuthor.value = p.name || "";
            inputEmail.value = p.email || "";
            if (inputUrl) inputUrl.value = p.url || "";
            saveProfile(p);
            refreshBar();
            setFieldsVisible(false);
            updateAvatar();
            // 记录上次使用的邮箱
            try {
              if (p.email) localStorage.setItem(LS.lastEmail, p.email);
            } catch (_) {}
            closeMenu();
          }
        });
      })();

      const authorWrap =
        inputAuthor.closest(".comment-form-author, p, .form-field, .field") ||
        inputAuthor.parentElement;
      const emailWrap =
        inputEmail.closest(".comment-form-email, p, .form-field, .field") ||
        inputEmail.parentElement;
      const urlWrap = inputUrl
        ? inputUrl.closest(".comment-form-url, p, .form-field, .field") ||
          inputUrl.parentElement
        : null;
      function setFieldsVisible(visible) {
        [authorWrap, emailWrap, urlWrap]
          .filter(Boolean)
          .forEach((el) =>
            el.classList.toggle("guest-fields-hidden", !visible)
          );
        // 如果三个输入都隐藏，则同时让容器也不占空间（兼容不支持 :has 的浏览器）
        const infoWrap = form.querySelector(".comment-form-info");
        if (infoWrap) {
          const anyVisible = !!infoWrap.querySelector(
            ".input-wrapper:not(.guest-fields-hidden)"
          );
          infoWrap.classList.toggle("all-guest-fields-hidden", !anyVisible);
        }
        // 同时处理 .inline-guest-fields 容器
        const guestFieldsContainer = form.querySelector(".inline-guest-fields");
        if (guestFieldsContainer) {
          const anyFieldVisible = !!guestFieldsContainer.querySelector(
            ".igf-field:not(.guest-fields-hidden)"
          );
          guestFieldsContainer.classList.toggle(
            "all-fields-hidden",
            !anyFieldVisible
          );
        }
        const editBtn = bar.querySelector(".guest-profile-edit");
        if (editBtn) {
          const label = visible ? "完成" : "编辑资料";
          editBtn.setAttribute("aria-label", label);
          editBtn.setAttribute("title", label);
          const sr = editBtn.querySelector(".sr-only");
          if (sr) sr.textContent = label;
        }
      }
      function highlightFields() {
        [inputAuthor, inputEmail, inputUrl].filter(Boolean).forEach((el) => {
          el.classList.add("guest-editing");
          setTimeout(() => el.classList.remove("guest-editing"), 2000);
        });
        inputAuthor.focus();
      }

      // 初始填充：优先当前档；若为空则使用“上次使用的常用资料”或第一个常用资料
      const profile = loadProfile();
      if (profile.name) inputAuthor.value ||= profile.name;
      if (profile.email) inputEmail.value ||= profile.email;
      if (inputUrl && profile.url) inputUrl.value ||= profile.url;

      if (!(inputAuthor.value && inputEmail.value)) {
        const list = (function () {
          try {
            const raw = localStorage.getItem(LS.profiles);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
          } catch (_) {
            return [];
          }
        })();
        const lastEmail = localStorage.getItem(LS.lastEmail) || "";
        let preferred = null;
        if (lastEmail) {
          preferred = list.find(
            (x) => (x.email || "").toLowerCase() === lastEmail.toLowerCase()
          );
        }
        if (!preferred) preferred = list.find((x) => x.name && x.email) || null;
        if (preferred) {
          if (!inputAuthor.value && preferred.name)
            inputAuthor.value = preferred.name;
          if (!inputEmail.value && preferred.email)
            inputEmail.value = preferred.email;
          if (inputUrl && !inputUrl.value && preferred.url)
            inputUrl.value = preferred.url;
        }
      }

      // 刷新欢迎语与头像
      refreshBar();
      updateAvatar();
      // 资料条初始化完成后，立即再做一次验证码评估（本地+异步）
      try {
        if (
          window.__westlifeCommentInstance &&
          typeof window.__westlifeCommentInstance.injectCaptcha === "function"
        ) {
          window.__westlifeCommentInstance.injectCaptcha({ skipAsync: true });
          setTimeout(() => window.__westlifeCommentInstance.injectCaptcha(), 0);
        }
      } catch (_) {}

      // 若已具备欢迎回来所需信息，则默认隐藏输入框
      (function () {
        const nameIn = (inputAuthor?.value || "").trim();
        const emailIn = (inputEmail?.value || "").trim();
        const { name: nameSt, email: emailSt } = loadProfile();
        const name = nameIn || nameSt;
        const email = emailIn || emailSt;
        if (name && email) setFieldsVisible(false);
        // 初始化时也同步一次容器隐藏状态（防止早期渲染闪烁空隙）
        const infoWrap = form.querySelector(".comment-form-info");
        if (infoWrap) {
          const anyVisible = !!infoWrap.querySelector(
            ".input-wrapper:not(.guest-fields-hidden)"
          );
          infoWrap.classList.toggle("all-guest-fields-hidden", !anyVisible);
        }
        // 同时处理 .inline-guest-fields 容器
        const guestFieldsContainer = form.querySelector(".inline-guest-fields");
        if (guestFieldsContainer) {
          const anyFieldVisible = !!guestFieldsContainer.querySelector(
            ".igf-field:not(.guest-fields-hidden)"
          );
          guestFieldsContainer.classList.toggle(
            "all-fields-hidden",
            !anyFieldVisible
          );
        }
      })();

      // 渲染资料下拉，若匹配“上次使用”则选中
      (function () {
        const list = (function () {
          try {
            const raw = localStorage.getItem(LS.profiles);
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
          } catch (_) {
            return [];
          }
        })();
        const activeEmail =
          (inputEmail.value || "").trim() ||
          localStorage.getItem(LS.lastEmail) ||
          "";
        renderProfileSelect(list, activeEmail);
        renderProfileMenu(list);
      })();
      // 标记已访问，用于“欢迎回来”判断
      try {
        localStorage.setItem(LS.seen, "1");
        localStorage.setItem(LS.lastSeenAt, String(Date.now()));
      } catch (_) {}

      const wpRemember = form.querySelector(
        '#wp-comment-cookies-consent, input[name="wp-comment-cookies-consent"]'
      );
      // 始终记住：强制打开记住状态并同步 WP 的 consent 字段（若存在）
      const syncRemember = (val) => {
        const v = val !== false; // 默认 true
        try {
          localStorage.setItem(LS.remember, v ? "1" : "0");
        } catch (_) {}
        if (wpRemember) {
          if (typeof wpRemember.checked !== "undefined") wpRemember.checked = v;
          if (typeof wpRemember.value !== "undefined")
            wpRemember.value = v ? "yes" : "no";
        }
      };
      syncRemember(true);

      // 轻量防抖工具
      function __wl_debounce(fn, wait) {
        let t;
        return function () {
          const ctx = this,
            args = arguments;
          clearTimeout(t);
          t = setTimeout(() => fn.apply(ctx, args), wait);
        };
      }
      const __wl_debouncedCaptchaReeval = __wl_debounce(() => {
        try {
          if (
            window.__westlifeCommentInstance &&
            typeof window.__westlifeCommentInstance.injectCaptcha === "function"
          ) {
            window.__westlifeCommentInstance.injectCaptcha({ skipAsync: true });
            setTimeout(
              () => window.__westlifeCommentInstance.injectCaptcha(),
              0
            );
          }
        } catch (_) {}
      }, 200);

      [inputAuthor, inputEmail, inputUrl].filter(Boolean).forEach((el) => {
        el.addEventListener("blur", () => {
          saveProfile({
            name: inputAuthor.value,
            email: inputEmail.value,
            url: inputUrl ? inputUrl.value : "",
          });
          refreshBar();
          if (el === inputEmail) {
            updateAvatar();
            // 邮箱变化后，重新判定是否需要验证码
            try {
              if (
                window.__westlifeCommentInstance &&
                typeof window.__westlifeCommentInstance.injectCaptcha ===
                  "function"
              ) {
                // 先快速基于本地计数判断，立即更新UI
                window.__westlifeCommentInstance.injectCaptcha({
                  skipAsync: true,
                });
                // 再异步拉取服务端真实计数，完成后可能再次更新UI
                setTimeout(
                  () => window.__westlifeCommentInstance.injectCaptcha(),
                  0
                );
              }
            } catch (_) {}
          }
        });
        if (el === inputEmail) {
          el.addEventListener("input", __wl_debouncedCaptchaReeval);
          el.addEventListener("change", __wl_debouncedCaptchaReeval);
        }
      });

      bar
        .querySelector(".guest-profile-edit")
        ?.addEventListener("click", () => {
          const hidden = authorWrap?.classList.contains("guest-fields-hidden");
          setFieldsVisible(Boolean(hidden));
          if (Boolean(hidden)) {
            highlightFields();
          } else {
            refreshBar();
          }
        });
      bar
        .querySelector(".guest-profile-save")
        ?.addEventListener("click", () => {
          const nameVal = (inputAuthor.value || "").trim();
          const emailVal = (inputEmail.value || "").trim();
          if (!nameVal || !emailVal) {
            setFieldsVisible(true);
            highlightFields();
            if (!nameVal) inputAuthor.focus();
            else inputEmail.focus();
            if (window.WestlifeUtils?.showMessage)
              window.WestlifeUtils.showMessage("请先填写昵称和邮箱", "warning");
            return;
          }
          const simpleEmail = /.+@.+\..+/;
          if (!simpleEmail.test(emailVal)) {
            setFieldsVisible(true);
            inputEmail.focus();
            if (window.WestlifeUtils?.showMessage)
              window.WestlifeUtils.showMessage("邮箱格式不正确", "warning");
            return;
          }
          addOrUpdateCurrentProfile();
          saveProfile({
            name: nameVal,
            email: emailVal,
            url: inputUrl ? (inputUrl.value || "").trim() : "",
          });
          // 记录上次使用的邮箱，便于跨页面记忆
          try {
            if (emailVal) localStorage.setItem(LS.lastEmail, emailVal);
          } catch (_) {}
          refreshBar();
          setFieldsVisible(false);
          updateAvatar();
          renderProfileSelect(undefined, emailVal);
          if (window.WestlifeUtils?.showMessage)
            window.WestlifeUtils.showMessage("已保存为常用资料", "success");
        });
      bar
        .querySelector(".guest-profile-select")
        ?.addEventListener("change", (e) => {
          const emailKey = e.target.value;
          if (!emailKey) return;
          const list = (function () {
            try {
              const raw = localStorage.getItem(LS.profiles);
              const arr = raw ? JSON.parse(raw) : [];
              return Array.isArray(arr) ? arr : [];
            } catch (_) {
              return [];
            }
          })();
          const p = list.find(
            (x) => (x.email || "").toLowerCase() === emailKey.toLowerCase()
          );
          if (!p) return;
          inputAuthor.value = p.name || "";
          inputEmail.value = p.email || "";
          if (inputUrl) inputUrl.value = p.url || "";
          saveProfile(p);
          refreshBar();
          setFieldsVisible(false);
          updateAvatar();
          // 记录上次使用的邮箱
          try {
            if (p.email) localStorage.setItem(LS.lastEmail, p.email);
          } catch (_) {}
        });
      // 取消独立“管理”按钮逻辑，已由下拉选择触发自定义菜单
      bar
        .querySelector(".guest-profile-clear")
        ?.addEventListener("click", () => {
          clearProfile();
          if (inputAuthor) inputAuthor.value = "";
          if (inputEmail) inputEmail.value = "";
          if (inputUrl) inputUrl.value = "";
          refreshBar();
          setFieldsVisible(true);
          updateAvatar();
        });

      // 验证码由 CommentHandler.injectCaptcha 统一管理，此处不再注入
    })();
  // 评论编辑功能
  if (typeof jQuery !== "undefined") {
    (function ($) {
      "use strict";

      $(document).on("click", ".comment-edit-link", function (e) {
        e.preventDefault();

        const $link = $(this);
        const $comment = $link.closest(".comment-item");
        const $content = $comment.find(".comment-content span").last();
        const commentId = $link.data("comment-id");
        const nonce = $link.data("nonce");

        const $editor = $(
          '<div class="comment-editor">' +
            '<textarea class="edit-comment-textarea">' +
            $content.text().trim() +
            "</textarea>" +
            '<div class="edit-comment-actions">' +
            '<button class="save-comment">保存</button>' +
            '<button class="cancel-edit">取消</button>' +
            "</div>" +
            "</div>"
        );

        $content.hide().after($editor);
        $link.hide();

        $editor.find(".cancel-edit").on("click", function () {
          $editor.remove();
          $content.show();
          $link.show();
        });

        $editor.find(".save-comment").on("click", function () {
          const $saveBtn = $(this);
          const newContent = $editor.find("textarea").val();

          $.ajax({
            url:
              (window.westlifeComment && window.westlifeComment.ajaxUrl) ||
              (window.westlifeSettings &&
                (westlifeSettings.ajaxUrl || westlifeSettings.ajaxurl)) ||
              window.ajaxurl,
            type: "POST",
            data: {
              action: "westlife_edit_comment",
              comment_id: commentId,
              content: newContent,
              nonce: nonce,
            },
            beforeSend: function () {
              $saveBtn.prop("disabled", true).text("保存中...");
            },
            success: function (response) {
              if (response.success) {
                $content.html(response.data.content).show();
                $editor.remove();
                $link.show();
              } else {
                console.error(response?.data?.message || "保存失败");
              }
            },
            error: function () {
              console.error("保存失败，请重试");
            },
            complete: function () {
              $saveBtn.prop("disabled", false).text("保存");
            },
          });
        });
      });
    })(jQuery);
  }
} // guard end
