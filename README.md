# AI 陪伴助手 HTML 版

这是小红书首发用的第一版源码：一个移动端恋爱陪伴聊天页。前端零依赖，支持通过 PHP 代理提供 10 次赠送聊天额度。

## 已实现

- 手机聊天主界面
- 可收缩配置侧栏
- 多角色恋爱陪伴，支持女生 / 男生按钮切换
- Skill 清单自动加载，方便服务器长期新增角色
- 可选择关系设定
- DeepSeek Chat Completions API 接入
- 流式输出
- 未填写 API Key 时，可走服务器代理体验 10 次
- API Key 保存到当前浏览器 `localStorage`
- 男生浅蓝主题、女生浅粉主题

## 目录结构

```text
ai-companion-html-v1/
├─ index.html
├─ api/
│  ├─ chat.php
│  ├─ config.example.php
│  └─ storage/
├─ assets/
│  ├─ css/
│  │  └─ styles.css
│  ├─ js/
│  │  └─ app.js
│  └─ skills/
│     ├─ manifest.json
│     ├─ sweet-girl.js
│     ├─ gentle-girl.js
│     ├─ dongbei-yujie.js
│     ├─ celeb-yu-shuxin.js
│     ├─ celeb-zhao-lusi.js
│     ├─ celeb-dilireba.js
│     ├─ celeb-yang-mi.js
│     ├─ celeb-tian-xiwei.js
│     ├─ celeb-li-xueqin.js
│     ├─ sunny-boy.js
│     ├─ tong-jincheng.js
│     ├─ idol-ma-jiaqi.js
│     ├─ idol-ding-chengxin.js
│     ├─ idol-song-yaxuan.js
│     ├─ idol-zhang-zhenyuan.js
│     ├─ idol-yan-haoxiang.js
│     ├─ idol-he-junlin.js
│     ├─ idol-liu-yaowen.js
│     ├─ idol-korean-boyfriend.js
│     ├─ celeb-xiao-zhan.js
│     ├─ celeb-wang-yibo.js
│     ├─ celeb-tan-jianci.js
│     └─ celeb-liu-yuning.js
```

## 内置角色

女生：

- 甜妹小鹿
- 温柔姐姐
- 东北雨姐型·豪爽大姐
- 虞书欣型·夹子甜妹
- 赵露思型·元气甜心
- 迪丽热巴型·浓颜御姐
- 杨幂型·清醒姐姐
- 田曦薇型·甜酷小太阳
- 李雪琴型·东北嘴替

男生：

- 年下小狗
- 童锦程
- 马嘉祺型·清冷队长
- 丁程鑫型·舞台热恋感
- 宋亚轩型·阳光治愈系
- 张真源型·温厚安全感
- 严浩翔型·猫系拽哥
- 贺峻霖型·会聊天的梗王
- 刘耀文型·年下直球
- 韩系爱豆男友
- 肖战型·温柔男友感
- 王一博型·冷感酷哥
- 檀健次型·会撩会哄
- 刘宇宁型·低音陪伴感

## 使用方式

部署到服务器时，把整个 `ai-companion-html-v1` 目录上传到支持 PHP 的站点，例如 Nginx + PHP-FPM、Apache、宝塔 PHP 站点。

如果要启用“默认赠送 10 次聊天机会”，不要把你的 DeepSeek API Key 写进前端文件。推荐二选一：

1. 在服务器环境变量里设置：

```text
DEEPSEEK_API_KEY=sk-你的Key
```

2. 或复制 `api/config.example.php` 为 `api/config.php`，然后填写：

```php
<?php
return [
    'deepseek_api_key' => 'sk-你的Key',
    'free_quota_limit' => 10,
];
```

用户未填写 Key 时，请求会走：

```text
POST ./api/chat.php
```

超过 10 次后，页面会提示用户填写自己的 DeepSeek API Key。

用户也可以在侧栏填写自己的：

- `API Key`：你的 DeepSeek API Key
- `Model`：在 `deepseek-v4-flash` 和 `deepseek-v4-pro` 之间选择

填写自己的 API Key 后，页面会直接请求：

```text
POST https://api.deepseek.com/chat/completions
```

服务器代理只保存赠送次数计数，不保存聊天记录。聊天记录仍然只保存在当前浏览器本地。

## 新增角色 Skill


1. 在 `assets/skills/` 下新建一个角色文件，例如 `new-role.js`。
2. 在 `assets/skills/manifest.json` 里加入：

```json
{ "id": "new_role", "file": "new-role.js" }
```

角色文件格式参考现有 skill：

```js
(function () {
  window.AI_COMPANION_SKILLS = window.AI_COMPANION_SKILLS || {};

  window.AI_COMPANION_SKILLS.new_role = {
    id: "new_role",
    gender: "男",
    name: "新角色",
    avatar: "✨",
    relationship: "像恋人一样陪我聊天，但保持健康边界",
    personality: "完整角色设定...",
    greeting: "开场白..."
  };
}());
```

角色名字、性格关键词、表情强度和回复长度在第一版界面中默认隐藏，由角色 Skill 自动提供。

## 注意

这一版改成 `manifest.json` 动态加载角色，适合部署在服务器上访问。直接双击 `index.html` 时，部分浏览器会限制 `file://` 下读取 JSON 清单。
