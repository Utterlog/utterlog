(function () {
  if (!window.Prism) return;
  var order = ["mac-dots", "show-language", "copy-to-clipboard"];

  // Notify helper: prefer WestlifeUtils.showMessage/showNotice, fallback to console
  function notify(message, type, duration) {
    try {
      if (
        window.WestlifeUtils &&
        typeof window.WestlifeUtils.showMessage === "function"
      ) {
        window.WestlifeUtils.showMessage(
          message,
          type || "info",
          duration || 2000
        );
        return;
      }
      if (
        window.WestlifeUtils &&
        typeof window.WestlifeUtils.showNotice === "function"
      ) {
        window.WestlifeUtils.showNotice(
          type || "info",
          message,
          duration || 2000
        );
        return;
      }
    } catch (_) {}
    // Minimal fallback
    try {
      console[type === "error" ? "error" : "log"](message);
    } catch (_) {}
  }

  function prepareAll() {
    var nodes = document.querySelectorAll(
      'pre code[class*="language-"], pre[class*="language-"] code'
    );
    nodes.forEach(function (code) {
      var pre =
        code.parentNode && /pre/i.test(code.parentNode.nodeName)
          ? code.parentNode
          : null;
      if (!pre) return;
      if (
        !pre.classList.contains("line-numbers") &&
        !pre.hasAttribute("data-no-line-numbers")
      ) {
        pre.classList.add("line-numbers");
      }
      if (!pre.hasAttribute("data-toolbar-order")) {
        pre.setAttribute("data-toolbar-order", order.join(","));
      }
    });
  }

  Prism.hooks.add("complete", function (env) {
    var el = env.element;
    var pre =
      el && el.parentNode && /pre/i.test(el.parentNode.nodeName)
        ? el.parentNode
        : null;
    if (!pre) return;
    var wrapper =
      pre.parentNode && pre.parentNode.classList.contains("code-toolbar")
        ? pre.parentNode
        : null;
    if (!wrapper) return;
    // Ensure toolbar exists and is placed BEFORE <pre> so it looks outside the code box
    var toolbar = wrapper.querySelector(".toolbar");
    if (!toolbar) return;
    // Default Prism puts toolbar after <pre>; move it before to render as an independent block
    if (pre.nextElementSibling === toolbar) {
      wrapper.insertBefore(toolbar, pre);
    }

    if (!toolbar.querySelector(".toolbar-item.mac-dots")) {
      var item = document.createElement("div");
      item.className = "toolbar-item mac-dots";
      item.innerHTML =
        '<span class="mac-dot red"></span><span class="mac-dot yellow"></span><span class="mac-dot green"></span>';
      toolbar.insertBefore(item, toolbar.firstChild);
    }
    var items = toolbar.querySelectorAll(".toolbar-item");
    items.forEach(function (it) {
      var btn = it.querySelector("button[data-copy-state]");
      if (btn) {
        it.classList.add("copy-to-clipboard");
        // Replace button content with Font Awesome icons if not already done
        if (!btn.classList.contains("has-fa")) {
          btn.innerHTML =
            '<i class="fa-solid fa-copy icon-copy" aria-hidden="true"></i>' +
            '<i class="fa-solid fa-check icon-check" aria-hidden="true"></i>';
          btn.classList.add("has-fa");
          if (!btn.getAttribute("aria-label"))
            btn.setAttribute("aria-label", "复制");
          if (!btn.title) btn.title = "复制";
        }
        // Robust copy fallback using capture phase to block Prism's default handler
        if (!btn._customCopyBoundCapture) {
          btn.addEventListener(
            "click",
            function (e) {
              // Use capture listener, stop further handlers so we fully control timing/state
              e.preventDefault();
              e.stopImmediatePropagation();
              e.stopPropagation();
              var codeEl = pre.querySelector("code");
              var text = codeEl ? codeEl.textContent : "";
              function copyText(t) {
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  return navigator.clipboard.writeText(t);
                }
                return new Promise(function (resolve, reject) {
                  try {
                    var ta = document.createElement("textarea");
                    ta.value = t;
                    ta.setAttribute("readonly", "");
                    ta.style.position = "absolute";
                    ta.style.left = "-9999px";
                    document.body.appendChild(ta);
                    ta.select();
                    var ok = document.execCommand("copy");
                    document.body.removeChild(ta);
                    ok ? resolve() : reject(new Error("execCommand failed"));
                  } catch (err) {
                    reject(err);
                  }
                });
              }
              copyText(text)
                .then(function () {
                  btn.setAttribute("data-copy-state", "copied");
                  notify("代码已复制到剪贴板", "success", 2200);
                  setTimeout(function () {
                    btn.removeAttribute("data-copy-state");
                  }, 2000); // keep green success for 2s
                })
                .catch(function () {
                  btn.setAttribute("data-copy-state", "failed");
                  notify("复制失败，请手动选择并复制", "error", 2000);
                  setTimeout(function () {
                    btn.removeAttribute("data-copy-state");
                  }, 1200);
                });
            },
            true
          );
          btn._customCopyBoundCapture = true;
        }
      }
    });
    items.forEach(function (it) {
      if (
        !it.classList.contains("mac-dots") &&
        !it.classList.contains("copy-to-clipboard")
      ) {
        var span = it.querySelector("span");
        if (span && span.textContent && span.textContent.length <= 20) {
          it.classList.add("show-language");
        }
      }
    });
  });

  function run() {
    prepareAll();
    try {
      Prism.highlightAll();
    } catch (e) {}
    // After highlight, enable collapsible for long code blocks (>20 lines)
    var blocks = document.querySelectorAll("div.code-toolbar");
    blocks.forEach(function (wrapper) {
      var pre = wrapper.querySelector('pre[class*="language-"]');
      if (!pre) return;
      var rows = pre.querySelector(".line-numbers-rows");
      var lineCount = rows
        ? rows.children.length
        : (pre.textContent.match(/\n/g) || []).length + 1;
      if (lineCount > 20) {
        wrapper.classList.add("collapsible", "is-collapsed");
        if (!wrapper.querySelector(".code-collapse-toggle")) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "code-collapse-toggle";
          btn.innerText = "展开";
          btn.addEventListener("click", function () {
            if (wrapper.classList.contains("is-collapsed")) {
              wrapper.classList.remove("is-collapsed");
              btn.innerText = "收起";
            } else {
              wrapper.classList.add("is-collapsed");
              btn.innerText = "展开";
            }
          });
          wrapper.appendChild(btn);
        }
      }
    });
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
