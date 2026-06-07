# Soul Echo AI Companion

一个适合手机端访问的恋爱陪伴 AI 聊天页。前端使用原生 HTML / CSS / JavaScript，后端只用一个 PHP 代理接口提供默认体验额度。

这个项目适合用来学习：

- AI 陪伴类产品的第一版落地形态
- 移动端玻璃质感聊天 UI
- DeepSeek Chat Completions 流式输出
- 浏览器本地保存 API Key 和历史会话
- 角色 Skill 文件拆分和动态加载
- 服务器代理赠送体验次数

## 在线能力

- 手机聊天主界面
- 可收缩配置侧栏
- 女生 / 男生角色切换
- 多角色恋爱陪伴设定
- Skill 清单自动加载，后续新增角色不用重写主逻辑
- DeepSeek `deepseek-v4-flash` / `deepseek-v4-pro` 二选一
- 流式输出
- 未填写 API Key 时，走服务器代理体验 10 次
- 用户自己的 API Key 只保存到当前浏览器 `localStorage`
- 历史会话只保存在当前浏览器本地

## 目录结构

```text
.
├─ index.html
├─ api/
│  ├─ chat.php
│  ├─ config.example.php
│  └─ wechat_article.php
└─ assets/
   ├─ css/
   │  └─ styles.css
   ├─ img/
   │  ├─ deepseek-color.svg
   │  └─ dx-logo.svg
   ├─ js/
   │  └─ app.js
   └─ skills/
      ├─ manifest.json
      └─ *.js
```

## 部署方式

把整个项目上传到支持 PHP 的站点目录，例如：

- Nginx + PHP-FPM
- Apache + PHP
- 宝塔 PHP 站点

浏览器访问站点根目录即可。

不要直接双击 `index.html` 运行。角色清单通过 `fetch()` 加载，部分浏览器会限制 `file://` 读取本地 JSON。

## 配置 DeepSeek Key

如果只允许用户填写自己的 Key，可以不配置服务器 Key。

如果要启用“默认赠送 10 次聊天机会”，推荐在服务器上配置环境变量：

```text
DEEPSEEK_API_KEY=sk-your-key
FREE_QUOTA_LIMIT=10
```

也可以复制示例配置：

```bash
cp api/config.example.php api/config.php
```

然后填写：

```php
<?php
return [
    'deepseek_api_key' => 'sk-your-key',
    'free_quota_limit' => 10,
];
```

`api/config.php` 不要提交到 GitHub。

## 接口说明

用户填写自己的 API Key 时，前端直接请求：

```text
POST https://api.deepseek.com/chat/completions
```

用户未填写 API Key 时，前端请求：

```text
POST ./api/chat.php
```

`chat.php` 会：

- 校验请求体
- 读取服务器 DeepSeek Key
- 按浏览器 Cookie 记录赠送次数
- 转发 DeepSeek 流式响应
- 不保存聊天记录

## 新增角色

1. 在 `assets/skills/` 新建角色文件，例如 `new-role.js`。
2. 在 `assets/skills/manifest.json` 加入：

```json
{ "id": "new_role", "file": "new-role.js" }
```

角色文件格式：

```js
(function () {
  window.AI_COMPANION_SKILLS = window.AI_COMPANION_SKILLS || {};

  window.AI_COMPANION_SKILLS.new_role = {
    id: "new_role",
    gender: "女",
    name: "新角色",
    avatar: "✨",
    relationship: "像恋人一样陪我聊天，但保持健康边界",
    personality: "完整角色设定...",
    greeting: "开场白..."
  };
}());
```

## 隐私说明

- 用户填写的 API Key 只保存在当前浏览器本地。
- 历史会话只保存在当前浏览器本地。
- 服务器代理只记录赠送次数，不保存聊天正文。
- 清空历史后，当前浏览器里的会话记录会被移除。

## 版权与角色说明

本项目由 Poppis 个人设计、开发与整理，仅供学习和个人体验使用。

所有角色均为虚构 AI 设定，不代表真人本人、经纪公司或官方授权。涉及的名称、图标和公开风格参考归原权利方所有，仅用于演示 AI 角色设定效果。

未经允许，请勿搬运、售卖或用于商业用途。
