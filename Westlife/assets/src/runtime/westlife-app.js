(function (w, d) {
  "use strict";

  if (w.WestlifeApp) {
    return;
  }

  const modules = [];

  function safeCall(fn, name, context) {
    if (typeof fn !== "function") return;
    try {
      fn(context);
    } catch (error) {
      if (w.console && typeof w.console.error === "function") {
        console.error(`[WestlifeApp] ${name} failed`, error);
      }
    }
  }

  const app = {
    modules,
    register(module) {
      if (!module || !module.name) return;
      if (modules.some((item) => item.name === module.name)) return;
      modules.push(module);
    },
    init(context = d) {
      modules.forEach((module) => {
        if (typeof module.match === "function" && !module.match(context)) {
          return;
        }
        safeCall(module.init, `${module.name}.init`, context);
      });
      d.dispatchEvent(
        new CustomEvent("westlife:modules-initialized", {
          detail: { context },
        })
      );
    },
    destroy(context = d) {
      modules.forEach((module) => {
        safeCall(module.destroy, `${module.name}.destroy`, context);
      });
      d.dispatchEvent(
        new CustomEvent("westlife:modules-destroyed", {
          detail: { context },
        })
      );
    },
    reinit(context = d) {
      this.destroy(context);
      this.init(context);
    },
  };

  w.WestlifeApp = app;

  d.addEventListener("DOMContentLoaded", () => {
    app.init(d);
  });
})(window, document);
