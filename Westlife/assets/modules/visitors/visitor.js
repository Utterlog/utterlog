(function ($) {
  "use strict";

  const MAP_CONFIG = {
    marker: {
      radius: 8,
      fillColor: "#002FA7",
      color: "#fff",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.8,
    },
    markerCurrent: {
      radius: 9,
      fillColor: "#22c55e", // 绿色：当前访客
      color: "#fff",
      weight: 1,
      opacity: 1,
      fillOpacity: 0.95,
    },
    heatmap: {
      radius: 25,
      blur: 15,
      maxZoom: 10,
      gradient: {
        0.4: "#002FA7",
        0.6: "#1E4EC8",
        0.8: "#4B7BE5",
        1.0: "#7B9EFF",
      },
    },
  };

  class VisitorMap {
    constructor() {
      this.map = null;
      this.heatLayer = null;
      this.markers = null;
      this.markerIndex = [];
      this.heatData = [];
      this._recent = {
        offsetX: 0,
        dragging: false,
        moved: false,
        startX: 0,
        startOffsetX: 0,
      };
      this.currentRange = "year"; // 地图点时间范围（本地 GeoIP 缓存）
      this._recentHandlers = { enter: null, leave: null, click: null };
      this._fs = {
        left: null,
        right: null,
        handlersBound: false,
        pending: false,
      };
      this._resizeHandler = null;
      this._fullscreenEnterHandler = null;
      this._fullscreenExitHandler = null;
    }

    getSiteTimeZone() {
      return (
        (window.westlifeSettings && window.westlifeSettings.siteTimezone) || "UTC"
      );
    }

    formatSiteDateParts(date) {
      try {
        const formatter = new Intl.DateTimeFormat("zh-CN", {
          timeZone: this.getSiteTimeZone(),
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        });
        const parts = {};
        formatter.formatToParts(date).forEach((part) => {
          if (part.type !== "literal") parts[part.type] = part.value;
        });
        return parts;
      } catch (e) {
        return null;
      }
    }

    // 统一格式化绝对时间：YYYY-MM-DD HH:mm:ss（使用浏览器本地时区）
    formatAbsTime(ts) {
      const n = Number(ts);
      if (!Number.isFinite(n)) return "";
      const d = new Date(n * 1000);
      const parts = this.formatSiteDateParts(d);
      if (parts) {
        return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
      }
      return d.toISOString().slice(0, 19).replace("T", " ");
    }

    // 相对时间（中文）：几秒前/几分钟前/几小时前/几天前/几个月前/几年前（使用UTC时间）
    formatRelativeZh(ts) {
      const n = Number(ts);
      if (!Number.isFinite(n)) return "";
      // 使用 UTC 时间戳计算，确保与服务器时间一致
      const nowUtc = Math.floor(Date.now() / 1000);
      const s = Math.max(0, nowUtc - n);
      if (s < 60) return s <= 1 ? "刚刚" : `${s}秒前`;
      const m = Math.floor(s / 60);
      if (m < 60) return `${m}分钟前`;
      const h = Math.floor(m / 60);
      if (h < 24) return `${h}小时前`;
      const d = Math.floor(h / 24);
      if (d < 30) return `${d}天前`;
      const mo = Math.floor(d / 30);
      if (mo < 12) return `${mo}个月前`;
      const y = Math.floor(mo / 12);
      return `${y}年前`;
    }

    // 站点时区当天 00:00:00 的时间戳（秒）
    getLocalDayStartTs() {
      const parts = this.formatSiteDateParts(new Date());
      if (!parts) {
        return Math.floor(Date.now() / 1000);
      }
      const utcTs = Date.parse(
        `${parts.year}-${parts.month}-${parts.day}T00:00:00Z`
      );
      return Number.isFinite(utcTs) ? Math.floor(utcTs / 1000) : Math.floor(Date.now() / 1000);
    }

    init() {
      if (this.map) return;
      this.mapElement = document.getElementById("visitor-map-background");
      if (!this.mapElement) {
        return;
      }

      // 使用固定高度，由 CSS 控制
      // this.mapElement.style.height = `calc(100vh - var(--header-height) - var(--footer-height))`;

      this.map = L.map("visitor-map-background", {
        zoomControl: true,
        attributionControl: false,
        fullscreenControl: true,
        fullscreenControlOptions: {
          position: "topleft",
          title: { false: "进入全屏", true: "退出全屏" },
        },
        center: westlifeMapConfig.mapOptions.center,
        zoom: westlifeMapConfig.mapOptions.zoom,
        minZoom: westlifeMapConfig.mapOptions.minZoom,
        maxZoom: westlifeMapConfig.mapOptions.maxZoom,
        maxBounds: L.latLngBounds(L.latLng(-90, -180), L.latLng(90, 180)),
        maxBoundsViscosity: 1.0,
      });

      L.tileLayer(westlifeMapConfig.mapOptions.tileLayer, {
        attribution: westlifeMapConfig.mapOptions.attribution,
        opacity: 0.8,
      }).addTo(this.map);

      this.markers = L.layerGroup().addTo(this.map);
      // 顶部右侧：地图点时间范围控制条（本地 GeoIP 数据）
      this.createRangeControl();
      this.initHeatmap();
      this.loadVisitorData(this.currentRange).finally(() => {
        // 初次加载后构建“今日”最近访客（用本地时区）
        this.refreshTodayRecentList();
      });

      this._resizeHandler = () => {
        if (this.map) {
          this.map.invalidateSize();
        }
      };
      window.addEventListener("resize", this._resizeHandler);

      // 全屏联动：进入/退出时创建或移除侧栏列表
      this._fullscreenEnterHandler = () => this.enterFullscreen();
      this._fullscreenExitHandler = () => this.exitFullscreen();
      this.map.on("enterFullscreen", this._fullscreenEnterHandler);
      this.map.on("exitFullscreen", this._fullscreenExitHandler);
    }

    destroy() {
      if (this._resizeHandler) {
        window.removeEventListener("resize", this._resizeHandler);
        this._resizeHandler = null;
      }
      if (this.map) {
        if (this._fullscreenEnterHandler) {
          this.map.off("enterFullscreen", this._fullscreenEnterHandler);
          this._fullscreenEnterHandler = null;
        }
        if (this._fullscreenExitHandler) {
          this.map.off("exitFullscreen", this._fullscreenExitHandler);
          this._fullscreenExitHandler = null;
        }
        this.map.off();
        this.map.remove();
        this.map = null;
      }
      this.heatLayer = null;
      this.markers = null;
      this.markerIndex = [];
      this.heatData = [];
      this.mapElement = null;
    }

    initHeatmap() {
      if (!this.map) return;

      this.heatLayer = L.heatLayer([], {
        radius: MAP_CONFIG.heatmap.radius,
        blur: MAP_CONFIG.heatmap.blur,
        maxZoom: MAP_CONFIG.heatmap.maxZoom,
        gradient: MAP_CONFIG.heatmap.gradient,
      });

      // 确保地图尺寸已准备好后再加载热力图，避免Canvas错误
      const addHeatLayerSafely = () => {
        const size = this.map.getSize();
        if (size.x > 0 && size.y > 0) {
          this.heatLayer.addTo(this.map);
        } else {
          setTimeout(addHeatLayerSafely, 100);
        }
      };

      this.map.whenReady(() => {
        addHeatLayerSafely();
      });
    }

    async loadVisitorData(range) {
      try {
        const r = range || this.currentRange || "year";
        const response = await fetch(westlifeMapConfig.ajaxurl, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: new URLSearchParams({
            action: "westlife_get_visitors_data",
            nonce: westlifeMapConfig.nonce,
            range: r,
          }),
        });

        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        if (!result.success)
          throw new Error(
            result.data?.message || westlifeMapConfig.i18n.loadError
          );

        if (this.heatLayer && Array.isArray(result.data.current)) {
          const heatData = result.data.current.map((point) => [
            point.lat,
            point.lon,
            1,
          ]);
          this.heatLayer.setLatLngs(heatData);
          this.renderVisitorData(result.data.current);
          this.currentRange = r;
          // 每次切换范围后也刷新“今日”最近访客（保持与地图数据源同步）
          this.refreshTodayRecentList();
        }

        if (result.data.stats) {
          this.updateStats(result.data.stats);
        }
      } catch (error) {
        console.error("访客数据加载失败:", error);
        this.showError(error.message || westlifeMapConfig.i18n.loadError);
      }
    }

    renderVisitorData(visitors) {
      this.markers.clearLayers();
      this.markerIndex = [];
      this.heatData = [];

      if (!Array.isArray(visitors) || visitors.length === 0) {
        // 无数据：清空标记与热力图，但保留地图与控件
        this.markers.clearLayers();
        this.markerIndex = [];
        this.heatData = [];
        if (this.heatLayer) this.heatLayer.setLatLngs([]);
        return;
      }

      // 最新访客：按时间戳 ts 最大判断
      const sorted = [...visitors].sort((a, b) => (a.ts || 0) - (b.ts || 0));
      const latest = sorted[sorted.length - 1];

      visitors.forEach((visitor) => {
        const lat = parseFloat(visitor.lat);
        const lon = parseFloat(visitor.lon);
        if (isNaN(lat) || isNaN(lon)) return;

        const latLng = [lat, lon];
        const isCurrent = latest && visitor.ts === latest.ts;

        const marker = L.circleMarker(latLng, {
          ...(isCurrent ? MAP_CONFIG.markerCurrent : MAP_CONFIG.marker),
          className: isCurrent
            ? "vm-marker vm-marker--current"
            : "vm-marker vm-marker--normal",
        })
          .bindPopup(this.createPopupContent(visitor))
          .addTo(this.markers);

        // 添加 hover 呼吸动画：通过添加/移除 CSS 类实现
        marker.on("mouseover", () => {
          const el = marker.getElement();
          if (el) el.classList.add("vm-marker-breath");
          // 反向联动：标记 → 列表高亮
          if (visitor.ts) this.highlightListByTs(visitor.ts, true);
        });
        marker.on("mouseout", () => {
          const el = marker.getElement();
          if (el) el.classList.remove("vm-marker-breath");
          if (visitor.ts) this.highlightListByTs(visitor.ts, false);
        });

        // 弹窗开/关与卡片激活态同步
        marker.on("popupopen", () => {
          if (visitor.ts) this.activateListByTs(visitor.ts, true);
        });
        marker.on("popupclose", () => {
          if (visitor.ts) this.activateListByTs(visitor.ts, false);
        });

        // 索引保存，便于列表 hover 联动
        this.markerIndex.push({
          lat,
          lon,
          ts:
            typeof visitor.ts !== "undefined"
              ? parseInt(visitor.ts, 10)
              : undefined,
          city: visitor.city || "",
          country: visitor.country || "",
          cc: visitor.cc || "",
          time: visitor.time || "",
          marker,
          isCurrent,
        });

        this.heatData.push([...latLng, 1]);
      });

      this.heatLayer.setLatLngs(this.heatData);
      this.fitMapBounds();

      // 绑定底部最近访客与标记的联动（列表会在 refreshTodayRecentList 中重建并再次绑定）
      this.bindRecentHover();

      // 若当前处于全屏状态（或之前进入时数据未就绪），此处补建左右侧栏
      if (this.isMapFullscreen() || this._fs.pending) {
        this.enterFullscreen();
      }
    }

    // 创建地图右上角的时间范围控制条（仅作用于地图点）
    createRangeControl() {
      if (!this.map) return;
      const self = this;
      const RangeControl = L.Control.extend({
        options: { position: "topright" },
        onAdd() {
          const container = L.DomUtil.create("div", "vhc-controls");
          const ranges = [
            { key: "today", label: "今日" },
            { key: "7d", label: "7天" },
            { key: "30d", label: "30天" },
            { key: "year", label: "年度" },
          ];
          ranges.forEach((r) => {
            const btn = L.DomUtil.create("button", "vhc-btn", container);
            btn.type = "button";
            btn.textContent = r.label;
            if (r.key === self.currentRange) btn.classList.add("is-active");
            btn.setAttribute("title", `切换地图点范围：${r.label}`);
            btn.setAttribute("aria-label", `切换地图点范围：${r.label}`);
            L.DomEvent.on(btn, "click", (e) => {
              L.DomEvent.stopPropagation(e);
              L.DomEvent.preventDefault(e);
              // 更新按钮激活态
              Array.from(container.querySelectorAll(".vhc-btn")).forEach((el) =>
                el.classList.remove("is-active")
              );
              btn.classList.add("is-active");
              self.currentRange = r.key;
              self.loadVisitorData(r.key);
            });
          });
          // 禁止滚轮/拖拽穿透
          L.DomEvent.disableClickPropagation(container);
          L.DomEvent.disableScrollPropagation(container);
          return container;
        },
      });
      this.map.addControl(new RangeControl());
    }

    createPopupContent(visitor) {
      const cc = (visitor.cc || "").toUpperCase();
      const flag =
        cc.length === 2
          ? String.fromCodePoint(0x1f1e6 + (cc.charCodeAt(0) - 65)) +
            String.fromCodePoint(0x1f1e6 + (cc.charCodeAt(1) - 65))
          : "";
      const addr = [visitor.city, visitor.country].filter(Boolean).join(", ");
      const title = addr
        ? `${addr}${flag ? " " + flag : ""}`
        : flag || "未知地址";
      const ts = typeof visitor.ts === "number" ? visitor.ts : NaN;
      const timeStr = Number.isFinite(ts) ? this.formatRelativeZh(ts) : "";
      return `<div class="visitor-popup"><div class="vp-addr"><b>${title}</b></div><div class="vp-time">${timeStr}</div><div class="vp-source">地图点 · GeoIP</div></div>`;
    }

    fitMapBounds() {
      const group = L.featureGroup(this.markers.getLayers());
      if (group.getLayers().length > 0) {
        this.map.fitBounds(group.getBounds(), { padding: [50, 50] });
      }
    }

    bindRecentHover() {
      const container = document.querySelector(
        ".vm-map-overlay .visitor-recent-inline"
      );
      if (!container) return;

      // 清理旧的事件处理器，避免重复绑定
      if (this._recentHandlers.enter) {
        container.removeEventListener("mouseover", this._recentHandlers.enter);
      }
      if (this._recentHandlers.leave) {
        container.removeEventListener("mouseout", this._recentHandlers.leave);
      }
      if (this._recentHandlers.click) {
        container.removeEventListener("click", this._recentHandlers.click);
      }

      const onEnter = (e) => {
        const item = e.target.closest(".visitor-item");
        if (item) this.toggleMarkerPulse(item, true);
      };
      const onLeave = (e) => {
        const item = e.target.closest(".visitor-item");
        if (item) this.toggleMarkerPulse(item, false);
      };
      const onClick = (e) => {
        // 若紧前发生了拖动，忽略此次点击
        if (this._recent && this._recent.moved) {
          this._recent.moved = false;
          return;
        }
        const item = e.target.closest(".visitor-item");
        if (!item) return;
        const target = this.findMarkerByItem(item);
        if (!target) return;
        const { marker } = target;
        const latlng = marker.getLatLng();
        const zoom = Math.max(this.map.getZoom(), 5);
        const open = () => marker.openPopup();
        this.map.once("moveend", open);
        // 使用 flyTo 提升平滑感，部分版本 setView 动画表现不一致
        this.map.flyTo(latlng, zoom, { animate: true, duration: 0.6 });
        // 立即给点击的卡片激活态（弹窗打开后会统一同步一次）
        this.activateListByTs(parseInt(item.getAttribute("data-ts"), 10), true);
      };

      container.addEventListener("mouseover", onEnter);
      container.addEventListener("mouseout", onLeave);
      container.addEventListener("click", onClick);

      this._recentHandlers = { enter: onEnter, leave: onLeave, click: onClick };
      // 固定两行网格布局，无需横向拖拽
    }

    // 根据 ts 在所有列表(底部 + 全屏侧栏)同步高亮/激活态
    highlightListByTs(ts, on) {
      if (!ts) return;
      const sel = `.visitor-item[data-ts="${ts}"]`;
      document.querySelectorAll(sel).forEach((el) => {
        if (on) el.classList.add("is-hover");
        else el.classList.remove("is-hover");
      });
    }

    activateListByTs(ts, on) {
      if (!ts) return;
      // 清除所有已激活
      if (on) {
        document
          .querySelectorAll(".visitor-item.is-active")
          .forEach((el) => el.classList.remove("is-active"));
      }
      const sel = `.visitor-item[data-ts="${ts}"]`;
      document.querySelectorAll(sel).forEach((el) => {
        if (on) el.classList.add("is-active");
        else el.classList.remove("is-active");
      });
    }

    // 全屏：创建左右两侧各 10 条的紧凑列表
    enterFullscreen() {
      // 若无数据，跳过
      if (!Array.isArray(this.markerIndex) || this.markerIndex.length === 0) {
        this._fs.pending = true;
        return;
      }
      this._fs.pending = false;

      const container = this.map.getContainer();
      // 清理旧的
      this.exitFullscreen();

      const overlayLeft = document.createElement("div");
      overlayLeft.className = "vm-fs-overlay vm-fs-left";
      const overlayRight = document.createElement("div");
      overlayRight.className = "vm-fs-overlay vm-fs-right";

      const listLeft = document.createElement("div");
      listLeft.className = "vm-fs-list";
      const listRight = document.createElement("div");
      listRight.className = "vm-fs-list";
      overlayLeft.appendChild(listLeft);
      overlayRight.appendChild(listRight);

      container.appendChild(overlayLeft);
      container.appendChild(overlayRight);

      this._fs.left = overlayLeft;
      this._fs.right = overlayRight;

      // 最新 20 条（ts 降序），左 10 + 右 10
      const sorted = [...this.markerIndex]
        .filter((m) => typeof m.ts === "number")
        .sort((a, b) => b.ts - a.ts)
        .slice(0, 20);
      const leftItems = sorted.slice(0, 10);
      const rightItems = sorted.slice(10, 20);

      const renderFsItem = (m) => {
        // 单行显示：城市 + 空格 + 两位国家码 + 空格 + emoji国旗 + 分隔点 + 时间
        const flag =
          (m.cc || "").length === 2
            ? String.fromCodePoint(
                0x1f1e6 + (m.cc.toUpperCase().charCodeAt(0) - 65)
              ) +
              String.fromCodePoint(
                0x1f1e6 + (m.cc.toUpperCase().charCodeAt(1) - 65)
              )
            : "";
        const countryPart = m.cc ? ` ${m.cc.toUpperCase()} ${flag}` : "";
        const timeStr = Number.isFinite(m.ts)
          ? this.formatRelativeZh(m.ts)
          : "";
        const text = `${m.city || "未知城市"}${countryPart} · ${timeStr}`;
        const div = document.createElement("div");
        div.className = "visitor-item";
        div.setAttribute("data-lat", String(m.lat));
        div.setAttribute("data-lon", String(m.lon));
        div.setAttribute("data-ts", String(m.ts));
        div.title = text;
        div.innerHTML = `<div class="visitor-one-line">${text}</div>`;
        return div;
      };

      leftItems.forEach((m) => listLeft.appendChild(renderFsItem(m)));
      rightItems.forEach((m) => listRight.appendChild(renderFsItem(m)));

      // 绑定事件（与底部一致）
      const bind = (root) => {
        root.addEventListener("mouseover", (e) => {
          const item = e.target.closest(".visitor-item");
          if (item) this.toggleMarkerPulse(item, true);
        });
        root.addEventListener("mouseout", (e) => {
          const item = e.target.closest(".visitor-item");
          if (item) this.toggleMarkerPulse(item, false);
        });
        root.addEventListener("click", (e) => {
          const item = e.target.closest(".visitor-item");
          if (!item) return;
          const target = this.findMarkerByItem(item);
          if (!target) return;
          const { marker } = target;
          const latlng = marker.getLatLng();
          const zoom = Math.max(this.map.getZoom(), 5);
          const open = () => marker.openPopup();
          this.map.once("moveend", open);
          this.map.flyTo(latlng, zoom, { animate: true, duration: 0.6 });
          this.activateListByTs(
            parseInt(item.getAttribute("data-ts"), 10),
            true
          );
        });
      };

      bind(listLeft);
      bind(listRight);
    }

    // 拉取并构建当天内的所有最近定位点（使用系统时区）
    async refreshTodayRecentList() {
      try {
        const response = await fetch(westlifeMapConfig.ajaxurl, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
          },
          body: new URLSearchParams({
            action: "westlife_get_visitors_data",
            nonce: westlifeMapConfig.nonce,
            range: "today",
          }),
        });
        if (!response.ok)
          throw new Error(`HTTP error! status: ${response.status}`);
        const result = await response.json();
        if (!result.success)
          throw new Error(
            result.data?.message || westlifeMapConfig.i18n.loadError
          );
        const list = Array.isArray(result.data.current)
          ? result.data.current.slice().sort((a, b) => b.ts - a.ts)
          : [];
        // 后端已按 range 过滤，无需再次按本地时区过滤
        this.renderBottomRecent(list);
      } catch (e) {
        console.error("刷新今日最近定位点失败:", e);
      }
    }

    // 渲染底部最近定位点（支持左右箭头与拖拽，无滚动条）
    renderBottomRecent(list) {
      const viewport = document.querySelector(
        ".vm-map-overlay .vm-recent-inline"
      );
      const track = document.querySelector(
        ".vm-map-overlay .visitor-recent-inline"
      );
      if (!viewport || !track) return;
      // 清理旧的提示文案
      const oldHint = viewport.querySelector(".vm-recent-empty");
      if (oldHint) oldHint.remove();

      // 当“今日”无数据：保留服务端渲染的历史列表，同时给出淡灰提示
      if (!Array.isArray(list) || list.length === 0) {
        const hint = document.createElement("div");
        hint.className = "vm-recent-empty";
        hint.setAttribute("aria-live", "polite");
        hint.textContent = "今日暂无新定位点，已显示最近定位历史";
        viewport.appendChild(hint);
        return;
      }
      track.innerHTML = "";
      const latestTs = Math.max(...list.map((x) => x.ts || 0));
      list.forEach((m) => {
        const item = document.createElement("div");
        item.className =
          m.ts === latestTs ? "visitor-item is-current" : "visitor-item";
        item.setAttribute("data-lat", String(m.lat));
        item.setAttribute("data-lon", String(m.lon));
        item.setAttribute("data-ts", String(m.ts));
        const cc = (m.cc || "").toUpperCase();
        const loc = [m.city, cc].filter(Boolean).join(", ") || "未知城市";
        item.innerHTML = `<div class="visitor-one-line"><span class="vol-loc">${loc}</span><span class="vol-time">${this.formatRelativeZh(
          m.ts
        )}</span></div>`;
        track.appendChild(item);
      });
      // 重新绑定联动与拖拽/箭头
      this.bindRecentHover();
      this.ensureArrows(viewport);
      this.attachDragScroll(viewport, track);
      this.setRecentOffset(0, viewport, track);
    }

    ensureArrows(viewport) {
      let left = viewport.querySelector(".vm-recent-arrow--left");
      let right = viewport.querySelector(".vm-recent-arrow--right");
      if (!left) {
        left = document.createElement("button");
        left.type = "button";
        left.className = "vm-recent-arrow vm-recent-arrow--left";
        left.setAttribute("aria-label", "向左");
        left.innerHTML = "&#x276E;";
        viewport.appendChild(left);
      }
      if (!right) {
        right = document.createElement("button");
        right.type = "button";
        right.className = "vm-recent-arrow vm-recent-arrow--right";
        right.setAttribute("aria-label", "向右");
        right.innerHTML = "&#x276F;";
        viewport.appendChild(right);
      }
      const track = viewport.querySelector(".visitor-recent-inline");
      const step = 360;
      left.onclick = () => this.nudgeRecent(-step, viewport, track);
      right.onclick = () => this.nudgeRecent(step, viewport, track);
    }

    setRecentOffset(x, viewport, track) {
      this._recent.offsetX = x;
      track.style.transform = `translateX(${x}px)`;
      this.constrainRecentOffset(viewport, track);
    }

    getTrackWidths(viewport, track) {
      const vpW = viewport.clientWidth;
      const trackW = track.scrollWidth;
      return { vpW, trackW };
    }

    constrainRecentOffset(viewport, track) {
      const { vpW, trackW } = this.getTrackWidths(viewport, track);
      let minX = Math.min(0, vpW - trackW);
      if (!Number.isFinite(minX)) minX = 0;
      if (this._recent.offsetX > 0) this._recent.offsetX = 0;
      if (this._recent.offsetX < minX) this._recent.offsetX = minX;
      track.style.transform = `translateX(${this._recent.offsetX}px)`;
      const left = viewport.querySelector(".vm-recent-arrow--left");
      const right = viewport.querySelector(".vm-recent-arrow--right");
      if (left) left.disabled = this._recent.offsetX === 0;
      if (right) right.disabled = this._recent.offsetX === minX;
    }

    nudgeRecent(dx, viewport, track) {
      this.setRecentOffset(this._recent.offsetX + dx, viewport, track);
    }

    attachDragScroll(viewport, track) {
      const state = this._recent;
      const onDown = (clientX) => {
        state.dragging = true;
        state.moved = false;
        state.startX = clientX;
        state.startOffsetX = state.offsetX;
        track.classList.add("is-grabbing");
        viewport.classList.add("is-grabbing");
      };
      const onMove = (clientX) => {
        if (!state.dragging) return;
        const dx = clientX - state.startX;
        if (Math.abs(dx) > 3) state.moved = true;
        this.setRecentOffset(state.startOffsetX + dx, viewport, track);
      };
      const onUp = (e) => {
        state.dragging = false;
        track.classList.remove("is-grabbing");
        viewport.classList.remove("is-grabbing");
        // 如果发生拖动，阻止紧接着的点击触发卡片定位
        if (state.moved && e) {
          e.preventDefault?.();
          e.stopPropagation?.();
        }
      };
      // 鼠标
      viewport.addEventListener("mousedown", (e) => {
        // 仅主键
        if (e.button !== 0) return;
        onDown(e.clientX);
      });
      window.addEventListener("mousemove", (e) => onMove(e.clientX));
      window.addEventListener("mouseup", onUp, { capture: true });
      // 触摸
      viewport.addEventListener(
        "touchstart",
        (e) => {
          if (e.touches && e.touches[0]) onDown(e.touches[0].clientX);
        },
        { passive: true }
      );
      window.addEventListener(
        "touchmove",
        (e) => {
          if (e.touches && e.touches[0]) onMove(e.touches[0].clientX);
        },
        { passive: true }
      );
      window.addEventListener("touchend", onUp);
    }

    // 全屏：移除侧栏
    exitFullscreen() {
      if (this._fs.left && this._fs.left.parentNode) {
        this._fs.left.parentNode.removeChild(this._fs.left);
      }
      if (this._fs.right && this._fs.right.parentNode) {
        this._fs.right.parentNode.removeChild(this._fs.right);
      }
      this._fs.left = null;
      this._fs.right = null;
    }

    // 判断地图是否处于全屏
    isMapFullscreen() {
      try {
        if (typeof this.map.isFullscreen === "function") {
          return !!this.map.isFullscreen();
        }
      } catch (_) {}
      const c = this.map.getContainer();
      return (
        document.body.classList.contains("leaflet-fullscreen-on") ||
        c.classList.contains("leaflet-fullscreen-on") ||
        c.classList.contains("leaflet-pseudo-fullscreen")
      );
    }

    toggleMarkerPulse(item, shouldPulse) {
      const lat = parseFloat(item.getAttribute("data-lat"));
      const lon = parseFloat(item.getAttribute("data-lon"));
      const ts = parseInt(item.getAttribute("data-ts"), 10);
      if (isNaN(lat) || isNaN(lon)) return;

      let found = this.findMarker({ lat, lon, ts });
      if (!found) return;

      const el = found.marker.getElement();
      if (!el) return;

      if (shouldPulse) {
        el.classList.add("vm-marker-breath", "vm-marker--hover-yellow");
      } else {
        el.classList.remove("vm-marker-breath", "vm-marker--hover-yellow");
      }
    }

    findMarkerByItem(item) {
      const lat = parseFloat(item.getAttribute("data-lat"));
      const lon = parseFloat(item.getAttribute("data-lon"));
      const ts = parseInt(item.getAttribute("data-ts"), 10);
      return this.findMarker({ lat, lon, ts });
    }

    findMarker({ lat, lon, ts }) {
      // 优先用时间戳精确匹配，其次用坐标近似匹配
      let found = this.markerIndex.find((m) => m.ts && ts && m.ts === ts);
      if (!found && !isNaN(lat) && !isNaN(lon)) {
        found = this.markerIndex.find(
          (m) => Math.abs(m.lat - lat) < 1e-6 && Math.abs(m.lon - lon) < 1e-6
        );
      }
      return found;
    }

    showError(message) {
      if (!this.mapElement) return;

      const errorDiv = document.createElement("div");
      errorDiv.className = "map-error";
      errorDiv.innerHTML = `<i class="fas fa-exclamation-circle"></i><p>${message}</p>`;

      this.mapElement.innerHTML = "";
      this.mapElement.appendChild(errorDiv);
    }

    updateStats(stats) {
      const $statsContainer = $(".visitor-stats");
      if ($statsContainer.length) {
        $statsContainer.html(`
                    <div class="stat-item"><i class="fas fa-globe-asia"></i><div class="stat-info"><span class="stat-value" data-value="${stats.countries}">0</span><span class="stat-label">访问国家</span></div></div>
                    <div class="stat-item"><i class="fas fa-users"></i><div class="stat-info"><span class="stat-value" data-value="${stats.total}">0</span><span class="stat-label">独立访客</span></div></div>
                    <div class="stat-item"><i class="fas fa-chart-line"></i><div class="stat-info"><span class="stat-value" data-value="${stats.total_visits}">0</span><span class="stat-label">总访问量</span></div></div>
                `);

        $(".stat-value").each(function () {
          const $this = $(this);
          const finalValue = parseInt($this.data("value"));
          $this.prop("Counter", 0).animate(
            {
              Counter: finalValue,
            },
            {
              duration: 1500,
              easing: "swing",
              step: function (now) {
                $this.text(Math.ceil(now));
              },
            }
          );
        });
      }
    }
  }

  function debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }

  let visitorMapInstance = null;

  function initVisitorPage() {
    if (!document.getElementById("visitor-map-background")) return;
    if (visitorMapInstance) return;
    visitorMapInstance = new VisitorMap();
    visitorMapInstance.updateHeatmap = debounce(
      visitorMapInstance.updateHeatmap?.bind(visitorMapInstance),
      100
    );
    visitorMapInstance.init();
  }

  function destroyVisitorPage() {
    if (visitorMapInstance && typeof visitorMapInstance.destroy === "function") {
      visitorMapInstance.destroy();
    }
    visitorMapInstance = null;
  }

  if (window.WestlifeApp && typeof window.WestlifeApp.register === "function") {
    window.WestlifeApp.register({
      name: "visitor-page",
      match(context) {
        const root =
          context && context.nodeType === 1 ? context : document;
        return !!root.querySelector("#visitor-map-background");
      },
      init() {
        initVisitorPage();
      },
      destroy() {
        destroyVisitorPage();
      },
    });
  } else {
    $(document).ready(function () {
      initVisitorPage();
    });
  }
})(jQuery);
