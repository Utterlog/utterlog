/**
 * Westlife Umami Statistics JavaScript Module
 * 独立的 Umami 统计数据前端模块
 *
 * @package Westlife
 * @version 1.0.0
 */

(function ($) {
  "use strict";

  const icon = (name, attrs = {}) =>
    window.WestlifeIcons && typeof window.WestlifeIcons.icon === "function"
      ? window.WestlifeIcons.icon(name, attrs)
      : "";

  // 主模块对象
  const WestlifeUmamiStats = {
    // 配置
    config: {
      ajaxUrl: "",
      nonce: "",
      isConfigured: false,
      cacheTime: 300000, // 5分钟
      retryAttempts: 3,
      retryDelay: 2000,
    },

    renderCountryFlagIcon(code, label) {
      const iso = this.normalizeCountryCode(code);
      if (!iso) return "";
      const text = label || iso;
      return `<span class="fi fi-${iso.toLowerCase()}" aria-label="${this.escapeHtml(
        text
      )}" title="${this.escapeHtml(text)}"></span>`;
    },

    escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    },

    // 状态
    state: {
      isLoading: false,
      currentData: null,
      lastFetch: 0,
      attempt: 0,
      initialized: false,
    },

    /**
     * 初始化
     */
    init() {
      if (this.state.initialized) return;
      this.state.initialized = true;

      // 获取配置
      if (typeof westlifeUmami !== "undefined") {
        this.config = { ...this.config, ...westlifeUmami };
      }

      // 检查是否已配置
      if (!this.config.isConfigured) {
        this.showError("Umami 未配置或配置不完整");
        return;
      }

      // 绑定事件
      this.bindEvents();

      // 自动获取数据
      this.fetchStats();
    },

    /**
     * 绑定事件
     */
    bindEvents() {
      // 页面可见性变化时刷新数据
      $(document).on("visibilitychange.westlifeUmami", () => {
        if (!document.hidden && this.shouldRefresh()) {
          this.fetchStats();
        }
      });

      // 手动刷新按钮
      $(document).on("click.westlifeUmami", ".umami-refresh-btn", (e) => {
        e.preventDefault();
        this.fetchStats(true);
      });

      // 窗口焦点时检查是否需要刷新
      $(window).on("focus.westlifeUmami", () => {
        if (this.shouldRefresh()) {
          this.fetchStats();
        }
      });

      // TopN: 绑定 tabs 切换（仅刷新当前区块）
      $(document).on("click.westlifeUmami", ".vm-topn-tab", (e) => {
        const $btn = $(e.currentTarget);
        const $section = $btn.closest(".vm-topn");
        $btn
          .addClass("is-active")
          .attr("aria-selected", "true")
          .siblings()
          .removeClass("is-active")
          .attr("aria-selected", "false");
        this.loadTopN($section[0]);
      });

      // TopN: 绑定范围切换（仅刷新当前区块）
      $(document).on("change.westlifeUmami", ".vm-topn-range-select", (e) => {
        const $section = $(e.currentTarget).closest(".vm-topn");
        this.loadTopN($section[0]);
      });
    },

    destroy() {
      $(document).off(".westlifeUmami");
      $(window).off(".westlifeUmami");
      this.state.isLoading = false;
      this.state.attempt = 0;
      this.state.initialized = false;
    },

    /**
     * 检查是否应该刷新数据
     */
    shouldRefresh() {
      const now = Date.now();
      return now - this.state.lastFetch > this.config.cacheTime;
    },

    /**
     * 获取统计数据
     */
    fetchStats(force = false) {
      // 防止重复请求
      if (this.state.isLoading) {
        return;
      }

      // 检查缓存
      if (!force && !this.shouldRefresh() && this.state.currentData) {
        this.updateDisplay(this.state.currentData);
        return;
      }

      this.state.isLoading = true;
      this.state.attempt = 0;
      this.showLoading();

      this._doFetch();
    },

    /**
     * 执行实际的数据获取
     */
    _doFetch() {
      this.state.attempt++;

      $.ajax({
        url: this.config.ajaxUrl,
        type: "POST",
        data: {
          action: "westlife_get_umami_stats",
          nonce: this.config.nonce,
        },
        timeout: 15000,
        success: (response) => {
          this.state.isLoading = false;

          if (response.success && response.data) {
            this.state.currentData = response.data;
            this.state.lastFetch = Date.now();
            this.updateDisplay(response.data);
            this.hideError();
          } else {
            this.handleError(response.data?.error || "数据获取失败");
          }
        },
        error: (xhr, status, error) => {
          this.state.isLoading = false;
          this.handleError(`请求失败: ${status} ${error}`);
        },
      });
    },

    /**
     * 处理错误（包含重试机制）
     */
    handleError(message) {
      console.warn("Umami Stats Error:", message);

      // 如果还有重试次数，则重试
      if (this.state.attempt < this.config.retryAttempts) {
        setTimeout(() => {
          this._doFetch();
        }, this.config.retryDelay);
        return;
      }

      // 重试失败，显示错误
      this.showError(message);
    },

    /**
     * 更新显示
     */
    updateDisplay(data) {
      if (!data) return;

      // 隐藏加载状态
      this.hideLoading();

      // 如果有错误，显示错误信息
      if (data.error) {
        this.showError(data.error);
        return;
      }

      // 更新各个统计数据
      this.updateStatCard("today_uv", data.today_uv, "今日访客");
      this.updateStatCard("today_pv", data.today_pv, "今日访问");
      this.updateStatCard("month_pv", data.month_pv, "本月访问");
      this.updateStatCard("year_pv", data.year_pv, "年度访问");

      // 更新数据源信息
      this.updateDataSource(data.updated_at);

      // 渲染小时访客图（默认“今日”）
      try {
        const arr =
          data.today_hourly && Array.isArray(data.today_hourly.sessions)
            ? data.today_hourly.sessions
            : [];
        this.renderHourlyChart("#vm-hero-hourly", arr, {
          title: "访客趋势",
          range: "today",
        });
      } catch (e) {
        console.warn("Hourly chart render error:", e);
      }

      // 触发自定义事件
      $(document).trigger("umami:updated", [data]);

      // 初次更新时加载 TopN
      this.loadTopN();
    },

    /**
     * 更新单个统计卡片
     */
    updateStatCard(key, value, label) {
      // 查找对应的元素
      const $card = $(`.umami-stat[data-key="${key}"]`);
      if ($card.length === 0) return;

      const $valueEl = $card.find(".stat-value");
      if ($valueEl.length === 0) return;

      // 移除加载状态
      $valueEl.removeClass("loading");

      // 数字动画
      this.animateNumber($valueEl[0], value);

      // 更新标签（如果需要）
      const $labelEl = $card.find(".stat-label");
      if ($labelEl.length > 0 && label) {
        $labelEl.text(label);
      }
    },

    /**
     * 数字动画
     */
    animateNumber(element, targetValue, duration = 800) {
      if (!element) return;

      const startValue = parseInt(element.textContent.replace(/,/g, "")) || 0;
      const target = parseInt(targetValue) || 0;

      // 如果值没有变化，直接设置
      if (startValue === target) {
        element.textContent = target.toLocaleString();
        return;
      }

      const startTime = performance.now();

      const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // 缓动函数
        const easeOutQuad = (t) => t * (2 - t);
        const currentValue = Math.floor(
          startValue + (target - startValue) * easeOutQuad(progress)
        );

        element.textContent = currentValue.toLocaleString();

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
    },

    /**
     * 显示加载状态
     */
    showLoading() {
      const $vals = $(".umami-stat .stat-value");
      $vals.addClass("u-loading").removeClass("loading").text("---");
      $(".umami-error").hide();
    },

    /**
     * 隐藏加载状态
     */
    hideLoading() {
      $(".umami-stat .stat-value").removeClass("u-loading loading");
    },

    /**
     * 显示错误信息
     */
    showError(message) {
      this.hideLoading();

      // 更新错误显示
      let $error = $(".umami-error");
      if ($error.length === 0) {
        $error = $(
          '<div class="umami-error" style="color: #dc3545; font-size: 0.9em; margin-top: 10px;"></div>'
        );
        $(".umami-stats-container").append($error);
      }

      $error
        .html(`${icon("triangle-alert")} ${message}`)
        .show();

      // 设置统计值为 "-"
      $(".umami-stat .stat-value").text("-");
    },

    /**
     * 隐藏错误信息
     */
    hideError() {
      $(".umami-error").hide();
    },

    /**
     * 更新数据源信息
     */
    updateDataSource(updatedAt) {
      const $source = $(".umami-data-source");
      if ($source.length === 0) return;

      let sourceText = "数据源：Umami";
      if (updatedAt) {
        const updateTime = new Date(updatedAt);
        const now = new Date();
        const diffMinutes = Math.floor((now - updateTime) / 60000);

        if (diffMinutes < 1) {
          sourceText += "（刚刚更新）";
        } else if (diffMinutes < 60) {
          sourceText += `（${diffMinutes}分钟前）`;
        } else {
          sourceText += `（${Math.floor(diffMinutes / 60)}小时前）`;
        }
      } else {
        sourceText += "（5分钟缓存）";
      }

      $source.text(sourceText);
    },

    /**
     * 手动清除缓存并刷新
     */
    refresh() {
      this.state.lastFetch = 0;
      this.fetchStats(true);
    },

    /**
     * 获取当前数据
     */
    getCurrentData() {
      return this.state.currentData;
    },

    /**
     * 将 ISO 国家码转换为中文国家/地区名称（优先使用 Intl.DisplayNames）
     */
    getRegionName(code) {
      if (!code) return "";
      try {
        if (!this._dn_zh) {
          this._dn_zh = new Intl.DisplayNames(["zh-CN", "zh"], {
            type: "region",
          });
        }
        const name = this._dn_zh.of(code);
        if (name && typeof name === "string" && name.trim()) return name;
      } catch (e) {
        // ignore
      }
      // Fallback 常见国家映射
      const map = {
        CN: "中国",
        HK: "中国香港特别行政区",
        MO: "中国澳门特别行政区",
        TW: "中国台湾省",
        US: "美国",
        GB: "英国",
        UK: "英国",
        FR: "法国",
        DE: "德国",
        JP: "日本",
        KR: "韩国",
        SG: "新加坡",
        AU: "澳大利亚",
        CA: "加拿大",
        ES: "西班牙",
        IT: "意大利",
        IN: "印度",
        RU: "俄罗斯",
        BR: "巴西",
        SE: "瑞典",
        NL: "荷兰",
        NO: "挪威",
        DK: "丹麦",
        FI: "芬兰",
        IE: "爱尔兰",
        CH: "瑞士",
        PL: "波兰",
        PT: "葡萄牙",
        GR: "希腊",
        EL: "希腊",
        TR: "土耳其",
        TH: "泰国",
        MY: "马来西亚",
        ID: "印度尼西亚",
        PH: "菲律宾",
        VN: "越南",
        NZ: "新西兰",
        MX: "墨西哥",
        AE: "阿联酋",
        SA: "沙特阿拉伯",
        EG: "埃及",
        ZA: "南非",
        UA: "乌克兰",
        XK: "科索沃",
      };
      return map[code] || code;
    },

    /**
     * 归一化国家码（用于国旗与显示）：UK->GB, EL->GR 等
     */
    normalizeCountryCode(code) {
      if (!code) return "";
      const c = code.toUpperCase();
      if (c === "UK") return "GB"; // flagcdn 使用 GB
      if (c === "EL") return "GR"; // 希腊
      return c;
    },

    /**
     * 规范化操作系统标签显示
     * - 将 Windows 10/Windows10 统一显示为 “Windows 10/11”
     */
    normalizeOSLabel(label) {
      if (!label) return label;
      const raw = String(label).trim();
      const compact = raw.replace(/\s+/g, "").toLowerCase();
      if (compact === "windows10") return "Windows 10/11";
      // 若未来 Umami 仍有将 Windows 11 识别成 Windows 10 的情况，不额外处理合并，只展示修正名
      return raw;
    },

    /**
     * 规范化浏览器标签到 key
     */
    normalizeBrowserLabel(label) {
      if (!label) return "unknown";
      const s = String(label).toLowerCase();
      if (s.includes("chrome")) return "chrome";
      if (s.includes("edge")) return "edge";
      if (s.includes("firefox")) return "firefox";
      if (s.includes("safari")) return "safari";
      if (s.includes("opera") || s.includes("opr")) return "opera";
      if (s.includes("qq")) return "qq";
      if (s.includes("uc")) return "uc";
      if (s.includes("wechat") || s.includes("micromessenger")) return "wechat";
      return "other";
    },

    /**
     * 浏览器显示名（首字母/品牌规范化）
     */
    normalizeBrowserDisplay(label) {
      if (!label) return "Unknown";
      const key = this.normalizeBrowserLabel(label);
      const map = {
        chrome: "Chrome",
        edge: "Edge",
        firefox: "Firefox",
        safari: "Safari",
        opera: "Opera",
        qq: "QQ",
        uc: "UC",
        wechat: "WeChat",
        other: null,
      };
      if (map[key]) return map[key];
      // 默认：单词首字母大写
      return String(label)
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ");
    },

    /**
     * 基于类型和标签返回一个中性 SVG（避免品牌商标图形），可以后续换成 CDN 图片
     */
    getIconSvg(type, label) {
      // 优先使用主题内置 SVG 图标
      const base = (this.config && this.config.iconsBase) || "";
      const makeImg = (src, alt) =>
        `<img src="${src}" alt="${
          alt || "icon"
        }" width="64" height="64" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`;

      if (base) {
        if (type === "browser") {
          const key = this.normalizeBrowserLabel(label);
          const file = `${key}.svg`;
          return makeImg(`${base}/${file}`, key);
        }
        if (type === "os") {
          const s = String(label).toLowerCase();
          let file = "system.svg";
          if (s.includes("windows")) file = "windows.svg";
          else if (
            s.includes("mac") ||
            s.includes("os x") ||
            s.includes("macos")
          )
            file = "macos.svg";
          else if (s.includes("android")) file = "android.svg";
          else if (
            s.includes("ios") ||
            s.includes("iphone") ||
            s.includes("ipad")
          )
            file = "ios.svg";
          else if (
            s.includes("linux") ||
            s.includes("ubuntu") ||
            s.includes("debian")
          )
            file = "linux.svg";
          return makeImg(`${base}/${file}`, label);
        }
      }

      // 兜底：返回一个空字符串（不显示图标）
      return "";
    },

    /**
     * TopN: 加载并渲染
     */
    loadTopN(sectionEl) {
      // 如果传入具体区块，仅刷新该区块；否则刷新全部
      const $sections = sectionEl ? $(sectionEl) : $(".vm-topn");
      if ($sections.length === 0) return;

      $sections.each((_, el) => {
        const $section = $(el);
        const type = $section.data("type") || "country"; // country | browser | os
        const range = $section.find(".vm-topn-range-select").val() || "30d";
        const $list = $section.find(".vm-topn-list");
        const $body = $section.find(".vm-topn-body");
        $list.empty();

        // 加载动画（矩形跳动）
        let $loading = $body.children(".vm-topn-loading");
        if (!$loading.length) {
          $loading = $(
            '<div class="vm-topn-loading" role="status" aria-live="polite" aria-label="正在加载">' +
              '<div class="loader-rect wl-force-anim" aria-hidden="true">' +
              "<div></div><div></div><div></div><div></div><div></div>" +
              "</div>" +
              "</div>"
          );
          $body.append($loading);
        }

        $.ajax({
          url: this.config.ajaxUrl,
          type: "GET",
          data: {
            action: "westlife_get_umami_topn",
            nonce: this.config.nonce,
            type,
            range,
            // OS/浏览器需要聚合，放宽 limit 以避免漏统计
            limit: type === "os" || type === "browser" ? 100 : 10,
          },
          timeout: 15000,
        })
          .done((res) => {
            $body.children(".vm-topn-loading").remove();
            if (!res || !res.success || !res.data) {
              $list.attr("data-empty", "加载失败");
              return;
            }
            const { items, total } = res.data;
            if (!Array.isArray(items) || items.length === 0) {
              $list.attr("data-empty", "暂无数据");
              return;
            }

            // 渲染
            if (type === "os") {
              // 仅展示并聚合五类：Windows 7/10/11、Mac OS、iOS、Android OS、Linux
              const buckets = {
                "Windows 7/10/11": 0,
                "Mac OS": 0,
                iOS: 0,
                "Android OS": 0,
                Linux: 0,
              };

              const toBucket = (raw) => {
                const s = String(raw || "").toLowerCase();
                if (s.includes("windows")) {
                  if (s.includes("7") || s.includes("10") || s.includes("11"))
                    return "Windows 7/10/11";
                  return null; // 其他 Windows 忽略
                }
                if (
                  s.includes("mac") ||
                  s.includes("os x") ||
                  s.includes("macos")
                )
                  return "Mac OS";
                if (
                  s.includes("ios") ||
                  s.includes("ipad") ||
                  s.includes("iphone")
                )
                  return "iOS";
                if (s.includes("android")) return "Android OS";
                if (
                  s.includes("linux") ||
                  s.includes("ubuntu") ||
                  s.includes("debian") ||
                  s.includes("centos") ||
                  s.includes("fedora") ||
                  s.includes("arch") ||
                  s.includes("mint")
                )
                  return "Linux";
                return null;
              };

              items.forEach((it) => {
                const key = toBucket(it.label);
                if (key && typeof it.value === "number")
                  buckets[key] += it.value;
              });

              const totalAll = Number(res.data.total) || 0;
              const order = [
                "Windows 7/10/11",
                "Mac OS",
                "iOS",
                "Android OS",
                "Linux",
              ];
              const renderList = order.map((k) => ({
                label: k,
                value: buckets[k] || 0,
              }));

              renderList.forEach((it) => {
                const $li = $(
                  '<li class="vm-topn-item"><div class="flag-emoji" role="img"></div><div class="vm-country-glass"><span class="label"></span><span class="meta"></span></div></li>'
                );
                $li.css({
                  "background-image": "none",
                  "background-color": "#fff",
                });
                const label = it.label;
                const percent =
                  totalAll > 0
                    ? Math.round((it.value / totalAll) * 10000) / 100
                    : 0;
                const $center = $li.find(".flag-emoji");
                $center.attr("aria-label", label).attr("aria-hidden", "true");
                $center.html(this.getIconSvg("os", label));
                $li.find(".label").text(label);
                $li.find(".meta").text(`${percent.toFixed(2)}%`);
                $list.append($li);
              });
            } else if (type === "browser") {
              // 仅展示并聚合五类：Chrome、Firefox、Edge (Chromium)、Safari、Opera
              const buckets = {
                Chrome: 0,
                Firefox: 0,
                "Edge (Chromium)": 0,
                Safari: 0,
                Opera: 0,
              };

              const toBucket = (raw) => {
                const key = this.normalizeBrowserLabel(raw);
                switch (key) {
                  case "chrome":
                    return "Chrome";
                  case "firefox":
                    return "Firefox";
                  case "edge":
                    return "Edge (Chromium)";
                  case "safari":
                    return "Safari";
                  case "opera":
                    return "Opera";
                  default:
                    return null; // 其他（QQ/UC/WeChat/360等）忽略
                }
              };

              items.forEach((it) => {
                const key = toBucket(it.label);
                if (key && typeof it.value === "number")
                  buckets[key] += it.value;
              });

              const totalAll = Number(res.data.total) || 0;
              const order = [
                "Chrome",
                "Firefox",
                "Edge (Chromium)",
                "Safari",
                "Opera",
              ];
              const renderList = order.map((k) => ({
                label: k,
                value: buckets[k] || 0,
              }));

              renderList.forEach((it) => {
                const $li = $(
                  '<li class="vm-topn-item"><div class="flag-emoji" role="img"></div><div class="vm-country-glass"><span class="label"></span><span class="meta"></span></div></li>'
                );
                $li.css({
                  "background-image": "none",
                  "background-color": "#fff",
                });
                const label = it.label;
                const percent =
                  totalAll > 0
                    ? Math.round((it.value / totalAll) * 10000) / 100
                    : 0;
                const $center = $li.find(".flag-emoji");
                $center.attr("aria-label", label).attr("aria-hidden", "true");
                $center.html(this.getIconSvg("browser", label));
                $li.find(".label").text(label);
                $li.find(".meta").text(`${percent.toFixed(2)}%`);
                $list.append($li);
              });
            } else {
              // 国家：显示名称与比例（不显示计数）
              const totalAll = Number(res.data.total) || 0;
              items.forEach((it) => {
                const $li = $(
                  '<li class="vm-topn-item"><div class="flag-emoji" role="img"></div><div class="vm-country-glass"><span class="label"></span><span class="meta"></span></div></li>'
                );
                $li.css({
                  "background-image": "none",
                  "background-color": "#fff",
                });

                const raw = (it.label || "").toString().toUpperCase();
                const iso = this.normalizeCountryCode(raw);
                const nameZh = this.getRegionName(iso);
                $li
                  .find(".flag-emoji")
                  .html(this.renderCountryFlagIcon(iso, nameZh || raw))
                  .attr("aria-label", `${nameZh || raw} 国旗`);
                $li.find(".label").text(nameZh || raw || "未知");
                const value = Number(it.value) || 0;
                const percent =
                  totalAll > 0
                    ? Math.round((value / totalAll) * 10000) / 100
                    : 0;
                $li.find(".meta").text(`${percent.toFixed(2)}%`);
                $list.append($li);
              });
            }
            $list.removeAttr("data-empty");
          })
          .fail(() => {
            $body.children(".vm-topn-loading").remove();
            $list.attr("data-empty", "加载失败");
          });
      });
    },

    /**
     * 渲染小时条形图（轻量实现）
     * @param {string} selector 容器选择器
     * @param {number[]} values 24 长度数组，代表 0-23 点的数值
     * @param {{title?: string}} options
     */
    renderHourlyChart(selector, values, options = {}) {
      const el = document.querySelector(selector);
      if (!el) return;
      if (!Array.isArray(values)) values = [];

      const title = options.title || "访客趋势";
      const range = options.range || "today";

      // 工具：渲染 24 柱
      const renderBars = (container, arr) => {
        const max = Math.max(1, ...arr);
        container.innerHTML = "";
        for (let h = 0; h < 24; h++) {
          const v = arr[h] || 0;
          const bar = document.createElement("div");
          bar.className = "vhc-bar" + (v === 0 ? " zero" : "");
          const percent = (v / max) * 100; // 百分比高度，贴底对齐
          bar.style.height = Math.max(2, percent) + "%";
          bar.dataset.hour = h;
          bar.dataset.value = v;
          container.appendChild(bar);
        }
      };

      // 包装 DOM
      const wrap = document.createElement("div");
      wrap.className = "vhc-wrap";
      const header = document.createElement("div");
      header.className = "vhc-title";
      header.innerHTML = `${icon("chart-column")} ${title}`;
      const bars = document.createElement("div");
      bars.className = "vhc-bars";
      renderBars(bars, values.length === 24 ? values : new Array(24).fill(0));

      // tooltip
      const tooltip = document.createElement("div");
      tooltip.className = "vhc-tooltip";
      el.appendChild(tooltip);
      bars.addEventListener("mousemove", (e) => {
        const target = e.target.closest(".vhc-bar");
        if (!target) {
          tooltip.style.display = "none";
          return;
        }
        const hour = target.dataset.hour;
        const value = target.dataset.value;
        tooltip.textContent = `${hour}:00  ·  ${value}`;
        tooltip.style.display = "block";
        const rect = el.getBoundingClientRect();
        tooltip.style.left = e.clientX - rect.left + "px";
        tooltip.style.top = e.clientY - rect.top - 8 + "px";
      });
      bars.addEventListener("mouseleave", () => {
        tooltip.style.display = "none";
      });

      // 右下角范围切换
      const controls = document.createElement("div");
      controls.className = "vhc-controls";
      const ranges = [
        { key: "today", label: "今日" },
        { key: "7d", label: "7天" },
        { key: "30d", label: "30天" },
        { key: "year", label: "年度" },
      ];
      ranges.forEach((r, i) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "vhc-btn" + (r.key === range ? " is-active" : "");
        btn.textContent = r.label;
        btn.addEventListener("click", () => this.switchHourlyRange(r.key));
        controls.appendChild(btn);
      });

      // 输出
      el.innerHTML = "";
      wrap.appendChild(header);
      wrap.appendChild(bars);
      // 轴刻度：每3小时一个刻度（紧贴容器底部）
      const axis = document.createElement("div");
      axis.className = "vhc-axis";
      for (let h = 0; h < 24; h++) {
        const tick = document.createElement("div");
        tick.className = "vhc-tick";
        tick.textContent = h % 3 === 0 ? `${h}` : "";
        axis.appendChild(tick);
      }
      wrap.appendChild(axis);
      el.appendChild(wrap);
      el.appendChild(controls);
    },

    // 切换小时图范围：today / 7d / 30d / year（轻量近似方案）
    switchHourlyRange(rangeKey) {
      const el = document.querySelector("#vm-hero-hourly");
      if (!el) return;
      const data = this.getCurrentData() || {};

      // 更新按钮态
      el.querySelectorAll(".vhc-btn").forEach((b) =>
        b.classList.remove("is-active")
      );
      const btns = Array.from(el.querySelectorAll(".vhc-btn"));
      const idx = ["today", "7d", "30d", "year"].indexOf(rangeKey);
      if (btns[idx]) btns[idx].classList.add("is-active");

      // 取值策略
      const todayArr =
        data.today_hourly && Array.isArray(data.today_hourly.sessions)
          ? data.today_hourly.sessions
          : new Array(24).fill(0);
      const sum = (arr) => arr.reduce((a, b) => a + (parseInt(b) || 0), 0);
      const todayTotal = sum(todayArr) || 1;
      let factor = 1;
      if (rangeKey === "7d" && data.week_uv)
        factor = Math.max(1, parseInt(data.week_uv) / todayTotal);
      else if (rangeKey === "30d" && data.month_uv)
        factor = Math.max(1, parseInt(data.month_uv) / todayTotal);
      else if (rangeKey === "year" && data.year_uv)
        factor = Math.max(1, parseInt(data.year_uv) / todayTotal);

      const bars = el.querySelector(".vhc-bars");
      if (!bars) return;
      const max = Math.max(1, ...todayArr.map((v) => Math.round(v * factor)));
      bars.querySelectorAll(".vhc-bar").forEach((bar, i) => {
        const v = Math.round((todayArr[i] || 0) * factor);
        const percent = (v / max) * 100; // 贴底对齐
        bar.style.height = Math.max(2, percent) + "%";
        bar.dataset.value = v;
      });
    },
  };

  // 暴露到全局
  window.WestlifeUmamiStats = WestlifeUmamiStats;

  function initUmamiModule() {
    if ($(".visitor-page, .umami-stats-container").length > 0) {
      WestlifeUmamiStats.init();
    }
  }

  if (window.WestlifeApp && typeof window.WestlifeApp.register === "function") {
    window.WestlifeApp.register({
      name: "umami-stats",
      match(context) {
        const root =
          context && context.nodeType === 1 ? context : document;
        return !!root.querySelector(".visitor-page, .umami-stats-container");
      },
      init() {
        initUmamiModule();
      },
      destroy() {
        WestlifeUmamiStats.destroy();
      },
    });
  } else {
    // 页面加载完成后初始化
    $(document).ready(function () {
      initUmamiModule();
    });
  }
})(jQuery);
