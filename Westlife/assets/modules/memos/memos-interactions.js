/**
 * Memos 交互功能模块
 *
 * @package Westlife
 * @version 2.0.0
 * @description 点赞、评论、发布等交互功能
 */

// 防止重复加载
if (typeof window.MemosInteractionsMixin !== "undefined") {
  console.warn(
    "[Westlife][Memos] Duplicate memos-interactions.js load detected"
  );
} else {
  window.MemosInteractionsMixin = {
    /**
     * 绑定发布功能事件
     */
    bindPublishEvents() {
      const textarea = document.getElementById("memo-publish-textarea");
      const publishBtn = document.getElementById("memo-publish-btn");
      const charCount = document.getElementById("memo-char-count");

      if (!textarea || !publishBtn) return;

      // 字符计数
      textarea.addEventListener("input", () => {
        const length = textarea.value.length;
        if (charCount) {
          charCount.textContent = `${length}/500`;
          charCount.style.color = length > 500 ? "#ef4444" : "#6b7280";
        }
        publishBtn.disabled = length === 0 || length > 500;
      });

      // 发布按钮
      publishBtn.addEventListener("click", () => {
        const content = textarea.value.trim();
        if (content) {
          this.publishMemo(content);
        }
      });

      // Ctrl+Enter 快捷键
      textarea.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          const content = textarea.value.trim();
          if (content && content.length <= 500) {
            this.publishMemo(content);
          }
        }
      });
    },

    /**
     * 发布 Memo
     */
    async publishMemo(content) {
      const ajaxUrl =
        this.config.ajaxUrl ||
        this.config.ajax_url ||
        window.ajaxurl ||
        "/wp-admin/admin-ajax.php";
      const nonce = this.config.nonce || window.westlifeSettings?.nonce;

      try {
        const response = await fetch(ajaxUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            action: "memos_create",
            nonce: nonce,
            content: content,
          }),
        });

        const data = await response.json();

        if (data.success) {
          this.showMessage("发布成功！", "success");
          // 清空输入框
          const textarea = document.getElementById("memo-publish-textarea");
          const charCount = document.getElementById("memo-char-count");
          if (textarea) {
            textarea.value = "";
            if (charCount) charCount.textContent = "0/500";
          }
          // 刷新列表
          setTimeout(() => {
            this.loadMemos(true);
          }, 500);
        } else {
          this.showMessage(data.data || "发布失败", "error");
        }
      } catch (error) {
        console.error("发布失败:", error);
        this.showMessage("发布失败，请稍后重试", "error");
      }
    },

    /**
     * 点赞 Memo
     */
    async likeMemo(memoId, button) {
      const ajaxUrl =
        this.config.ajaxUrl ||
        this.config.ajax_url ||
        window.ajaxurl ||
        "/wp-admin/admin-ajax.php";
      const nonce = this.config.nonce || window.westlifeSettings?.nonce;

      try {
        const response = await fetch(ajaxUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            action: "memos_like",
            nonce: nonce,
            memo_id: memoId,
          }),
        });

        const data = await response.json();

        if (data.success) {
          const countSpan = button.querySelector(".like-count");
          if (countSpan) {
            countSpan.textContent = data.data.count || 0;
          }
          button.classList.add("liked");
          this.showMessage("点赞成功！", "success");
        } else {
          this.showMessage(data.data || "点赞失败", "error");
        }
      } catch (error) {
        console.error("点赞失败:", error);
        this.showMessage("点赞失败，请稍后重试", "error");
      }
    },

    /**
     * 切换评论区显示
     */
    toggleComments(memoId, button) {
      const commentsWrapper = document.getElementById(
        `memo-comments-${memoId}`
      );
      if (!commentsWrapper) return;

      const isVisible = commentsWrapper.style.display !== "none";
      const card = button.closest(".memo-card");
      const container = document.getElementById("memos-grid");
      const isMagazineLayout =
        container && container.getAttribute("data-layout") === "magazine";

      if (isVisible) {
        // 收起评论
        commentsWrapper.style.display = "none";
        button.classList.remove("active");
        button.title = "展开评论";

        if (isMagazineLayout && card) {
          card.classList.remove("expanded");
          setTimeout(() => this.applyMasonryLayout(), 350);
        }
      } else {
        // 展开评论
        commentsWrapper.style.display = "block";
        button.classList.add("active");
        button.title = "收起评论";

        if (isMagazineLayout && card) {
          card.classList.add("expanded");
          setTimeout(() => this.applyMasonryLayout(), 350);
        }

        // 加载评论系统
        this.loadCommentSystem(memoId);
      }
    },

    /**
     * 加载评论系统
     */
    loadCommentSystem(memoId) {
      const container = document.getElementById(`memo-comments-body-${memoId}`);
      if (!container || container.dataset.loaded === "true") return;

      const commentSystem = window.westlifeMemosCommentSystem || "none";
      const commentConfig = window.westlifeMemosCommentConfig || {};

      if (commentSystem === "twikoo" && commentConfig.envId) {
        if (typeof twikoo !== "undefined") {
          const commentPath = `/memos/${memoId}`;
          twikoo.init({
            envId: commentConfig.envId,
            el: `#memo-comments-body-${memoId}`,
            path: commentPath,
          });
          container.dataset.loaded = "true";
        }
      } else if (commentSystem === "waline" && commentConfig.serverURL) {
        if (typeof Waline !== "undefined") {
          const commentPath = `/memos/${memoId}`;
          Waline.init({
            el: `#memo-comments-body-${memoId}`,
            serverURL: commentConfig.serverURL,
            path: commentPath,
          });
          container.dataset.loaded = "true";
        }
      }
    },

    /**
     * 显示消息提示 - 统一使用主题通知系统
     */
    showMessage(message, type = "info", duration = 3000) {
      // 统一使用主题的通知系统 WestlifeUtils.showMessage
      if (
        window.WestlifeUtils &&
        typeof window.WestlifeUtils.showMessage === "function"
      ) {
        window.WestlifeUtils.showMessage(message, type, duration);
      } else {
        // 如果主题通知系统未加载，使用 console 提示
        console.warn("[Memos Interactions] 主题通知系统未加载:", message);
      }
    },

    /**
     * 加载点赞数（批量）
     */
    async loadBatchLikeCounts(memoIds) {
      const ajaxUrl =
        this.config.ajaxUrl ||
        this.config.ajax_url ||
        window.ajaxurl ||
        "/wp-admin/admin-ajax.php";
      const nonce = this.config.nonce || window.westlifeSettings?.nonce;

      try {
        const response = await fetch(ajaxUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            action: "get_batch_memo_likes",
            nonce: nonce,
            memo_ids: memoIds.join(","),
          }),
        });

        const data = await response.json();
        if (data.success && data.data) {
          Object.entries(data.data).forEach(([memoId, count]) => {
            const likeBtn = document.querySelector(
              `.like-btn[data-memo-id="${memoId}"]`
            );
            if (likeBtn) {
              const countSpan = likeBtn.querySelector(".like-count");
              if (countSpan) {
                countSpan.textContent = count || 0;
              }
            }
          });
        }
      } catch (error) {
        console.error("加载点赞数失败:", error);
      }
    },

    /**
     * 加载评论数
     */
    loadCommentCount(memoId, commentBtn) {
      const commentPath = `/memos/${memoId}`;
      const commentSystem = window.westlifeMemosCommentSystem || "none";

      if (commentSystem === "twikoo") {
        this.getTwikooCommentCount(commentPath, commentBtn);
      } else if (commentSystem === "waline") {
        this.getWalineCommentCount(commentPath, commentBtn);
      }
    },

    /**
     * 获取 Twikoo 评论数
     */
    getTwikooCommentCount(path, commentBtn) {
      if (typeof twikoo === "undefined") return;

      const cacheKey = `twikoo_count_${path}`;
      const cachedData = sessionStorage.getItem(cacheKey);

      if (cachedData) {
        const { count, timestamp } = JSON.parse(cachedData);
        if (Date.now() - timestamp < 300000) {
          this.updateCommentCount(commentBtn, count);
          return;
        }
      }

      twikoo
        .getCommentsCount({
          envId: window.westlifeMemosCommentConfig?.envId,
          urls: [path],
          includeReply: false,
        })
        .then((res) => {
          const count = res[0]?.count || 0;
          this.updateCommentCount(commentBtn, count);
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({ count, timestamp: Date.now() })
          );
        });
    },

    /**
     * 获取 Waline 评论数
     */
    getWalineCommentCount(path, commentBtn) {
      if (typeof Waline === "undefined") return;

      const serverURL = window.westlifeMemosCommentConfig?.serverURL;
      if (!serverURL) return;

      fetch(
        `${serverURL}/api/comment?path=${encodeURIComponent(path)}&type=count`
      )
        .then((res) => res.json())
        .then((data) => {
          const count = data.data || 0;
          this.updateCommentCount(commentBtn, count);
        })
        .catch((error) => {
          console.error("获取 Waline 评论数失败:", error);
        });
    },

    /**
     * 更新评论数显示
     */
    updateCommentCount(commentBtn, count) {
      const countSpan = commentBtn.querySelector(".comment-count");
      if (countSpan && count > 0) {
        countSpan.textContent = count;
        countSpan.style.display = "inline";
      }
    },
  };
}
