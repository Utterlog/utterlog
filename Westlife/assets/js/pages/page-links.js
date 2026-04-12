/**
 * 友情链接页交互脚本 - 重写版
 */
(function (window, document) {
  "use strict";

  let linksPageInitialized = false;

  // 初始化设置数据
  function initializeSettings() {
    const settingsEl = document.getElementById("westlife-settings");
    if (!settingsEl) {
      console.warn("友链设置数据元素未找到，使用默认配置");
      return {
        ajaxUrl: "/wp-admin/admin-ajax.php",
        nonce: "",
        allUrls: [],
        cachedResults: null,
      };
    }

    try {
      const settings = {
        ajaxUrl: settingsEl.dataset.ajaxUrl || "/wp-admin/admin-ajax.php",
        nonce: settingsEl.dataset.nonce || "",
        allUrls: settingsEl.dataset.allUrls
          ? JSON.parse(settingsEl.dataset.allUrls)
          : [],
        cachedResults: settingsEl.dataset.cachedResults
          ? JSON.parse(settingsEl.dataset.cachedResults)
          : null,
      };

      // 挂载到全局对象
      window.westlifeSettings = window.westlifeSettings || {};
      Object.assign(window.westlifeSettings, settings);

      return settings;
    } catch (error) {
      console.error("解析友链设置数据失败:", error);
      return {
        ajaxUrl: "/wp-admin/admin-ajax.php",
        nonce: "",
        allUrls: [],
        cachedResults: null,
      };
    }
  }

  // 工具函数
  const Utils = {
    toast(message, type = "info") {
      if (window.WestlifeUtils?.showMessage) {
        window.WestlifeUtils.showMessage(message, type);
        return;
      }

      const toast = document.createElement("div");
      toast.textContent = message;
      toast.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        background: ${
          type === "error"
            ? "#ef4444"
            : type === "success"
            ? "#10b981"
            : "#3b82f6"
        };
        color: white; padding: 12px 20px; border-radius: 6px;
        z-index: 9999; font-size: 14px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      `;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    },

    // 按钮加载状态管理
    setButtonLoading(button, loading = true) {
      if (!button) return;
      if (loading) {
        button.classList.add("u-loading");
        if (button.classList.contains("loading"))
          button.classList.remove("loading");
        button.disabled = true;
      } else {
        button.classList.remove("u-loading", "loading");
        button.disabled = false;
      }
    },

    // AJAX 请求封装
    ajax(options) {
      const settings = window.westlifeSettings;
      if (!settings) {
        console.error("友链设置未初始化");
        return Promise.reject("设置未初始化");
      }

      const defaults = {
        url: settings.ajaxUrl,
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
      };

      const config = Object.assign({}, defaults, options);

      // 添加nonce到数据中
      if (config.data) {
        const params = new URLSearchParams(config.data);
        params.append("nonce", settings.nonce);
        config.data = params.toString();
      }

      return fetch(config.url, {
        method: config.method,
        headers: config.headers,
        body: config.data,
        credentials: "same-origin",
      }).then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      });
    },
  };

  // 友链检测器
  const LinkChecker = {
    checking: false,
    hideTimer: null,
    hideStatsTimer: null,
    hasManualCheck: false,
    lastCheckEl: null,

    ensureLastCheckEl() {
      if (!this.lastCheckEl) {
        this.lastCheckEl = document.getElementById("lastCheckTime");
      }
      return this.lastCheckEl;
    },

    setLastCheck(timeValue) {
      const el = this.ensureLastCheckEl();
      if (!el) return;
      if (!timeValue) {
        el.classList.add("u-hidden");
        return;
      }
      try {
        const dt = timeValue instanceof Date ? timeValue : new Date(timeValue);
        const formatted = this.formatDateTime(dt);
        el.textContent = `上次检测时间：${formatted}`;
        el.classList.remove("u-hidden");
      } catch (e) {
        // ignore
      }
    },

    formatDateTime(dt) {
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, "0");
      const d = String(dt.getDate()).padStart(2, "0");
      const hh = String(dt.getHours()).padStart(2, "0");
      const mm = String(dt.getMinutes()).padStart(2, "0");
      return `${y}-${m}-${d} ${hh}:${mm}`;
    },

    async checkAll(useRealtime = false) {
      if (this.checking) {
        Utils.toast("检测进行中，请稍候...", "info");
        return;
      }

      const cards = document.querySelectorAll(".link-card[data-url]");
      this.checking = true;

      try {
        if (useRealtime) {
          this.hasManualCheck = true;
          await this.realtimeCheckAll();
        } else {
          const cacheData = await this.getCachedResults();
          if (cacheData && cacheData.results) {
            this.updateUI(cacheData.results);
            this.updateStatusInfo(cacheData);
            this.updateCategoryStats(cacheData.category_stats);
          } else {
            if (!this.hasManualCheck) {
              return;
            }
            this.updateStats(cards.length, cards.length);
          }
        }
      } catch (error) {
        if (this.hasManualCheck) {
          this.updateStats(cards.length, cards.length);
        }
      } finally {
        this.checking = false;
      }
    },

    async realtimeCheckAll() {
      const visibleCards = document.querySelectorAll(".link-card[data-url]");

      // 添加检测中样式
      visibleCards.forEach((card) => {
        card.classList.add("checking");
      });

      Utils.toast("开始检测所有分类的友链...", "info");

      try {
        const response = await Utils.ajax({
          data: {
            action: "westlife_check_links_realtime",
            check_all_categories: "true",
          },
        });

        if (!response.success) {
          throw new Error(response.data?.message || "API请求失败");
        }

        this.updateUI(response.data.results);
        // 更新上次检测时间显示（使用当前时间）
        this.setLastCheck(new Date());
        // 删除分类统计调用
        // this.updateCategoryStats(response.data.category_stats);

        Utils.toast(
          `检测完成: 共检测 ${response.data.checked_count} 个友链`,
          "success"
        );
      } catch (error) {
        Utils.toast("检测失败: " + error.message, "error");
        throw error;
      } finally {
        // 移除检测中样式
        visibleCards.forEach((card) => {
          card.classList.remove("checking");
        });
      }
    },

    async getCachedResults() {
      const cachedResults = window.westlifeSettings?.cachedResults;
      if (cachedResults && cachedResults.results) {
        if (cachedResults.last_check) {
          this.setLastCheck(cachedResults.last_check);
        }
        return cachedResults;
      }

      try {
        const response = await Utils.ajax({
          data: {
            action: "westlife_check_link_head",
          },
        });

        if (!response.success) {
          return this.getEmptyCache();
        }
        if (response.data?.last_check) {
          this.setLastCheck(response.data.last_check);
        }
        return response.data;
      } catch (error) {
        return this.getEmptyCache();
      }
    },

    getEmptyCache() {
      return {
        results: {},
        last_check: null,
        total_links: 0,
        available_links: 0,
        // 删除 category_stats: {}
      };
    },

    updateUI(results) {
      if (!results || typeof results !== "object") {
        return;
      }

      const cards = document.querySelectorAll(".link-card[data-url]");
      let availableCount = 0;
      let totalVisible = 0;

      cards.forEach((card) => {
        const url = card.dataset.url;
        const result = results[url];

        totalVisible++;

        if (result) {
          const isUnavailable = !result.status;
          card.classList.toggle("is-unavailable", isUnavailable);

          if (result.status) {
            availableCount++;
            card.removeAttribute("title");
          } else {
            let title = `❌ 不可访问\n`;
            title += `HTTP状态码: ${result.http_code || "无响应"}\n`;
            title += `详情: ${result.details || result.error || "连接失败"}\n`;
            if (result.response_time) {
              title += `响应时间: ${result.response_time}ms\n`;
            }
            if (result.effective_url && result.effective_url !== url) {
              title += `重定向到: ${result.effective_url}\n`;
            }
            title += `\n检测时间: ${result.checked_at || "未知"}`;
            card.setAttribute("title", title);
          }
        } else {
          availableCount++;
          card.classList.remove("is-unavailable");
          card.removeAttribute("title");
        }
      });

      if (this.hasManualCheck) {
        this.updateStats(totalVisible, availableCount);
      }
    },

    updateCategoryStats(categoryStats) {
      // 删除分类统计功能，不显示任何内容
      return;
    },

    updateStats(total, available) {
      if (!this.hasManualCheck) {
        return;
      }

      const statusEl = document.getElementById("linkStatus");
      if (statusEl) {
        const unavailable = total - available;
        statusEl.innerHTML = `
            <i class="fa-solid fa-info-circle"></i>
            <span>友链状态: 共 <strong>${total}</strong> 个，</span>
            <span style="color: var(--color-success);"><strong>${available}</strong> 个可访问</span>
            ${
              unavailable > 0
                ? `<span>，<span style="color: var(--color-error);"><strong>${unavailable}</strong> 个不可访问</span></span>`
                : ""
            }
        `;

        statusEl.classList.add("fade-in");
        this.autoHideStatus(statusEl);
      }
    },

    updateStatusInfo(cacheData) {
      if (!this.hasManualCheck) {
        return;
      }

      if (!cacheData || !cacheData.last_check) return;

      try {
        const lastCheck = new Date(cacheData.last_check);
        const timeAgo = this.timeAgo(lastCheck);

        const statusEl = document.getElementById("linkStatus");
        if (statusEl) {
          statusEl.innerHTML = `
            <i class="fa-solid fa-clock"></i>
            <span>上次自动检测: <strong>${timeAgo}</strong>，</span>
            <span>共 <strong>${cacheData.total_links}</strong> 个友链，</span>
            <span style="color: var(--color-success);"><strong>${
              cacheData.available_links
            }</strong> 个可访问</span>
            ${
              cacheData.total_links - cacheData.available_links > 0
                ? `<span>，<span style="color: var(--color-error);"><strong>${
                    cacheData.total_links - cacheData.available_links
                  }</strong> 个不可访问</span></span>`
                : ""
            }
          `;

          statusEl.classList.add("fade-in");
          this.autoHideStatus(statusEl);
        }
      } catch (error) {
        // 静默处理错误
      }
    },

    autoHideStatus(statusEl) {
      if (this.hideTimer) {
        clearTimeout(this.hideTimer);
      }

      statusEl.style.display = "block";
      statusEl.style.opacity = "1";

      this.hideTimer = setTimeout(() => {
        statusEl.classList.remove("fade-in");
        statusEl.classList.add("u-fade-out");

        setTimeout(() => {
          statusEl.style.display = "none";
          statusEl.classList.remove("u-fade-out");
        }, 500);
      }, 5000);
    },

    timeAgo(date) {
      const now = new Date();
      const diff = now - date;
      const minutes = Math.floor(diff / 60000);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (days > 0) return `${days}天前`;
      if (hours > 0) return `${hours}小时前`;
      if (minutes > 0) return `${minutes}分钟前`;
      return "刚刚";
    },
  };

  // 检测按钮处理器 - 重写版
  const RecheckHandler = {
    init() {
      const btn = document.getElementById("recheckAllLinks");
      if (!btn) return;

      btn.addEventListener("click", async () => {
        if (btn.classList.contains("loading")) return;

        Utils.setButtonLoading(btn, true);

        try {
          await LinkChecker.checkAll(true);
        } catch (error) {
          Utils.toast("检测失败: " + error.message, "error");
        } finally {
          Utils.setButtonLoading(btn, false);
        }
      });
    },
  };

  // 随机访问 - 重写版
  const RandomVisit = {
    init() {
      const btn = document.getElementById("randomVisitBtn");
      if (!btn) return;

      btn.addEventListener("click", () => {
        if (btn.classList.contains("loading")) return;

        // 获取页面上所有友链卡片的URL（包含所有分类）
        const allCards = document.querySelectorAll(".link-card[data-url]");
        const allUrls = Array.from(allCards)
          .map((card) => card.dataset.url)
          .filter(Boolean);

        if (!allUrls.length) {
          Utils.toast("暂无友链", "info");
          return;
        }

        // 过滤出可访问的友链
        const availableUrls = allUrls.filter((url) => {
          const card = document.querySelector(
            `.link-card[data-url="${CSS.escape(url)}"]`
          );
          return card && !card.classList.contains("is-unavailable");
        });

        if (!availableUrls.length) {
          Utils.toast("暂无可访问的友链", "info");
          return;
        }

        // 设置加载状态（显示旋转圆圈）
        Utils.setButtonLoading(btn, true);

        // 1.5秒后执行跳转
        setTimeout(() => {
          const randomUrl =
            availableUrls[Math.floor(Math.random() * availableUrls.length)];

          // 获取对应的友链卡片以显示站点名称
          const targetCard = document.querySelector(
            `.link-card[data-url="${CSS.escape(randomUrl)}"]`
          );
          const siteName =
            targetCard?.querySelector(".link-name a")?.textContent ||
            "友链站点";

          // 打开新窗口访问
          window.open(randomUrl, "_blank", "noopener,noreferrer");

          // 移除加载状态
          Utils.setButtonLoading(btn, false);

          // 显示成功提示
          Utils.toast(`正在访问「${siteName}」...`, "success");
        }, 1500);
      });
    },
  };

  // 复制功能
  const CopyHandler = {
    init() {
      document.addEventListener("click", async (e) => {
        const btn = e.target.closest(".copy-btn[data-copy]");
        if (!btn) return;

        e.preventDefault();
        const text = btn.dataset.copy;
        if (!text) return;

        try {
          if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
          } else {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            textarea.style.left = "-9999px";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
          }
          Utils.toast("已复制到剪贴板", "success");
        } catch (error) {
          Utils.toast("复制失败", "error");
        }
      });
    },
  };

  // 弹窗管理
  const ModalManager = {
    init() {
      const modal = document.getElementById("linkModal");
      if (!modal) return;
      const modalContent = modal.querySelector(".modal-content");

      if (!modal.__WL_SCROLL_GUARD__) {
        modal.__WL_SCROLL_GUARD__ = true;
        const guard = (e) => {
          if (!modal.classList.contains("show")) return;
          if (modalContent && modalContent.contains(e.target)) return;
          e.preventDefault();
        };
        modal.addEventListener("wheel", guard, { passive: false });
        modal.addEventListener("touchmove", guard, { passive: false });
      }

      const openBtn = document.getElementById("applyLinkBtn");
      if (openBtn) {
        openBtn.addEventListener("click", () => {
          modal.classList.add("show");
          modal.setAttribute("aria-hidden", "false");

          const firstInput = modal.querySelector(
            "input, textarea, select, button"
          );
          if (firstInput) {
            firstInput.focus();
          }
        });
      }

      const closeModal = () => {
        modal.classList.remove("show");
        modal.setAttribute("aria-hidden", "true");
      };

      modal.querySelectorAll(".modal-close, .modal-cancel").forEach((btn) => {
        btn.addEventListener("click", closeModal);
      });

      const backdrop = modal.querySelector(".modal-backdrop");
      if (backdrop) {
        backdrop.addEventListener("click", closeModal);
      }

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && modal.classList.contains("show")) {
          closeModal();
        }
      });
    },
  };

  // 表单处理
  const FormHandler = {
    init() {
      const form = document.getElementById("linkForm");
      if (!form) return;

      const linkAddedCheckbox = document.getElementById("linkAdded");
      const submitBtn = form.querySelector(".modal-submit");
      const descField = form.querySelector("#siteDesc");
      const counterEl = document.querySelector(
        '.char-counter[data-for="siteDesc"]'
      );

      if (linkAddedCheckbox && submitBtn) {
        const updateSubmitButton = () => {
          submitBtn.disabled = !linkAddedCheckbox.checked;
        };

        linkAddedCheckbox.addEventListener("change", updateSubmitButton);
        updateSubmitButton();
      }

      // 实时字符统计
      if (descField && counterEl) {
        const maxLen = parseInt(
          descField.getAttribute("maxlength") || "100",
          10
        );
        const updateCount = () => {
          const len = descField.value.trim().length;
          counterEl.textContent = `${len} / ${maxLen}`;
          counterEl.classList.toggle("is-over-limit", len > maxLen);
        };
        descField.addEventListener("input", updateCount);
        updateCount();
      }

      // 基础字段规则定义
      const validators = {
        name: (v) => v.trim().length >= 2 || "站点名称至少2个字符",
        url: (v) =>
          /^https?:\/\//i.test(v.trim()) || "网址需以 http(s):// 开头",
        avatar: (v) =>
          !v || /^https?:\/\//i.test(v.trim()) || "头像链接需是有效 URL",
        rss: (v) =>
          !v || /^https?:\/\//i.test(v.trim()) || "RSS 链接需是有效 URL",
        desc: (v) => v.trim().length >= 5 || "描述至少 5 个字符",
      };

      function showFieldError(inputEl, message) {
        if (!inputEl) return;
        const group = inputEl.closest(".form-group");
        if (!group) return;
        group.classList.add("form-field-error");
        let err = group.querySelector(".form-error-msg");
        if (!err) {
          err = document.createElement("div");
          err.className = "form-error-msg";
          err.innerHTML = `<span class="form-error-icon">⚠</span><span class="form-error-text"></span>`;
          // 插入在 helper 之前或末尾
          const helper = group.querySelector(".form-helper");
          if (helper) group.insertBefore(err, helper);
          else group.appendChild(err);
        }
        err.querySelector(".form-error-text").textContent = message;
      }

      function clearFieldError(inputEl) {
        const group = inputEl.closest(".form-group");
        if (!group) return;
        group.classList.remove("form-field-error");
        const err = group.querySelector(".form-error-msg");
        if (err) err.remove();
      }

      function validateField(inputEl) {
        if (!inputEl || !validators[inputEl.name]) return true;
        const value = inputEl.value || "";
        const result = validators[inputEl.name](value);
        if (result !== true) {
          showFieldError(inputEl, result);
          return false;
        }
        clearFieldError(inputEl);
        return true;
      }

      // 绑定实时验证
      form.querySelectorAll("input[name], textarea[name]").forEach((field) => {
        field.addEventListener("blur", () => validateField(field));
        field.addEventListener("input", () => {
          // 输入时若之前报错则重新验证
          if (field.closest(".form-field-error")) validateField(field);
        });
      });

      form.addEventListener("submit", async (e) => {
        e.preventDefault();

        // 全量验证
        let allValid = true;
        form
          .querySelectorAll("input[name], textarea[name]")
          .forEach((field) => {
            const ok = validateField(field);
            if (!ok) allValid = false;
          });

        if (linkAddedCheckbox && !linkAddedCheckbox.checked) {
          allValid = false;
          Utils.toast("请先勾选已添加本站友链", "error");
        }

        if (!allValid) return;

        const formData = new FormData(form);
        const submitButton = form.querySelector(".modal-submit");
        const originalText = submitButton?.textContent || "提交申请";

        if (submitButton) {
          submitButton.disabled = true;
          submitButton.textContent = "提交中...";
        }

        try {
          const response = await Utils.ajax({
            data: {
              action: "westlife_submit_friend_link",
              name: formData.get("name") || "",
              url: formData.get("url") || "",
              rss: formData.get("rss") || "",
              avatar: formData.get("avatar") || "",
              desc: formData.get("desc") || "",
              link_added: formData.get("link_added") || "off",
            },
          });

          if (!response.success) {
            throw new Error(response.data?.message || "提交失败");
          }

          Utils.toast("提交成功，感谢您的申请！", "success");
          this.resetForm(form);
          // 自动关闭弹窗
          const modal = document.getElementById("linkModal");
          if (modal && modal.classList.contains("show")) {
            setTimeout(() => {
              modal.classList.remove("show");
              modal.setAttribute("aria-hidden", "true");
            }, 800);
          }
        } catch (error) {
          Utils.toast("提交失败: " + error.message, "error");
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = originalText;
          }
        }
      });
    },

    resetForm(form) {
      form.reset();
      const submitButton = form.querySelector(".modal-submit");
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "提交申请";
      }
    },
  };

  // 初始化所有模块
  function init() {
    if (linksPageInitialized) return;
    linksPageInitialized = true;
    const settings = initializeSettings();

    // 仅在设置成功加载后初始化其他模块
    if (settings) {
      Utils.setButtonLoading(document.getElementById("recheckAllLinks"), false);
      LinkChecker.checkAll(false);
      RecheckHandler.init();
      RandomVisit.init();
      CopyHandler.init();
      ModalManager.init();
      FormHandler.init();
    }
  }

  function destroy() {
    linksPageInitialized = false;
  }

  if (window.WestlifeApp && typeof window.WestlifeApp.register === "function") {
    window.WestlifeApp.register({
      name: "links-page",
      match(context) {
        const root =
          context && context.nodeType === 1 ? context : document;
        return !!root.querySelector(
          ".page-links, .links-page, #westlife-settings, #recheckAllLinks"
        );
      },
      init() {
        init();
      },
      destroy() {
        destroy();
      },
    });
  } else {
    // DOMContentLoaded 事件处理
    document.addEventListener("DOMContentLoaded", init);
  }
})(window, document);
