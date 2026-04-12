<?php
/**
 * LiMhy - 分类视图
 */
?>
<div class="container list-page">
    <div class="page-header" style="margin-bottom: 24px;">
        <h1 class="page-title" style="font-size: 2.2rem; font-weight: 900; margin: 0 0 8px 0; letter-spacing: 1px;">
            <?=e($category['name'])?>
        </h1>
        <?php if ($category['description']): ?>
            <p class="page-desc" style="color: #444; font-weight: 600;"><?=e($category['description'])?></p>
        <?php else: ?>
            <p class="page-desc" style="color: #666; font-weight: 600; font-family: monospace;"><?= (int)($feed['total'] ?? ($pager['total'] ?? 0)) ?> 篇文章</p>
        <?php endif; ?>
    </div>

    <?php if (empty($posts)): ?>
        <div class="empty-state" style="padding: 40px 0; font-weight: 800;"><p>该分类暂无文章</p></div>
    <?php else: ?>
        <section class="post-list" id="js-list-feed" data-list-feed
                 data-endpoint="<?= e($feed['endpoint'] ?? url('api/category-posts')) ?>"
                 data-query-key="<?= e($feed['query_key'] ?? 'category') ?>"
                 data-query-value="<?= e($feed['query_value'] ?? ($category['slug'] ?? '')) ?>"
                 data-next-offset="<?= (int)($feed['next_offset'] ?? count($posts)) ?>"
                 data-batch-size="<?= (int)($feed['batch_size'] ?? (defined('POSTS_PER_PAGE') ? POSTS_PER_PAGE : 10)) ?>"
                 data-has-more="<?= !empty($feed['has_more']) ? '1' : '0' ?>">
            <?= limhy_render_home_cards($posts) ?>
        </section>

        <div class="feed-loader<?= empty($feed['has_more']) ? ' is-hidden' : '' ?>" id="js-list-feed-loader" aria-live="polite">
            <button type="button" class="feed-loader__button" id="js-list-feed-button">点击加载更多</button>
        </div>
        <div class="feed-loader__sentinel<?= empty($feed['has_more']) ? ' is-hidden' : '' ?>" id="js-list-feed-sentinel" aria-hidden="true"></div>
    <?php endif; ?>
</div>

<script>
(function () {
  var feed = document.querySelector('[data-list-feed]');
  var loader = document.getElementById('js-list-feed-loader');
  var button = document.getElementById('js-list-feed-button');
  var sentinel = document.getElementById('js-list-feed-sentinel');
  if (!feed || !loader || !button || !sentinel) return;

  var state = {
    endpoint: feed.getAttribute('data-endpoint') || '',
    queryKey: feed.getAttribute('data-query-key') || '',
    queryValue: feed.getAttribute('data-query-value') || '',
    nextOffset: parseInt(feed.getAttribute('data-next-offset') || '0', 10),
    batchSize: parseInt(feed.getAttribute('data-batch-size') || '10', 10),
    hasMore: feed.getAttribute('data-has-more') === '1',
    loading: false
  };

  function syncUi() {
    if (!state.hasMore) {
      loader.classList.add('is-hidden');
      sentinel.classList.add('is-hidden');
      button.disabled = true;
      return;
    }
    loader.classList.remove('is-hidden');
    sentinel.classList.remove('is-hidden');
    button.disabled = state.loading;
    button.textContent = state.loading ? '加载中...' : '点击加载更多';
  }

  function loadMore() {
    if (state.loading || !state.hasMore) return;
    state.loading = true;
    syncUi();
    var url = state.endpoint
      + '?' + encodeURIComponent(state.queryKey) + '=' + encodeURIComponent(state.queryValue)
      + '&offset=' + encodeURIComponent(state.nextOffset)
      + '&limit=' + encodeURIComponent(state.batchSize)
      + '&_t=' + Date.now();
    fetch(url, {
      method: 'GET',
      credentials: 'same-origin',
      headers: { 'X-Requested-With': 'XMLHttpRequest', 'Accept': 'application/json' }
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || '加载失败');
        if (data.html) feed.insertAdjacentHTML('beforeend', data.html);
        state.nextOffset = parseInt(data.next_offset || state.nextOffset, 10);
        state.hasMore = !!data.has_more;
        feed.setAttribute('data-next-offset', String(state.nextOffset));
        feed.setAttribute('data-has-more', state.hasMore ? '1' : '0');
      })
      .catch(function () {
        if (typeof window.showToast === 'function') window.showToast('加载更多文章失败', 'error');
      })
      .finally(function () {
        state.loading = false;
        syncUi();
      });
  }

  button.addEventListener('click', loadMore);
  syncUi();
})();
</script>
