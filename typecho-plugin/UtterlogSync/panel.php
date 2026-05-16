<?php
/**
 * Typecho 后台「控制台 → Utterlog 同步」面板。
 * 提供：测试连接 / 网络诊断 / 一键推送 / 实时进度条 / 最近日志。
 */
if (!defined('__TYPECHO_ROOT_DIR__')) exit;

include 'header.php';
include 'menu.php';

require_once dirname(__FILE__) . '/lib/Exporter.php';
require_once dirname(__FILE__) . '/lib/Logger.php';

$options = Typecho_Widget::widget('Widget_Options');
$plugin = $options->plugin('UtterlogSync');
$settings = array(
    'utterlog_url' => isset($plugin->utterlog_url) ? trim($plugin->utterlog_url) : '',
    'site_uuid'    => isset($plugin->site_uuid) ? trim($plugin->site_uuid) : '',
    'sync_token'   => isset($plugin->sync_token) ? trim($plugin->sync_token) : '',
);
$configured = $settings['utterlog_url'] !== '' && $settings['site_uuid'] !== '' && $settings['sync_token'] !== '';

$exporter = new UtterlogSync_Exporter(Typecho_Db::get(), $options);
$counts = $exporter->collectCounts();
$lastRun = UtterlogSync_Logger::getLastRun();
$resources = UtterlogSync_Exporter::RESOURCES;

$remoteTab = $settings['utterlog_url'] !== '' ? rtrim($settings['utterlog_url'], '/') . '/admin/tools?tab=typecho-sync' : '';
$actionBase = $options->index . '/action/utterlog-sync';
?>
<div class="main">
    <div class="body container">
        <div class="typecho-page-title">
            <h2>Utterlog 同步</h2>
        </div>

        <div class="row typecho-page-main">
            <div class="col-mb-12">

                <?php if (!$configured): ?>
                <div style="background:#fef9c3;border:1px solid #fde68a;padding:14px 16px;margin-bottom:18px;color:#713f12;">
                    尚未配置。请先去 <a href="<?php $options->adminUrl('options-plugin.php?config=UtterlogSync'); ?>" style="font-weight:600;">设置 → 插件 → UtterlogSync</a> 填写 Utterlog 接收地址、Site UUID 和 Token，然后回到本页。
                </div>
                <?php endif; ?>

                <h3>导出预览</h3>
                <p style="color:#666;">每种资源的当前数量，不产生网络请求。</p>
                <table class="typecho-list-table" style="max-width:480px;margin-bottom:24px;">
                    <thead><tr><th>资源</th><th style="width:120px;">数量</th></tr></thead>
                    <tbody>
                    <?php foreach ($counts as $r => $n): ?>
                        <tr><td><?php echo htmlspecialchars($r); ?></td><td><?php echo number_format($n); ?></td></tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>

                <h3>推送到 Utterlog</h3>
                <p style="color:#666;">按 <code>categories → tags → posts → pages → comments</code> 顺序分批推送。每批走单独的 AJAX，不会卡住后台页面。<strong>请先测试连接</strong>。</p>

                <div id="us-ping-result" style="margin:10px 0;"></div>

                <p>
                    <button type="button" class="btn" id="us-test-btn" <?php echo $configured ? '' : 'disabled'; ?>>测试连接</button>
                    &nbsp;
                    <button type="button" class="btn" id="us-diag-btn" <?php echo $configured ? '' : 'disabled'; ?>>网络诊断</button>
                    &nbsp;
                    <button type="button" class="btn primary" id="us-push-btn" disabled>开始推送</button>
                    &nbsp;
                    <button type="button" class="btn" id="us-retry-btn" style="display:none;">重试</button>
                </p>

                <div id="us-diag-result" style="display:none;max-width:900px;margin-top:12px;background:#0f172a;color:#e2e8f0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.6;max-height:520px;overflow:auto;padding:16px;"></div>

                <div id="us-progress" style="max-width:720px;margin-top:14px;">
                <?php foreach ($resources as $r): ?>
                    <div class="us-row" data-resource="<?php echo htmlspecialchars($r); ?>" style="display:flex;align-items:center;gap:12px;margin:8px 0;">
                        <span style="width:90px;font-weight:600;"><?php echo htmlspecialchars($r); ?></span>
                        <div style="flex:1;border:2px solid #c3c4c7;background:#f0f0f1;height:16px;overflow:hidden;">
                            <div class="us-bar" style="width:0;height:100%;background:#0052D9;transition:width 0.3s ease;"></div>
                        </div>
                        <span class="us-label" style="min-width:120px;text-align:right;font-variant-numeric:tabular-nums;color:#50575e;">0 / 0</span>
                    </div>
                <?php endforeach; ?>
                </div>

                <div id="us-complete-link" style="margin-top:12px;display:none;"></div>

                <h3 style="margin-top:24px;">实时日志</h3>
                <div id="us-live-log" style="background:#1e293b;color:#e2e8f0;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;line-height:1.6;max-height:300px;overflow-y:auto;padding:12px;max-width:720px;">
                    <div style="color:#64748b;">等待开始…</div>
                </div>

                <?php if ($lastRun): ?>
                <h3 style="margin-top:24px;">最近一次同步</h3>
                <p>
                    <strong>动作：</strong><?php echo htmlspecialchars($lastRun['action']); ?>
                    &nbsp;|&nbsp; <strong>状态：</strong><?php echo htmlspecialchars($lastRun['status']); ?>
                    &nbsp;|&nbsp; <strong>开始：</strong><?php echo htmlspecialchars($lastRun['started_at']); ?>
                    <?php if (!empty($lastRun['finished_at'])): ?>
                    &nbsp;|&nbsp; <strong>结束：</strong><?php echo htmlspecialchars($lastRun['finished_at']); ?>
                    <?php endif; ?>
                </p>
                <table class="typecho-list-table">
                    <thead><tr><th style="width:160px;">时间</th><th style="width:80px;">级别</th><th>消息</th></tr></thead>
                    <tbody>
                    <?php foreach ((array)$lastRun['messages'] as $m): ?>
                        <tr><td><?php echo htmlspecialchars($m['time']); ?></td><td><?php echo htmlspecialchars($m['level']); ?></td><td><?php echo htmlspecialchars($m['message']); ?></td></tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<script>
(function() {
    var actionBase = <?php echo json_encode($actionBase); ?>;
    var remoteToolsUrl = <?php echo json_encode($remoteTab); ?>;
    var testBtn = document.getElementById('us-test-btn');
    var diagBtn = document.getElementById('us-diag-btn');
    var pushBtn = document.getElementById('us-push-btn');
    var retryBtn = document.getElementById('us-retry-btn');
    var pingOut = document.getElementById('us-ping-result');
    var diagOut = document.getElementById('us-diag-result');
    var logEl = document.getElementById('us-live-log');
    var completeLinkEl = document.getElementById('us-complete-link');
    var resumeState = null;

    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function now() {
        var d = new Date();
        return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }
    function log(message, level) {
        if (logEl.firstChild && logEl.firstChild.style && logEl.firstChild.style.color === 'rgb(100, 116, 139)') {
            logEl.innerHTML = '';
        }
        var color = '#e2e8f0';
        if (level === 'error') color = '#f87171';
        else if (level === 'warning') color = '#fbbf24';
        else if (level === 'success') color = '#4ade80';
        else if (level === 'info') color = '#93c5fd';
        var line = document.createElement('div');
        line.style.color = color;
        line.textContent = '[' + now() + '] ' + message;
        logEl.appendChild(line);
        logEl.scrollTop = logEl.scrollHeight;
    }
    function setBar(resource, pushed, total) {
        var row = document.querySelector('.us-row[data-resource="' + resource + '"]');
        if (!row) return;
        var bar = row.querySelector('.us-bar');
        var label = row.querySelector('.us-label');
        var pct = total > 0 ? Math.min(100, Math.round((pushed / total) * 100)) : (pushed === 0 ? 100 : 0);
        bar.style.width = pct + '%';
        if (total === 0) {
            label.textContent = '0 / 0 (跳过)';
            bar.style.background = '#94a3b8';
        } else if (pushed >= total) {
            label.textContent = total + ' / ' + total;
            bar.style.background = '#16a34a';
        } else {
            label.textContent = pushed + ' / ' + total;
            bar.style.background = '#0052D9';
        }
    }
    function resetBars(plan) {
        for (var i = 0; i < plan.length; i++) {
            var row = document.querySelector('.us-row[data-resource="' + plan[i].resource + '"]');
            if (!row) continue;
            row.querySelector('.us-bar').style.width = '0';
            row.querySelector('.us-bar').style.background = '#0052D9';
            row.querySelector('.us-label').textContent = '0 / ' + plan[i].total;
        }
    }
    function call(action, payload) {
        var fd = new FormData();
        if (payload) {
            for (var k in payload) if (Object.prototype.hasOwnProperty.call(payload, k)) fd.append(k, payload[k]);
        }
        var url = actionBase + '?do=' + encodeURIComponent(action);
        return fetch(url, { method: 'POST', credentials: 'same-origin', body: fd })
            .then(function(r) { return r.json().then(function(j) { return { status: r.status, json: j }; }); });
    }
    function busy(b) {
        pushBtn.disabled = b;
        pushBtn.textContent = b ? '推送中…' : '开始推送';
    }
    function startSync() {
        completeLinkEl.style.display = 'none';
        completeLinkEl.innerHTML = '';
        retryBtn.style.display = 'none';
        resumeState = null;
        busy(true);
        log('准备同步…', 'info');
        call('prepare').then(function(res) {
            if (!res.json.success) {
                log('prepare 失败：' + (res.json.data && res.json.data.message || '未知错误'), 'error');
                busy(false);
                return;
            }
            var jobId = res.json.data.job_id;
            var plan = res.json.data.plan || [];
            var batchSize = res.json.data.batch_size || 100;
            log('job_id = ' + jobId + '，batch_size = ' + batchSize, 'info');
            resetBars(plan);
            run(jobId, plan, 0, 0, 1, batchSize);
        }).catch(function(e) { log('prepare 请求失败：' + e.message, 'error'); busy(false); });
    }
    function run(jobId, plan, idx, offset, batchNo, batchSize) {
        resumeState = { jobId: jobId, plan: plan, idx: idx, offset: offset, batchNo: batchNo, batchSize: batchSize };
        if (idx >= plan.length) { complete(jobId); return; }
        var item = plan[idx];
        if (!item || item.total <= 0) {
            setBar(item ? item.resource : '', 0, 0);
            log((item ? item.resource : '') + ' 无数据，跳过', 'info');
            run(jobId, plan, idx + 1, 0, 1, batchSize);
            return;
        }
        call('batch', { resource: item.resource, job_id: jobId, offset: offset, batch_no: batchNo }).then(function(res) {
            if (!res.json.success) {
                log(item.resource + ' 批次 ' + batchNo + ' 失败：' + (res.json.data && res.json.data.message || '未知错误'), 'error');
                retryBtn.style.display = '';
                busy(false);
                return;
            }
            var data = res.json.data || {};
            var pushed = data.pushed || 0;
            var cumulative = offset + pushed;
            setBar(item.resource, Math.min(cumulative, item.total), item.total);
            if (pushed > 0) log(item.resource + ' 批次 ' + batchNo + ' 推送 ' + pushed + ' 条 (累计 ' + cumulative + '/' + item.total + ')', 'info');
            if (data.resource_done) {
                setBar(item.resource, item.total, item.total);
                log(item.resource + ' 完成', 'success');
                run(jobId, plan, idx + 1, 0, 1, batchSize);
            } else {
                run(jobId, plan, idx, offset + batchSize, batchNo + 1, batchSize);
            }
        }).catch(function(e) {
            log(item.resource + ' 批次 ' + batchNo + ' 请求失败：' + e.message, 'error');
            retryBtn.style.display = '';
            busy(false);
        });
    }
    function complete(jobId) {
        log('调用 /finish …', 'info');
        call('complete', { job_id: jobId }).then(function(res) {
            if (!res.json.success) {
                log('/finish 失败：' + (res.json.data && res.json.data.message || '未知错误'), 'error');
                retryBtn.style.display = '';
                busy(false);
                return;
            }
            log('同步完成！', 'success');
            resumeState = null;
            busy(false);
            pushBtn.disabled = true;
            pushBtn.textContent = '同步完成';
            if (remoteToolsUrl) {
                completeLinkEl.innerHTML = '<div style="padding:8px 12px;background:#dcfce7;border:1px solid #86efac;color:#166534;">同步完成。前往 <a href="' + remoteToolsUrl + '" target="_blank" rel="noopener">目标站 Typecho 同步</a> 页面查看媒体下载进度。</div>';
            } else {
                completeLinkEl.innerHTML = '<div style="padding:8px 12px;background:#dcfce7;border:1px solid #86efac;color:#166534;">同步完成，请去目标站后台「工具 → Typecho 同步」查看媒体下载进度。</div>';
            }
            completeLinkEl.style.display = '';
        }).catch(function(e) {
            log('/finish 请求失败：' + e.message, 'error');
            retryBtn.style.display = '';
            busy(false);
        });
    }
    if (testBtn) testBtn.addEventListener('click', function() {
        testBtn.disabled = true;
        testBtn.textContent = '测试中...';
        pingOut.innerHTML = '';
        call('ping').then(function(res) {
            testBtn.disabled = false; testBtn.textContent = '测试连接';
            if (res.json.success) {
                pingOut.innerHTML = '<div style="padding:8px 12px;background:#dcfce7;border:1px solid #86efac;color:#166534;"><strong>连接成功</strong> — 站点: <code>' + (res.json.data.label || '(未命名)') + '</code></div>';
                pushBtn.disabled = false;
            } else {
                pingOut.innerHTML = '<div style="padding:8px 12px;background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;"><strong>连接失败</strong>: ' + (res.json.data && res.json.data.message || '未知错误') + '</div>';
                pushBtn.disabled = true;
            }
        }).catch(function(e) {
            testBtn.disabled = false; testBtn.textContent = '测试连接';
            pingOut.innerHTML = '<div style="padding:8px 12px;background:#fee2e2;border:1px solid #fca5a5;color:#991b1b;">请求失败: ' + e.message + '</div>';
        });
    });
    if (diagBtn) diagBtn.addEventListener('click', function() {
        diagBtn.disabled = true; diagBtn.textContent = '诊断中...';
        diagOut.style.display = 'block';
        diagOut.innerHTML = '<div style="color:#94a3b8;">running 4 cURL probes (IPv4/IPv6 × verify/no-verify) ...</div>';
        call('diag').then(function(res) {
            diagBtn.disabled = false; diagBtn.textContent = '网络诊断';
            if (!res.json.success) {
                diagOut.innerHTML = '<div style="color:#fca5a5;">' + (res.json.data && res.json.data.message || '诊断失败') + '</div>';
                return;
            }
            var r = res.json.data;
            function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }
            var html = '';
            html += '<div style="color:#94a3b8;margin-bottom:8px;">probe: <span style="color:#e2e8f0;">' + esc(r.url) + '</span></div>';
            html += '<div style="color:#94a3b8;margin-bottom:8px;">PHP ' + esc(r.php_version) + ' · cURL ' + esc(r.curl_version) + '</div>';
            html += '<div style="color:#94a3b8;margin-bottom:8px;">DNS A: ' + esc(JSON.stringify(r.dns.A)) + ' · AAAA: ' + esc(JSON.stringify(r.dns.AAAA)) + '</div>';
            html += '<hr style="border-color:#334155;margin:10px 0;" />';
            r.tests.forEach(function(t) {
                var color = t.ok ? '#86efac' : '#fca5a5';
                html += '<div style="margin-bottom:14px;">';
                html += '<div style="color:' + color + ';font-weight:700;">' + esc(t.label) + ' — ' + (t.ok ? 'OK http ' + t.http_code : 'FAIL (errno=' + t.errno + ') ' + esc(t.error)) + '</div>';
                html += '<div style="color:#cbd5e1;">ip=' + esc(t.primary_ip || '-') + ' · dns=' + t.t_dns_ms + 'ms · connect=' + t.t_connect_ms + 'ms · tls=' + t.t_tls_ms + 'ms · total=' + t.t_total_ms + 'ms · bytes=' + t.bytes + '</div>';
                if (t.body_preview) html += '<div style="color:#64748b;margin-top:4px;">body: ' + esc(t.body_preview) + '</div>';
                html += '</div>';
            });
            diagOut.innerHTML = html;
        }).catch(function(e) {
            diagBtn.disabled = false; diagBtn.textContent = '网络诊断';
            diagOut.innerHTML = '<div style="color:#fca5a5;">请求失败: ' + e.message + '</div>';
        });
    });
    if (pushBtn) pushBtn.addEventListener('click', startSync);
    if (retryBtn) retryBtn.addEventListener('click', function() {
        if (!resumeState) { startSync(); return; }
        retryBtn.style.display = 'none';
        busy(true);
        log('从 ' + resumeState.plan[resumeState.idx].resource + ' offset=' + resumeState.offset + ' 重试…', 'warning');
        run(resumeState.jobId, resumeState.plan, resumeState.idx, resumeState.offset, resumeState.batchNo, resumeState.batchSize);
    });
})();
</script>

<?php include 'copyright.php'; include 'common-js.php'; include 'footer.php'; ?>
