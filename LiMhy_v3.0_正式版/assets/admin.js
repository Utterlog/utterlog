/**
 * LiMhy - 后台运行脚本 v3.0
 */
;(function() {
    'use strict';

    const root = document.documentElement;
    const themeToggle = document.getElementById('js-admin-theme-toggle');
    const applyThemeIcon = () => {
        if (!themeToggle) return;
        const isDark = root.getAttribute('data-admin-theme') === 'dark';
        themeToggle.innerHTML = isDark
            ? '<i class="ri-sun-line"></i>'
            : '<i class="ri-moon-clear-line"></i>';
        themeToggle.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    };

    applyThemeIcon();
    if (themeToggle) {
        themeToggle.addEventListener('click', function() {
            const isDark = root.getAttribute('data-admin-theme') === 'dark';
            if (isDark) {
                root.removeAttribute('data-admin-theme');
                localStorage.setItem('limhy_admin_theme', 'light');
            } else {
                root.setAttribute('data-admin-theme', 'dark');
                localStorage.setItem('limhy_admin_theme', 'dark');
            }
            applyThemeIcon();
        });
    }

    const trigger = document.getElementById('js-trigger');
    const sider = document.getElementById('js-sider');
    const overlay = document.getElementById('js-overlay');

    if (trigger && sider && overlay) {
        trigger.addEventListener('click', function(e) {
            e.stopPropagation();
            sider.classList.toggle('show');
            overlay.classList.toggle('show');
        });

        function closeMenu() {
            sider.classList.remove('show');
            overlay.classList.remove('show');
        }

        overlay.addEventListener('click', closeMenu);
        if (window.innerWidth <= 1024) {
            sider.querySelectorAll('a').forEach(link => {
                link.addEventListener('click', closeMenu);
            });
        }
    }

    document.addEventListener('click', function() {});
})();
