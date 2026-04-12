<?php
/**
 * 邮件通知模板 (Neo-Brutalism Style)
 * 变更：兼容“新评论通知管理员”与“回复通知普通用户”双重模式
 */

// 1. 智能判定发信人与文案
if (isset($isReply) && $isReply) {
    // 场景 A：有人回复了某人的评论（带上引用框）
    $displayAuthor = $replyAuthor;
    $displayEmail  = $replyEmail ?? '';
    $displayTitle  = "您在【" . htmlspecialchars($postTitle) . "】的评论收到了新回复";
} else {
    // 场景 B：全新评论，直接发给管理员（无引用框）
    $displayAuthor = $commentAuthor ?? '访客';
    $displayEmail  = $commentEmail ?? '';
    $displayTitle  = "您的文章【" . htmlspecialchars($postTitle) . "】有了新评论";
}

// 2. 动态头像与签名
$avatarUrl = get_avatar_url($displayEmail, $displayAuthor);
$signatureUrl = rtrim($siteUrl, '/') . '/assets/img/Jason.png';
$currentTime = date('Y-m-d H:i');

?>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>新通知</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
    
    <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f4f5; padding: 20px;">
        <tr>
            <td align="center">
                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border: 3px solid #000000; border-radius: 0;">
                    
                    <tr>
                        <td align="center" style="padding-top: 0;">
                            <div style="background-color: #000000; color: #ffffff; display: inline-block; padding: 10px 30px; border-bottom-left-radius: 12px; border-bottom-right-radius: 12px; font-weight: 900; font-size: 18px; letter-spacing: 1px;">
                                <?=htmlspecialchars($siteName)?>
                            </div>
                        </td>
                    </tr>

                    <tr>
                        <td style="padding: 40px 30px;">
                            
                            <!-- 用户信息行 (展示发起评论的人) -->
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 20px;">
                                <tr>
                                    <td width="50" style="vertical-align: middle;">
                                        <img src="<?=htmlspecialchars($avatarUrl)?>" alt="Avatar" width="40" height="40" style="border-radius: 50%; border: 2px solid #000000; display: block;">
                                    </td>
                                    <td style="vertical-align: middle; padding-left: 10px;">
                                        <span style="font-size: 20px; font-weight: 800; color: #000000;">
                                            <?=htmlspecialchars($displayAuthor)?>
                                        </span>
                                    </td>
                                </tr>
                            </table>

                            <!-- 提示标题 -->
                            <div style="font-size: 16px; font-weight: 700; color: #000000; margin-bottom: 24px; line-height: 1.5;">
                                <?=$displayTitle?>
                            </div>

                            <?php if (isset($isReply) && $isReply): ?>
                                <!-- [场景 A：回复模式] -->
                                <div style="border: 2px dashed #000000; border-radius: 12px; padding: 16px; background-color: #ffffff; margin-bottom: 24px;">
                                    <div style="font-size: 14px; color: #555555; line-height: 1.6; font-style: italic;">
                                        “<?=htmlspecialchars($parentContent)?>”
                                    </div>
                                </div>

                                <div style="font-size: 16px; font-weight: 800; color: #000000; margin-bottom: 12px;">
                                    <?=htmlspecialchars($replyAuthor)?> 的回复：
                                </div>

                                <div style="border: 2px dashed #000000; border-radius: 12px; padding: 16px; background-color: #ffffff; margin-bottom: 30px; position: relative;">
                                    <div style="position: absolute; left: -2px; top: 10px; bottom: 10px; width: 6px; background-color: #000000; border-radius: 0 4px 4px 0;"></div>
                                    <div style="font-size: 15px; color: #000000; line-height: 1.6; padding-left: 10px; font-weight: 500;">
                                        <?=nl2br(htmlspecialchars($replyContent))?>
                                    </div>
                                </div>

                            <?php else: ?>
                                <!-- [场景 B：给管理员的普通留言模式] -->
                                <div style="border: 2px dashed #000000; border-radius: 12px; padding: 16px; background-color: #ffffff; margin-bottom: 30px; position: relative;">
                                    <div style="position: absolute; left: -2px; top: 10px; bottom: 10px; width: 6px; background-color: #000000; border-radius: 0 4px 4px 0;"></div>
                                    <div style="font-size: 15px; color: #000000; line-height: 1.6; padding-left: 10px; font-weight: 500;">
                                        <?=nl2br(htmlspecialchars($commentContent ?? ''))?>
                                    </div>
                                </div>
                            <?php endif; ?>

                            <!-- 底部信息区 -->
                            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom: 30px;">
                                <tr>
                                    <td valign="bottom">
                                        <img src="<?=htmlspecialchars($signatureUrl)?>" alt="Jason" width="100" style="display: block; opacity: 0.8;">
                                    </td>
                                    <td align="right" valign="bottom" style="font-size: 12px; font-weight: 700; color: #000000; font-family: monospace;">
                                        时间: <?=$currentTime?>
                                    </td>
                                </tr>
                            </table>

                            <!-- 按钮 -->
                            <table border="0" cellpadding="0" cellspacing="0" width="100%">
                                <tr>
                                    <td align="center">
                                        <a href="<?=htmlspecialchars($postUrl)?>#comments" target="_blank" style="display: inline-block; background-color: #000000; color: #ffffff; font-size: 16px; font-weight: 800; text-decoration: none; padding: 14px 30px; border-radius: 6px; border: 2px solid #000000; box-shadow: 4px 4px 0px rgba(0,0,0,0.1);">
                                            查看完整内容
                                        </a>
                                    </td>
                                </tr>
                            </table>

                        </td>
                    </tr>
                </table>

                <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin-top: 20px;">
                    <tr>
                        <td align="center" style="font-size: 12px; color: #777777; line-height: 1.6; padding: 0 10px;">
                            这封邮件是发送给特定收件人的。如果您不小心收到了此邮件，请您立即删除，并且不要以任何方式使用或分享其中的信息。
                        </td>
                    </tr>
                </table>

            </td>
        </tr>
    </table>

</body>
</html>