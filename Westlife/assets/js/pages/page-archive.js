/**
 * Archive Page Scripts (Merged)
 * 合并：
 *  - 简洁基础版 page-archive.js（平滑锚点滚动）
 *  - 交互完整版 archive-page.js（热力图 tooltip + 月份弹窗 + 模拟数据 + 年份折叠）
 * Version: 3.1
 *
 * 功能列表：
 * 1. 平滑锚点滚动 (initSmoothScroll)
 * 2. 热力图单元格悬停 tooltip (initHeatmapTooltips)
 * 3. 月份点击弹出当月文章列表（AJAX + 回退模拟数据）(showMonthModal / fetchMonthArticles)
 * 4. 加载 / 错误状态弹窗 (showLoadingModal / showErrorModal)
 * 5. ESC 关闭 / 点击遮罩关闭 / 关闭按钮关闭 (closeModal)
 * 6. 时间线月份与热力图联动 (initMonthClickHandlers)
 * 7. 年份折叠（保留接口：initYearToggle，默认未启用）
 * 8. 动态注入必要的动画 keyframes（若全局已有可删除）
 * 9. 全局 window.ArchivePageInteraction 暴露以便调试
 *
 * 使用说明：
 *  - 若需要启用年份折叠，将 init() 中的 this.initYearToggle() 取消注释。
 *  - 若主题已统一提供 @keyframes spin，可移除 styleTag 注入部分。
 *  - 可通过 window.ArchivePageInteraction 访问类定义进行扩展。
 */

(function () {
  "use strict";
  const wlIcon =
    window.WestlifeIcons && typeof window.WestlifeIcons.icon === "function"
      ? (name, attrs = {}) => window.WestlifeIcons.icon(name, attrs)
      : () => "";

  let archiveInstance = null;
  let archiveStyleTag = null;

  /**
   * 归档交互主类
   */
  class ArchivePageInteraction {
    constructor() {
      this.boundKeydown = null;
      this.init();
    }

    /**
     * 初始化入口
     */
    init() {
      this.bindEvents();
      this.initHeatmapTooltips();
      this.initMonthClickHandlers();
      this.initModalHandlers();
      // 可选：年份折叠功能（默认不启用防止不需要的监听）
      // this.initYearToggle();
    }

    /**
     * 绑定全局事件（键盘等）
     */
    bindEvents() {
      this.boundKeydown = (e) => {
        if (e.key === "Escape") this.closeModal();
      };
      document.addEventListener("keydown", this.boundKeydown);
    }

    destroy() {
      if (this.boundKeydown) {
        document.removeEventListener("keydown", this.boundKeydown);
        this.boundKeydown = null;
      }
    }

    /**
     * 热力图悬停 tooltip
     */
    initHeatmapTooltips() {
      const heatmapCells = document.querySelectorAll(".heatmap-cell");
      heatmapCells.forEach((cell) => {
        const tooltip = document.createElement("div");
        tooltip.className = "heatmap-tooltip";
        cell.appendChild(tooltip);

        cell.addEventListener("mouseenter", () => {
          const date = cell.dataset.date;
          const count = cell.dataset.count || 0;
          if (date) {
            const formattedDate = this.formatDate(date);
            tooltip.textContent =
              count > 0
                ? `${formattedDate}: ${count} 篇文章`
                : `${formattedDate}: 无文章`;
            tooltip.style.opacity = "1";
            tooltip.style.visibility = "visible";
          }
        });
        cell.addEventListener("mouseleave", () => {
          tooltip.style.opacity = "0";
          tooltip.style.visibility = "hidden";
        });
      });
    }

    /**
     * 月份点击（热力图 & 时间线）
     */
    initMonthClickHandlers() {
      const heatCells = document.querySelectorAll(
        '.heatmap-cell[data-has-posts="true"]'
      );
      heatCells.forEach((cell) => {
        cell.addEventListener("click", () => {
          const date = cell.dataset.date;
          if (date) {
            const [year, month] = date.split("-");
            this.showMonthModal(year, month);
          }
        });
      });

      const monthItems = document.querySelectorAll(".month-item");
      monthItems.forEach((item) => {
        item.addEventListener("click", () => {
          const year = item.dataset.year;
          const month = item.dataset.month;
          if (year && month) this.showMonthModal(year, month);
        });
      });
    }

    /**
     * 模态相关（遮罩点击 + 关闭按钮）
     */
    initModalHandlers() {
      document.addEventListener("click", (e) => {
        if (e.target.classList.contains("month-modal")) this.closeModal();
        if (
          e.target.classList.contains("modal-close") ||
          e.target.closest(".modal-close")
        )
          this.closeModal();
      });
    }

    /**
     * 显示月份弹窗
     */
    async showMonthModal(year, month) {
      try {
        this.showLoadingModal();
        const articles = await this.fetchMonthArticles(year, month);
        this.createMonthModal(year, month, articles);
      } catch (err) {
        console.error("获取文章数据失败:", err);
        this.showErrorModal();
      }
    }

    /**
     * 获取指定年月文章（AJAX -> 回退模拟）
     */
    async fetchMonthArticles(year, month) {
      try {
        const response = await fetch(
          `${window.location.origin}/wp-admin/admin-ajax.php`,
          {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              action: "get_month_articles",
              year: year,
              month: month,
              nonce: window.archive_nonce || "",
            }),
          }
        );
        if (!response.ok) throw new Error("Network response was not ok");
        const data = await response.json();
        if (data.success) return data.data;
        throw new Error(data.message || "获取数据失败");
      } catch (error) {
        console.warn("AJAX失败，使用模拟数据:", error);
        return this.getMockArticles(year, month);
      }
    }

    /**
     * 模拟数据（AJAX失败回退）
     */
    getMockArticles(year, month) {
      return [
        {
          id: 1,
          title: `${year}年${month}月的第一篇文章`,
          date: `${year}-${month.padStart(2, "0")}-15`,
          permalink: "#",
          category: "技术分享",
          excerpt: "这是文章摘要...",
        },
        {
          id: 2,
          title: "GitHub风格热力图实现教程",
          date: `${year}-${month.padStart(2, "0")}-10`,
          permalink: "#",
          category: "CSS教程",
          excerpt: "详细介绍如何实现GitHub风格的提交热力图...",
        },
        {
          id: 3,
          title: "简洁归档页面设计思路",
          date: `${year}-${month.padStart(2, "0")}-05`,
          permalink: "#",
          category: "设计思路",
          excerpt: "如何设计一个既美观又实用的归档页面...",
        },
      ];
    }

    /**
     * 创建月份弹窗 DOM
     */
    createMonthModal(year, month, articles) {
      this.removeExistingModal();
      const monthNames = [
        "",
        "一月",
        "二月",
        "三月",
        "四月",
        "五月",
        "六月",
        "七月",
        "八月",
        "九月",
        "十月",
        "十一月",
        "十二月",
      ];
      const modal = document.createElement("div");
      modal.className = "month-modal";
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">${year}年${monthNames[parseInt(month)]} (${
        articles.length
      }篇文章)</h3>
            <button class="modal-close" type="button">${wlIcon("x")}</button>
          </div>
          <div class="modal-body">${this.createArticleList(articles)}</div>
        </div>`;
      document.body.appendChild(modal);
      requestAnimationFrame(() => modal.classList.add("show"));
    }

    /**
     * 渲染文章列表 HTML
     */
    createArticleList(articles) {
      if (!articles.length) {
        return `<div style="text-align:center;padding:40px;color:var(--archive-text-secondary);">
          ${wlIcon("file-text", { style: "font-size:3rem;margin-bottom:16px;opacity:.5;" })}
          <p>该月份暂无文章</p></div>`;
      }
      return `<ul class="article-list">${articles
        .map(
          (a) => `
        <li class="article-item">
          <a href="${a.permalink}" class="article-title">${a.title}</a>
          <div class="article-meta">
            <span class="article-date">${wlIcon("calendar")}${this.formatDate(
              a.date
            )}</span>
            <span class="article-category">${wlIcon("folder")}<span class="category-tag">${
              a.category
            }</span></span>
          </div>
        </li>`
        )
        .join("")}</ul>`;
    }

    /**
     * 显示加载中弹窗
     */
    showLoadingModal() {
      this.removeExistingModal();
      const modal = document.createElement("div");
      modal.className = "month-modal show";
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">加载中...</h3>
            <button class="modal-close" type="button">${wlIcon("x")}</button>
          </div>
          <div class="modal-body">
            <div style="text-align:center;padding:40px;">
              <div class="wl-loading-spinner" style="width:40px;height:40px;border:4px solid var(--archive-border);border-top:4px solid var(--archive-primary);border-radius:50%;animation:spin 1s linear infinite;margin:0 auto 16px;"></div>
              <p style="color:var(--archive-text-secondary);">正在获取文章数据...</p>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    /**
     * 显示错误弹窗
     */
    showErrorModal() {
      this.removeExistingModal();
      const modal = document.createElement("div");
      modal.className = "month-modal show";
      modal.innerHTML = `
        <div class="modal-content">
          <div class="modal-header">
            <h3 class="modal-title">加载失败</h3>
            <button class="modal-close" type="button">${wlIcon("x")}</button>
          </div>
          <div class="modal-body">
            <div style="text-align:center;padding:40px;color:var(--archive-text-secondary);">
              ${wlIcon("triangle-alert", { style: "font-size:3rem;margin-bottom:16px;color:#ef4444;" })}
              <p>获取文章数据失败，请稍后重试</p>
            </div>
          </div>
        </div>`;
      document.body.appendChild(modal);
    }

    /**
     * 关闭当前弹窗
     */
    closeModal() {
      const modal = document.querySelector(".month-modal");
      if (modal) {
        modal.classList.remove("show");
        setTimeout(() => modal.remove(), 300);
      }
    }

    /**
     * 移除已存在的弹窗（防止堆叠）
     */
    removeExistingModal() {
      const existing = document.querySelector(".month-modal");
      if (existing) existing.remove();
    }

    /**
     * 格式化日期为 yyyy年MM月dd日
     */
    formatDate(dateString) {
      const date = new Date(dateString);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const d = String(date.getDate()).padStart(2, "0");
      return `${y}年${m}月${d}日`;
    }

    /**
     * 年份折叠切换（手动启用）
     */
    initYearToggle() {
      const yearHeaders = document.querySelectorAll(".year-header");
      yearHeaders.forEach((header) => {
        header.addEventListener("click", () => {
          const yearSection = header.closest(".timeline-year");
          const monthList =
            yearSection && yearSection.querySelector(".month-list");
          if (monthList) {
            const isExpanded = monthList.style.display !== "none";
            monthList.style.display = isExpanded ? "none" : "grid";
            const icon = header.querySelector(".toggle-icon");
            if (icon) icon.classList.toggle("rotated", !isExpanded);
          }
        });
      });
    }
  }

  // 注入必要的 keyframes （如果未在全局样式中）
  if (!document.getElementById("westlife-archive-inline-style")) {
    archiveStyleTag = document.createElement("style");
    archiveStyleTag.id = "westlife-archive-inline-style";
    archiveStyleTag.textContent = `@keyframes spin {0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}} .toggle-icon{transition:transform .3s ease;} .toggle-icon.rotated{transform:rotate(180deg);}`;
    document.head.appendChild(archiveStyleTag);
  }

  /**
   * 平滑滚动锚点
   */
  function initSmoothScroll() {
    const links = document.querySelectorAll('a[href^="#"]');
    links.forEach((link) => {
      link.addEventListener("click", (e) => {
        const href = link.getAttribute("href");
        if (href === "#") return;
        const target = document.querySelector(href);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  function initArchivePage() {
    initSmoothScroll();
    if (!archiveInstance) {
      archiveInstance = new ArchivePageInteraction();
    }
    // 全局暴露（可用于调试 / 手动调用）
    window.ArchivePageInteraction = ArchivePageInteraction;
  }

  function destroyArchivePage() {
    if (archiveInstance && typeof archiveInstance.destroy === "function") {
      archiveInstance.destroy();
    }
    archiveInstance = null;
  }

  if (window.WestlifeApp && typeof window.WestlifeApp.register === "function") {
    window.WestlifeApp.register({
      name: "archive-page",
      match(context) {
        const root =
          context && context.nodeType === 1 ? context : document;
        return !!root.querySelector(
          ".archive-page, .heatmap-cell, .monthly-archive, .archive-timeline"
        );
      },
      init() {
        initArchivePage();
      },
      destroy() {
        destroyArchivePage();
      },
    });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      initArchivePage();
    });
  }
})();
