/**
 * 文章列表页面交互脚本
 * @package Westlife
 */

(function ($) {
  "use strict";

  $(document).ready(function () {
    // 年份锚点平滑滚动
    $('a[href^="#year-"]').on("click", function (e) {
      e.preventDefault();
      const target = $($(this).attr("href"));
      if (target.length) {
        $("html, body").animate(
          {
            scrollTop: target.offset().top - 100,
          },
          600,
          "swing"
        );
      }
    });

    // 文章项悬浮动画增强
    $(".pl-post-item").on("mouseenter", function () {
      $(this)
        .find(".pl-post-title a")
        .css("color", "var(--posts-list-primary)");
    });

    $(".pl-post-item").on("mouseleave", function () {
      $(this).find(".pl-post-title a").css("color", "");
    });

    // 统计信息动画
    function animateValue(element, start, end, duration) {
      const range = end - start;
      const increment = end > start ? 1 : -1;
      const stepTime = Math.abs(Math.floor(duration / range));
      let current = start;

      const timer = setInterval(function () {
        current += increment;
        $(element).text(current.toLocaleString());
        if (current === end) {
          clearInterval(timer);
        }
      }, stepTime);
    }

    // 页面加载时动画显示统计数字
    if ($(".stat-value").length) {
      $(".stat-value").each(function () {
        const finalValue = parseInt($(this).text().replace(/,/g, ""));
        if (!isNaN(finalValue)) {
          $(this).text("0");
          const observer = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (entry.isIntersecting) {
                  animateValue(entry.target, 0, finalValue, 1000);
                  observer.unobserve(entry.target);
                }
              });
            },
            { threshold: 0.5 }
          );
          observer.observe(this);
        }
      });
    }

    // 年份标题 Sticky 效果增强
    const yearHeaders = $(".pl-year-header");
    if (yearHeaders.length) {
      $(window).on("scroll", function () {
        yearHeaders.each(function () {
          const $this = $(this);
          const offsetTop = $this.parent().offset().top;
          const scrollTop = $(window).scrollTop();

          if (scrollTop >= offsetTop - 80) {
            $this.addClass("stuck");
          } else {
            $this.removeClass("stuck");
          }
        });
      });
    }
  });
})(jQuery);
