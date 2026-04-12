(function ($, w, d) {
  "use strict";

  const icon = (name, attrs = {}) =>
    window.WestlifeIcons && typeof window.WestlifeIcons.icon === "function"
      ? window.WestlifeIcons.icon(name, attrs)
      : "";

  // 工具函数
  const Utils = {
    // 简易通知队列，避免多条通知重叠
    _noticeQueue: [],
    _noticeShowing: false,
    _enqueueNotice: function (message, type = "info", duration = 2000) {
      this._noticeQueue.push({ message: String(message), type, duration });
      this._drainNotices();
    },
    _drainNotices: function () {
      if (this._noticeShowing) return;
      var next = this._noticeQueue.shift();
      if (!next) return;
      this._noticeShowing = true;
      if (
        w.WestlifeUtils &&
        typeof w.WestlifeUtils.showMessage === "function"
      ) {
        try {
          w.WestlifeUtils.showMessage(next.message, next.type, next.duration);
        } catch (e) {
        }
      } else {
        // 主题通知未加载时静默跳过
      }
      // 在 duration 后允许显示下一条
      setTimeout(() => {
        this._noticeShowing = false;
        this._drainNotices();
      }, Math.max(500, Number(next.duration) || 2000));
    },
    // 格式化本地时间
    formatLocalTime: function (timestamp) {
      var d = new Date(timestamp * 1000);
      try {
        var formatter = new Intl.DateTimeFormat("zh-CN", {
          timeZone:
            (w.westlifeSettings && w.westlifeSettings.siteTimezone) || "UTC",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
        var parts = {};
        formatter.formatToParts(d).forEach(function (part) {
          if (part.type !== "literal") parts[part.type] = part.value;
        });
        return (
          parts.year +
          "-" +
          parts.month +
          "-" +
          parts.day +
          " " +
          parts.hour +
          ":" +
          parts.minute +
          ":" +
          parts.second
        );
      } catch (e) {
        return d.toISOString().slice(0, 19).replace("T", " ");
      }
    },

    showError: function (message, duration = 2500) {
      console.error("Feeds Error:", message);
      this._enqueueNotice(message, "error", duration);
    },

    showSuccess: function (message, duration = 2500) {
      this._enqueueNotice(message, "success", duration);
    },

    // 显示快速提示（改为调用主题通知样式，纯文字、无自定义样式）
    showQuickTip: function (message, duration = 3000) {
      this._enqueueNotice(message, "info", duration);
    },

    getAjaxConfig: function () {
      return {
        url: "/wp-admin/admin-ajax.php",
        nonce: (w.westlifeSettings && w.westlifeSettings.nonce) || "",
      };
    },
  };

  // 布局切换功能
  const LayoutToggle = {
    init: function () {
      this.createToggleButtons();
      this.applyStoredLayout();
      this.bindEvents();
    },

    createToggleButtons: function () {
      var $actions = $("#feedsActions");
      if (!$actions.length || $actions.find(".feeds-layout-toggle").length)
        return;

      var toggleHtml = `
                <div class="feeds-layout-toggle" role="group" aria-label="布局切换">
                    <button type="button" class="lt-btn one" title="单列" aria-pressed="false">
                        ${icon("list")}
                    </button>
                    <button type="button" class="lt-btn two" title="两列" aria-pressed="false">
                        ${icon("columns-2")}
                    </button>
                    <button type="button" class="lt-btn three active" title="三列" aria-pressed="true">
                        ${icon("layout-grid")}
                    </button>
                </div>
            `;

      $actions.html(toggleHtml);
    },

    applyStoredLayout: function () {
      try {
        var layout = localStorage.getItem("feeds_layout") || "layout-3";
        this.setLayout(layout);
      } catch (e) {
        this.setLayout("layout-3");
      }
    },

    setLayout: function (layout) {
      var $timeline = $("#feedsTimeline");
      var $buttons = $(".lt-btn");

      // 移除所有布局类
      $timeline.removeClass("layout-1 layout-2 layout-3");
      // 添加新布局类
      $timeline.addClass(layout);

      // 更新按钮状态
      $buttons.removeClass("active").attr("aria-pressed", "false");

      // 修正：根据布局设置对应按钮状态
      if (layout === "layout-1") {
        $(".lt-btn.one").addClass("active").attr("aria-pressed", "true");
      } else if (layout === "layout-2") {
        $(".lt-btn.two").addClass("active").attr("aria-pressed", "true");
      } else {
        $(".lt-btn.three").addClass("active").attr("aria-pressed", "true");
      }

      // 保存到本地存储
      try {
        localStorage.setItem("feeds_layout", layout);
      } catch (e) {}

      // 通知 DataLoader 布局发生变化
      if (window.WestlifeFeeds && window.WestlifeFeeds.DataLoader) {
        window.WestlifeFeeds.DataLoader.onLayoutChange(layout);
      }
    },

    bindEvents: function () {
      $(document).on("click", ".lt-btn", (e) => {
        var $btn = $(e.currentTarget);
        var layout = "layout-3"; // 默认三列

        if ($btn.hasClass("one")) {
          layout = "layout-1";
        } else if ($btn.hasClass("two")) {
          layout = "layout-2";
        } else if ($btn.hasClass("three")) {
          layout = "layout-3";
        }

        this.setLayout(layout);
      });
    },
  };

  // 数据加载器
  const DataLoader = {
    currentPage: 1,
    isLoading: false,
    hasMoreData: true,
    currentLayout: "layout-3",
    autoLoadCount: 0, // 自动加载次数计数
    totalLoaded: 0, // 已加载总数

    init: function () {
      // 检查是否在 feeds 页面
      if (!$("#feedsTimeline").length) return;

      // 取消管理员/访客模式初始化提示

      // 获取当前布局
      this.currentLayout = this.getCurrentLayout();

      // 记录加载开始时间
      this.loadStartTime = Date.now();

      // 移除占位符，显示加载状态
      this.showInitialLoading();

      // 异步加载数据
      this.loadStatsData();
      this.loadFeedsData();

      // 绑定刷新事件
      this.bindRefreshEvent();

      // 绑定滚动加载更多
      this.bindScrollLoadMore();

      // 绑定手动加载更多
      this.bindManualLoadMore();
    },

    getCurrentLayout: function () {
      var $timeline = $("#feedsTimeline");
      if ($timeline.hasClass("layout-1")) return "layout-1";
      if ($timeline.hasClass("layout-2")) return "layout-2";
      return "layout-3";
    },

    getLoadConfig: function () {
      // 根据布局返回不同的加载配置
      switch (this.currentLayout) {
        case "layout-1":
          return {
            initial: 6, // 首次加载6个
            auto: 12, // 自动加载12个
            maxAuto: 1, // 最多自动加载1次
          };
        case "layout-2":
          return {
            initial: 12, // 首次加载12个
            auto: 12, // 自动加载12个
            maxAuto: 1, // 最多自动加载1次
          };
        case "layout-3":
        default:
          return {
            initial: 18, // 首次加载18个
            auto: 18, // 自动加载18个
            maxAuto: 1, // 最多自动加载1次
          };
      }
    },

    onLayoutChange: function (newLayout) {
      this.currentLayout = newLayout;
      // 布局改变时重置计数器，重新开始加载逻辑
      this.autoLoadCount = 0;
      this.hideManualLoadButton();
    },

    showInitialLoading: function () {
      // 统计卡片使用圆圈加载器（只显示在统计卡片内）
      var $statsCard = $("#statsCardContent");
      if ($statsCard.length && !$statsCard.find(".stats-summary").length) {
        $statsCard.html(`
          <div class="stats-loading">
            <div class="circle-loader"></div>
            <p class="stats-loading-text wl-loading-text">正在加载统计数据...</p>
          </div>
        `);
        $statsCard.css("position", "relative");
      }

      // 显示骨架屏而不是中心加载器，提升感知性能
      this.showSkeletonScreen();
    },

    showSkeletonScreen: function () {
      var $timeline = $("#feedsTimeline");
      var skeletonCount = this.getCurrentLayout() === "layout-1" ? 3 : 6;
      var skeletonHTML = "";

      for (var i = 0; i < skeletonCount; i++) {
        skeletonHTML += `
          <article class="feed-item skeleton-item">
            <div class="skeleton-title"></div>
            <div class="skeleton-desc"></div>
            <div class="skeleton-desc"></div>
            <div class="skeleton-footer">
              <div class="skeleton-avatar"></div>
              <div class="skeleton-source"></div>
            </div>
          </article>
        `;
      }

      $timeline.html(skeletonHTML);
    },

    showCenterRectLoader: function (text) {
      // 移除现有的加载器
      this.hideCenterLoader();

      // 在页面中心显示矩形跳动加载器（始终居中）
      var $centerLoader = $(`
        <div class="feeds-center-loader">
          <div class="loader-rect"><div></div><div></div><div></div><div></div><div></div></div>
          <p>${text}</p>
        </div>
      `);
      $("body").append($centerLoader);
      // 暗色模式交由 CSS 控制
    },

    hideCenterLoader: function () {
      $(".feeds-center-loader").remove();
    },

    loadStatsData: function () {
      var config = Utils.getAjaxConfig();

      // 优化的快速请求配置
      $.ajax({
        url: config.url,
        type: "POST",
        timeout: 5000, // 5秒快速超时
        cache: true,
        data: {
          action: "westlife_get_feeds_stats",
          nonce: config.nonce,
        },
      })
        .done((response) => {
          if (
            response &&
            response.success &&
            response.data &&
            response.data.stats
          ) {
            this.renderStatsCard(response.data.stats);
          } else {
            console.error("Stats error:", response);
            this.renderStatsError(response.data || "未知错误");
          }
        })
        .fail((xhr, status, error) => {
          console.error("Stats AJAX failed:", status, error);
          if (status === "timeout") {
            this.renderStatsError("加载超时，使用默认数据");
            this.renderStatsCard({
              total_feeds: 0,
              total_posts: 0,
              last_update: Math.floor(Date.now() / 1000),
            });
          } else {
            this.renderStatsError("网络请求失败");
          }
        });
    },

    loadFeedsData: function () {
      this.isLoading = true;
      var config = Utils.getAjaxConfig();
      var loadConfig = this.getLoadConfig();

      // 高性能AJAX配置 - 快速加载首屏数据
      $.ajax({
        url: config.url,
        type: "POST",
        timeout: 8000, // 8秒快速超时
        cache: true,
        data: {
          action: "westlife_get_feeds",
          page: 1,
          count: loadConfig.initial,
          nonce: config.nonce,
        },
      })
        .done((response) => {
          if (
            response &&
            response.success &&
            response.data &&
            response.data.html
          ) {
            // 隐藏中心加载器
            this.hideCenterLoader();

            // 显示数据
            $("#feedsTimeline").html(response.data.html);
            this.hasMoreData = response.data.has_more || false;
            this.currentPage = 1;
            this.totalLoaded = loadConfig.initial;
            this.autoLoadCount = 0;

            // 显示加载完成性能反馈（success，避免与初始化提示重叠）
            if (this.loadStartTime) {
              var loadTime = ((Date.now() - this.loadStartTime) / 1000).toFixed(
                1
              );
              var cacheStatus =
                response.data.cache_info &&
                response.data.cache_info.from_quick_cache
                  ? "缓存"
                  : "实时";
              (function (doneMsg) {
                var sinceInit =
                  Date.now() -
                  (window.WestlifeFeeds &&
                  window.WestlifeFeeds.DataLoader &&
                  window.WestlifeFeeds.DataLoader.initTipShownAt
                    ? window.WestlifeFeeds.DataLoader.initTipShownAt
                    : 0);
                var minGap = 800; // 至少间隔 800ms
                var delay = sinceInit < minGap ? minGap - sinceInit : 0;
                setTimeout(function () {
                  if (
                    window.WestlifeUtils &&
                    typeof window.WestlifeUtils.showMessage === "function"
                  ) {
                    window.WestlifeUtils.showMessage(
                      String(doneMsg),
                      "success",
                      2500
                    );
                  } else {
                    Utils.showQuickTip(doneMsg, 2500);
                  }
                }, delay);
              })(`${cacheStatus}加载完成，用时 ${loadTime} 秒`);
            }

            // 初始化布局切换
            LayoutToggle.init();

            // 检查是否需要显示手动加载按钮
            this.checkManualLoadButton();
          } else {
            console.error("Feeds error:", response);
            this.hideCenterLoader();
            this.renderFeedsError(response.data || "未知错误");
          }
        })
        .fail((xhr, status, error) => {
          console.error("Feeds AJAX failed:", status, error, xhr.responseText);
          this.hideCenterLoader();

          if (status === "timeout") {
            this.renderFeedsError("加载超时，正在使用缓存数据...");
            // 显示基础内容，避免完全空白
            setTimeout(() => {
              $("#feedsTimeline").html(`
                <div class="no-feeds-message">
                  <p>网络较慢，数据正在后台加载中...</p>
                  <button onclick="location.reload()" class="btn btn-primary">刷新页面</button>
                </div>
              `);
            }, 1000);
          } else {
            this.renderFeedsError("网络请求失败: " + status);
          }
        })
        .always(() => {
          this.isLoading = false;
        });
    },

    loadMoreData: function (isManual = false) {
      if (this.isLoading || !this.hasMoreData) return;

      this.isLoading = true;
      var config = Utils.getAjaxConfig();
      var loadConfig = this.getLoadConfig();
      var loadCount = isManual ? loadConfig.auto : loadConfig.auto;

      if (!isManual) {
        this.showLoadMoreLoader();
      }

      $.post(config.url, {
        action: "westlife_get_feeds",
        page: this.currentPage + 1,
        count: loadCount,
        nonce: config.nonce,
      })
        .done((response) => {
          if (
            response &&
            response.success &&
            response.data &&
            response.data.html
          ) {
            $("#feedsTimeline").append(response.data.html);
            this.hasMoreData = response.data.has_more || false;
            this.currentPage++;
            this.totalLoaded += loadCount;

            if (!isManual) {
              this.autoLoadCount++;
            }

            this.checkManualLoadButton();
          } else {
            Utils.showError("加载更多数据失败");
          }
        })
        .fail((xhr, status, error) => {
          Utils.showError("网络请求失败，请稍后重试");
        })
        .always(() => {
          if (!isManual) {
            this.hideLoadMoreLoader();
          }
          this.isLoading = false;
        });
    },

    checkManualLoadButton: function () {
      var loadConfig = this.getLoadConfig();

      // 如果还有更多数据且已达到自动加载上限，显示手动加载按钮
      if (this.hasMoreData && this.autoLoadCount >= loadConfig.maxAuto) {
        this.showManualLoadButton();
      } else {
        this.hideManualLoadButton();
      }
    },

    showManualLoadButton: function () {
      if (!$("#manualLoadMore").length && this.hasMoreData) {
        $("#feedsTimeline").after(`
          <div class="manual-load-container">
            <button type="button" id="manualLoadMore" class="manual-load-btn">
              ${icon("plus")}
              加载更多
            </button>
          </div>
        `);
      }
    },

    hideManualLoadButton: function () {
      $(".manual-load-container").remove();
    },

    showLoadMoreLoader: function () {
      if (!$("#loadMoreLoader").length) {
        // 在页面中心显示加载更多指示器
        this.showCenterRectLoader("正在加载更多内容...");
      }
    },

    hideLoadMoreLoader: function () {
      this.hideCenterLoader();
    },

    renderStatsCard: function (stats) {
      var html = `
                <div class="stats-summary">
                    <div class="summary-item">
                        <div class="summary-icon">${icon("rss")}</div>
                        <div class="summary-content">
                            <span class="summary-label">订阅源</span>
                            <span class="summary-value">${
                              stats.success || 0
                            }</span>
                        </div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-icon">${icon("rows-3")}</div>
                        <div class="summary-content">
                            <span class="summary-label">条动态</span>
                            <span class="summary-value">${
                              stats.total || 0
                            }</span>
                        </div>
                    </div>
                    <div class="summary-item">
                        <div class="summary-icon">${icon("clock-3")}</div>
                        <div class="summary-content">
                            <span class="summary-label">分钟后更新</span>
                            <span class="summary-value" id="cacheCountdown">${
                              stats.cache_minutes || 60
                            }</span>
                        </div>
                    </div>
                </div>
                <div class="card-divider"></div>
                <div class="last-update-info">
                    ${
                      window.westlifeSettings && window.westlifeSettings.isAdmin
                        ? `<button type="button" id="refreshFeeds" class="btn-refresh-inline" title="刷新缓存">${icon("refresh-cw")}</button>`
                        : ""
                    }
                    <span class="update-text" id="lastUpdateText" data-timestamp="${
                      stats.last_update || Math.floor(Date.now() / 1000)
                    }">
                        最后更新：${Utils.formatLocalTime(
                          stats.last_update || Math.floor(Date.now() / 1000)
                        )}
                    </span>
                </div>
            `;
      $("#statsCardContent").html(html);
    },

    renderStatsError: function (message) {
      $("#statsCardContent").html(`
        <div class="stats-error">
          ${icon("triangle-alert")}
          <p>统计数据加载失败: ${message}</p>
        </div>
      `);
    },

    renderFeedsError: function (message) {
      $("#feedsTimeline").html(`
        <div class="no-feeds">
          ${icon("triangle-alert")}
          <p>动态数据加载失败: ${message}</p>
          <button type="button" class="btn btn-primary" onclick="window.WestlifeFeeds.DataLoader.loadFeedsData()">重试</button>
        </div>
      `);
    },

    bindRefreshEvent: function () {
      $(document).on("click", "#refreshFeeds", (e) => {
        e.preventDefault();
        var $btn = $(e.currentTarget);

        if ($btn.hasClass("is-refreshing")) return;

        $btn.addClass("is-refreshing");
        const refreshIconEl = $btn.find(".wl-icon, .lucide").first();
        if (refreshIconEl.length) {
          refreshIconEl.addClass("fa-spin");
        }

        // 显示刷新加载器
        this.showCenterRectLoader("正在强制刷新缓存...");

        // 调用强制刷新 API（使用通用 AJAX 配置）
        var _config = Utils.getAjaxConfig();
        $.ajax({
          url: _config.url,
          method: "POST",
          data: {
            action: "westlife_refresh_feeds",
            force_refresh: "1",
            nonce: _config.nonce,
          },
          timeout: 120000, // 增加到2分钟超时
          success: (response) => {
            this.hideCenterLoader();

            if (response.success) {
              // 显示成功消息
              if (response.data && response.data.notification) {
                Utils.showSuccess(response.data.notification.text);
              }

              // 重置分页状态
              this.currentPage = 1;
              this.autoLoadCount = 0;
              this.totalLoaded = 0;
              this.hasMoreData = true;
              this.hideManualLoadButton();

              // 重新加载数据
              this.loadStatsData();
              this.loadFeedsData();
            } else {
              var errorMsg = "刷新失败";
              if (response.data && response.data.notification) {
                errorMsg = response.data.notification.text;
              } else if (response.data) {
                errorMsg = "刷新失败: " + response.data;
              }
              Utils.showError(errorMsg);
            }
          },
          error: (xhr, status, error) => {
            console.error("Force refresh error:", xhr, status, error);
            this.hideCenterLoader();

            var errorMsg = "刷新失败，请稍后重试";
            if (status === "timeout") {
              errorMsg = "刷新超时，但可能正在后台处理中，请稍后查看";
            } else if (xhr.responseText) {
              try {
                var errorData = JSON.parse(xhr.responseText);
                if (errorData && errorData.data) {
                  errorMsg = "刷新失败: " + errorData.data;
                }
              } catch (e) {
                // 忽略JSON解析错误
              }
            }

            Utils.showError(errorMsg);
          },
          complete: () => {
            $btn.removeClass("is-refreshing");
            const refreshIconEl = $btn.find(".wl-icon, .lucide").first();
            if (refreshIconEl.length) {
              refreshIconEl.removeClass("fa-spin");
            }
          },
        });
      });
    },

    bindManualLoadMore: function () {
      $(document).on("click", "#manualLoadMore", (e) => {
        e.preventDefault();
        var $btn = $(e.currentTarget);

        if (this.isLoading) return;

        // 显示按钮加载状态
        var originalText = $btn.html();
        $btn.html(`${icon("loader-circle fa-spin")}加载中...`);
        $btn.prop("disabled", true);

        // 手动加载更多
        this.loadMoreData(true);

        // 恢复按钮状态
        setTimeout(() => {
          $btn.html(originalText);
          $btn.prop("disabled", false);

          // 检查是否还需要显示按钮
          if (!this.hasMoreData) {
            this.hideManualLoadButton();
          }
        }, 1500);
      });
    },

    bindScrollLoadMore: function () {
      var $window = $(window);
      var throttleTimer = null;

      $window.on("scroll", () => {
        if (throttleTimer) return;

        throttleTimer = setTimeout(() => {
          var loadConfig = this.getLoadConfig();

          // 只有在未达到自动加载上限时才自动加载
          if (
            !this.hasMoreData ||
            this.isLoading ||
            this.autoLoadCount >= loadConfig.maxAuto
          ) {
            throttleTimer = null;
            return;
          }

          var scrollTop = $window.scrollTop();
          var windowHeight = $window.height();
          var documentHeight = $(document).height();

          // 距离底部200px时开始加载
          if (scrollTop + windowHeight >= documentHeight - 200) {
            this.loadMoreData(false);
          }

          throttleTimer = null;
        }, 100);
      });
    },
  };

  // 倒计时功能
  const CountdownTimer = {
    init: function () {
      this.startCountdown();
    },

    startCountdown: function () {
      setInterval(() => {
        var $countdown = $("#cacheCountdown");
        if (!$countdown.length) return;

        var current = parseInt($countdown.text()) || 0;
        if (current > 0) {
          $countdown.text(current - 1);
        } else {
          $countdown.text("0");
        }
      }, 60000);
    },
  };

  // 主初始化函数
  function init() {
    // 检查是否在 feeds 页面
    if (!$(".feeds-page").length) return;

    // 初始化各个模块
    DataLoader.init();
    CountdownTimer.init();
  }

  // DOM 就绪时初始化
  $(document).ready(init);

  // 添加旋转动画和circle-loader专用样式，仅作用于feeds页面
  if (!document.getElementById("feeds-spinner-styles")) {
    var style = document.createElement("style");
    style.id = "feeds-spinner-styles";
    style.textContent = `
            .feeds-page .circle-loader {
                width: 40px;
                height: 40px;
                border: 4px solid #e0e7ef;
                border-top: 4px solid #2563eb;
                border-radius: 50%;
                animation: feeds-spin 1s linear infinite;
                margin-bottom: 18px;
                background: none;
                position: static;
            }
            @keyframes feeds-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            @keyframes skeleton-pulse {
                0% { opacity: 1; }
                100% { opacity: 0.6; }
            }
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            .feeds-page .stats-loading {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                height: 120px;
                width: 100%;
                position: relative;
                background: none;
            }
            .skeleton-item {
                overflow: hidden;
                position: relative;
            }
        `;
    document.head.appendChild(style);
  }

  // 暴露到全局
  window.WestlifeFeeds = {
    DataLoader: DataLoader,
    LayoutToggle: LayoutToggle,
    Utils: Utils,
  };
})(jQuery, window, document);
