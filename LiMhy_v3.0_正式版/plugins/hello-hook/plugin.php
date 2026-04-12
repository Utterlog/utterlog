<?php
declare(strict_types=1);

return [
    'name' => 'Hello Hook',
    'slug' => 'hello-hook',
    'version' => '2.0.0',
    'author' => 'Jason',
    'description' => 'LiMhy 官方插件：用于验证插件元信息、启用停用与 Hook 注入链路。',
    'requires' => '2.0.0',
    'settings' => [
        ['key' => 'footer_text', 'label' => '前台悬浮提示文案', 'type' => 'text', 'default' => 'Hello Hook 已生效', 'maxlength' => 80],
        ['key' => 'enable_front_badge', 'label' => '启用前台提示气泡', 'type' => 'checkbox', 'default' => 1],
    ],
];
