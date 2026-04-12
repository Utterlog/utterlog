/* Bird Module (migrated) */
// ...existing code from previous bird.js...
(function (w, d) {
  "use strict"; /* simplified keep same content */
  const BirdMod = {
    version: "1.3.3",
    selectors: { bird: ".hf-bird-wire" },
    el: { bird: null, zEl: null },
    flags: { reduced: false },
    init() {
      this.el.bird = d.querySelector(this.selectors.bird);
      if (!this.el.bird) return;
      // 尊重系统减少动画；允许通过 <html data-force-motion="true"> 或 window.WESTLIFE_FORCE_MOTION 强制开启动画
      this.flags.reduced = !!(
        w.WestlifeUtils &&
        typeof w.WestlifeUtils.shouldReduceMotion === "function" &&
        w.WestlifeUtils.shouldReduceMotion()
      );
      if (!(w.WestlifeUtils && typeof w.WestlifeUtils.shouldReduceMotion === "function")) {
        this.flags.reduced = !!(
          w.matchMedia &&
          w.matchMedia("(prefers-reduced-motion: reduce)").matches &&
          !(d.documentElement && d.documentElement.getAttribute("data-force-motion") === "true") &&
          w.WESTLIFE_FORCE_MOTION !== true
        );
      }
      this.initSleepAndFeed();
      this.initYearProgressPlacement();
      this.initFestiveMessages();
      this.initHoverMonthTooltips();
      this.initBirdFloat();
      this.initNearEyeAndBlink();
      this.initYearRolloverWatcher();
      this.expose();
    },
    expose() {
      // 提前缓存队列（允许在脚本加载前注册）
      this._messageOverrides = this._messageOverrides || {};
      const self = this;
      this.registerMessages = function (defs) {
        if (!defs) return;
        const list = Array.isArray(defs) ? defs : [defs];
        list.forEach((d) => {
          if (!d || !d.id) return;
          const store = self._messageOverrides[d.id] || {
            ongoing: [],
            upcoming: [],
            passed: [],
          };
          ["ongoing", "upcoming", "passed"].forEach((k) => {
            if (!d[k]) return;
            let incoming = d[k];
            if (typeof incoming === "function") {
              // 存储函数引用，稍后在 pickMessage 展开
              incoming = [incoming];
            }
            if (!Array.isArray(incoming)) return;
            const merged = store[k].concat(incoming);
            // 去重仅针对字符串，函数保持引用
            const strSet = new Set();
            const finalArr = [];
            merged.forEach((item) => {
              if (typeof item === "string") {
                if (!strSet.has(item)) {
                  strSet.add(item);
                  finalArr.push(item);
                }
              } else if (typeof item === "function") {
                finalArr.push(item);
              }
            });
            store[k] = finalArr;
          });
          self._messageOverrides[d.id] = store;
        });
      };
      /**
       * debugShowFestival(options)
       * 调试/强制显示节日或节气提示（不受今日已展示 & 距离范围限制）
       * options:
       *  - id: 节日 id（如 'springfest', 'solar-lichun'）；可选，若缺省且提供 custom 则用 custom
       *  - state: 强制状态 'ongoing' | 'upcoming' | 'passed' （不提供则自动计算）
       *  - deltaDays: 覆盖用于 {d} 占位的天数（仅当 state=upcoming 或 passed 有意义）
       *  - refDate: 参考日期（Date 或 YYYY-MM-DD 字符串）用于选择消息；默认今天
       *  - custom: 自定义节日对象 { id,name,start,end,type,msgs:{ongoing,upcoming,passed} }
       *  - silent: true 时不弹出 UI 仅返回对象
       * 返回: { festival, state, message }
       * 用法示例:
       *   WestlifeBird.debugShowFestival({ id:'springfest', state:'upcoming', deltaDays:5 });
       *   WestlifeBird.debugShowFestival({ custom:{ id:'testX', name:'测试', start:'2025-07-01', end:'2025-07-01', type:'festival', msgs:{ upcoming:['测试倒计时 {d} 天'], ongoing:['测试进行中'], passed:['测试已过 {d} 天'] } }, state:'upcoming', deltaDays:3 });
       */
      this.debugShowFestival = function (options = {}) {
        try {
          const nowReal = new Date();
          const refDate = (() => {
            if (!options.refDate) return nowReal;
            if (options.refDate instanceof Date) return options.refDate;
            if (typeof options.refDate === "string") {
              const [y, m, d2] = options.refDate
                .split("-")
                .map((n) => parseInt(n, 10));
              if (y && m && d2) return new Date(y, m - 1, d2);
            }
            return nowReal;
          })();
          const year = refDate.getFullYear();
          let fest = null;
          if (options.custom) {
            fest = { ...options.custom };
            if (!fest.start) fest.start = `${year}-01-01`;
            if (!fest.end) fest.end = fest.start;
            if (!fest.msgs)
              fest.msgs = {
                ongoing: ["自定义进行中"],
                upcoming: ["自定义倒计时 {d} 天"],
                passed: ["自定义已过 {d} 天"],
              };
          } else {
            const list = self.buildFestivalList(year);
            fest = list.find((f) => f.id === options.id);
            if (!fest) {
              console.warn("debugShowFestival: 未找到节日 id", options.id);
              return null;
            }
          }
          // 装饰 state / delta
          let decorated = self.decorateFestivalState(fest, refDate);
          if (options.state) decorated.state = options.state;
          if (typeof options.deltaDays === "number")
            decorated.deltaDays = options.deltaDays;
          const msg = self.pickMessage(decorated, refDate);
          if (!options.silent) {
            self.safeShowFestivalTip(msg, decorated.state);
          }
          return { festival: decorated, state: decorated.state, message: msg };
        } catch (e) {
          console.error("debugShowFestival error", e);
          return null;
        }
      };
      w.WestlifeBird = this; // 暴露
      // 处理早期队列
      if (w._WL_BIRD_MSG_QUEUE && w._WL_BIRD_MSG_QUEUE.length) {
        w._WL_BIRD_MSG_QUEUE.forEach((q) => this.registerMessages(q));
        w._WL_BIRD_MSG_QUEUE.length = 0;
      }
    },
    initYearProgressPlacement() {
      const wrap = this.el.bird.closest(".wire-curve-divider");
      if (!wrap) return;
      // Provide API to move bird if needed (e.g., test) -> animate position
      this.moveBirdToProgress = (pct) => {
        this.el.bird.style.left = pct + "%";
      };
    },
    initHoverMonthTooltips() {
      const wrap = this.el.bird.closest(".wire-curve-divider");
      if (!wrap) return;
      const ticks = wrap.querySelectorAll(".wire-scale-tick");
      // 月份中文别名（可根据需要再调整，例如正月/腊月等，这里采用简洁）
      const monthAlias = {
        1: "一月",
        2: "二月",
        3: "三月",
        4: "四月",
        5: "五月",
        6: "六月",
        7: "七月",
        8: "八月",
        9: "九月",
        10: "十月",
        11: "十一月",
        12: "十二月",
      };
      let tooltip;
      function ensure() {
        if (!tooltip) {
          tooltip = d.createElement("div");
          tooltip.className = "bird-month-tip";
          d.body.appendChild(tooltip);
        }
        return tooltip;
      }
      const yearDays = parseInt(wrap.getAttribute("data-year-days"), 10) || 365;
      // 读取服务端注入的每月统计（文章+说说）
      function getMonthStats(m) {
        const data = w.__WL_MONTH_STATS;
        if (!data) return { posts: 0, memos: 0 };
        return {
          posts: data.posts && data.posts[m] ? data.posts[m] : 0,
          memos: data.memos && data.memos[m] ? data.memos[m] : 0,
        };
      }
      // 如果统计稍后注入，监听事件再更新（简单方案：不重新绑定，只在 hover 时读取最新 window 数据）
      ticks.forEach((t) => {
        // 入场动画初始状态设置（若尚未标记）
        if (!t.dataset.staggerApplied) {
          t.style.opacity = 0;
          t.style.transform += " translateY(-6px)";
          const delay = parseInt(t.getAttribute("data-doy"), 10) || 0;
          // 只对前 ~200 天做可见渐进，其余统一延迟以防过多回流
          const baseDelay =
            delay <= 200 ? delay * 4 : 200 * 4 + (delay - 200) * 0.5;
          setTimeout(() => {
            t.style.transition = "opacity .6s ease, transform .6s ease";
            t.style.opacity = 1;
            t.style.transform = t.style.transform.replace(
              / translateY\(-6px\)/,
              ""
            );
          }, baseDelay);
          t.dataset.staggerApplied = 1;
        }
        // 可聚焦支持键盘导航
        t.setAttribute("tabindex", "0");
        const showTip = () => {
          // 如果是 next-year 节点，显示特殊提示
          if (t.classList.contains("next-year")) {
            const ny = t.getAttribute("data-next-year");
            const tip = ensure();
            const rect = t.getBoundingClientRect();
            tip.textContent = `${ny} 年 1 月 1 日`;
            tip.style.left = rect.left + rect.width / 2 + "px";
            tip.style.top = rect.top - 34 + "px";
            tip.classList.add("show");
            return;
          }
          const m = t.getAttribute("data-month");
          if (!m) return;
          const doy = parseInt(t.getAttribute("data-doy"), 10) || 0;
          const pct = ((doy - 1) / (yearDays - 1)) * 100;
          const tip = ensure();
          const rect = t.getBoundingClientRect();
          const stats = getMonthStats(parseInt(m, 10));
          const line1 = `${
            monthAlias[m] || m + "月"
          } 1日 · 第${doy}天 (${pct.toFixed(1)}%)`;
          const line2 = `文章 ${stats.posts} · 说说 ${stats.memos}`;
          tip.innerHTML = `${line1}<br>${line2}`;
          tip.style.left = rect.left + rect.width / 2 + "px";
          tip.style.top = rect.top - 34 + "px";
          tip.classList.add("show");
        };
        t.addEventListener("mouseenter", showTip);
        t.addEventListener("mouseleave", () => {
          tooltip && tooltip.classList.remove("show");
        });
        // 仅保留键盘左右移动，不触发 Enter/Space 滚动
        t.addEventListener("keydown", (ke) => {
          if (t.classList.contains("next-year")) return; // 不对 next-year 节点做键盘月份跳转
          if (ke.key === "ArrowRight" || ke.key === "ArrowLeft") {
            // 键盘左右切换焦点
            const arr = Array.from(ticks);
            const idx = arr.indexOf(t);
            if (idx !== -1) {
              const nextIdx = ke.key === "ArrowRight" ? idx + 1 : idx - 1;
              if (arr[nextIdx]) {
                arr[nextIdx].focus();
                ke.preventDefault();
              }
            }
          }
        });
        // focus 显示 / blur 隐藏
        t.addEventListener("focus", showTip);
        t.addEventListener("blur", () => {
          tooltip && tooltip.classList.remove("show");
        });
      });
      // Mobile: hide minor ticks
      const mq = w.matchMedia("(max-width:640px)");
      const apply = () => {
        ticks.forEach((t) => {
          const isMajor = t.classList.contains("major");
          if (!isMajor) {
            t.style.display = mq.matches ? "none" : "block";
          }
        });
      };
      if (mq.addEventListener) mq.addEventListener("change", apply);
      else mq.addListener(apply);
      apply();
      // 自动激活当前月份刻度
      try {
        const now = new Date();
        const currentMonth = now.getMonth() + 1; // 1-12
        const currentTick = Array.from(ticks).find(
          (tk) => parseInt(tk.getAttribute("data-month"), 10) === currentMonth
        );
        if (currentTick && !wrap.querySelector(".wire-scale-tick.active")) {
          currentTick.classList.add("active");
        }
      } catch (e) {}
    },
    initBirdFloat() {
      if (this.flags.reduced) return;
      this.el.bird.classList.add("bird-float-enabled");
      // CSS animation handled in bird.css (we will append rule if missing)
      this.injectOnce(
        "bird-float-style",
        `@keyframes birdFloat{0%,100%{transform:translate(-50%,-30%) scale(.9);}50%{transform:translate(-50%,-42%) scale(.92);} } .bird-float-enabled{animation:birdFloat 6.5s ease-in-out infinite;}`
      );
    },
    initYearRolloverWatcher() {
      // Daily check at midnight to rebuild festival list & reposition
      const msTillMidnight = (() => {
        const now = new Date();
        const next = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + 1,
          0,
          0,
          2
        );
        return next - now;
      })();
      setTimeout(() => {
        this.initFestiveMessages(); /* could rebuild ticks if year changed */
      }, msTillMidnight);
    },
    initNearEyeAndBlink() {
      const bird = this.el.bird;
      const eye = bird.querySelector(".bird-eye");
      if (!eye) return;
      if (this.flags.reduced) return;
      // 睡眠配置：两种模式 1) 深色主题即睡眠 2) 时间窗口 (22:30-06:30)
      this.sleepConfig = this.sleepConfig || {
        mode: "auto", // auto | theme | time
        timeRange: { start: "22:30", end: "06:30" },
        forceAwakeUntil: 0, // 唤醒后短期保持清醒
        awakeGraceMs: 10 * 60 * 1000,
      };
      const birdBody = bird.querySelector(".bird-body");
      const applyBirdSkin = (skin) => {
        if (!birdBody) return;
        if (skin === "yellow") {
          birdBody.style.fill = "#f5c542";
          birdBody.setAttribute("data-skin", "yellow");
        } else {
          birdBody.style.fill = "#1da1f2";
          birdBody.setAttribute("data-skin", "blue");
        }
      };
      const parseHM = (s) => {
        const [h, m] = s.split(":").map((n) => parseInt(n, 10));
        return h * 60 + m;
      };
      const inSleepTime = () => {
        const now = new Date();
        const total = now.getHours() * 60 + now.getMinutes();
        const start = parseHM(this.sleepConfig.timeRange.start);
        const end = parseHM(this.sleepConfig.timeRange.end);
        if (start < end) return total >= start && total < end; // 正常区间
        // 跨夜区间
        return total >= start || total < end;
      };
      this.evaluateSleepState = () => {
        const now = Date.now();
        let reason = null;
        if (now < this.sleepConfig.forceAwakeUntil) {
          // 强制清醒保护期
          eye.removeAttribute("data-sleep");
          applyBirdSkin("blue");
          this.lastSleepInfo = { asleep: false, reason: null };
          this.toggleZVisible && this.toggleZVisible(false);
          return false;
        }
        let asleep = false;
        const isDarkTheme =
          d.documentElement.getAttribute("data-theme") === "dark";
        if (this.sleepConfig.mode === "theme") {
          asleep = isDarkTheme;
          if (asleep) reason = "theme";
        } else if (this.sleepConfig.mode === "time") {
          asleep = inSleepTime();
          if (asleep) reason = "time";
        } else if (this.sleepConfig.mode === "auto") {
          if (isDarkTheme) {
            asleep = true;
            reason = "theme";
          } else if (inSleepTime()) {
            asleep = true;
            reason = "time";
          }
        }
        if (asleep) {
          eye.setAttribute("data-sleep", "1");
          applyBirdSkin(reason === "theme" ? "yellow" : "blue");
          this.toggleZVisible && this.toggleZVisible(true);
        } else {
          eye.removeAttribute("data-sleep");
          applyBirdSkin("blue");
          this.toggleZVisible && this.toggleZVisible(false);
        }
        this.lastSleepInfo = { asleep, reason };
        return asleep;
      };
      this.injectOnce(
        "bird-sleep-eye-style",
        `.bird-eye[data-sleep="1"]{transition:transform .25s;transform-origin:center;transform:scaleY(.15) translateY(2px) !important;}
         .bird-eye[data-sleep="1"]:after{opacity:.25}`
      );
      // 首次评估 + 定时轮询
      this.evaluateSleepState();
      setInterval(() => this.evaluateSleepState(), 60 * 1000);
      const blink = () => {
        // 如果睡眠状态则不执行眨眼动画
        if (this.evaluateSleepState && this.evaluateSleepState()) {
          schedule();
          return;
        }
        const base =
          eye.getAttribute("data-base-tf") || eye.style.transform || "scale(1)";
        const bbox = eye.getBoundingClientRect();
        const scaleY = 0.18;
        const offset = (bbox.height * (1 - scaleY)) / 2;
        eye.style.transition = "transform .09s";
        eye.style.transform =
          base + ` scaleY(${scaleY}) translateY(-${offset.toFixed(2)}px)`;
        setTimeout(() => {
          eye.style.transform = base;
          setTimeout(() => {
            eye.style.transition = "";
          }, 120);
        }, 110);
        schedule();
      };
      function schedule() {
        setTimeout(blink, 3000 + Math.random() * 4000);
      }
      schedule();
      // Restore advanced: Zz floating indicator
      this.setupZzz();
      // 保证进入时一定有提示
      setTimeout(() => {
        try {
          const key = "birdInitTipShown";
          const today = this.dateYMD(new Date());
          const shownTag = localStorage.getItem(key);
          if (shownTag !== today) {
            if (this._showBirdTip) {
              if (this.lastSleepInfo && this.lastSleepInfo.asleep) {
                this._showBirdTip(this.sleepMessages.first || "睡觉了 别点");
              } else {
                this._showBirdTip("点我可以互动");
              }
            }
            localStorage.setItem(key, today);
          }
        } catch (e) {}
      }, 800);
    },
    setupZzz() {
      let z = d.querySelector(".bird-zzz-floating");
      if (!z) {
        z = d.createElement("span");
        z.className = "bird-zzz-floating";
        z.textContent = "Zz";
        d.body.appendChild(z);
      }
      this.el.zEl = z;
      this.injectOnce(
        "bird-zzz-style",
        `.bird-zzz-floating{font:14px/1 sans-serif;color:#7a8394;opacity:.85;animation:zzFloat 3.2s ease-in-out infinite;position:absolute;pointer-events:none;z-index:50;transition:transform .35s ease,color .35s,filter .4s,opacity .35s;}
         .bird-zzz-floating[data-hide="1"]{opacity:0;animation:none;}
         @keyframes zzFloat{0%,100%{transform:translate(0,0);}50%{transform:translate(6px,-8px);}}`
      );
      const pos = () => {
        if (!this.el.zEl || !this.el.bird) return;
        const r = this.el.bird.getBoundingClientRect();
        this.el.zEl.style.top = r.top + w.scrollY - 14 + "px";
        this.el.zEl.style.left = r.right + w.scrollX - 28 + "px";
      };
      pos();
      w.addEventListener("scroll", () => pos(), { passive: true });
      w.addEventListener("resize", () => pos());
      const mo = new MutationObserver(() => pos());
      mo.observe(d.documentElement, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
      // 供睡眠评估调用：true 显示，false 隐藏
      this.toggleZVisible = (show) => {
        if (!this.el.zEl) return;
        if (show) {
          this.el.zEl.removeAttribute("data-hide");
          // 立即刷新一次显示内容
          this._zzActive = true;
          if (!this._zzCycling) cycle();
        } else {
          this.el.zEl.setAttribute("data-hide", "1");
          this._zzActive = false;
        }
      };
      const cycle = () => {
        this._zzCycling = true;
        if (!this.el.zEl) return;
        if (!this._zzActive) {
          // 睡眠结束，暂停循环，稍后唤醒时再启动
          this._zzCycling = false;
          return;
        }
        const variants = ["Z", "Zz", "Zzz"];
        this.el.zEl.textContent =
          variants[Math.floor(Math.random() * variants.length)];
        setTimeout(cycle, 2000 + Math.random() * 2600);
      };
      // 初始根据当前睡眠状态决定可见性（evaluateSleepState 之后会再次校准）
      this.toggleZVisible(false);
    },
    injectOnce(id, css) {
      let st = d.getElementById(id);
      if (!st) {
        st = d.createElement("style");
        st.id = id;
        st.textContent = css;
        d.head.appendChild(st);
      }
    },
    initSleepAndFeed() {
      const bird = this.el.bird;
      if (!bird) return;
      const prefersReduced = (() => {
        try {
          if (
            w.WestlifeUtils &&
            typeof w.WestlifeUtils.shouldReduceMotion === "function"
          ) {
            return !!w.WestlifeUtils.shouldReduceMotion();
          }
          const forced =
            (d.documentElement &&
              d.documentElement.getAttribute("data-force-motion") === "true") ||
            w.WESTLIFE_FORCE_MOTION === true;
          if (forced) return false;
          return !!(
            w.matchMedia &&
            w.matchMedia("(prefers-reduced-motion: reduce)").matches
          );
        } catch (e) {
          return false;
        }
      })();
      const storage = {
        darkClicksKey: "birdDarkClicks",
        timeClicksKey: "birdTimeClicks",
        forcedDayKey: "birdForcedDay",
        dayFeedKey: "birdDayFeedCount",
        firstVisitKey: "birdFirstVisitShown",
      };
      try {
        if (localStorage.getItem(storage.forcedDayKey) === "1") {
          if (d.documentElement.getAttribute("data-theme") !== "light")
            d.documentElement.setAttribute("data-theme", "light");
        }
      } catch (e) {}
      let darkClickCount = 0;
      try {
        const v = parseInt(localStorage.getItem(storage.darkClicksKey), 10);
        if (!isNaN(v)) darkClickCount = v;
      } catch (e) {}
      let dayFeedCount = 0;
      try {
        const v = parseInt(localStorage.getItem(storage.dayFeedKey), 10);
        if (!isNaN(v)) dayFeedCount = v;
      } catch (e) {}
      function persist(k, v) {
        try {
          localStorage.setItem(k, String(v));
        } catch (e) {}
      }
      const showTip = (msg, opts = {}) => {
        let tip = d.querySelector(".bird-sleep-tip");
        if (!tip) {
          tip = d.createElement("div");
          tip.className = "bird-sleep-tip";
          d.body.appendChild(tip);
        }
        const r = bird.getBoundingClientRect();
        tip.style.left = r.left + r.width * 0.5 + "px";
        tip.style.top = r.top - 30 + "px";
        tip.textContent = msg;
        tip.classList.remove("show");
        void tip.offsetWidth;
        tip.classList.add("show");
        clearTimeout(tip._hideTimer);
        tip._hideTimer = setTimeout(
          () => tip.classList.remove("show"),
          opts.duration || 2200
        );
        return tip;
      };
      this._showBirdTip = showTip;
      // 睡眠提示文案可配置
      this.sleepMessages = this.sleepMessages || {
        wakeThreshold: 5,
        first: "睡觉了 别点",
        middle: ["呼…", "再点我也不醒", "别吵啦", "做梦呢~"],
        wake: "被你叫醒上班了",
      };
      this.setSleepMessages = (defs) => {
        if (!defs) return;
        Object.assign(this.sleepMessages, defs);
      };
      // 唤醒后提示逻辑（只在刚被强制叫醒执行一次）
      this._handleForcedWake = () => {
        if (this._justForcedAwake) return; // 避免重复
        this._justForcedAwake = true;
        // 1. 诱导用户投喂
        this._showBirdTip &&
          this._showBirdTip("醒了，投喂一下？", { duration: 2600 });
        // 2. 给鸟一个轻微伸展动画（复用已有 class 或自定义）
        try {
          bird.classList.remove("stretch");
          void bird.offsetWidth;
          bird.classList.add("stretch");
          setTimeout(() => bird.classList.remove("stretch"), 1200);
        } catch (e) {}
        // 3. 立即尝试显示一个节日/节气祝福（不打扰已有已展示逻辑，可添加一个快速 pick）
        try {
          const now = new Date();
          const year = now.getFullYear();
          const list = this.buildFestivalList(year).map((f) =>
            this.decorateFestivalState(f, now)
          );
          const running = list.filter((f) => f.state === "ongoing");
          const upcoming = list.filter(
            (f) => f.state === "upcoming" && f.deltaDays <= 3
          );
          const pick = running[0] || upcoming[0];
          if (pick) {
            const msg = this.pickMessage(pick, now);
            // 使用独立延迟避免 tip 覆盖立即唤醒提示
            setTimeout(() => this.safeShowFestivalTip(msg, pick.state), 900);
          }
        } catch (e) {}
        // 4. 重置标志：允许下一次真正睡过去后再显示
        setTimeout(() => {
          this._justForcedAwake = false;
        }, this.sleepConfig.awakeGraceMs + 2000);
        // 5. 标记醒后首次投喂的特殊文案
        this._justAwakeNeedFeedBoost = true;
      };
      bird.addEventListener("click", () => {
        const sleepInfo = this.lastSleepInfo || { asleep: false };
        if (sleepInfo.asleep) {
          darkClickCount++;
          persist(storage.darkClicksKey, darkClickCount);
          const sm = this.sleepMessages;
          let msg = "";
          if (darkClickCount === 1) msg = sm.first;
          else if (darkClickCount < sm.wakeThreshold) {
            const arr = sm.middle;
            msg = arr[Math.floor(Math.random() * arr.length)];
          } else {
            // 达到唤醒条件
            if (sleepInfo.reason === "theme") {
              d.documentElement.setAttribute("data-theme", "light");
              persist(storage.forcedDayKey, 1);
            }
            msg = sm.wake;
            darkClickCount = 0;
            persist(storage.darkClicksKey, 0);
            if (this.evaluateSleepState) {
              this.sleepConfig.forceAwakeUntil =
                Date.now() + this.sleepConfig.awakeGraceMs;
              this.evaluateSleepState();
            }
            // 唤醒后的额外反应
            this._handleForcedWake && this._handleForcedWake();
          }
          showTip(msg);
          return;
        }
        if (prefersReduced) return;
        let feedMsg = "谢谢投喂！";
        const extra = ["好吃", "继续~", "我精神了", "记住你啦", "能量+1"]; // 常规循环
        if (this._justAwakeNeedFeedBoost) {
          feedMsg = "补给收到!";
          this._justAwakeNeedFeedBoost = false;
        } else {
          feedMsg = extra[dayFeedCount % extra.length];
        }
        dayFeedCount++;
        persist(storage.dayFeedKey, dayFeedCount);
        bird.classList.remove("peck");
        void bird.offsetWidth;
        bird.classList.add("peck");
        setTimeout(() => bird.classList.remove("peck"), 520);
        showTip(feedMsg);
        // 高级投喂特效
        if (!prefersReduced) {
          this.spawnFeedEffect(bird);
        }
        try {
          const ajaxCfg = w.westlife_ajax || {};
          const visitorCfg = w.westlifeVisitorConfig || {};
          const visitorData = visitorCfg.visitorData || {};
          const homeProfile = visitorCfg.homeProfile || {};
          if (ajaxCfg.ajax_url && ajaxCfg.nonce) {
            fetch(ajaxCfg.ajax_url, {
              method: "POST",
              credentials: "same-origin",
              headers: {
                "Content-Type":
                  "application/x-www-form-urlencoded; charset=UTF-8",
              },
              body: new URLSearchParams({
                action: "westlife_bird_feed",
                nonce: ajaxCfg.nonce,
                email: homeProfile.email || visitorData.email || "",
                name: homeProfile.display_name || visitorData.name || "",
                url: visitorData.url || "",
              }).toString(),
            })
              .then((response) => (response.ok ? response.json() : null))
              .then((json) => {
                if (json && json.success && json.data && json.data.state) {
                  const state = json.data.state;
                  if (state.message) {
                    showTip(state.message, { duration: 2400 });
                  }
                  bird.setAttribute("data-mood", state.mood || "curious");
                  bird.setAttribute("data-stage", state.stage || "nestling");
                  bird.setAttribute(
                    "aria-label",
                    `小鸟当前处于${state.stage_label || "雏鸟"}阶段，亲密度${state.closeness || 0}`
                  );
                }
                try {
                  w.dispatchEvent(
                    new CustomEvent("westlife:bird-fed", {
                      detail: json && json.data ? json.data : null,
                    })
                  );
                } catch (_) {}
              })
              .catch(() => {});
          }
        } catch (_) {}
      });
      try {
        if (
          !localStorage.getItem(storage.firstVisitKey) &&
          d.documentElement.getAttribute("data-theme") !== "dark"
        ) {
          // 延迟可能与初始化统一提示重复，留守兼容
          setTimeout(() => showTip("点我可以互动"), 600);
          localStorage.setItem(storage.firstVisitKey, "1");
        }
      } catch (e) {}
    },
    dateYMD(dt) {
      const y = dt.getFullYear();
      const m = (dt.getMonth() + 1).toString().padStart(2, "0");
      const d2 = dt.getDate().toString().padStart(2, "0");
      return `${y}-${m}-${d2}`;
    },
    parse(s) {
      const [a, b, c] = s.split("-").map((n) => parseInt(n, 10));
      return new Date(a, b - 1, c);
    },
    daysBetween(a, b) {
      return Math.round((this.clearTime(a) - this.clearTime(b)) / 86400000);
    },
    clearTime(dt) {
      const d = new Date(dt);
      d.setHours(0, 0, 0, 0);
      return d.getTime();
    },
    decorateFestivalState(f, now) {
      const start = this.parse(f.start);
      const end = this.parse(f.end || f.start);
      const n = this.parse(this.dateYMD(now));
      let state, delta;
      if (n >= start && n <= end) {
        state = "ongoing";
        delta = 0;
      } else if (n < start) {
        state = "upcoming";
        delta = this.daysBetween(start, n);
      } else {
        state = "passed";
        delta = this.daysBetween(n, end);
      }
      return { ...f, state, deltaDays: delta };
    },
    buildFestivalList(year) {
      const base = [
        {
          id: "newyear",
          name: "元旦",
          start: `${year}-01-01`,
          end: `${year}-01-01`,
          type: "holiday",
          msgs: {
            ongoing: [
              "新年好！立个 Flag 吗？",
              "元旦快乐，新的旅程启航！",
              "第一天写下第一个灵感吧~",
            ],
            upcoming: [
              "倒计时 {d} 天就元旦啦，准备好迎接了吗？",
              "还有 {d} 天就是新年的钟声~",
              "元旦将至，计划清单写好没？",
            ],
            passed: [
              "元旦结束啦，继续加油！",
              "新年第一步已经迈出",
              "假期结束调整状态咯",
            ],
          },
        },
        {
          id: "springfest",
          name: "春节",
          start: `${year}-01-29`,
          end: `${year}-02-04`,
          type: "holiday",
          msgs: {
            ongoing: [
              "春节快乐！吃好喝好睡好~",
              "新春大吉！红包收到手软了吗？",
              "年味正浓，记录点团圆瞬间吧~",
            ],
            upcoming: [
              "距离春节还有 {d} 天，年味渐浓~",
              "还有 {d} 天回家，行李清单准备了吗？",
              "倒数 {d} 天，心已经在家乡了吧~",
            ],
            passed: [
              "春节假期结束，缓缓切换到工作模式~",
              "年已过，愿热闹延续成动力",
              "假期结束，保持一点松弛感~",
            ],
          },
        },
        {
          id: "valentine",
          name: "情人节",
          start: `${year}-02-14`,
          end: `${year}-02-14`,
          type: "festival",
          msgs: {
            ongoing: [
              "情人节快乐！爱要说出口~",
              "今天适合多点温柔 💝",
              "去讲一个暖心的小故事给 TA 吧",
            ],
            upcoming: [
              "情人节还有 {d} 天，花订了吗？",
              "倒计时 {d} 天，准备一份惊喜？",
              "还有 {d} 天，写张手写贺卡如何？",
            ],
            passed: [
              "情人节过去啦，日常也要温柔相待~",
              "节日结束，爱意继续营业",
              "记录一条今天的甜蜜记忆~",
            ],
          },
        },
        {
          id: "lantern",
          name: "元宵节",
          start: `${year}-02-12`,
          end: `${year}-02-12`,
          type: "lunar",
          msgs: {
            ongoing: [
              "元宵节快乐！来碗热乎乎的汤圆~",
              "花灯与月色都等你",
              "今晚的圆，替你好运续满~",
            ],
            upcoming: [
              "元宵节还有 {d} 天，馅料选甜的还是咸的？",
              "还有 {d} 天，准备一起赏花灯吗？",
              "倒计时 {d} 天，收藏一盏喜欢的灯",
            ],
            passed: [
              "元宵已过，圆满继续~",
              "汤圆的余味还在吗？",
              "节气往前走，心情也慢慢亮",
            ],
          },
        },
        {
          id: "qingming",
          name: "清明节",
          start: `${year}-04-04`,
          end: `${year}-04-06`,
          type: "holiday",
          msgs: {
            ongoing: [
              "清明时节，愿安好",
              "今日适合与记忆轻声对话",
              "让思念变成前行的温柔力量",
            ],
            upcoming: [
              "清明还有 {d} 天，规划出行了吗？",
              "倒计时 {d} 天，天气或有变化注意安排",
              "清明临近，停一停也很好",
            ],
            passed: [
              "清明已过，珍惜当下",
              "节日过去，心意仍在",
              "收拾心绪继续前行",
            ],
          },
        },
        {
          id: "labour",
          name: "劳动节",
          start: `${year}-05-01`,
          end: `${year}-05-05`,
          type: "holiday",
          msgs: {
            ongoing: [
              "劳动节快乐！也别忘了好好休息~",
              "假期 Day {day}，放松与灵感都要有",
              "向每一份认真致敬",
            ],
            upcoming: [
              "五一还有 {d} 天，订票了吗？",
              "倒计时 {d} 天，行程轻松一点更享受",
              "还有 {d} 天，做个小出游计划？",
            ],
            passed: [
              "五一结束啦，保持节奏别冲太猛",
              "假期后的第一天，加点缓冲",
              "收心也不必太急，慢慢来",
            ],
          },
        },
        {
          id: "dragonboat",
          name: "端午节",
          start: `${year}-05-30`,
          end: `${year}-06-01`,
          type: "holiday",
          msgs: {
            ongoing: [
              "端午安康！粽叶飘香~",
              "今天吃了几种粽子？",
              "糯香和仲夏正式上线",
            ],
            upcoming: [
              "端午还有 {d} 天，咸甜粽之争继续~",
              "倒计时 {d} 天，粽子礼盒买好没？",
              "还有 {d} 天，艾草和香囊准备了吗？",
            ],
            passed: [
              "端午已过，香气还在",
              "节日结束，保留一点慢节奏",
              "继续加油，也要记得午后喝水",
            ],
          },
        },
        {
          id: "qixi",
          name: "七夕",
          start: `${year}-08-05`,
          end: `${year}-08-05`,
          type: "lunar",
          msgs: {
            ongoing: [
              "七夕快乐！愿有情人常相伴",
              "今晚的银河给你祝福 ✨",
              "写一条悄悄话给未来的自己吧",
            ],
            upcoming: [
              "七夕还有 {d} 天，准备点小心意？",
              "倒计时 {d} 天，想好怎么表达了吗？",
              "还有 {d} 天，把温柔攒起来~",
            ],
            passed: [
              "七夕已过，浪漫留存心底",
              "节日走远，关心常在",
              "把美好写成日常的一行字",
            ],
          },
        },
        {
          id: "midautumn",
          name: "中秋节",
          start: `${year}-10-05`,
          end: `${year}-10-07`,
          type: "holiday",
          msgs: {
            ongoing: [
              "中秋快乐！月色与团圆都刚刚好",
              "吃月饼别忘了配茶~",
              "今晚抬头看看月亮",
              "今年中秋回家了吗？",
            ],
            upcoming: [
              "中秋还有 {d} 天，车票抢到了吗？",
              "倒计时 {d} 天，月饼口味选好没？",
              "还有 {d} 天，是不是有点想家",
              "离中秋还有 {d} 天，今年回家吗？",
            ],
            passed: [
              "中秋已过，愿圆满常在",
              "节日过去，思念留香",
              "把月色留在文字里",
              "月亮下次再见~",
            ],
          },
        },
        {
          id: "national",
          name: "国庆节",
          start: `${year}-10-01`,
          end: `${year}-10-07`,
          type: "holiday",
          msgs: {
            ongoing: [
              "国庆假期愉快！旅途顺利~",
              "假期 Day {day}，缓缓也很好",
              "今天拍了几张照片？",
              "去过的地方都在记忆里闪光",
            ],
            upcoming: [
              "国庆还有 {d} 天，预定做得怎么样？",
              "倒计时 {d} 天，行李别太满留点余地",
              "还有 {d} 天，目的地攻略收藏下",
              "再过 {d} 天就是国庆长假啦！",
            ],
            passed: [
              "国庆已过，慢慢调频",
              "假期的照片整理一下？",
              "收心不急，渐进切换",
              "带着旅途的灵感继续前进",
            ],
          },
        },
        {
          id: "christmas",
          name: "圣诞节",
          start: `${year}-12-25`,
          end: `${year}-12-25`,
          type: "festival",
          msgs: {
            ongoing: [
              "圣诞快乐！🎄",
              "今晚来一杯热饮？",
              "写张卡片寄给未来",
              "叮当铃声在心里响起~",
            ],
            upcoming: [
              "圣诞还有 {d} 天，礼物挑好没？",
              "倒计时 {d} 天，准备交换礼物？",
              "还有 {d} 天，温暖灯光安排上~",
            ],
            passed: [
              "圣诞刚过，氛围还在",
              "节日余温，慢慢收进心里",
              "准备向新年冲刺了吗？",
            ],
          },
        },
      ];
      // 合并节气（示例：部分 24 节气，可按需扩展；日期使用公历近似，闰年微差忽略）
      const solarTerms = this.buildSolarTerms(year);
      // 农历节日（年份映射：示例 2024-2027，可扩展；若无匹配保持 base 里静态近似日期）
      const lunarMap = {
        // 参考真实日期（可能随历法略有差异，必要时再校准）
        2024: {
          springfest: ["02-10", "02-17"], // 初一-初八
          lantern: ["02-24"],
          dragonboat: ["06-10", "06-12"],
          qixi: ["08-10"],
          midautumn: ["09-17", "09-17"],
        },
        2025: {
          springfest: ["01-29", "02-04"],
          lantern: ["02-12"],
          dragonboat: ["05-30", "06-01"],
          qixi: ["08-05"],
          midautumn: ["10-05", "10-07"],
        },
        2026: {
          springfest: ["02-17", "02-23"],
          lantern: ["03-03"],
          dragonboat: ["06-19", "06-21"],
          qixi: ["08-25"],
          midautumn: ["09-25", "09-27"],
        },
        2027: {
          springfest: ["02-06", "02-12"],
          lantern: ["02-20"],
          dragonboat: ["06-09", "06-11"],
          qixi: ["08-14"],
          midautumn: ["09-15", "09-17"],
        },
      };
      if (lunarMap[year]) {
        base.forEach((f) => {
          if (lunarMap[year][f.id]) {
            const [s, e] = lunarMap[year][f.id];
            f.start = `${year}-${s}`;
            f.end = `${year}-${e || s}`;
          }
        });
      }
      return base.concat(solarTerms);
    },
    buildSolarTerms(year) {
      // 完整 24 节气（近似公历日期，未做闰年细化调整，可后续接入更精确算法）
      const terms = [
        ["lichun", "立春", "02-04"],
        ["yushui", "雨水", "02-19"],
        ["jingzhe", "惊蛰", "03-05"],
        ["chunfen", "春分", "03-20"],
        ["qingming-term", "清明(节气)", "04-04"],
        ["guyu", "谷雨", "04-20"],
        ["lixia", "立夏", "05-05"],
        ["xiaoman", "小满", "05-21"],
        ["mangzhong", "芒种", "06-05"],
        ["xiazhi", "夏至", "06-21"],
        ["xiaoshu", "小暑", "07-07"],
        ["dashu", "大暑", "07-23"],
        ["liqiu", "立秋", "08-07"],
        ["chushu", "处暑", "08-23"],
        ["bailu", "白露", "09-07"],
        ["qiufen", "秋分", "09-22"],
        ["hanlu", "寒露", "10-08"],
        ["shuangjiang", "霜降", "10-23"],
        ["lidong", "立冬", "11-07"],
        ["xiaoxue", "小雪", "11-22"],
        ["daxue", "大雪", "12-07"],
        ["dongzhi", "冬至", "12-21"],
        ["xiaohan", "小寒", "01-05"],
        ["dahan", "大寒", "01-20"],
      ];
      const genericOngoing = (name) => [
        `${name}到了，观察一下身边的小变化`,
        `${name}：节奏轻调`,
        `${name}日，写个短句记录气候`,
      ];
      const genericUpcoming = (name) => [
        `${name}还有 {d} 天，留意天气起伏`,
        `倒计时 {d} 天到${name}，整理一下本阶段目标`,
        `再过 {d} 天就是${name}，调整作息迎接新节奏`,
      ];
      const genericPassed = (name) => [
        `${name}刚过，状态缓慢过渡`,
        `${name}结束，写个节气感受`,
        `${name}之后，注意能量管理`,
      ];
      return terms.map(([id, name, md]) => {
        return {
          id: `solar-${id}`,
          name,
          start: `${year}-${md}`,
          end: `${year}-${md}`,
          type: "solar",
          msgs: {
            ongoing: genericOngoing(name),
            upcoming: genericUpcoming(name),
            passed: genericPassed(name),
          },
        };
      });
    },
    pickMessage(f, now) {
      const dayIndex =
        f.state === "ongoing"
          ? this.daysBetween(now, this.parse(f.start)) + 1
          : null;
      const pool = f.msgs[f.state] || [];
      // 覆盖/追加注册消息
      let overridePool = pool;
      if (this._messageOverrides && this._messageOverrides[f.id]) {
        const ov = this._messageOverrides[f.id];
        if (ov && Array.isArray(ov[f.state]) && ov[f.state].length) {
          overridePool = ov[f.state];
        }
      }
      if (overridePool.length === 0) return "";
      // 将函数项动态展开（传入上下文）
      const runtimeExpanded = [];
      overridePool.forEach((item) => {
        if (typeof item === "function") {
          try {
            const res = item({
              festival: f,
              state: f.state,
              now,
              dayIndex: dayIndex || 1,
              deltaDays: f.deltaDays,
              dateStr: this.dateYMD(now),
            });
            if (Array.isArray(res)) {
              res.forEach(
                (r) => typeof r === "string" && runtimeExpanded.push(r)
              );
            } else if (typeof res === "string" && res) {
              runtimeExpanded.push(res);
            }
          } catch (e) {}
        } else if (typeof item === "string") runtimeExpanded.push(item);
      });
      if (runtimeExpanded.length) overridePool = runtimeExpanded;
      const base = this.stablePick(
        overridePool,
        f.id + ":" + f.state + ":" + this.dateYMD(now)
      );
      const enriched = base
        .replace(/\{d\}/g, f.deltaDays)
        .replace(/\{day\}/g, dayIndex || 1);
      const iconMap = {
        newyear: "🎉",
        springfest: "🧧",
        lantern: "🏮",
        valentine: "💝",
        labour: "🛠️",
        dragonboat: "🎏",
        qixi: "💫",
        midautumn: "🌕",
        national: "🇨🇳",
        christmas: "🎄",
        // 单独节气 icon（如无准确象征，用通用/自然类 emoji）
        "solar-lichun": "🌱",
        "solar-yushui": "💧",
        "solar-jingzhe": "⚡",
        "solar-chunfen": "☯️",
        "solar-qingming-term": "🍃",
        "solar-guyu": "🌾",
        "solar-lixia": "🔥",
        "solar-xiaoman": "🌿",
        "solar-mangzhong": "🌱",
        "solar-xiazhi": "☀️",
        "solar-xiaoshu": "🌀",
        "solar-dashu": "🌋",
        "solar-liqiu": "🍂",
        "solar-chushu": "🌤️",
        "solar-bailu": "🧊",
        "solar-qiufen": "⚖️",
        "solar-hanlu": "💨",
        "solar-shuangjiang": "❄️",
        "solar-lidong": "🥣",
        "solar-xiaoxue": "🌨️",
        "solar-daxue": "☃️",
        "solar-dongzhi": "🕯️",
        "solar-xiaohan": "🧤",
        "solar-dahan": "🧣",
        solar: "🗓️",
      };
      let icon = iconMap[f.id];
      if (!icon && f.type === "solar") icon = iconMap.solar;
      return icon ? icon + " " + enriched : enriched;
    },
    spawnFeedEffect(bird) {
      const rect = bird.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5 + w.scrollX;
      const cy = rect.top + rect.height * 0.35 + w.scrollY;
      // 能量环
      const ring = d.createElement("div");
      ring.className = "bird-energy-ring";
      ring.style.left = cx + "px";
      ring.style.top = cy + "px";
      d.body.appendChild(ring);
      setTimeout(() => ring.remove(), 900);
      // 多粒子
      const grains = 6;
      for (let i = 0; i < grains; i++) {
        const g = d.createElement("div");
        g.className = "bird-feed-grain";
        g.style.left = cx + "px";
        g.style.top = cy + "px";
        d.body.appendChild(g);
        const angle = (Math.PI * 2 * i) / grains + Math.random() * 0.8;
        const dist = 26 + Math.random() * 18;
        const tx = Math.cos(angle) * dist;
        const ty = Math.sin(angle) * dist + 4;
        requestAnimationFrame(() => {
          g.style.transform = `translate(${tx.toFixed(1)}px, ${ty.toFixed(
            1
          )}px) scale(.2)`;
          g.style.opacity = 0;
        });
        setTimeout(() => g.remove(), 1000 + Math.random() * 300);
      }
    },
    stablePick(arr, seed) {
      let h = 0;
      for (let i = 0; i < seed.length; i++) {
        h = (h * 131 + seed.charCodeAt(i)) >>> 0;
      }
      return arr[h % arr.length];
    },
    defer(fn, ms) {
      setTimeout(fn, ms);
    },
    safeShowFestivalTip(msg, state) {
      if (!msg) return;
      const bird = this.el.bird;
      if (!bird) return;
      let tip = d.querySelector(".bird-festival-tip");
      if (!tip) {
        tip = d.createElement("div");
        tip.className = "bird-festival-tip";
        d.body.appendChild(tip);
      }
      const r = bird.getBoundingClientRect();
      tip.style.left = r.left + r.width * 0.5 + "px";
      tip.style.top = r.top - 54 + "px";
      tip.textContent = msg;
      tip.setAttribute("data-state", state || "");
      tip.classList.remove("show");
      void tip.offsetWidth;
      tip.classList.add("show");
      clearTimeout(tip._hideTimer);
      tip._hideTimer = setTimeout(() => tip.classList.remove("show"), 5400);
    },
    initFestiveMessages() {
      const bird = this.el.bird;
      if (!bird) return;
      const today = this.dateYMD(new Date());
      const year = parseInt(today.slice(0, 4), 10);
      const list = this.buildFestivalList(year);
      const nowDate = new Date();
      const candidates = list.map((f) =>
        this.decorateFestivalState(f, nowDate)
      );
      const running = candidates.filter((c) => c.state === "ongoing");
      const upcoming = candidates.filter(
        (c) => c.state === "upcoming" && c.deltaDays <= 7
      );
      const recent = candidates.filter(
        (c) => c.state === "passed" && Math.abs(c.deltaDays) <= 2
      );
      let pick = running[0] || upcoming[0] || recent[0];
      if (!pick) return;
      const msg = this.pickMessage(pick, nowDate);
      // 防打扰：当天已展示则跳过
      try {
        const key = "birdFestMsgShown";
        const tag = this.dateYMD(new Date()) + ":" + pick.id;
        if (localStorage.getItem(key) === tag) {
          return;
        }
        localStorage.setItem(key, tag);
      } catch (e) {}
      this.defer(() => this.safeShowFestivalTip(msg, pick.state), 1200);
    },
  };
  d.addEventListener("DOMContentLoaded", () => BirdMod.init());
})(window, document);
