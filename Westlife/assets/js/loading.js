/**
 * Westlife Loading初始化模块
 */

(function ($, w, d) {
  "use strict";

  function getSettings() {
    return w.westlifeSettings || {};
  }

  function getMode() {
    var attr = d.documentElement.getAttribute("data-page-loader");
    // 只有明确的 spinner 或 bar 才直接返回，空字符串要走下面的逻辑
    if (attr === "spinner" || attr === "bar") return attr;

    var s = getSettings();
    var enabled = !!s.pageLoaderEnabled;
    var firstVisit = false;
    try {
      firstVisit = !localStorage.getItem("__wl_visited__");
    } catch (e) {}

    // 修改逻辑：打开模式 + 首次访问任何页面 = 罗盘
    // 否则都是进度条
    return enabled && firstVisit ? "spinner" : "bar";
  }

  // 检查是否是首页
  function isHomePage() {
    try {
      var settings = getSettings();
      return (
        settings.isHome ||
        settings.isFrontPage ||
        document.body.classList.contains("home") ||
        document.body.classList.contains("front-page")
      );
    } catch (e) {
      return false;
    }
  }

  // 检查是否是页面导航（站内跳转）
  function isPageNavigation() {
    try {
      // 简化逻辑：只检查是否有站内 referrer
      if (!document.referrer) return false;

      var currentOrigin = location.origin;
      var referrerOrigin = new URL(document.referrer).origin;

      return currentOrigin === referrerOrigin;
    } catch (e) {
      return false;
    }
  }

  // 若后端未写入 data-page-loader，则这里补写
  // 注意：不在这里设置 localStorage，而是在罗盘显示完成后设置
  (function markVisitAndAttr() {
    if (!d.documentElement.getAttribute("data-page-loader")) {
      d.documentElement.setAttribute("data-page-loader", getMode());
    }
  })();

  var WL = {
    get mode() {
      return getMode();
    },

    LoaderUI: {
      removeTopBar: function (scope) {
        var selector;
        if (scope === "all") {
          selector = ".page-progress";
        } else if (typeof scope === "string" && scope) {
          selector = '.page-progress[data-origin="' + scope + '"]';
        } else {
          selector = '.page-progress[data-origin="global"]';
        }
        $(selector).remove();
      },
      removeSpinner: function () {
        $(".ajax-loading-overlay, .page-loader").remove();
      },
    },

    // 顶部进度条（分类/分页/全局）
    createTopProgressBar: function (origin) {
      origin = origin || "ajax";

      var settings = getSettings();
      var pageLoaderEnabled = !!settings.pageLoaderEnabled;
      var isHome = isHomePage();

      // 修改逻辑：
      // 1. 首页分类/分页切换：禁用进度条
      // 2. 如果是 spinner 模式且是 global 进度条：禁用（因为会显示罗盘）
      // 3. 如果是 bar 模式：允许显示进度条
      // 4. 其他情况：允许

      if (isHome && (origin === "category" || origin === "pagination")) {
        return $();
      }

      // 只有在 spinner 模式下才禁用 global 进度条
      if (pageLoaderEnabled && origin === "global" && WL.mode === "spinner") {
        return $();
      }

      var $exist = $('.page-progress[data-origin="' + origin + '"]');
      if ($exist.length) return $exist;

      // 首选插入到头部容器内，便于将进度条显示在 header 与 container 之间
      var $target = $(".site-header .header-content");
      if (!$target.length) {
        $target = $("body");
      }
      var $el = $(
        '<div class="page-progress" data-origin="' +
          origin +
          '" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">' +
          '<div class="progress-container">' +
          '<div class="progress-bar" style="width:0%"></div>' +
          '<div class="progress-text">0%</div>' +
          "</div>" +
          "</div>"
      ).appendTo($target);
      return $el;
    },

    setTopProgress: function ($el, percent) {
      if (!$el || !$el.length) return;
      var p = Math.max(0, Math.min(100, Math.round(percent)));
      $el.attr("aria-valuenow", String(p));
      $el.find(".progress-bar").css("width", p + "%");
      $el.find(".progress-text").text(p + "%");
    },

    destroyTopProgressBar: function ($el) {
      if (!$el || !$el.length) return;
      $el.stop(true, true).fadeOut(160, function () {
        $(this).remove();
      });
    },

    // 列表遮罩 + 矩形 Loader
    createGridLoadingOverlay: function ($container) {
      var $c = $container && ($container.jquery ? $container : $($container));
      if (!$c || !$c.length) return $();

      var $ov = $c.children(".grid-loading-overlay");
      if ($ov.length) return $ov;

      $ov = $(
        '<div class="grid-loading-overlay viewport-center" role="status" aria-live="polite" aria-label="正在加载">' +
          '<div class="loader-rect wl-force-anim is-fixed" aria-hidden="true">' +
          "<div></div><div></div><div></div><div></div><div></div>" +
          "</div>" +
          "</div>"
      );

      if ($c.css("position") === "static") $c.css("position", "relative");
      $c.append($ov);

      try {
        $ov.find(".loader-rect > div").each(function () {
          this.style.animationPlayState = "running";
        });
      } catch (e) {}
      return $ov;
    },

    // 首访全屏 Spinner
    initFullScreenSpinner: function () {
      var settings = getSettings();
      var pageLoaderEnabled = !!settings.pageLoaderEnabled;

      // 简化条件：只有当模式是 spinner 且开启了全屏加载才显示
      if (WL.mode !== "spinner" || !pageLoaderEnabled) {
        // 如果不显示罗盘，也要标记已访问（兜底）
        try {
          localStorage.setItem("__wl_visited__", "1");
        } catch (e) {}

        // 重要：移除罗盘 DOM 元素，避免它一直显示
        var loader = d.querySelector(".page-loader");
        if (loader && loader.parentNode) {
          loader.parentNode.removeChild(loader);
        }
        return;
      }
      if (w.__wlSpinnerBootstrapped) return;
      w.__wlSpinnerBootstrapped = true;

      // 全屏加载时移除所有进度条
      WL.LoaderUI.removeTopBar("all");

      var loader = d.querySelector(".page-loader");
      if (!loader) {
        return;
      }

      var progressEl = loader.querySelector(".loader-progress");
      if (!progressEl) {
        return;
      }

      var percent = 1;
      var isLoaded = d.readyState === "complete";
      var minShow = 800;
      var dclGrace = 900;
      var maxWait = 5000;
      var startTs = 0;
      var rafId = 0;
      var hardTimeoutId = 0;

      function render() {
        progressEl.textContent = String(percent | 0);
      }

      function loop(ts) {
        if (!startTs) startTs = ts;
        if (!isLoaded) percent = Math.min(90, percent + 0.25);
        else percent = Math.min(100, percent + 1.5);
        render();

        if (percent < 100) {
          rafId = w.requestAnimationFrame(loop);
        } else {
          var elapsed = ts - startTs;
          var remain = Math.max(0, minShow - elapsed);
          setTimeout(function () {
            if (loader && loader.parentNode)
              loader.parentNode.removeChild(loader);
            // 罗盘显示完成后，标记已访问
            try {
              localStorage.setItem("__wl_visited__", "1");
            } catch (e) {}
          }, remain);
          if (hardTimeoutId) clearTimeout(hardTimeoutId);
        }
      }

      render();
      rafId = w.requestAnimationFrame(loop);

      w.addEventListener(
        "load",
        function () {
          isLoaded = true;
        },
        { once: true }
      );

      var onDCL = function () {
        setTimeout(function () {
          isLoaded = true;
        }, dclGrace);
      };
      if (d.readyState === "interactive" || d.readyState === "complete")
        onDCL();
      else d.addEventListener("DOMContentLoaded", onDCL, { once: true });

      hardTimeoutId = setTimeout(function () {
        isLoaded = true;
        percent = Math.max(percent, 95);
      }, maxWait);

      w.addEventListener(
        "pageshow",
        function (e) {
          if (e.persisted && loader && loader.parentNode) {
            loader.parentNode.removeChild(loader);
          }
        },
        { once: true }
      );
    },

    // 页面加载时的全局顶部进度条
    initGlobalBarOnLoad: function () {
      var settings = getSettings();
      var pageLoaderEnabled = !!settings.pageLoaderEnabled;
      var isNavigation = isPageNavigation();

      // 修改逻辑：
      // 1. 如果模式是 bar，总是显示进度条（不限制站内跳转）
      // 2. 如果功能关闭且是站内跳转，也显示进度条
      var shouldShow = false;

      if (WL.mode === "bar") {
        shouldShow = true;
      } else if (!pageLoaderEnabled && isNavigation) {
        shouldShow = true;
      }

      if (!shouldShow) {
        return;
      }

      var $prog = WL.createTopProgressBar("global");
      if (!$prog || !$prog.length) {
        return;
      }

      var alreadyLoaded = d.readyState === "complete";
      var val = 0;
      var target1 = alreadyLoaded ? 97 : 90;
      var speed1 = alreadyLoaded ? 0.03 : 0.015;
      var minShow = 600;

      var startTs = 0;
      var rafId = 0;
      var finId = 0;
      var running = true;
      var startedAt = performance.now();

      function cancel(id) {
        if (id) {
          try {
            w.cancelAnimationFrame(id);
          } catch (e) {}
        }
      }

      function stopAndDestroy() {
        running = false;
        cancel(rafId);
        cancel(finId);
        if ($prog && $prog.length) {
          WL.destroyTopProgressBar($prog);
        }
      }

      function finishTo100(duration) {
        cancel(rafId);
        rafId = 0;
        var start = 0;
        var from = val;
        var to = 100;
        var easeOutCubic = function (t) {
          return 1 - Math.pow(1 - t, 3);
        };

        function finStep(ts) {
          if (!running) return;
          if (!start) start = ts;
          var t = Math.min(1, (ts - start) / Math.max(1, duration));
          var p = from + (to - from) * easeOutCubic(t);
          val = p;
          WL.setTopProgress($prog, val);
          if (t < 1) {
            finId = w.requestAnimationFrame(finStep);
          } else {
            setTimeout(function () {
              WL.destroyTopProgressBar($prog);
            }, 260);
            running = false;
          }
        }
        finId = w.requestAnimationFrame(finStep);
      }

      function step(ts) {
        if (!running) return;
        if (!startTs) {
          startTs = ts;
        }
        var dt = ts - startTs;
        startTs = ts;

        val = Math.min(target1, val + speed1 * dt);
        WL.setTopProgress($prog, val);

        if (!running) return;
        rafId = w.requestAnimationFrame(step);
      }

      WL.setTopProgress($prog, val);
      rafId = w.requestAnimationFrame(step);

      if (alreadyLoaded) {
        setTimeout(function () {
          finishTo100(400);
        }, minShow);
      } else {
        w.addEventListener(
          "load",
          function () {
            var elapsed = performance.now() - startedAt;
            var wait = Math.max(0, minShow - elapsed);
            setTimeout(function () {
              var remain = Math.max(0, 100 - val);
              var dur = Math.min(600, Math.max(300, remain * 20));
              finishTo100(dur);
            }, wait);
          },
          { once: true }
        );
      }

      w.addEventListener("pagehide", stopAndDestroy, { once: true });
      d.addEventListener(
        "visibilitychange",
        function () {
          if (d.visibilityState === "hidden") stopAndDestroy();
        },
        { once: true }
      );
    },

    startGuards: function () {},
  };

  w.WestlifeLoading = WL;

  $(function () {
    WL.initFullScreenSpinner();
    WL.initGlobalBarOnLoad();
  });
})(jQuery, window, document);
