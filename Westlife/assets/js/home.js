/**
 * Home page specific interactions (extracted from former inline <script> blocks in index.php)
 * Sections:
 * 1. Active Index + Recent Feed
 * 2. Heatmap animation + Refresh
 * 3. Center placeholder collapse toggle
 * 4. Daily Quote / Tasks Progress / AI Recommendations / Reading Digest
 */
(function () {
  "use strict";

  var homeInitialized = false;
  var homeCleanupFns = [];

  function apiRoot() {
    if (window.wlApiRoot) return window.wlApiRoot;
    var r =
      (window.wpApiSettings && window.wpApiSettings.root) ||
      window.location.origin.replace(/\/$/, "") + "/wp-json/";
    if (!/\/$/.test(r)) r += "/";
    window.wlApiRoot = r;
    return r;
  }

  function getVisitorConfig() {
    return window.westlifeVisitorConfig || {};
  }

  function getHomeProfileCard() {
    return document.getElementById("hf-visitor-card");
  }

  function applyActiveIndexState(score) {
    var wrap = document.querySelector(".active-index-wrapper");
    if (!wrap) return;
    wrap.classList.remove("ai-low", "ai-mid", "ai-high");
    if (score < 100) wrap.classList.add("ai-low");
    else if (score < 300) wrap.classList.add("ai-mid");
    else wrap.classList.add("ai-high");
  }

  function applyHomeProfile(profile) {
    if (!profile || typeof profile !== "object") return;
    if (window.westlifeVisitorConfig) {
      window.westlifeVisitorConfig.homeProfile = profile;
    }
    var card = getHomeProfileCard();
    if (!card) return;

    if (profile.email) card.dataset.email = profile.email;
    if (profile.level && profile.level.slug) card.dataset.level = profile.level.slug;
    if (typeof profile.score !== "undefined") {
      card.dataset.score = String(profile.score || 0);
    }

    var avatar = card.querySelector(".profile-avatar img");
    if (avatar && profile.avatar_url) {
      avatar.src = profile.avatar_url;
      avatar.alt = (profile.display_name || "访客") + "的头像";
    }

    var nameEl = card.querySelector(".profile-name");
    if (nameEl && profile.display_name) {
      nameEl.textContent = profile.display_name;
    }

    var sloganEl = document.getElementById("hf-profile-slogan");
    if (sloganEl && profile.slogan) {
      sloganEl.textContent = profile.slogan;
    }

    var greetEl = document.getElementById("hf-greet");
    if (greetEl && profile.greeting) {
      greetEl.textContent = profile.greeting;
    }

    var levelEl = document.getElementById("hf-level-badge");
    if (levelEl && profile.level) {
      var badge = profile.badge || {};
      levelEl.className =
        "profile-level-badge level-" + (badge.type || "star");
      levelEl.title = profile.level_hint || profile.level.label || "";
      levelEl.setAttribute(
        "aria-label",
        profile.level_hint || profile.level.label || ""
      );
      levelEl.innerHTML =
        badge.html ||
        '<i class="fa-sharp fa-solid fa-star" aria-hidden="true"></i>';
    }

    var score = parseInt(profile.score || "0", 10);
    var aiEl = document.getElementById("hf-active-index");
    if (aiEl) {
      aiEl.textContent = isNaN(score) ? "0" : String(score);
    }
    applyActiveIndexState(isNaN(score) ? 0 : score);

    if (profile.is_admin && profile.admin_metrics) {
      var metrics = profile.admin_metrics || {};
      var todayViewsEl = document.getElementById("hf-admin-today-views");
      var todayCommentsEl = document.getElementById("hf-admin-today-comments");
      var articleReactionsEl = document.getElementById("hf-admin-article-reactions");
      var memoLikesEl = document.getElementById("hf-admin-memo-likes");
      var birdFeedsEl = document.getElementById("hf-admin-bird-feeds");
      if (todayViewsEl) {
        todayViewsEl.textContent = String(metrics.today_views || 0);
      }
      if (todayCommentsEl) {
        todayCommentsEl.textContent = String(metrics.today_comments || 0);
      }
      if (articleReactionsEl) {
        articleReactionsEl.textContent = String(metrics.article_reactions || 0);
      }
      if (memoLikesEl) {
        memoLikesEl.textContent = String(metrics.memo_likes || 0);
      }
      if (birdFeedsEl) {
        birdFeedsEl.textContent = String(metrics.bird_feeds || 0);
      }
    }
  }

  function shouldIncrementHomeProfileView(profile) {
    if (!profile || !profile.email) return false;
    var key = "wl_home_profile_view_" + profile.email.toLowerCase();
    try {
      var last = parseInt(localStorage.getItem(key) || "0", 10);
      var now = Date.now();
      if (last && now - last < 12 * 60 * 60 * 1000) {
        return false;
      }
      localStorage.setItem(key, String(now));
      return true;
    } catch (e) {
      return true;
    }
  }

  function syncHomeProfile(profile) {
    var cfg = getVisitorConfig();
    if (!cfg || !cfg.ajaxUrl || !cfg.nonce || !profile || !profile.email) {
      return Promise.resolve(null);
    }
    var visitorData = (cfg && cfg.visitorData) || {};

    var body = new URLSearchParams();
    body.set("action", "westlife_visitor_sync_home_profile");
    body.set("nonce", cfg.nonce);
    body.set("email", profile.email || "");
    body.set("name", profile.display_name || visitorData.name || "");
    body.set("url", visitorData.url || "");
    if (shouldIncrementHomeProfileView(profile)) {
      body.set("increment_view", "1");
    }

    return fetch(cfg.ajaxUrl, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body: body.toString(),
    })
      .then(function (response) {
        return response.ok ? response.json() : Promise.reject(new Error("sync failed"));
      })
      .then(function (json) {
        if (json && json.success && json.data && json.data.profile) {
          applyHomeProfile(json.data.profile);
          return json.data.profile;
        }
        return null;
      })
      .catch(function () {
        return null;
      });
  }

  function initHomeSayingLike() {
    var button = document.querySelector(".home-saying-like-btn");
    if (!button || button.dataset.bound === "1") return;
    button.dataset.bound = "1";

    button.addEventListener("click", function () {
      var memoId = button.getAttribute("data-memo-id");
      if (!memoId || button.disabled) return;

      var cfg = getVisitorConfig();
      var visitorData = cfg.visitorData || {};
      var profile = cfg.homeProfile || {};
      var nonce =
        (window.westlifeSettings && window.westlifeSettings.nonce) || "";
      var ajaxUrl =
        (window.westlifeSettings &&
          (window.westlifeSettings.ajaxUrl || window.westlifeSettings.ajaxurl)) ||
        window.ajaxurl ||
        "/wp-admin/admin-ajax.php";
      var countEl = button.querySelector(".home-saying-like-count");
      var current = parseInt((countEl && countEl.textContent) || "0", 10) || 0;

      button.disabled = true;

      fetch(ajaxUrl, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body: new URLSearchParams({
          action: "memos_like",
          nonce: nonce,
          memo_id: memoId,
          email: profile.email || visitorData.email || "",
          name: profile.display_name || visitorData.name || "",
          url: visitorData.url || "",
        }).toString(),
      })
        .then(function (response) {
          return response.ok ? response.json() : Promise.reject(new Error("network"));
        })
        .then(function (json) {
          if (!json || !json.success) {
            throw new Error((json && json.data && json.data.message) || "点赞失败");
          }
          if (countEl) {
            countEl.textContent = String(
              (json.data && json.data.likes) || current + 1
            );
          }
          button.classList.add("is-liked");
          if (profile && profile.sync_eligible && profile.email) {
            syncHomeProfile(profile);
          }
        })
        .catch(function () {
          button.disabled = false;
        });
    });
  }

  function initActiveIndexAndFeed(onAsyncReady) {
    var cfg = getVisitorConfig();
    var profile = (cfg && cfg.homeProfile) || null;

    if (profile) {
      applyHomeProfile(profile);
    }

    if (profile && profile.sync_eligible && profile.email) {
      syncHomeProfile(profile).finally(function () {
        if (typeof onAsyncReady === "function") onAsyncReady();
      });
      return;
    }

    if (typeof onAsyncReady === "function") onAsyncReady();
  } // end initActiveIndexAndFeed

  // 旧热力图逻辑已迁出，仅保留通过 WLHeatmap.tryInit 的懒加载入口（若需要）。

  // 简单 tooltip：跟随鼠标显示日期 + 数量
  // initHeatmapTooltips -> 已迁移到独立 heatmap.js

  /* ================= 3. Placeholder Collapse ================= */
  function initCenterTopPlaceholder() {
    var box = document.querySelector(".center-top-placeholder");
    if (!box) return;
    var btn = box.querySelector(".ctp-toggle");
    var body = box.querySelector(".ctp-body");
    if (!btn || !body) return;
    var storeKey = "wl_center_placeholder_state";
    try {
      var saved = localStorage.getItem(storeKey);
      if (saved === "collapsed") collapse(true);
    } catch (e) {}
    btn.addEventListener("click", function () {
      if (box.classList.contains("is-collapsed")) expand();
      else collapse();
    });
    function collapse(skipSave) {
      box.classList.add("is-collapsed");
      btn.setAttribute("aria-expanded", "false");
      var icon = btn.querySelector(".toggle-icon");
      var txt = btn.querySelector(".toggle-text");
      if (txt) txt.textContent = "展开";
      if (icon) icon.textContent = "▸";
      body.style.display = "none";
      if (!skipSave)
        try {
          localStorage.setItem(storeKey, "collapsed");
        } catch (e) {}
    }
    function expand(skipSave) {
      box.classList.remove("is-collapsed");
      btn.setAttribute("aria-expanded", "true");
      var icon = btn.querySelector(".toggle-icon");
      var txt = btn.querySelector(".toggle-text");
      if (txt) txt.textContent = "折叠";
      if (icon) icon.textContent = "▾";
      body.style.display = "";
      if (!skipSave)
        try {
          localStorage.setItem(storeKey, "expanded");
        } catch (e) {}
    }
  }

  /* ================= 4. Quote / Tasks / Reco / Reading ================= */
  function initQuoteTasksRecoReading() {
    /* Quote */
    var quotes = [
      "大多数人想要改造这个世界，但却罕有人想改造自己。",
      "代码会说话，数据会证明。",
      "不被记录的思考会很快消散。",
      "把复杂留给系统，把简单留给用户。",
      "少就是多，快就是慢。",
      "持续的小改进胜过一次性的完美。",
      "先让它能用，再让它优雅。",
      "临界点前都是线性积累。",
      "清晰永远胜过聪明。",
      "写代码也是写给未来的自己看的。",
    ];
    var quoteText = document.getElementById("quote-text");
    var quoteBtn = document.getElementById("quote-refresh");
    var quoteStoreKey = "wl_daily_quote_v1";
    function pickQuote(force) {
      try {
        if (!force) {
          var cache = JSON.parse(localStorage.getItem(quoteStoreKey) || "null");
          if (cache && Date.now() - cache.time < 12 * 60 * 60 * 1000) {
            // 12h
            quoteText.textContent = cache.text;
            return;
          }
        }
      } catch (e) {}
      var q = quotes[Math.floor(Math.random() * quotes.length)];
      if (quoteText) quoteText.textContent = q;
      try {
        localStorage.setItem(
          quoteStoreKey,
          JSON.stringify({ time: Date.now(), text: q })
        );
      } catch (e) {}
    }
    if (quoteText) pickQuote();
    if (quoteBtn)
      quoteBtn.addEventListener("click", function () {
        pickQuote(true);
      });

    /* Tasks (动态配置) */
    (function () {
      var taskList =
        document.getElementById("task-list-left") ||
        document.getElementById("task-list");
      if (!taskList) return;
      var script = document.getElementById("wl-home-tasks-json");
      var data = [];
      if (script) {
        try {
          data = JSON.parse(script.textContent.trim() || "[]");
        } catch (e) {
          data = [];
        }
      }
      if (!Array.isArray(data)) data = [];
      if (data.length === 0) {
        // 若页面已有占位“暂无任务”则保持；否则可插入一个空提示
        if (!taskList.querySelector(".task-empty")) {
          var emptyLi = document.createElement("li");
          emptyLi.className = "task-empty";
          emptyLi.style.listStyle = "none";
          emptyLi.style.color = "var(--color-text-light)";
          emptyLi.style.fontSize = "12px";
          emptyLi.textContent = "暂无任务";
          taskList.appendChild(emptyLi);
        }
        return;
      }
      taskList.innerHTML = "";
      data.forEach(function (t, idx) {
        var title = t && typeof t.title === "string" ? t.title : "";
        var pct = parseInt(t && t.percent, 10);
        if (isNaN(pct) || pct < 0) pct = 0;
        if (pct > 100) pct = 100;
        if (!title) return;
        var li = document.createElement("li");
        li.className = "task-item";
        li.setAttribute("role", "group");
        var row = document.createElement("div");
        row.className = "task-title-row";
        var st = document.createElement("span");
        st.textContent = title;
        row.appendChild(st);
        var sp = document.createElement("span");
        sp.className = "task-pct";
        sp.textContent = pct + "%";
        row.appendChild(sp);
        var barWrap = document.createElement("div");
        barWrap.className = "task-bar-wrap";
        barWrap.setAttribute("role", "progressbar");
        barWrap.setAttribute("aria-valuemin", "0");
        barWrap.setAttribute("aria-valuemax", "100");
        barWrap.setAttribute("aria-valuenow", String(pct));
        barWrap.setAttribute("aria-label", title + " 进度");
        var bar = document.createElement("div");
        bar.className = "task-bar";
        bar.style.width = "0%";
        barWrap.appendChild(bar);
        li.appendChild(row);
        li.appendChild(barWrap);
        taskList.appendChild(li);
        requestAnimationFrame(function () {
          setTimeout(function () {
            bar.style.width = pct + "%";
          }, 60 * (idx + 1));
        });
      });
    })();

    /* AI Recommendations */
    var recoBox = document.getElementById("ai-reco-content");
    var recoBtn = document.getElementById("reco-refresh");
    var recoKey = "wl_ai_reco_v1";
    var recoTTL = 30 * 60 * 1000;
    function setRecoHTML(html) {
      if (recoBox) recoBox.innerHTML = html;
    }
    function cacheReco(html) {
      try {
        sessionStorage.setItem(
          recoKey,
          JSON.stringify({ time: Date.now(), html: html })
        );
      } catch (e) {}
    }
    function loadReco(force) {
      if (!recoBox) return;
      if (!force) {
        try {
          var c = JSON.parse(sessionStorage.getItem(recoKey) || "null");
          if (c && Date.now() - c.time < recoTTL) {
            setRecoHTML(c.html);
            return;
          }
        } catch (e) {}
      }
      setRecoHTML("加载中…");
      var root = apiRoot();
      fetch(
        root +
          "wp/v2/posts?per_page=15&orderby=date&order=desc&_fields=id,title,link,date,comment_count"
      )
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((arr) => {
          if (!Array.isArray(arr)) throw new Error("格式错误");
          var now = Date.now();
          var days30 = 30 * 24 * 60 * 60 * 1000;
          var within = arr.filter((p) => {
            var d = p.date ? Date.parse(p.date) : 0;
            return now - d < days30;
          });
          if (within.length === 0) within = arr.slice(0, 5);
          within.sort(function (a, b) {
            var ca = typeof a.comment_count === "number" ? a.comment_count : 0;
            var cb = typeof b.comment_count === "number" ? b.comment_count : 0;
            return cb - ca;
          });
          var pickPool = within.slice(0, 5);
          if (pickPool.length === 0) throw new Error("无数据");
          var pickCount = Math.min(3, pickPool.length);
          var finalN = Math.max(
            1,
            Math.min(pickCount, Math.floor(Math.random() * pickCount) + 1)
          );
          for (let i = pickPool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pickPool[i], pickPool[j]] = [pickPool[j], pickPool[i]];
          }
          var chosen = pickPool.slice(0, finalN);
          var html = chosen
            .map(function (p) {
              var title =
                p.title && p.title.rendered
                  ? p.title.rendered.replace(/<[^>]+>/g, "")
                  : "未命名文章";
              var badge =
                typeof p.comment_count === "number" && p.comment_count > 0
                  ? '<span class="reco-badge" title="评论数">' +
                    p.comment_count +
                    "评</span>"
                  : '<span class="reco-badge">荐</span>';
              return (
                '<div class="reco-item">' +
                badge +
                '<a href="' +
                p.link +
                '" target="_blank" rel="noopener">' +
                title +
                "</a></div>"
              );
            })
            .join("");
          setRecoHTML(html);
          cacheReco(html);
        })
        .catch(() => {
          fetch(
            root +
              "wp/v2/posts?per_page=3&orderby=date&order=desc&_fields=title,link"
          )
            .then((r) => (r.ok ? r.json() : Promise.reject()))
            .then((arr) => {
              if (!Array.isArray(arr) || arr.length === 0)
                throw new Error("no fallback");
              var html = arr
                .map((p) => {
                  var title =
                    p.title && p.title.rendered
                      ? p.title.rendered.replace(/<[^>]+>/g, "")
                      : "最新文章";
                  return (
                    '<div class="reco-item"><span class="reco-badge">新</span><a href="' +
                    p.link +
                    '" target="_blank" rel="noopener">' +
                    title +
                    "</a></div>"
                  );
                })
                .join("");
              setRecoHTML(html);
              cacheReco(html);
            })
            .catch(() => {
              setRecoHTML('<span class="reco-empty">暂无推荐</span>');
            });
        });
    }
    loadReco();
    if (recoBtn)
      recoBtn.addEventListener("click", function () {
        loadReco(true);
      });

    /* Reading Digest */
    var readingWrap = document.getElementById("reading-content");
    var readingBtn = document.getElementById("reading-refresh");
    var readingKey = "wl_reading_digest_v1";
    var readingTTL = 6 * 60 * 60 * 1000;
    function mockReadingData() {
      return [
        {
          id: "book-js",
          title: "JavaScript 高级程序设计",
          progress: 42,
          totalPages: 900,
          updated: Date.now() - 3600 * 1000,
        },
        {
          id: "book-net",
          title: "计算机网络 (第7版)",
          progress: 68,
          totalPages: 500,
          updated: Date.now() - 5 * 3600 * 1000,
        },
        {
          id: "book-ai",
          title: "深度学习入门实践",
          progress: 15,
          totalPages: 320,
          updated: Date.now() - 26 * 3600 * 1000,
        },
      ];
    }
    function fmtAgo(ts) {
      var diff = Date.now() - ts;
      var h = Math.floor(diff / 3600000);
      if (h < 1) return "刚刚";
      if (h < 24) return h + "h前";
      var d = Math.floor(h / 24);
      return d + "d前";
    }
    function renderReading(list) {
      if (!readingWrap) return;
      if (!list || !list.length) {
        readingWrap.innerHTML = '<div class="reading-empty">暂无阅读数据</div>';
        return;
      }
      var html = list
        .slice(0, 3)
        .map(function (it, idx) {
          var meta =
            '<div class="reading-meta"><span>' +
            fmtAgo(it.updated) +
            "</span><span>" +
            it.totalPages +
            "p</span></div>";
          return (
            '<div class="reading-item" data-id="' +
            it.id +
            '">' +
            '<div class="reading-title-row"><span class="reading-title" title="' +
            it.title.replace(/"/g, "&quot;") +
            '">' +
            it.title +
            '</span><span class="reading-pct">' +
            it.progress +
            "%</span></div>" +
            '<div class="reading-bar-wrap" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' +
            it.progress +
            '" aria-label="' +
            it.title +
            ' 阅读进度"><div class="reading-bar" style="width:0%"></div></div>' +
            meta +
            "</div>"
          );
        })
        .join("");
      readingWrap.innerHTML = html;
      requestAnimationFrame(function () {
        readingWrap
          .querySelectorAll(".reading-item")
          .forEach(function (node, i) {
            var pct = node.querySelector(".reading-pct");
            var bar = node.querySelector(".reading-bar");
            var v = parseInt(pct.textContent, 10) || 0;
            setTimeout(function () {
              bar.style.width = v + "%";
            }, 80 * (i + 1));
          });
      });
    }
    function loadReading(force) {
      if (!readingWrap) return;
      if (!force) {
        try {
          var c = JSON.parse(localStorage.getItem(readingKey) || "null");
          if (c && Date.now() - c.time < readingTTL) {
            renderReading(c.data);
            return;
          }
        } catch (e) {}
      }
      readingWrap.innerHTML = '<div class="reading-empty">加载中…</div>';
      var data = mockReadingData();
      renderReading(data);
      try {
        localStorage.setItem(
          readingKey,
          JSON.stringify({ time: Date.now(), data: data })
        );
      } catch (e) {}
    }
    loadReading();
    if (readingBtn)
      readingBtn.addEventListener("click", function () {
        loadReading(true);
      });
  }

  function mark(name) {
    if (window.performance && performance.mark) performance.mark(name);
  }
  function measure(name, start, end) {
    try {
      if (performance.getEntriesByName(end).length === 0) mark(end);
      if (window.performance && performance.measure)
        performance.measure(name, start, end);
    } catch (e) {}
  }

  function setupPostThumbSkeletonRemoval() {
    var wrappers = document.querySelectorAll(".post-thumbnail-wrapper");
    wrappers.forEach(function (w) {
      var img = w.querySelector("img.post-thumbnail-img");
      if (!img) return;

      // 检查图片是否已加载（更准确的判断）
      if (img.complete && img.naturalHeight > 0) {
        w.classList.add("is-thumb-ready");
        return;
      }

      // 如果图片有 src 但未加载完成，添加监听器
      if (img.src) {
        img.addEventListener(
          "load",
          function () {
            w.classList.add("is-thumb-ready");
          },
          { once: true }
        );
        img.addEventListener(
          "error",
          function () {
            // 即使加载失败也移除骨架屏，显示默认图
            w.classList.add("is-thumb-ready");
          },
          { once: true }
        );
      } else {
        // 如果没有 src（不应该发生），立即移除骨架屏
        w.classList.add("is-thumb-ready");
      }
    });
    mark("posts-grid-ready");
  }

  var homeVisualRefreshFrame = 0;
  var homeVisualRefreshTimer = 0;

  function queueHeatmapInit() {
    if (!window.WLHeatmap || typeof window.WLHeatmap.tryInit !== "function") {
      return;
    }
    var postsPanel = document.getElementById("activity-heatmap-posts");
    if (!postsPanel) return;
    if (postsPanel.getAttribute("data-loaded") === "true") {
      try {
        window.dispatchEvent(new Event("resize"));
      } catch (e) {}
      return;
    }
    window.WLHeatmap.tryInit();
  }

  function refreshHomeVisualState() {
    setupPostThumbSkeletonRemoval();

    if (homeVisualRefreshFrame) {
      cancelAnimationFrame(homeVisualRefreshFrame);
    }
    if (homeVisualRefreshTimer) {
      clearTimeout(homeVisualRefreshTimer);
    }

    homeVisualRefreshFrame = requestAnimationFrame(function () {
      homeVisualRefreshFrame = 0;
      queueHeatmapInit();
      try {
        window.dispatchEvent(new Event("resize"));
      } catch (e) {}
    });

    homeVisualRefreshTimer = setTimeout(function () {
      homeVisualRefreshTimer = 0;
      queueHeatmapInit();
    }, 120);
  }

  function initHomePage() {
    if (homeInitialized) return;
    homeInitialized = true;
    homeCleanupFns = [];
    mark("dom-ready");
    refreshHomeVisualState();
    initActiveIndexAndFeed();
    initCenterTopPlaceholder();
    initHomeSayingLike();
    initQuoteTasksRecoReading();
    var onWindowLoad = function () {
      refreshHomeVisualState();
    };
    window.addEventListener("load", onWindowLoad, { once: true });
    homeCleanupFns.push(function () {
      window.removeEventListener("load", onWindowLoad);
    });
    var onBirdFed = function (event) {
      var detail = event && event.detail ? event.detail : null;
      if (detail && detail.state) {
        var birdFeedsEl = document.getElementById("hf-admin-bird-feeds");
        if (birdFeedsEl && typeof detail.state.feed_today !== "undefined") {
          birdFeedsEl.textContent = String(detail.state.feed_today || 0);
        }
      }
      var cfg = getVisitorConfig();
      var profile = cfg.homeProfile || null;
      if (profile && profile.sync_eligible && profile.email) {
        syncHomeProfile(profile);
      }
    };
    window.addEventListener("westlife:bird-fed", onBirdFed);
    homeCleanupFns.push(function () {
      window.removeEventListener("westlife:bird-fed", onBirdFed);
    });
  }

  function destroyHomePage() {
    homeInitialized = false;
    if (homeVisualRefreshFrame) {
      cancelAnimationFrame(homeVisualRefreshFrame);
      homeVisualRefreshFrame = 0;
    }
    if (homeVisualRefreshTimer) {
      clearTimeout(homeVisualRefreshTimer);
      homeVisualRefreshTimer = 0;
    }
    while (homeCleanupFns.length) {
      try {
        homeCleanupFns.pop()();
      } catch (_) {}
    }
  }

  if (window.WestlifeApp && typeof window.WestlifeApp.register === "function") {
    window.WestlifeApp.register({
      name: "home-page",
      match: function (context) {
        var root = context && context.nodeType === 1 ? context : document;
        return !!root.querySelector(
          "#hf-active-index, #quote-text, .center-top-placeholder, #task-list-left, #task-list"
        );
      },
      init: function () {
        initHomePage();
      },
      destroy: function () {
        destroyHomePage();
      },
    });
  } else {
    document.addEventListener("DOMContentLoaded", function () {
      initHomePage();
    });
  }
})();
