<?php
/**
 * LiMhy - 防火墙拦截阻断视图
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    渲染 WAF 或设备指纹封禁时的前端提示页面
 * @require string $blockCode 拦截响应码
 * @require string $blockMsg  拦截附言
 * @require string $clientIp  客户端溯源 IP
 */
?>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>403 Access Denied</title>
<style>
    :root { --bg:#fff0f0; --text:#000; --border:3px solid #000; --shadow:5px 5px 0 #000; --red:#ff4d4d; }
    body { background:var(--bg); color:var(--text); font-family:sans-serif; display:flex; align-items:center; justify-content:center; min-height:100vh; margin:0; padding:20px; }
    .block-card { background:#fff; border:var(--border); box-shadow:var(--shadow); border-radius:0; padding:40px; max-width:500px; width:100%; position:relative; }
    .icon { font-size:48px; display:block; margin-bottom:20px; }
    h1 { font-size:36px; font-weight:900; margin:0 0 10px 0; text-transform:uppercase; letter-spacing:-1px; }
    .reason { background:var(--text); color:#fff; display:inline-block; padding:4px 8px; font-weight:bold; font-family:monospace; margin-bottom:20px; }
    p { font-size:16px; line-height:1.6; margin-bottom:30px; }
    .meta { border-top:2px dashed #000; padding-top:20px; font-size:13px; font-family:monospace; display:flex; justify-content:space-between; }
    .btn { background:#000; color:#fff; text-decoration:none; padding:10px 20px; font-weight:bold; display:inline-block; transition:transform 0.1s; }
    .btn:active { transform:translate(2px, 2px); }
</style>
</head>
<body>
<div class="block-card">
    <div class="icon">糟了的</div>
    <h1>Access Denied</h1>
    <div class="reason"><?=htmlspecialchars($blockCode)?></div>
    <p>
        <?=htmlspecialchars($blockMsg)?><br>
        您的请求触发了安全防御系统。
    </p>
    
    <a href="/" class="btn">返回首页</a>

    <div class="meta">
        <span>IP: <?=htmlspecialchars($clientIp)?></span>
        <span>ID: <?=uniqid()?></span>
    </div>
</div>
</body>
</html>
