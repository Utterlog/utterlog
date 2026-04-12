/**
 * Memos 说说页面交互功能
 *
 * @package Westlife
 * @version 2.0.0
 */

// 防止重复加载（例如同时被独立 enqueue 与被打进 bundle）导致 "Identifier 'MemosManager' has already been declared"
if (typeof window.MemosManager !== "undefined") {
  console.warn(
    "[Westlife][Memos] Duplicate page-memos.js load detected, skip redefining MemosManager"
  );
} else {
  class MemosManager {
    constructor() {
      this.config = window.MemosAPI || window.memosConfig || {};

      // 标准化配置字段
      if (this.config.ajax_url && !this.config.ajaxUrl) {
        this.config.ajaxUrl = this.config.ajax_url;
      }
      if (this.config.per_page && !this.config.perPage) {
        this.config.perPage = this.config.per_page;
      }

      this.currentPage = 0;
      this.currentFilter = "all";
      this.currentSearch = "";
      this.isLoading = false;
      this.hasMore = true;
      this.nextPageToken = "";
      this.allMemos = [];
      this.filteredMemos = [];
      this.refreshTimer = null;
      this.eventController =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      this.loadedIds = new Set(); // 添加去重机制
      this.totalStats = null; // 存储总体统计数据
      this._statsLoadedOnce = false; // 首次加载时强制刷新统计
      this.keywordsMap = new Map(); // 存储标签和出现次数
      this.selectedKeyword = null; // 当前选中的关键词

      // 分段加载控制
      this.autoLoadCount = 0; // 已自动加载的次数（初始加载算第0次，第一次下拉算第1次）
      this.maxAutoLoad = 1; // 最多自动加载次数（0=初始，1=第一次下拉）

      this.init();
    }

    // 生成稳定的去重键：优先 id；否则使用 createTime + 内容摘要
    getMemoKey(m) {
      if (m && m.id && String(m.id).trim() !== "") return String(m.id);
      const t = m && m.createTime ? String(m.createTime) : "";
      const c = m && (m.excerpt || m.content || "");
      const head = String(c).slice(0, 40);
      return `${t}|${head}`;
    }

    // 获取图片占位符（1x1透明GIF）
    getPlaceholder() {
      return "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    }

    getSiteTimeZone() {
      return (
        (window.westlifeSettings && window.westlifeSettings.siteTimezone) ||
        "UTC"
      );
    }

    formatSiteDate(date, withTime = false) {
      try {
        const formatter = new Intl.DateTimeFormat("zh-CN", {
          timeZone: this.getSiteTimeZone(),
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          ...(withTime
            ? {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              }
            : {}),
        });
        return formatter.format(date).replace(/\//g, "-");
      } catch (e) {
        return withTime
          ? date.toISOString().slice(0, 19).replace("T", " ")
          : date.toISOString().slice(0, 10);
      }
    }

    // 初始化图片功能（懒加载 + 本地图片预览）
    initImageFeatures() {
      // 1. 触发 lazysizes 更新
      if (window.lazySizes) {
        window.lazySizes.init();
      }

      // 2. 重新绑定本地图片预览
      if (
        window.WestlifeViewImages &&
        typeof window.WestlifeViewImages.init === "function"
      ) {
        window.WestlifeViewImages.init();
      }
    }

    isImageViewerEnabled() {
      return !(
        window.westlifeImage &&
        window.westlifeImage.enableViewer === false
      );
    }

    // 恢复用户布局偏好
    restoreLayout() {
      const grid = document.getElementById("memos-grid");
      const toggleBtn = document.getElementById("toggle-view");

      if (!grid || !toggleBtn) return;

      try {
        const savedLayout = localStorage.getItem("memos_layout");
        if (savedLayout === "magazine") {
          grid.setAttribute("data-layout", "magazine");
          toggleBtn.setAttribute("data-view", "magazine");
          toggleBtn.innerHTML =
            '<i class="fas fa-th-large"></i><span class="view-text">杂志</span>';
          toggleBtn.title = "切换到列表布局";

          // 延迟应用 Masonry 布局（等待内容加载）
          setTimeout(() => {
            if (grid.querySelectorAll(".memo-card").length > 0) {
              this.applyMasonryLayout();
            }
          }, 500);
        }
      } catch (e) {
        // localStorage 不可用时使用默认布局（列表）
      }
    }

    init() {
      this.bindEvents();
      // 已删除视图切换功能

      // 延迟绑定发布框事件，确保 DOM 已加载
      setTimeout(() => {
        this.bindPublishEvents();
      }, 100);

      // 立即显示骨架屏，提升视觉体验
      this.showLoading();

      // 延迟加载策略：先显示页面框架，然后延迟加载内容
      setTimeout(() => {
        this.loadMemos(true);
      }, 150); // 延迟150ms，让骨架屏先显示

      // 统计数据可以更晚加载
      setTimeout(() => {
        this.checkServiceStatus();
      }, 200);

      // 初始化关键词板块
      this.initKeywords();

      if (this.config.autoRefresh) {
        // 自动刷新也延迟启动
        setTimeout(() => {
          this.startAutoRefresh();
        }, 5000); // 5秒后再启动自动刷新
      }
    }

    bindEvents() {
      const signal = this.eventController ? this.eventController.signal : undefined;

      // 筛选按钮
      document.querySelectorAll(".filter-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.handleFilter(e);
        }, signal ? { signal } : undefined);
      });

      // 搜索
      const searchInput = document.getElementById("memos-search");
      const searchBtn = document.getElementById("search-btn");

      if (searchInput) {
        searchInput.addEventListener(
          "input",
          this.debounce((e) => {
            this.handleSearch(e.target.value);
          }, 300),
          signal ? { signal } : undefined
        );

        searchInput.addEventListener("keypress", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            this.handleSearch(e.target.value);
          }
        }, signal ? { signal } : undefined);
      }

      if (searchBtn) {
        searchBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const query = searchInput?.value?.trim() || "";
          this.handleSearch(query);
        }, signal ? { signal } : undefined);
      }

      // 关键词板块事件
      this.bindKeywordsEvents();

      // 刷新按钮
      const refreshBtn = document.getElementById("refresh-btn");
      if (refreshBtn) {
        refreshBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.refreshMemos();
        }, signal ? { signal } : undefined);
      }

      // 已删除视图切换按钮

      // 加载更多按钮绑定在 updateLoadMoreButton() 方法中动态处理

      // 重试按钮
      const retryBtn = document.getElementById("retry-btn");
      if (retryBtn) {
        retryBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.loadMemos(true);
        }, signal ? { signal } : undefined);
      }

      // 使用事件委托处理复制和删除按钮（因为按钮是动态生成的）
      // 注意：点赞和评论按钮改为在 createMemoElement 中直接绑定
      const self = this; // 保存 this 上下文
      document.body.addEventListener("click", function (e) {
        // 检查点击的是否是复制按钮或其子元素
        const copyBtn = e.target.closest(".memo-copy-btn");
        if (copyBtn) {
          e.preventDefault();
          e.stopPropagation();
          const memoId = copyBtn.dataset.memoId;
          if (memoId) {
            self.copyMemo(memoId);
          }
          return;
        }

        // 检查点击的是否是删除按钮
        const deleteBtn = e.target.closest(".memo-delete-btn");
        if (deleteBtn) {
          e.preventDefault();
          e.stopPropagation();
          const memoId = deleteBtn.dataset.memoId;
          const memoName = deleteBtn.dataset.memoName;
          if (memoId) {
            self.deleteMemo(memoName || memoId, deleteBtn);
          }
          return;
        }

        // 检查点击的是否是代码复制按钮
        const codeCopyBtn = e.target.closest(".code-copy-btn");
        if (codeCopyBtn) {
          e.preventDefault();
          e.stopPropagation();
          self.copyCode(codeCopyBtn);
          return;
        }
      }, signal ? { signal } : undefined);

      // 状态刷新按钮
      const refreshStatusBtn = document.getElementById("refresh-status");
      if (refreshStatusBtn) {
        refreshStatusBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.checkServiceStatus();
        }, signal ? { signal } : undefined);
      }

      // 强制刷新统计按钮
      const refreshStatsBtn = document.getElementById("refresh-stats-btn");
      if (refreshStatsBtn) {
        refreshStatsBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.forceRefreshStats();
        }, signal ? { signal } : undefined);
      }

      // 滚动加载更多（保存句柄便于后续解绑）
      this._onScroll = this.debounce(() => {
        if (this.shouldLoadMore()) {
          this.loadMore();
        }
      }, 100);
      window.addEventListener(
        "scroll",
        this._onScroll,
        signal ? { signal, passive: true } : { passive: true }
      );
    }

    async loadMemos(reset = false) {
      if (this.isLoading && !reset) return;

      this.isLoading = true;

      if (reset) {
        // 显示矩形跳动加载动画
        const skeleton = document.getElementById("skeleton-memos");
        const loading = document.getElementById("loading-state");
        const grid = document.getElementById("memos-grid");
        if (skeleton) skeleton.style.display = "none";
        if (loading) {
          loading.style.display = "flex";
          loading.classList.remove("u-hidden");
        }
        if (grid) grid.style.display = "none";

        this.currentPage = 0;
        this.hasMore = true;
        this.nextPageToken = "";
        this.allMemos = [];
        this.loadedIds.clear();
        this.autoLoadCount = 0; // 重置自动加载计数

        // 重置后重新启用滚动自动加载（此前如果加载完毕会解绑监听）
        if (this._onScroll) {
          // 先解绑再绑定，避免重复注册
          window.removeEventListener("scroll", this._onScroll);
          window.addEventListener("scroll", this._onScroll);
        }

        // 首次加载时获取总体统计数据
        this.loadTotalStats();
      }

      try {
        const formData = new FormData();
        formData.append("action", "memos_load");

        // 只有登录用户才传递 nonce
        if (this.config.nonce && !this.config.isGuest) {
          formData.append("nonce", this.config.nonce);
        }

        formData.append("limit", this.config.perPage || 20);
        formData.append(
          "offset",
          this.currentPage * (this.config.perPage || 20)
        );
        formData.append("filter", this.currentSearch);

        // 若存在分页令牌，传给后端
        if (this.nextPageToken) {
          formData.append("page_token", this.nextPageToken);
        }

        if (reset) {
          formData.append("force", "1");
        }

        const response = await fetch(this.config.ajaxUrl, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const text = await response.text();
        let result;
        try {
          result = JSON.parse(text);
        } catch (e) {
          throw new Error("服务器返回了无效的 JSON 响应");
        }

        if (result.success) {
          const data = result.data;
          const newMemos = data.memos || [];

          // 去重（使用稳定键，避免 id 为空时误判）
          const uniqueMemos = [];
          for (const m of newMemos) {
            const key = this.getMemoKey(m);
            if (!this.loadedIds.has(key)) {
              this.loadedIds.add(key);
              uniqueMemos.push(m);
            }
          }

          if (reset) {
            this.allMemos = uniqueMemos;
          } else {
            this.allMemos = [...this.allMemos, ...uniqueMemos];
          }

          // 检查是否还有更多数据 - 使用后端返回的 has_more 字段
          this.hasMore = data.has_more || false;
          // 保存下一页令牌
          this.nextPageToken = data.next_page_token || "";

          if (uniqueMemos.length > 0) {
            this.currentPage++;
          }

          this.applyFilters();
          this.renderMemos();
          this.updateStats();
          this.renderTags();

          // 提取关键词
          this.extractKeywords(this.allMemos);

          this.hideLoading();
          this.updateLoadMoreButton();

          if (this.allMemos.length === 0) {
            this.showEmpty();
          }

          // 如果当前内容不足以填满视口且还有更多，自动继续加载一页（仅限前2次）
          setTimeout(() => {
            if (
              this.shouldLoadMore() &&
              this.autoLoadCount < this.maxAutoLoad
            ) {
              this.loadMore();
            }
          }, 80);
        } else {
          throw new Error(
            result.data?.message || this.config.strings.loadFailed || "加载失败"
          );
        }
      } catch (error) {
        this.showError(error.message);
      } finally {
        this.isLoading = false;
      }
    }

    // 新增：获取总体统计数据（适配游客）
    async loadTotalStats() {
      try {
        const formData = new FormData();
        formData.append("action", "memos_stats");
        // 首次进入页面强制刷新统计，保证总数准确
        if (!this._statsLoadedOnce) {
          formData.append("force_refresh", "1");
        }

        // 只有登录用户才传递 nonce
        if (this.config.nonce && !this.config.isGuest) {
          formData.append("nonce", this.config.nonce);
        }

        const response = await fetch(this.config.ajaxUrl, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const text = await response.text();

        let result;
        try {
          result = JSON.parse(text);
        } catch (e) {
          throw new Error(
            "统计数据返回了无效的 JSON 响应: " + text.substring(0, 100)
          );
        }

        if (result.success && result.data) {
          this.updateTotalStats(result.data);
          this._statsLoadedOnce = true;
        } else {
          throw new Error(result.data?.message || "统计数据获取失败");
        }
      } catch (error) {
        // 失败时不影响主要功能，但要显示错误信息
        this.showMessage("统计数据获取失败: " + error.message);
      } finally {
        this._statsLoadedOnce = true;
      }
    }

    // 新增：更新总体统计显示
    updateTotalStats(stats) {
      const totalMemos = document.getElementById("total-memos");
      const totalDays = document.getElementById("total-days");
      const last30El = document.getElementById("memos-last30");
      const thisMonthEl = document.getElementById("memos-this-month");

      if (
        totalMemos &&
        (stats.totalMemos !== undefined || stats.total !== undefined)
      ) {
        const count = stats.totalMemos || stats.total || 0;
        totalMemos.textContent = count;

        // 添加更新动画效果
        totalMemos.style.color = "#f59e0b";
        totalMemos.style.transform = "scale(1.1)";
        setTimeout(() => {
          totalMemos.style.color = "";
          totalMemos.style.transform = "";
        }, 600);
      }

      if (
        totalDays &&
        (stats.totalDays !== undefined || stats.days !== undefined)
      ) {
        const days = stats.totalDays || stats.days || 0;
        totalDays.textContent = days;

        // 添加更新动画效果
        totalDays.style.color = "#f59e0b";
        totalDays.style.transform = "scale(1.1)";
        setTimeout(() => {
          totalDays.style.color = "";
          totalDays.style.transform = "";
        }, 600);
      }

      // 本月说说数
      if (thisMonthEl && stats.thisMonth !== undefined) {
        thisMonthEl.textContent = stats.thisMonth;
        thisMonthEl.style.color = "#f59e0b";
        thisMonthEl.style.transform = "scale(1.1)";
        setTimeout(() => {
          thisMonthEl.style.color = "";
          thisMonthEl.style.transform = "";
        }, 600);
      }

      // 保存统计数据
      this.totalStats = stats;

      // 不在这里显示通知，由调用方决定是否显示
      // 避免与 refreshMemos 的通知重复
    }

    async loadMore() {
      if (this.isLoading || !this.hasMore) {
        return;
      }

      const loadMoreBtn = document.querySelector("#load-more-memos");

      // 临时隐藏加载更多按钮，让页面显示矩形跳动加载动画
      if (loadMoreBtn) {
        loadMoreBtn.style.display = "none";
      }

      try {
        // loadMemos(false) 会在页面中显示加载动画
        await this.loadMemos(false);
        // 加载完成后增加自动加载计数
        this.autoLoadCount++;
      } finally {
        // 恢复按钮显示
        if (loadMoreBtn) {
          loadMoreBtn.style.display = "";
        }
      }
    }

    updateLoadMoreButton() {
      const container = document.querySelector("#load-more-container");
      if (!container) return;

      if (this.hasMore && this.filteredMemos.length > 0) {
        // 显示加载更多按钮
        container.classList.remove("u-hidden");

        // 重新绑定事件（如果按钮是新生成的）
        const loadMoreBtn = container.querySelector("#load-more-memos");
        if (loadMoreBtn && !loadMoreBtn.hasAttribute("data-bound")) {
          loadMoreBtn.setAttribute("data-bound", "true");
          const signal = this.eventController ? this.eventController.signal : undefined;
          loadMoreBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.loadMore();
          }, signal ? { signal } : undefined);
        }
      } else if (!this.hasMore && this.allMemos.length > 0) {
        // 无更多内容，解绑滚动监听（无论自动加载次数是否达到限制）
        if (this._onScroll) {
          window.removeEventListener("scroll", this._onScroll);
        }
        // 显示没有更多内容，优先显示总统计数据
        const totalCount = this.totalStats
          ? this.totalStats.totalMemos
          : this.allMemos.length;
        const currentCount = this.allMemos.length;

        container.classList.remove("u-hidden");
        container.innerHTML = `
                <div class="no-more-content">
                    <i class="fas fa-check-circle"></i>
                    <div class="title">已显示全部内容</div>
                    <div class="desc">
                        当前显示 ${currentCount} 条，
                        ${
                          this.totalStats
                            ? `总共 ${totalCount} 条说说`
                            : "没有更多说说了"
                        }
                    </div>
                </div>
            `;
      } else {
        container.classList.add("u-hidden");
      }
    }

    // 强制刷新统计数据
    async forceRefreshStats() {
      const refreshBtn = document.getElementById("refresh-stats-btn");

      if (refreshBtn) {
        refreshBtn.classList.add("u-loading");
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        refreshBtn.disabled = true;
      }

      try {
        const formData = new FormData();
        formData.append("action", "memos_stats");
        formData.append("nonce", this.config.nonce);
        formData.append("force_refresh", "1"); // 强制刷新，绕过缓存

        const response = await fetch(this.config.ajaxUrl, {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const text = await response.text();

        let result;
        try {
          result = JSON.parse(text);
        } catch (e) {
          throw new Error(
            "服务器返回了无效的 JSON 响应: " + text.substring(0, 200)
          );
        }

        if (result.success && result.data) {
          this.updateTotalStats(result.data);
          // 不在这里显示通知，避免与 loadTotalStats 重复

          // 同时更新显示
          this.updateStats();
        } else {
          throw new Error(result.data?.message || "获取统计数据失败");
        }
      } catch (error) {
        this.showMessage("统计数据更新失败: " + error.message);
      } finally {
        if (refreshBtn) {
          refreshBtn.classList.remove("u-loading");
          refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i>';
          refreshBtn.disabled = false;
        }
      }
    }

    async refreshMemos() {
      const refreshBtn = document.getElementById("refresh-btn");
      if (refreshBtn) {
        refreshBtn.classList.add("u-loading");
        // 刷新按钮保持原图标，只是旋转
        refreshBtn.disabled = true;
      }

      try {
        // 并行执行内容刷新和统计数据刷新
        // loadMemos(true) 会在页面中央显示矩形跳动加载动画
        await Promise.all([this.loadMemos(true), this.forceRefreshStats()]);

        // 刷新成功后显示通知
        this.showMessage("最新说说加载成功", "success", 2000);
      } catch (error) {
        this.showMessage("刷新失败，请重试", "error", 2000);
      } finally {
        if (refreshBtn) {
          refreshBtn.classList.remove("u-loading");
          refreshBtn.disabled = false;
        }
      }
    }

    async checkForNewContent() {
      try {
        // 获取最新的统计数据，检查是否有新内容
        const response = await fetch(this.config.ajaxUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            action: "memos_stats",
            nonce: this.config.nonce,
          }),
        });

        const result = await response.json();

        if (result.success) {
          const newTotal = result.data.totalMemos || result.data.total || 0;
          const currentTotal =
            document.getElementById("total-memos")?.textContent || "0";
          const currentTotalNum = parseInt(currentTotal);

          if (newTotal > currentTotalNum) {
            this.showNewContentNotification(newTotal - currentTotalNum);
            // 自动刷新内容和统计
            await Promise.all([this.loadMemos(true), this.forceRefreshStats()]);
          }
        }
      } catch (error) {}
    }

    showNewContentNotification(count) {
      // 使用主题统一通知系统显示新内容提示
      const message = `发现 ${count} 条新说说`;
      this.showMessage(message, "info", 5000);
    }

    handleFilter(e) {
      const filter =
        e.target.dataset.filter ||
        e.target.closest(".filter-btn").dataset.filter;
      if (!filter || filter === this.currentFilter) return;

      document.querySelectorAll(".filter-btn").forEach((btn) => {
        btn.classList.remove("active");
      });

      const targetBtn = e.target.closest(".filter-btn");
      if (targetBtn) {
        targetBtn.classList.add("active");
      }

      this.currentFilter = filter;
      this.applyFilters();
      this.renderMemos();
    }

    handleSearch(query) {
      this.currentSearch = query.trim();
      this.applyFilters();
      this.renderMemos();
    }

    applyFilters() {
      let filtered = [...this.allMemos];

      if (this.currentFilter !== "all") {
        const now = new Date();
        const today = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate()
        );
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());

        filtered = filtered.filter((memo) => {
          const createTime = new Date(memo.createTime);

          switch (this.currentFilter) {
            case "pinned":
              return memo.pinned;
            case "today":
              return createTime >= today;
            case "week":
              return createTime >= weekStart;
            default:
              return true;
          }
        });
      }

      if (this.currentSearch) {
        const query = this.currentSearch.toLowerCase();
        filtered = filtered.filter((memo) => {
          return (
            memo.content.toLowerCase().includes(query) ||
            (memo.tags &&
              memo.tags.some((tag) => tag.toLowerCase().includes(query)))
          );
        });
      }

      this.filteredMemos = filtered;
    }

    renderMemos() {
      const container = document.getElementById("memos-grid");
      if (!container) {
        return;
      }

      if (this.filteredMemos.length === 0) {
        if (this.allMemos.length === 0) {
          this.showEmpty();
        } else {
          container.innerHTML =
            '<div class="search-no-results">没有找到匹配的说说</div>';
        }
        return;
      }

      container.innerHTML = "";

      this.filteredMemos.forEach((memo) => {
        const memoElement = this.createMemoElement(memo);
        container.appendChild(memoElement);
      });

      this.updateLoadMoreButton();
      this.hideError();
      this.hideEmpty();

      // 渲染完成后初始化懒加载和图片预览
      this.initImageFeatures();

      // 批量加载点赞数和评论数
      const memoIds = this.filteredMemos
        .map((memo) => memo.id || memo.uid || memo.name || memo.resourceName)
        .filter(Boolean);

      if (memoIds.length > 0) {
        this.loadBatchLikeCounts(memoIds);
        this.loadBatchCommentCountsForIds(memoIds);
      }
    }

    createMemoElement(memo) {
      const article = document.createElement("article");
      article.className = `memo-card${memo.pinned ? " pinned" : ""}`;

      // 使用多种可能的ID字段
      let rawId = memo.id || memo.uid || memo.name || memo.resourceName;

      // 提取纯 ID：如果包含 "memos/" 前缀，去掉它
      // 例如：'memos/nf8EcGYVBfWo2zjarNDDnC' → 'nf8EcGYVBfWo2zjarNDDnC'
      const memoId = String(rawId).replace(/^memos\//, "");

      article.dataset.memoId = memoId;

      // 处理创建时间
      const createTime = new Date(memo.createTime);
      const now = new Date();
      const diffTime = now - createTime;
      const diffMinutes = Math.floor(diffTime / (1000 * 60));
      const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      let relativeTime = "";
      if (diffMinutes < 1) {
        relativeTime = "刚刚";
      } else if (diffMinutes < 60) {
        relativeTime = `${diffMinutes}分钟前`;
      } else if (diffHours < 24) {
        relativeTime = `${diffHours}小时前`;
      } else if (diffDays < 30) {
        relativeTime = `${diffDays}天前`;
      } else {
        relativeTime = this.formatSiteDate(createTime, false);
      }

      // 提取内容中的标签
      const contentTags = this.extractTagsFromContent(memo.content || "");

      // 处理内容
      let content = memo.content || "";

      // 检查是否包含特殊内容
      const hasSpecialChars = /[🎉🎊✨🌟⭐💫🎆🎇]/u.test(content);

      // 处理附件图片
      const attachmentImages = this.getAttachmentImages(memo);

      // 生成Memos平台链接
      const memosUrl = this.generateMemosUrl(memo);

      // 清理 memoId 用于 DOM ID（移除特殊字符如 /）
      const cleanMemoId = String(memoId).replace(/[^a-zA-Z0-9_-]/g, "_");

      article.innerHTML = `
            <div class="memo-card-container">
                <div class="memo-header">
                    <div class="memo-meta">
                        <span class="memo-time" title="${this.formatSiteDate(
                          createTime,
                          true
                        )}">
                            ${relativeTime}
                        </span>
                        ${
                          memo.pinned
                            ? '<span class="pinned-indicator"><i class="fas fa-thumbtack"></i></span>'
                            : ""
                        }
                        ${
                          hasSpecialChars
                            ? '<span class="special-indicator">🎉</span>'
                            : ""
                        }
                    </div>
                    <div class="memo-actions">
                        <a href="${memosUrl}" target="_blank" rel="noopener noreferrer" 
                           class="memo-action-btn memo-link-btn" title="前往Memos查看">
                            <i class="fas fa-external-link-alt"></i>
                        </a>
                        <button class="memo-action-btn memo-copy-btn" data-memo-id="${memoId}" title="复制内容">
                            <i class="fas fa-copy"></i>
                        </button>
                        ${
                          this.config.isAdmin
                            ? `<button class="memo-action-btn memo-delete-btn" data-memo-id="${memoId}" data-memo-name="${rawId}" title="删除说说">
                            <i class="fas fa-trash-alt"></i>
                        </button>`
                            : ""
                        }
                    </div>
                </div>
                
                <div class="memo-content">
                    ${this.formatContent(content, contentTags)}
                </div>
                
                ${
                  attachmentImages.length > 0
                    ? `
                    <div class="memo-attachments"${this.isImageViewerEnabled() ? " view-image" : ""}>
                        ${attachmentImages
                          .map(
                            (img, idx) => `
                            <div class="memo-image-container">
                                <a href="${img.url}" class="img-link">
                                    <img src="${this.getPlaceholder()}" data-src="${
                              img.url
                            }" alt="${
                              img.name || "图片"
                            }" class="memo-image zoom-in lazyload" loading="${
                              idx === 0 ? "eager" : "lazy"
                            }" />
                                </a>
                            </div>
                        `
                          )
                          .join("")}
                    </div>
                `
                    : ""
                }
                
                <div class="memo-footer">
                    <div class="memo-stats-left">
                        <button class="stat-btn like-btn" data-memo-id="${cleanMemoId}" data-original-id="${memoId}" title="点赞">
                            <i class="fas fa-heart"></i>
                            <span class="like-count">0</span>
                        </button>
                    </div>
                    <div class="memo-stats-right">
                        <button class="stat-btn comment-btn" data-memo-id="${cleanMemoId}" data-original-id="${memoId}" title="展开评论">
                            <i class="fas fa-comment"></i>
                            <span class="comment-text">评论</span>
                            <span class="comment-count">0</span>
                        </button>
                    </div>
                </div>

                <!-- 每条说说的独立评论区 -->
                <div class="memo-comments-wrapper" id="memo-comments-${cleanMemoId}" style="display: none;">
                    <div class="memo-comments-container">
                        <div class="memo-comments-header">
                            <i class="fas fa-comments"></i>
                            <span>评论</span>
                        </div>
                        <div class="memo-comments-body" id="memo-comments-body-${memoId}">
                            <!-- 评论系统将在这里加载 -->
                        </div>
                    </div>
                </div>
            </div>
        `;

      article.classList.add("memo-card");

      // 绑定点赞和评论事件
      setTimeout(() => {
        const likeBtn = article.querySelector(".like-btn");
        if (likeBtn) {
          // 检查是否已点赞（通过 Cookie）
          const cookieName = `memos_liked_${memoId}`;
          if (document.cookie.includes(cookieName)) {
            likeBtn.classList.add("liked");
            likeBtn.disabled = true;
          }

          // 点赞数已在 renderMemos 中批量加载，不需要单独加载
          if (!likeBtn.dataset.eventBound) {
            likeBtn.dataset.eventBound = "true"; // 标记已绑定
            likeBtn.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.likeMemo(memoId, likeBtn);
            });
          }
        }

        // 绑定评论按钮事件（评论数已在 renderMemos 后批量加载）
        const commentBtn = article.querySelector(".comment-btn");
        if (commentBtn && !commentBtn.dataset.eventBound) {
          commentBtn.dataset.eventBound = "true"; // 标记已绑定
          commentBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.toggleComments(memoId, commentBtn);
          });
        }
      }, 0);

      return article;
    }

    // 展开/收起评论区（照搬旧版本）
    toggleComments(memoId, button) {
      // 清理 memoId，确保与 HTML 生成时一致
      const cleanMemoId = String(memoId).replace(/[^a-zA-Z0-9_-]/g, "_");
      const commentsWrapper = document.getElementById(
        `memo-comments-${cleanMemoId}`
      );

      if (!commentsWrapper) {
        console.error(
          "评论区容器未找到:",
          `memo-comments-${cleanMemoId}`,
          "原始ID:",
          memoId
        );
        return;
      }

      const isVisible =
        commentsWrapper.style.display !== "none" &&
        commentsWrapper.style.display !== "";

      if (isVisible) {
        // 收起评论
        commentsWrapper.style.display = "none";
        button.classList.remove("active");
        button.title = "展开评论";

        // 更新按钮图标和文字
        const icon = button.querySelector("i");
        const text = button.querySelector(".comment-text");
        if (icon) icon.className = "fas fa-comment";
        if (text) text.textContent = "评论";
      } else {
        // 展开评论
        commentsWrapper.style.display = "block";
        button.classList.add("active");
        button.title = "收起评论";

        // 更新按钮图标和文字
        const icon = button.querySelector("i");
        const text = button.querySelector(".comment-text");
        if (icon) icon.className = "fas fa-comment-slash";
        if (text) text.textContent = "收起";

        // 加载评论系统（传递原始 memoId，让 loadCommentSystem 处理清理）
        this.loadCommentSystem(memoId);

        // 滚动到评论区
        setTimeout(() => {
          commentsWrapper.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          });
        }, 100);
      }
    }

    // 加载评论系统（照搬旧版本）
    loadCommentSystem(memoId) {
      // 清理 memoId，移除或转义特殊字符，确保可以作为有效的 DOM ID
      const cleanMemoId = String(memoId).replace(/[^a-zA-Z0-9_-]/g, "_");
      const container = document.getElementById(
        `memo-comments-body-${cleanMemoId}`
      );

      if (!container) {
        console.error(
          "评论容器未找到:",
          `memo-comments-body-${cleanMemoId}`,
          "原始ID:",
          memoId
        );
        return;
      }

      if (container.dataset.loaded === "true") return;

      const commentSystem = window.westlifeMemosCommentSystem || "none";
      const commentConfig = window.westlifeMemosCommentConfig || {};

      if (commentSystem === "none") {
        container.innerHTML =
          '<p style="text-align: center; color: #9ca3af; padding: 20px;">评论功能未启用</p>';
        return;
      }

      // 生成唯一的评论路径
      // 注意：memoId 已经包含 'memos/' 前缀，所以只需要在前面加 '/'
      const commentPath = memoId.startsWith("memos/")
        ? `/${memoId}`
        : `/memos/${memoId}`;

      if (commentSystem === "twikoo") {
        const envId = commentConfig.twikoo_envid;
        if (envId && typeof twikoo !== "undefined") {
          twikoo.init({
            envId: envId,
            el: container, // 直接使用 DOM 元素，而不是选择器
            path: commentPath,
            lang: "zh-CN",
          });
          container.dataset.loaded = "true";
        } else {
          container.innerHTML =
            '<p style="text-align: center; color: #ef4444; padding: 20px;">Twikoo 配置错误或未加载</p>';
        }
      } else if (commentSystem === "waline") {
        const serverURL = commentConfig.waline_serverurl;
        if (serverURL && typeof Waline !== "undefined") {
          Waline.init({
            el: container, // 直接使用 DOM 元素，而不是选择器
            serverURL: serverURL,
            path: commentPath,
            lang: "zh-CN",
            locale: {
              placeholder: "欢迎评论...",
            },
          });
          container.dataset.loaded = "true";
        } else {
          container.innerHTML =
            '<p style="text-align: center; color: #ef4444; padding: 20px;">Waline 配置错误或未加载</p>';
        }
      }
    }

    // 批量加载点赞数（优化版本）
    async loadBatchLikeCounts(memoIds) {
      try {
        const ajaxUrl =
          this.config.ajaxUrl ||
          this.config.ajax_url ||
          (typeof ajaxurl !== "undefined"
            ? ajaxurl
            : "/wp-admin/admin-ajax.php");

        const response = await fetch(ajaxUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            action: "get_batch_memo_likes",
            memo_ids: memoIds.join(","),
          }),
        });

        const data = await response.json();
        if (data.success && data.data.likes) {
          // 更新所有点赞数
          Object.entries(data.data.likes).forEach(([memoId, likes]) => {
            // 后端返回的 memoId 可能是 "memos/xxx"，需要提取纯 ID
            const pureMemoId = String(memoId).replace(/^memos\//, "");

            // 清理 ID 用于选择器（按钮的 data-memo-id 是清理后的 ID）
            const cleanMemoId = String(pureMemoId).replace(
              /[^a-zA-Z0-9_-]/g,
              "_"
            );

            const button = document.querySelector(
              `.like-btn[data-memo-id="${cleanMemoId}"]`
            );

            if (button) {
              const likesSpan = button.querySelector(".like-count");
              if (likesSpan) {
                likesSpan.textContent = likes || 0;
              }
            } else {
              console.warn(`[点赞] 找不到按钮: ${cleanMemoId}`);
            }
          });
        }
      } catch (error) {
        console.error("批量加载点赞数失败:", error);
      }
    }

    // 加载点赞数（单个，保留用于兼容）
    async loadLikeCount(memoId, button) {
      // 单个加载已被批量加载取代，这里仅用于特殊情况
      try {
        const ajaxUrl =
          this.config.ajaxUrl ||
          this.config.ajax_url ||
          (typeof ajaxurl !== "undefined"
            ? ajaxurl
            : "/wp-admin/admin-ajax.php");

        const response = await fetch(ajaxUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            action: "get_memo_likes",
            memo_id: memoId,
          }),
        });

        const data = await response.json();
        if (data.success && data.data.likes > 0) {
          const likesSpan = button.querySelector(".like-count");
          if (likesSpan) {
            likesSpan.textContent = data.data.likes;
          }
        }
      } catch (error) {
        console.error("加载点赞数失败:", error);
      }
    }

    // 批量加载评论数（根据指定的 memo IDs）
    async loadBatchCommentCountsForIds(memoIds) {
      try {
        const commentSystem =
          window.westlifeMemosCommentSystem ||
          this.config.commentSystem ||
          "none";

        if (commentSystem === "none" || !memoIds || memoIds.length === 0) {
          return;
        }

        // 收集指定 memo 的路径
        // memoIds 现在已经是纯 ID（没有 memos/ 前缀），直接使用
        const paths = memoIds.map((id) => `/memos/${id}`);

        // 根据不同的评论系统批量获取评论数
        if (commentSystem === "twikoo") {
          await this.getBatchTwikooCommentCount(paths);
        } else if (commentSystem === "waline") {
          // Waline 批量获取（如果需要）
          // await this.getBatchWalineCommentCount(paths);
        }
      } catch (error) {
        console.error("批量加载评论数失败:", error);
      }
    }

    // 批量加载评论数（在 renderMemos 之后调用 - 保留用于兼容）
    async loadBatchCommentCounts() {
      // 这个方法已被 loadBatchCommentCountsForIds 取代
      // 保留用于向后兼容
      const memoIds = this.displayedMemos
        .map((memo) => memo.id)
        .filter(Boolean);
      await this.loadBatchCommentCountsForIds(memoIds);
    }

    // 加载评论数（单个，保留用于兼容）
    async loadCommentCount(memoId, commentBtn) {
      // 单个加载已被批量加载取代，这里仅用于特殊情况
      try {
        const commentSystem =
          window.westlifeMemosCommentSystem ||
          this.config.commentSystem ||
          "none";

        if (commentSystem === "none") {
          return;
        }

        const commentPath = `/memos/${memoId}`;

        if (commentSystem === "twikoo") {
          await this.getTwikooCommentCount(commentPath, commentBtn);
        } else if (commentSystem === "waline") {
          await this.getWalineCommentCount(commentPath, commentBtn);
        }
      } catch (error) {
        console.error("加载评论数失败:", error);
      }
    }

    // 批量获取 Twikoo 评论数（优化版本）
    async getBatchTwikooCommentCount(paths) {
      try {
        // 检查 Twikoo 是否已加载
        if (typeof twikoo === "undefined") {
          console.warn("Twikoo 脚本未加载");
          return;
        }

        const envId = window.westlifeMemosCommentConfig?.twikoo_envid || "";

        if (!envId) {
          console.warn("Twikoo envId 未配置");
          return;
        }

        // 过滤出需要请求的路径（排除已缓存的）
        const pathsToFetch = [];
        const cachedCounts = {};

        paths.forEach((path) => {
          const cacheKey = `twikoo_count_${path}`;
          const cached = sessionStorage.getItem(cacheKey);
          if (cached) {
            try {
              const { count, timestamp } = JSON.parse(cached);
              // 缓存 5 分钟
              if (Date.now() - timestamp < 300000) {
                cachedCounts[path] = count;
                return;
              }
            } catch (e) {
              sessionStorage.removeItem(cacheKey);
            }
          }
          pathsToFetch.push(path);
        });

        // 先更新缓存的数据
        Object.entries(cachedCounts).forEach(([path, count]) => {
          const memoId = path.split("/").pop();
          const commentBtn = document.querySelector(
            `.comment-btn[data-memo-id="${memoId}"]`
          );
          if (commentBtn && count > 0) {
            this.updateCommentCount(commentBtn, count);
          }
        });

        // 批量请求未缓存的数据
        if (pathsToFetch.length > 0) {
          const counts = await twikoo.getCommentsCount({
            envId: envId,
            urls: pathsToFetch,
            includeReply: true,
          });

          if (counts && counts.length > 0) {
            counts.forEach((item) => {
              const { url, count } = item;

              // 缓存结果
              const cacheKey = `twikoo_count_${url}`;
              sessionStorage.setItem(
                cacheKey,
                JSON.stringify({ count, timestamp: Date.now() })
              );

              // 更新显示
              // url 格式: /memos/xxx, 提取出纯 ID（xxx）
              const pureMemoId = url.replace(/^\/memos\//, "");

              // 清理 ID 用于选择器（按钮的 data-memo-id 是清理后的 ID）
              const cleanMemoId = String(pureMemoId).replace(
                /[^a-zA-Z0-9_-]/g,
                "_"
              );

              const commentBtn = document.querySelector(
                `.comment-btn[data-memo-id="${cleanMemoId}"]`
              );

              if (commentBtn) {
                this.updateCommentCount(commentBtn, count);
              } else {
                console.warn(`找不到评论按钮: cleanMemoId=${cleanMemoId}`);
              }
            });
          }
        }
      } catch (error) {
        console.error("批量获取 Twikoo 评论数失败:", error);
      }
    }

    // 获取 Twikoo 评论数（单个，保留用于兼容）
    async getTwikooCommentCount(path, commentBtn) {
      // 单个获取已被批量获取取代，这里仅用于特殊情况
      try {
        if (typeof twikoo === "undefined") {
          return;
        }

        const envId = window.westlifeMemosCommentConfig?.twikoo_envid || "";
        if (!envId) {
          return;
        }

        const cacheKey = `twikoo_count_${path}`;
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          try {
            const { count, timestamp } = JSON.parse(cached);
            if (Date.now() - timestamp < 300000) {
              this.updateCommentCount(commentBtn, count);
              return;
            }
          } catch (e) {
            sessionStorage.removeItem(cacheKey);
          }
        }

        const counts = await twikoo.getCommentsCount({
          envId: envId,
          urls: [path],
          includeReply: true,
        });

        if (counts && counts.length > 0) {
          const count = counts[0].count;
          sessionStorage.setItem(
            cacheKey,
            JSON.stringify({ count, timestamp: Date.now() })
          );
          this.updateCommentCount(commentBtn, count);
        }
      } catch (error) {
        console.error("获取 Twikoo 评论数失败:", error);
      }
    }

    // 获取 Waline 评论数
    async getWalineCommentCount(path, commentBtn) {
      try {
        const serverURL =
          window.westlifeMemosCommentConfig?.waline_serverurl || "";
        if (!serverURL) {
          return;
        }

        // Waline 提供了评论数 API
        const response = await fetch(
          `${serverURL}/api/comment?type=count&url=${encodeURIComponent(path)}`
        );
        const data = await response.json();

        if (data && typeof data.data === "number") {
          this.updateCommentCount(commentBtn, data.data);
        }
      } catch (error) {
        console.error("获取 Waline 评论数失败:", error);
      }
    }

    // 更新评论数显示
    updateCommentCount(commentBtn, count) {
      if (!commentBtn) {
        console.warn("评论按钮不存在");
        return;
      }

      const countSpan = commentBtn.querySelector(".comment-count");

      if (countSpan) {
        countSpan.textContent = count;
        if (count > 0) {
          countSpan.style.display = "inline"; // 显示计数
        }
      } else {
        console.warn("找不到 .comment-count 元素");
      }
    }

    // 生成Memos平台链接
    generateMemosUrl(memo) {
      // 从后台配置读取 Memos 基础 URL，如果没有则使用当前域名
      const baseUrl =
        this.config.memos_base_url ||
        this.config.memosBaseUrl ||
        "https://pan.sb";

      // 优先使用 name 字段（新版 API，格式如：memos/xxxxx）
      if (memo.name && typeof memo.name === "string") {
        // 如果 name 已经包含路径前缀（如 "memos/xxxxx"），直接拼接
        if (memo.name.includes("/")) {
          return `${baseUrl}/${memo.name}`;
        }
        // 如果 name 是纯 ID，添加 memos/ 前缀（新版默认格式）
        return `${baseUrl}/memos/${memo.name}`;
      }

      // 回退到 uid 字段（纯 ID）
      if (memo.uid && typeof memo.uid === "string") {
        // uid 通常是纯 ID，使用 /m/ 短路径（旧版兼容）
        return `${baseUrl}/m/${memo.uid}`;
      }

      // 最后尝试 id 字段
      if (memo.id && typeof memo.id === "string") {
        // 如果 id 包含路径前缀，直接使用
        if (memo.id.includes("/")) {
          return `${baseUrl}/${memo.id}`;
        }
        // 纯 ID，使用 memos/ 前缀
        return `${baseUrl}/memos/${memo.id}`;
      }

      return baseUrl;
    }

    // 获取附件中的图片
    getAttachmentImages(memo) {
      // 优先使用后端处理好的 images 数据
      if (memo.images && Array.isArray(memo.images) && memo.images.length > 0) {
        return memo.images;
      }

      // 如果没有后端数据，回退到原来的逻辑
      const images = [];
      const attachmentFields = ["resources", "attachments", "files", "media"];

      attachmentFields.forEach((field) => {
        if (memo[field] && Array.isArray(memo[field])) {
          memo[field].forEach((resource) => {
            if (this.isImageResource(resource)) {
              const imageUrl = this.getResourceUrl(resource);
              if (imageUrl) {
                images.push({
                  url: imageUrl,
                  name: resource.filename || resource.name || "图片",
                  type: resource.type || resource.mimeType || "image",
                });
              }
            }
          });
        }
      });

      if (memo.nodes && Array.isArray(memo.nodes)) {
        memo.nodes.forEach((node) => {
          if (node.type === "IMAGE" && node.imageNode) {
            const imageUrl = node.imageNode.url;
            if (imageUrl) {
              images.push({
                url: imageUrl,
                name: node.imageNode.altText || "图片",
                type: "image",
              });
            }
          }
        });
      }

      return images;
    }

    isImageResource(resource) {
      const mimeType =
        resource.type || resource.mimeType || resource.contentType || "";
      if (mimeType.startsWith("image/")) {
        return true;
      }

      const filename =
        resource.filename || resource.name || resource.publicId || "";
      const imageExtensions = [
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".webp",
        ".svg",
        ".bmp",
      ];
      return imageExtensions.some((ext) =>
        filename.toLowerCase().endsWith(ext)
      );
    }

    getResourceUrl(resource) {
      const urlFields = ["url", "downloadUrl", "publicUrl", "link", "src"];

      for (const field of urlFields) {
        if (resource[field]) {
          let url = resource[field];

          if (url.startsWith("/")) {
            const baseUrl = this.config.memosBaseUrl || window.location.origin;
            url = baseUrl + url;
          }

          return url;
        }
      }

      if (resource.publicId) {
        const baseUrl = this.config.memosBaseUrl || window.location.origin;
        return `${baseUrl}/file/${resource.publicId}/${
          resource.filename || "image"
        }`;
      }

      return null;
    }

    extractTagsFromContent(content) {
      const tagRegex = /#([^\s#]+)/g;
      const tags = [];
      let match;

      while ((match = tagRegex.exec(content)) !== null) {
        const tag = match[1];
        if (!tags.includes(tag)) {
          tags.push(tag);
        }
      }

      return tags;
    }

    formatContent(content) {
      if (!content) return "";

      // 1. 处理图片 - 支持 ![alt](url) 和 直接 URL（使用懒加载）
      const placeholder = this.getPlaceholder();
      content = content.replace(
        /!\[(.*?)\]\((.*?)\)/g,
        `<div class="memo-image-container"${this.isImageViewerEnabled() ? " view-image" : ""}><a href="$2" class="img-link"><img src="${placeholder}" data-src="$2" alt="$1" class="memo-image zoom-in lazyload" loading="lazy" /></a></div>`
      );

      // 处理直接的图片链接
      content = content.replace(
        /https?:\/\/[^\s]+\.(jpg|jpeg|png|gif|webp|svg)(\?[^\s]*)?/gi,
        `<div class="memo-image-container"${this.isImageViewerEnabled() ? " view-image" : ""}><a href="$&" class="img-link"><img src="${placeholder}" data-src="$&" alt="图片" class="memo-image zoom-in lazyload" loading="lazy" /></a></div>`
      );

      // 2. 处理代码块 - 三个反引号包围的代码
      content = content.replace(
        /```([a-zA-Z]*)\n?([\s\S]*?)```/g,
        '<div class="memo-code-block"><div class="code-header"><span class="code-language">$1</span><button class="code-copy-btn" title="复制代码"><i class="fas fa-copy"></i></button></div><pre><code class="language-$1">$2</code></pre></div>'
      );

      // 3. 处理行内代码 - 单个反引号包围的代码
      content = content.replace(
        /`([^`]+)`/g,
        '<code class="memo-inline-code">$1</code>'
      );

      // 4. 处理换行
      content = content.replace(/\n/g, "<br>");

      // 5. 处理链接 - 但不要影响已经处理的图片
      content = content.replace(
        /(?<!<img[^>]*src=")https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g,
        '<a href="$&" target="_blank" rel="noopener noreferrer" class="memo-link">$&</a>'
      );

      // 6. 处理 @提及
      content = content.replace(/@(\w+)/g, '<span class="mention">@$1</span>');

      // 7. 处理标签高亮（只在内容中显示，点击可筛选）
      content = content.replace(
        /#([\u4e00-\u9fa5a-zA-Z0-9_]+)/g,
        '<span class="memo-tag-inline" onclick="memosManager.searchByTag(\'$1\')">#$1</span>'
      );

      // 8. 处理引用
      content = content.replace(
        /^&gt;\s*(.+)/gm,
        '<blockquote class="memo-quote">$1</blockquote>'
      );

      return content;
    }

    // 复制代码功能
    copyCode(button) {
      const codeBlock = button.closest(".memo-code-block");
      const code = codeBlock.querySelector("code").textContent;

      if (navigator.clipboard) {
        navigator.clipboard.writeText(code).then(() => {
          const originalText = button.innerHTML;
          button.innerHTML = '<i class="fas fa-check"></i>';
          button.style.color = "#10b981";

          setTimeout(() => {
            button.innerHTML = originalText;
            button.style.color = "";
          }, 2000);
        });
      }
    }

    updateStats() {
      const totalMemos = document.getElementById("total-memos");
      const totalDays = document.getElementById("total-days");
      const thisMonthEl = document.getElementById("memos-this-month");
      const last30El = document.getElementById("memos-last30");

      // 优先使用总体统计数据（兜底更新，不带动画）
      if (this.totalStats) {
        if (totalMemos) {
          totalMemos.textContent =
            this.totalStats.totalMemos || this.totalStats.total || 0;
        }
        if (totalDays) {
          totalDays.textContent =
            this.totalStats.totalDays || this.totalStats.days || 0;
        }
        if (thisMonthEl) {
          thisMonthEl.textContent = this.totalStats.thisMonth || 0;
        }
        if (last30El) {
          last30El.textContent = this.totalStats.last30 || 0;
        }
      }
    }

    renderTags() {
      const tagsContainer = document.getElementById("tags-cloud");
      if (!tagsContainer) return;

      const tagCount = {};
      this.allMemos.forEach((memo) => {
        const contentTags = this.extractTagsFromContent(memo.content || "");
        contentTags.forEach((tag) => {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        });
      });

      const sortedTags = Object.entries(tagCount)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20);

      if (sortedTags.length === 0) {
        return;
      }

      tagsContainer.innerHTML = sortedTags
        .map(
          ([tag, count]) => `
            <span class="tag-item" onclick="memosManager.searchByTag('${tag}')">
                ${tag}
                <span class="tag-count">(${count})</span>
            </span>
        `
        )
        .join("");
    }

    searchByTag(tag) {
      const searchInput = document.getElementById("memos-search");
      if (searchInput) {
        searchInput.value = `#${tag}`;
      }
      this.handleSearch(`#${tag}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    async checkServiceStatus() {
      const statusIcon = document.getElementById("status-indicator");
      const statusText = document.getElementById("status-text");

      if (!statusIcon || !statusText) return;

      // 1. 显示检测中状态
      statusIcon.className = "status-indicator loading";
      statusIcon.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
      statusText.textContent = "检测中";

      try {
        const formData = new FormData();
        formData.append("action", "memos_latest");
        formData.append("nonce", this.config.nonce);

        const response = await fetch(this.config.ajaxUrl, {
          method: "POST",
          body: formData,
        });

        const result = await response.json();

        if (result.success) {
          // 2. 检测成功 - 显示在线（绿色wifi）
          statusIcon.className = "status-indicator online";
          statusIcon.innerHTML = '<i class="fas fa-wifi"></i>';
          statusText.textContent = "在线";
        } else {
          throw new Error("Service offline");
        }
      } catch (error) {
        // 3. 检测失败 - 显示离线（红色wifi）
        statusIcon.className = "status-indicator offline";
        statusIcon.innerHTML = '<i class="fas fa-wifi"></i>';
        statusText.textContent = "离线";
      }
    }

    shouldLoadMore() {
      if (!this.hasMore || this.isLoading) return false;

      // 如果已经自动加载超过限制次数，不再自动触发
      if (this.autoLoadCount >= this.maxAutoLoad) return false;

      const scrollTop =
        window.pageYOffset || document.documentElement.scrollTop;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      return scrollTop + windowHeight >= documentHeight - 1000;
    }

    toggleView() {
      const grid = document.getElementById("memos-grid");
      const toggleBtn = document.getElementById("toggle-view");

      if (!grid || !toggleBtn) return;

      const currentLayout = grid.getAttribute("data-layout") || "list";

      // 添加淡出效果
      grid.style.opacity = "0";
      grid.style.transform = "translateY(10px)";

      setTimeout(() => {
        // 切换布局：list <-> magazine
        if (currentLayout === "list") {
          // 切换到杂志模式
          grid.setAttribute("data-layout", "magazine");
          toggleBtn.setAttribute("data-view", "magazine");
          toggleBtn.innerHTML =
            '<i class="fas fa-th-large"></i><span class="view-text">杂志</span>';
          toggleBtn.title = "切换到列表布局";

          // 保存用户偏好
          try {
            localStorage.setItem("memos_layout", "magazine");
          } catch (e) {}
        } else {
          // 切换到列表模式
          grid.setAttribute("data-layout", "list");
          toggleBtn.setAttribute("data-view", "list");
          toggleBtn.innerHTML =
            '<i class="fas fa-list"></i><span class="view-text">列表</span>';
          toggleBtn.title = "切换到杂志布局";

          // 保存用户偏好
          try {
            localStorage.setItem("memos_layout", "list");
          } catch (e) {}
        }

        // 应用对应布局
        if (currentLayout === "list") {
          // 切换到杂志模式，应用 Masonry 布局
          setTimeout(() => this.applyMasonryLayout(), 100);
        } else {
          // 切换到列表模式，重置布局
          this.resetListLayout();
        }

        // 淡入效果
        setTimeout(() => {
          grid.style.opacity = "1";
          grid.style.transform = "translateY(0)";
        }, 50);

        // 重新初始化图片功能（确保懒加载和图片预览正常工作）
        setTimeout(() => {
          this.initImageFeatures();
        }, 100);
      }, 200); // 等待淡出完成
    }

    // Masonry 瀑布流布局算法
    applyMasonryLayout() {
      const grid = document.getElementById("memos-grid");
      if (!grid || grid.getAttribute("data-layout") !== "magazine") return;

      const cards = Array.from(grid.querySelectorAll(".memo-card"));
      if (cards.length === 0) return;

      // 获取列数（响应式）
      const containerWidth = grid.offsetWidth;
      let columns = 3;
      let gap = 12; // 卡片间距（紧凑）

      if (containerWidth <= 768) {
        columns = 1;
        gap = 16; // 手机单列时稍大
      } else if (containerWidth <= 1200) {
        columns = 2;
        gap = 14; // 平板两列时中等
      }

      const columnWidth = (containerWidth - gap * (columns - 1)) / columns;

      // 初始化每列的高度
      const columnHeights = new Array(columns).fill(0);

      // 记录展开卡片的总高度（用于调整容器高度）
      let expandedCardsHeight = 0;

      // 遍历所有卡片，计算位置
      cards.forEach((card) => {
        // 如果卡片已展开（显示评论），跳过瀑布流布局
        if (card.classList.contains("expanded")) {
          card.style.width = "100%";
          card.style.left = "0";
          card.style.top = "auto";
          card.style.position = "relative";

          // 精确计算展开卡片的实际高度
          // 强制重新计算布局以获取真实高度
          card.style.height = "auto";
          const actualHeight = card.getBoundingClientRect().height;

          // 累加展开卡片的实际高度（包括 margin-bottom）
          expandedCardsHeight += actualHeight + 20;
          return;
        }

        // 找到最短的一列
        const shortestColumnIndex = columnHeights.indexOf(
          Math.min(...columnHeights)
        );

        // 设置卡片宽度
        card.style.width = `${columnWidth}px`;

        // 计算卡片位置
        const left = shortestColumnIndex * (columnWidth + gap);
        const top = columnHeights[shortestColumnIndex];

        // 应用位置
        card.style.left = `${left}px`;
        card.style.top = `${top}px`;
        card.style.position = "absolute";

        // 更新该列的高度（卡片高度 + 间距）
        const cardHeight = card.offsetHeight;
        columnHeights[shortestColumnIndex] += cardHeight + gap;
      });

      // 设置容器高度（瀑布流最高列 + 展开卡片的高度）
      const maxHeight = Math.max(...columnHeights);
      grid.style.height = `${maxHeight + expandedCardsHeight}px`;
    }

    // 重置列表模式布局
    resetListLayout() {
      const grid = document.getElementById("memos-grid");
      if (!grid) return;

      // 清除高度
      grid.style.height = "auto";

      // 清除所有卡片的绝对定位
      const cards = grid.querySelectorAll(".memo-card");
      cards.forEach((card) => {
        card.style.position = "";
        card.style.left = "";
        card.style.top = "";
        card.style.width = "";
      });
    }

    async copyMemo(id) {
      const memo = this.allMemos.find((m) => {
        const memoId = m.id || m.uid || m.name || m.resourceName;
        // 检查是否需要清理 ID（移除 memos/ 前缀）
        const cleanMemoId = String(memoId).replace(/^memos\//, "");
        const cleanSearchId = String(id).replace(/^memos\//, "");
        return cleanMemoId === cleanSearchId || memoId === id;
      });

      if (!memo) {
        this.showMessage("未找到说说内容", "error", 2000);
        return;
      }

      try {
        let success = false;

        // 尝试使用现代 Clipboard API（HTTPS 环境）
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(memo.content);
          success = true;
        } else {
          // 降级：使用传统 execCommand 方法（兼容非 HTTPS 环境）
          const textarea = document.createElement("textarea");
          textarea.value = memo.content;
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
          this.showMessage("说说内容复制成功 ✨", "success", 2000);
        } else {
          this.showMessage("复制失败，请重试", "error", 2000);
        }
      } catch (err) {
        console.error("[Memos] 复制失败:", err);
        this.showMessage("复制失败，请重试", "error", 2000);
      }
    }

    /**
     * 显示消息通知 - 使用主题自带的通知样式
     */
    showMessage(message, type = "info", duration = 3000) {
      // 统一使用主题的通知系统 WestlifeUtils.showMessage
      if (
        window.WestlifeUtils &&
        typeof window.WestlifeUtils.showMessage === "function"
      ) {
        window.WestlifeUtils.showMessage(message, type, duration);
      } else {
        // 如果主题通知系统未加载，使用 console 提示（避免自定义通知样式冲突）
        console.warn("[Memos] 主题通知系统未加载:", message);
      }
    }

    startAutoRefresh() {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
      }

      this.refreshTimer = setInterval(async () => {
        await this.checkForNewContent();
      }, this.config.refreshInterval || 300000);
    }

    debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
        const later = () => {
          clearTimeout(timeout);
          func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
      };
    }

    // 显示/隐藏状态方法
    showLoading() {
      const skeleton = document.getElementById("skeleton-memos");
      const loading = document.getElementById("loading-state");
      const error = document.getElementById("error-state");
      const empty = document.getElementById("empty-state");
      const grid = document.getElementById("memos-grid");

      // 优先显示骨架屏，提升视觉体验
      if (skeleton) skeleton.style.display = "block";
      if (loading) loading.style.display = "none"; // 不显示传统loading
      if (error) error.style.display = "none";
      if (empty) empty.style.display = "none";
      if (grid) grid.style.display = "none";
    }

    // 显示矩形跳动加载动画（用于刷新）
    showLoadingAnimation() {
      const skeleton = document.getElementById("skeleton-memos");
      const loading = document.getElementById("loading-state");
      const error = document.getElementById("error-state");
      const empty = document.getElementById("empty-state");
      const grid = document.getElementById("memos-grid");

      // 显示矩形跳动动画
      if (skeleton) skeleton.style.display = "none";
      if (loading) {
        loading.style.display = "flex"; // 显示矩形跳动
        loading.classList.remove("u-hidden");
      }
      if (error) error.style.display = "none";
      if (empty) empty.style.display = "none";
      if (grid) grid.style.display = "none";
    }

    hideLoading() {
      const skeleton = document.getElementById("skeleton-memos");
      const loading = document.getElementById("loading-state");
      const grid = document.getElementById("memos-grid");

      // 优雅地隐藏骨架屏
      if (skeleton) {
        skeleton.classList.add("u-fade-out");
        setTimeout(() => {
          skeleton.style.display = "none";
          skeleton.classList.remove("u-fade-out");
        }, 300);
      }

      if (loading) loading.style.display = "none";
      if (grid) {
        grid.style.display = "grid";
        // 添加淡入动画
        grid.style.opacity = "0";
        setTimeout(() => {
          grid.style.opacity = "1";
          grid.style.transition = "opacity 0.3s ease";
        }, 100);
      }
    }

    showError(message) {
      const error = document.getElementById("error-state");
      const errorMessage = document.getElementById("error-message");
      const loading = document.getElementById("loading-state");
      const empty = document.getElementById("empty-state");
      const grid = document.getElementById("memos-grid");

      if (error) error.style.display = "block";
      if (errorMessage) errorMessage.textContent = message;
      if (loading) loading.style.display = "none";
      if (empty) empty.style.display = "none";
      if (grid) grid.style.display = "none";
    }

    hideError() {
      const error = document.getElementById("error-state");
      if (error) error.style.display = "none";
    }

    showEmpty() {
      const empty = document.getElementById("empty-state");
      const loading = document.getElementById("loading-state");
      const error = document.getElementById("error-state");
      const grid = document.getElementById("memos-grid");

      if (empty) empty.style.display = "block";
      if (loading) loading.style.display = "none";
      if (error) error.style.display = "none";
      if (grid) grid.style.display = "none";
    }

    hideEmpty() {
      const empty = document.getElementById("empty-state");
      if (empty) empty.style.display = "none";
    }

    // 绑定发布框事件
    bindPublishEvents() {
      const textarea = document.getElementById("memo-publish-textarea");
      const charCurrent = document.getElementById("memo-char-count");
      const publishBtn = document.getElementById("memo-publish-btn");
      const signal = this.eventController ? this.eventController.signal : undefined;

      if (!textarea || !publishBtn) {
        return;
      }

      // 字符计数
      textarea.addEventListener("input", () => {
        if (charCurrent) {
          charCurrent.textContent = textarea.value.length;
        }
      }, signal ? { signal } : undefined);

      // 发布按钮
      publishBtn.addEventListener("click", () => {
        this.publishMemo();
      }, signal ? { signal } : undefined);

      // Ctrl+Enter 快捷键发布
      textarea.addEventListener("keydown", (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          this.publishMemo();
        }
      }, signal ? { signal } : undefined);
    }

    // 发布 Memo
    async publishMemo() {
      const textarea = document.getElementById("memo-publish-textarea");
      const visibility = document.getElementById("memo-visibility");
      const publishBtn = document.getElementById("memo-publish-btn");

      if (!textarea || !publishBtn) {
        return;
      }

      const content = textarea.value.trim();

      if (!content) {
        alert("请输入内容");
        return;
      }

      // 禁用按钮，显示加载状态
      publishBtn.disabled = true;
      publishBtn.classList.add("publishing");
      const originalText = publishBtn.querySelector("span").textContent;
      publishBtn.querySelector("span").textContent = "发布中...";
      publishBtn.querySelector("i").className = "fas fa-spinner fa-spin";

      try {
        const ajaxUrl =
          this.config.ajaxUrl ||
          this.config.ajax_url ||
          (typeof ajaxurl !== "undefined"
            ? ajaxurl
            : "/wp-admin/admin-ajax.php");
        const nonce =
          this.config.nonce ||
          (typeof westlifeSettings !== "undefined"
            ? westlifeSettings.nonce
            : "");
        const visitorCfg =
          typeof window !== "undefined" ? window.westlifeVisitorConfig || {} : {};
        const visitorData = visitorCfg.visitorData || {};
        const homeProfile = visitorCfg.homeProfile || {};

        const response = await fetch(ajaxUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            action: "memos_create",
            nonce: nonce,
            content: content,
            visibility: visibility?.value || "PUBLIC",
          }),
        });

        const data = await response.json();

        if (data.success) {
          // 清空输入框
          textarea.value = "";
          const charCount = document.getElementById("memo-char-count");
          if (charCount) charCount.textContent = "0";

          // 显示成功提示
          this.showMessage(data.data.message || "发布成功！", "success");

          // 刷新列表
          await this.loadMemos(true);
        } else {
          throw new Error(data.data.message || "发布失败");
        }
      } catch (error) {
        console.error("发布失败:", error);
        this.showMessage(error.message || "发布失败，请重试", "error");
      } finally {
        // 恢复按钮状态
        publishBtn.disabled = false;
        publishBtn.classList.remove("publishing");
        publishBtn.querySelector("span").textContent = originalText;
        publishBtn.querySelector("i").className = "fas fa-paper-plane";
      }
    }

    // 删除 Memo（仅管理员）
    async deleteMemo(memoName, button) {
      if (!memoName) return;

      // 显示确认弹窗（使用主题样式）
      this.showDeleteConfirm(memoName, button);
    }

    // 显示删除确认弹窗
    showDeleteConfirm(memoName, button) {
      // 创建弹窗容器
      const modal = document.createElement("div");
      modal.className = "delete-profile-confirm";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.innerHTML = `
        <div class="delete-profile-confirm-inner">
          <h3 class="delete-profile-title">删除说说</h3>
          <p class="delete-profile-desc">确定要删除这条说说吗？<br><strong>此操作无法撤销。</strong></p>
          <div class="delete-profile-actions">
            <button type="button" class="btn-delete-cancel">取消</button>
            <button type="button" class="btn-delete-confirm">确认删除</button>
          </div>
        </div>
      `;

      document.body.appendChild(modal);

      // 取消按钮
      const cancelBtn = modal.querySelector(".btn-delete-cancel");
      cancelBtn.addEventListener("click", () => {
        modal.setAttribute("aria-hidden", "true");
        setTimeout(() => modal.remove(), 300);
      });

      // 确认删除按钮
      const confirmBtn = modal.querySelector(".btn-delete-confirm");
      confirmBtn.addEventListener("click", async () => {
        modal.setAttribute("aria-hidden", "true");
        setTimeout(() => modal.remove(), 300);

        // 执行删除操作
        await this.executeDelete(memoName, button);
      });

      // 点击背景关闭
      modal.addEventListener("click", (e) => {
        if (e.target === modal) {
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

    // 执行删除操作
    async executeDelete(memoName, button) {
      // 禁用按钮，显示加载状态
      button.disabled = true;
      const originalIcon = button.querySelector("i").className;
      button.querySelector("i").className = "fas fa-spinner fa-spin";

      try {
        const ajaxUrl =
          this.config.ajaxUrl ||
          this.config.ajax_url ||
          (typeof ajaxurl !== "undefined"
            ? ajaxurl
            : "/wp-admin/admin-ajax.php");
        const nonce =
          this.config.nonce ||
          (typeof westlifeSettings !== "undefined"
            ? westlifeSettings.nonce
            : "");

        const response = await fetch(ajaxUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            action: "memos_delete",
            nonce: nonce,
            memo_name: memoName,
          }),
        });

        const data = await response.json();

        if (data.success) {
          // 显示成功提示
          this.showMessage(data.data.message || "删除成功！", "success");

          // 移除卡片（带动画效果）
          const card = button.closest(".memo-card");
          if (card) {
            card.style.transition = "opacity 0.3s, transform 0.3s";
            card.style.opacity = "0";
            card.style.transform = "scale(0.95)";
            setTimeout(() => {
              card.remove();
              // 如果列表为空，显示空状态
              const grid = document.getElementById("memos-grid");
              if (grid && grid.children.length === 0) {
                this.showEmpty();
              }
            }, 300);
          }
        } else {
          throw new Error(data.data.message || "删除失败");
        }
      } catch (error) {
        console.error("删除失败:", error);
        this.showMessage(error.message || "删除失败，请重试", "error");

        // 恢复按钮状态
        button.disabled = false;
        button.querySelector("i").className = originalIcon;
      }
    }

    // 点赞 Memo
    async likeMemo(memoId, button) {
      if (!memoId) return;

      // 防止重复点击
      if (button.classList.contains("liking")) return;

      button.classList.add("liking");
      const originalText = button.textContent;

      try {
        const ajaxUrl =
          this.config.ajaxUrl ||
          this.config.ajax_url ||
          (typeof ajaxurl !== "undefined"
            ? ajaxurl
            : "/wp-admin/admin-ajax.php");
        const nonce =
          this.config.nonce ||
          (typeof westlifeSettings !== "undefined"
            ? westlifeSettings.nonce
            : "");

        const response = await fetch(ajaxUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            action: "memos_like",
            nonce: nonce,
            memo_id: memoId,
            email: homeProfile.email || visitorData.email || "",
            name: homeProfile.display_name || visitorData.name || "",
            url: visitorData.url || "",
          }),
        });

        // 先获取文本，检查是否是 JSON
        const responseText = await response.text();

        let data;
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          console.error("JSON 解析失败:", parseError);
          console.error("完整响应:", responseText);
          throw new Error("服务器返回了非 JSON 格式的数据");
        }

        if (data.success) {
          // 更新点赞数
          const likesSpan = button.querySelector(".like-count");
          if (likesSpan) {
            likesSpan.textContent = data.data.likes;
          }

          // 添加已点赞样式
          button.classList.add("liked");
          button.disabled = true;

          // 设置 Cookie（前端同步，避免刷新前重复点赞）
          const cookieName = `memos_liked_${memoId}`;
          const expires = new Date();
          expires.setTime(expires.getTime() + 30 * 24 * 60 * 60 * 1000); // 30天
          document.cookie = `${cookieName}=1; expires=${expires.toUTCString()}; path=/`;

          // 显示提示
          this.showMessage(data.data.message || "点赞成功！", "success");
        } else {
          throw new Error(data.data.message || "点赞失败");
        }
      } catch (error) {
        console.error("点赞失败:", error);
        this.showMessage(error.message || "点赞失败", "error");
      } finally {
        button.classList.remove("liking");
      }
    }

    // 初始化关键词板块
    initKeywords() {
      const section = document.getElementById("memos-keywords-section");
      if (!section) return;

      // 展开/收起功能
      const header = section.querySelector(".keywords-header");
      const toggle = section.querySelector(".keywords-toggle");
      const signal = this.eventController ? this.eventController.signal : undefined;

      if (header && toggle) {
        header.addEventListener("click", () => {
          section.classList.toggle("collapsed");
        }, signal ? { signal } : undefined);
      }
    }

    // 绑定关键词事件
    bindKeywordsEvents() {
      // 已在 initKeywords 中绑定
    }

    // 提取所有标签
    extractKeywords(memos) {
      this.keywordsMap.clear();

      memos.forEach((memo) => {
        const content = memo.content || "";
        // 匹配 #标签 格式
        const tags = content.match(/#[\u4e00-\u9fa5a-zA-Z0-9_]+/g);

        if (tags) {
          tags.forEach((tag) => {
            const keyword = tag.substring(1); // 去掉 # 号
            const count = this.keywordsMap.get(keyword) || 0;
            this.keywordsMap.set(keyword, count + 1);
          });
        }
      });

      this.renderKeywords();
    }

    // 渲染关键词
    renderKeywords() {
      const container = document.getElementById("keywords-list");
      const loading = document.querySelector(".keywords-loading");
      const empty = document.querySelector(".keywords-empty");
      const totalEl = document.getElementById("keywords-total");

      if (!container) return;

      // 隐藏加载状态
      if (loading) loading.style.display = "none";

      // 按出现次数排序
      const sortedKeywords = Array.from(this.keywordsMap.entries()).sort(
        (a, b) => b[1] - a[1]
      );

      if (sortedKeywords.length === 0) {
        container.innerHTML = "";
        if (empty) empty.style.display = "flex";
        if (totalEl) totalEl.textContent = "0";
        return;
      }

      // 隐藏空状态
      if (empty) empty.style.display = "none";

      // 更新总数
      if (totalEl) totalEl.textContent = sortedKeywords.length;

      // 生成标签HTML（最多显示20个）
      const html = sortedKeywords
        .slice(0, 20)
        .map(([keyword, count]) => {
          const isActive = this.selectedKeyword === keyword ? "active" : "";
          return `
            <span class="keyword-tag ${isActive}" data-keyword="${keyword}">
              <i class="fas fa-hashtag"></i>
              <span>${keyword}</span>
              <span class="tag-count">${count}</span>
            </span>
          `;
        })
        .join("");

      container.innerHTML = html;

      // 绑定点击事件
      container.querySelectorAll(".keyword-tag").forEach((tag) => {
        tag.addEventListener("click", () => {
          const keyword = tag.getAttribute("data-keyword");
          this.filterByKeyword(keyword);
        });
      });
    }

    // 按关键词筛选
    filterByKeyword(keyword) {
      // 切换选中状态
      if (this.selectedKeyword === keyword) {
        this.selectedKeyword = null;
      } else {
        this.selectedKeyword = keyword;
      }

      // 更新UI
      document.querySelectorAll(".keyword-tag").forEach((tag) => {
        if (tag.getAttribute("data-keyword") === keyword) {
          tag.classList.toggle("active");
        } else {
          tag.classList.remove("active");
        }
      });

      // 如果没有选中关键词，显示全部
      if (!this.selectedKeyword) {
        this.filteredMemos = [...this.allMemos];
      } else {
        // 筛选包含该关键词的说说
        this.filteredMemos = this.allMemos.filter((memo) => {
          const content = memo.content || "";
          return content.includes(`#${this.selectedKeyword}`);
        });
      }

      // 重新渲染
      this.renderMemos();

      // 显示提示
      if (this.selectedKeyword) {
        this.showMessage(`已筛选标签: #${this.selectedKeyword}`, "info");
      }
    }

    // 点击卡片外部关闭展开的评论
    bindOutsideClickToCloseComments() {
      document.addEventListener("click", (e) => {
        const container = document.getElementById("memos-grid");
        if (
          !container ||
          container.getAttribute("data-layout") !== "magazine"
        ) {
          return;
        }
        const memoCard = e.target.closest(".memo-card");
        if (memoCard) return;
        const expandedCards = container.querySelectorAll(".memo-card.expanded");
        if (expandedCards.length > 0) {
          expandedCards.forEach((card) => {
            const commentBtn = card.querySelector(".comment-btn");
            if (commentBtn) {
              const memoId = commentBtn.getAttribute("data-memo-id");
              const commentsWrapper = document.getElementById(
                `memo-comments-${memoId}`
              );
              if (commentsWrapper && commentsWrapper.style.display !== "none") {
                commentsWrapper.style.display = "none";
                commentBtn.classList.remove("active");
                commentBtn.title = "展开评论";
                card.classList.remove("expanded");
              }
            }
          });
          setTimeout(() => this.applyMasonryLayout(), 350);
        }
      });
    }

    destroy() {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
      }
      if (this.eventController) {
        this.eventController.abort();
        this.eventController = null;
      }
      if (this._onScroll) {
        window.removeEventListener("scroll", this._onScroll);
        this._onScroll = null;
      }
    }
  }

  function initMemosPage() {
    if (
      typeof window.MemosAPI !== "undefined" ||
      typeof window.memosConfig !== "undefined"
    ) {
      // 若已经存在实例，先销毁再重建（热更新 / 局部刷新安全）
      if (
        window.memosManager &&
        typeof window.memosManager.destroy === "function"
      ) {
        try {
          window.memosManager.destroy();
        } catch (e) {}
      }
      window.memosManager = new MemosManager();
    }
  }

  function destroyMemosPage() {
    if (
      window.memosManager &&
      typeof window.memosManager.destroy === "function"
    ) {
      try {
        window.memosManager.destroy();
      } catch (e) {}
    }
    window.memosManager = null;
  }

  if (window.WestlifeApp && typeof window.WestlifeApp.register === "function") {
    window.WestlifeApp.register({
      name: "memos-page",
      match(context) {
        const root =
          context && context.nodeType === 1 ? context : document;
        return !!root.querySelector(
          "#memos-grid, .memos-page, .memos-container, #memos-search"
        );
      },
      init() {
        initMemosPage();
      },
      destroy() {
        destroyMemosPage();
      },
    });
  } else {
    // 页面加载完成后初始化 - 只初始化一个管理器
    document.addEventListener("DOMContentLoaded", function () {
      initMemosPage();
    });
  }

  // 页面卸载时清理
  window.addEventListener("beforeunload", function () {
    if (window.memosManager) {
      window.memosManager.destroy();
    }
  });
} // end guard
