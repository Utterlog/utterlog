/*! Lightweight heatmap module extracted from home.js */
(function (global) {
  if (global.WLHeatmap) return; // idempotent
  var HEATMAP_CACHE_VERSION = 1;
  var HEATMAP_CACHE_TTL = 1000 * 60 * 30; // 30min
  var inFlight = {};
  var stats = { ok: 0, network: 0, empty: 0, watchdog: 0 };

  function cacheKey(type) {
    return "wl_heatmap_" + type + "_v" + HEATMAP_CACHE_VERSION;
  }
  function readCache(type) {
    try {
      var raw = localStorage.getItem(cacheKey(type));
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || !o.time || !o.html) return null;
      if (Date.now() - o.time > HEATMAP_CACHE_TTL) return null;
      return o;
    } catch (e) {
      return null;
    }
  }
  function writeCache(type, html) {
    try {
      localStorage.setItem(
        cacheKey(type),
        JSON.stringify({ time: Date.now(), html: html })
      );
    } catch (e) {}
  }

  function fetchAndRender(typeKey, panel, url, options) {
    options = options || {};
    var start = (performance && performance.now()) || Date.now();
    var MIN_SPIN = options.silent ? 0 : 800;
    if (performance && performance.mark) {
      try {
        performance.mark("heatmap-fetch-" + typeKey + "-start");
      } catch (e) {}
    }
    return fetch(url + (url.indexOf("?") > -1 ? "&" : "?") + "_" + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error("network");
        return r.json();
      })
      .then(function (data) {
        if (!(data && data.success && data.data && data.data.html))
          throw new Error("empty");
        stats.ok++;
        panel.classList.add("is-flipping");
        var elapsed =
          ((performance && performance.now()) || Date.now()) - start;
        var remain = MIN_SPIN - elapsed;
        if (remain < 0) remain = 0;
        setTimeout(function () {
          panel.innerHTML = data.data.html;
          panel.classList.remove("u-loading", "is-flip-start", "is-flipping");
          panel.classList.add("is-flip-end");
          panel.setAttribute("data-loaded", "true");
          panel.setAttribute("aria-busy", "false");
          animate(panel);
          initTooltips();
          writeCache(typeKey, data.data.html);
        }, remain);
      })
      .catch(function (err) {
        var reason = (err && err.message) || "unknown";
        if (reason === "network") stats.network++;
        else if (reason === "empty") stats.empty++;
        if (!options.silent) {
          panel.innerHTML =
            '<div class="heatmap-error">加载失败，点击重试</div>';
          panel.setAttribute("aria-busy", "false");
          panel.addEventListener("click", function retry(e) {
            if (e.target.classList.contains("heatmap-error")) {
              panel.removeEventListener("click", retry);
              panel.removeAttribute("data-loaded");
              load(typeKey, { force: true });
            }
          });
        }
      })
      .finally(function () {
        if (performance && performance.mark && performance.measure) {
          try {
            performance.mark("heatmap-fetch-" + typeKey + "-end");
            performance.measure(
              "heatmap-fetch-" + typeKey,
              "heatmap-fetch-" + typeKey + "-start",
              "heatmap-fetch-" + typeKey + "-end"
            );
          } catch (e) {}
        }
        panel.addEventListener(
          "animationend",
          function (ev) {
            if (ev.animationName === "hm-flip-in") {
              panel.classList.remove("is-flip-end");
            }
          },
          { once: false }
        );
      });
  }

  function load(type, opts) {
    opts = opts || {};
    var id =
      type === "memos" ? "activity-heatmap-memos" : "activity-heatmap-posts";
    var panel = document.getElementById(id);
    if (!panel) return;
    if (panel.getAttribute("data-loaded") === "true" && !opts.force) return;
    var url = panel.getAttribute("data-load-url");
    if (!url) {
      panel.setAttribute("data-loaded", "true");
      return;
    }
    var cached = readCache(type);
    if (cached && !opts.skipCache) {
      panel.innerHTML = cached.html;
      panel.classList.remove("u-loading", "is-flip-start", "is-flipping");
      panel.setAttribute("data-loaded", "true");
      panel.setAttribute("data-cached", "true");
      panel.setAttribute("aria-busy", "false");
      animate(panel);
      initTooltips();
      if (!inFlight[type]) {
        inFlight[type] = fetchAndRender(type, panel, url, {
          silent: true,
        }).finally(function () {
          inFlight[type] = null;
        });
      }
      return;
    }
    panel.classList.add("u-loading", "is-flip-start");
    panel.setAttribute("aria-busy", "true");
    panel.removeAttribute("data-cached");
    panel.innerHTML =
      '<div class="heatmap-loading-spinner"><span class="spin" aria-label="loading"></span></div>';
    if (!inFlight[type]) {
      inFlight[type] = fetchAndRender(type, panel, url, {
        silent: false,
      }).finally(function () {
        inFlight[type] = null;
      });
    }
  }

  function initTooltips() {
    var root = document.querySelector(".right-heatmap");
    if (!root) return;
    var wrap = root.querySelector(".heatmap-panels");
    if (!wrap) return;
    var tip = root.querySelector(".heatmap-float-tip");
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "heatmap-float-tip";
      var s = tip.style;
      s.position = "fixed";
      s.zIndex = "9999";
      s.background = "var(--color-background)";
      s.border = "1px solid var(--color-border)";
      s.padding = "4px 6px";
      s.borderRadius = "4px";
      s.fontSize = "11px";
      s.boxShadow = "0 2px 4px rgba(0,0,0,.08)";
      s.pointerEvents = "none";
      s.transition = "opacity .15s";
      s.opacity = "0";
      document.body.appendChild(tip);
    }
    var visible = false;
    function show(html, x, y) {
      tip.innerHTML = html;
      tip.style.left = x + 12 + "px";
      tip.style.top = y + 12 + "px";
      if (!visible) {
        visible = true;
        tip.style.opacity = "1";
      }
    }
    function hide() {
      if (visible) {
        visible = false;
        tip.style.opacity = "0";
      }
    }
    wrap.addEventListener("mouseover", function (e) {
      var cell = e.target.closest(".activity-day");
      if (!cell) return;
      var date = cell.getAttribute("data-date") || "";
      var count = cell.getAttribute("data-count") || "0";
      var panel = cell.closest(".hm-panel");
      var type = panel ? panel.getAttribute("data-type") : "";
      var base =
        count === "0"
          ? date + " 无更新"
          : date + " · " + (type === "posts" ? count + "篇" : count + "条");
      var html = base;
      if (type === "posts" && count !== "0") {
        var titlesRaw = cell.getAttribute("data-titles");
        if (titlesRaw) {
          titlesRaw
            .split("||")
            .slice(0, 5)
            .forEach(function (t) {
              html += "<br>" + t;
            });
        }
      }
      show(html, e.pageX, e.pageY);
    });
    wrap.addEventListener("mousemove", function (e) {
      if (!visible) return;
      show(tip.innerHTML, e.pageX, e.pageY);
    });
    wrap.addEventListener("mouseout", function (e) {
      if (!e.relatedTarget || !wrap.contains(e.relatedTarget)) hide();
    });
  }

  function setupMemosDeferred() {
    if (global.__memosDeferredHooked) return;
    global.__memosDeferredHooked = true;
    var selectors = [
      '[data-heatmap-tab="memos"]',
      '.heatmap-tabs [data-type="memos"]',
      '.heatmap-panel-switch[data-target="memos"]',
    ];
    function wire() {
      var nodes = selectors
        .map(function (s) {
          return Array.from(document.querySelectorAll(s));
        })
        .flat();
      if (!nodes.length) return false;
      nodes.forEach(function (el) {
        if (el.__memosLoadBound) return;
        el.__memosLoadBound = true;
        el.addEventListener(
          "click",
          function () {
            var panel = document.querySelector(
              '.heatmap-panel[data-type="memos"]'
            );
            if (panel && panel.getAttribute("data-loaded") === "true") return;
            if (performance && performance.mark) {
              try {
                performance.mark("heatmap-memos-start");
              } catch (e) {}
            }
            load("memos");
          },
          { once: true }
        );
      });
      return true;
    }
    if (wire()) return;
    var mo = new MutationObserver(function (m, obs) {
      if (wire()) obs.disconnect();
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(function () {
      try {
        mo.disconnect();
      } catch (e) {}
    }, 8000);
  }

  function animate(panel) {
    /* placeholder: original animate logic may exist in home.js; keep minimal */
  }

  function init(options) {
    options = options || {};
    if (init.__done) return;
    init.__done = true;
    if (performance && performance.mark) {
      try {
        performance.mark("heatmap-posts-start");
      } catch (e) {}
    }
    load("posts");
    setupMemosDeferred();
    setTimeout(function () {
      var p = document.getElementById("activity-heatmap-posts");
      if (
        p &&
        p.getAttribute("data-loaded") !== "true" &&
        !p.querySelector(".heatmap-error")
      ) {
        stats.watchdog++;
        load("posts", { force: true });
      }
    }, 3000);
    attachSwitcher();
  }

  function attachSwitcher() {
    if (attachSwitcher.__bound) return;
    var wrap = document.querySelector(".heatmap-switch");
    var panelsWrap = document.querySelector(".heatmap-panels");
    if (!wrap || !panelsWrap) return;
    var buttons = wrap.querySelectorAll(".hm-switch-btn");
    var rangeLabelId = panelsWrap.getAttribute("data-range-label-target");
    var rangeLabelEl = rangeLabelId
      ? document.getElementById(rangeLabelId)
      : null;
    var storeKey = "wl_heatmap_source_v1";
    function saveSource(val) {
      try {
        localStorage.setItem(storeKey, val);
      } catch (e) {}
    }
    function readSource() {
      try {
        return localStorage.getItem(storeKey) || "";
      } catch (e) {
        return "";
      }
    }
    function activate(source) {
      if (!source) source = "posts";
      var targetBtn = null;
      buttons.forEach(function (b) {
        if (b.getAttribute("data-source") === source) targetBtn = b;
      });
      if (!targetBtn) return;
      if (targetBtn.classList.contains("is-active")) return; // already
      buttons.forEach(function (b) {
        var active = b === targetBtn;
        b.classList.toggle("is-active", active);
        b.setAttribute("aria-selected", active ? "true" : "false");
      });
      var panels = panelsWrap.querySelectorAll(".hm-panel");
      panels.forEach(function (p) {
        var type = p.getAttribute("data-type");
        var active = type === source;
        p.classList.toggle("is-active", active);
        if (active) p.removeAttribute("hidden");
        else p.setAttribute("hidden", "");
      });
      if (rangeLabelEl) {
        var days =
          document.querySelector(".right-heatmap")?.getAttribute("data-days") ||
          "100";
        rangeLabelEl.textContent =
          "最近 " + days + " 天 · " + (source === "posts" ? "文章" : "说说");
      }
      if (source === "memos") load("memos");
      else {
        var postsPanel = document.getElementById("activity-heatmap-posts");
        if (postsPanel && postsPanel.getAttribute("data-loaded") !== "true")
          load("posts");
      }
      saveSource(source);
    }
    buttons.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var source = btn.getAttribute("data-source");
        activate(source);
      });
    });
    // 初次根据记忆恢复（若记忆是 memos 且未加载，会触发懒加载）
    var remembered = readSource();
    if (remembered && remembered !== "posts") activate(remembered);
    attachSwitcher.__bound = true;
  }

  function resetRuntimeState() {
    init.__done = false;
    attachSwitcher.__bound = false;
  }

  global.WLHeatmap = {
    init: init,
    load: load,
    stats: stats,
    version: "2.0.0",
    tryInit: tryAutoInit,
  };
  try {
    // 自定义事件，供外部监听热力图模块就绪
    var ev = new CustomEvent("westlife:heatmap-ready", {
      detail: { version: "2.0.0" },
    });
    window.dispatchEvent(ev);
  } catch (e) {}

  // Debug 辅助：设置 window.WL_HEATMAP_DEBUG = true 可看到日志
  function dlog() {
    if (window.WL_HEATMAP_DEBUG && typeof console !== "undefined") {
      try {
        console.debug.apply(console, arguments);
      } catch (e) {}
    }
  }

  // 自动初始化（更宽松条件）
  function tryAutoInit() {
    if (!global.WLHeatmap) return;
    if (global.WLHeatmap._autoInitDone) return; // 避免重复
    var postsPanel = document.getElementById("activity-heatmap-posts");
    if (!postsPanel) {
      // 兼容其它可能的容器命名（例如后续重构）
      postsPanel = document.querySelector(
        '[data-type="posts"].hm-panel, .activity-grid[data-type="posts"], .heatmap-panel[data-type="posts"]'
      );
    }
    if (postsPanel) {
      dlog("[Heatmap] auto init start");
      try {
        global.WLHeatmap.init();
      } catch (e) {
        dlog("[Heatmap] init error", e);
      }
      global.WLHeatmap._autoInitDone = true;
    } else {
      dlog("[Heatmap] posts panel not found yet");
    }
  }

  if (
    document.readyState === "complete" ||
    document.readyState === "interactive"
  ) {
    setTimeout(tryAutoInit, 0);
  } else {
    document.addEventListener("DOMContentLoaded", tryAutoInit);
  }

  // 兜底轮询（最多 2s）防止异步注入时机过晚
  var __hmPollCount = 0;
  var __hmPoll = setInterval(function () {
    if (global.WLHeatmap && global.WLHeatmap._autoInitDone) {
      clearInterval(__hmPoll);
      return;
    }
    __hmPollCount++;
    tryAutoInit();
    if (__hmPollCount > 60) {
      // 延长到约 6 秒
      dlog("[Heatmap] auto init polling stopped after 6s");
      clearInterval(__hmPoll);
    }
  }, 100);

  // 暴露手动触发（调试用）：window.WLHeatmap.tryInit()
  global.WLHeatmap.tryInit = tryAutoInit;

  if (global.WestlifeApp && typeof global.WestlifeApp.register === "function") {
    global.WestlifeApp.register({
      name: "heatmap",
      match(context) {
        var root = context && context.nodeType === 1 ? context : document;
        return !!root.querySelector(
          "#activity-heatmap-posts, #activity-heatmap-memos, .right-heatmap"
        );
      },
      init: function () {
        resetRuntimeState();
        global.WLHeatmap._autoInitDone = false;
        tryAutoInit();
      },
      destroy: function () {
        resetRuntimeState();
        global.WLHeatmap._autoInitDone = false;
      },
    });
  }
})(window);
