# Blog · 个人博客

一个仿照 DeepSeek Harness 界面气质搭建的静态个人博客。左侧是文章分类与文章目录，右侧以对话式排版阅读文章：标题靠右，像一次提问；正文靠左，像一次完整的回答。

内容源现在直接使用 Markdown：只要把 `.md` 文件放进 `data/` 下的任意子文件夹，构建脚本就会递归扫描、解析 frontmatter，并生成博客使用的 `data/blog-content.json`。

## 功能

- **递归解析 Markdown**：扫描 `data/` 下所有层级的 `.md` 文件，不限制嵌套深度。
- **自动分类**：文章默认归入 `data/` 下的第一层文件夹；新文件夹会自动生成分类。
- **Markdown 图片**：图片可以放在文档旁边的子目录中，构建时会自动改写成正确的站点路径。
- **文章分类目录**：新建、重命名、删除分类；支持把网页中创建的分类样式导出为 `categories.json`；删除分类时文章会移入「未分类」。
- **文章管理**：网页端可新建、编辑、发布/存为草稿、删除文章。
- **搜索、筛选、排序**：搜索标题、摘要、标签和正文；按全部/已发布/草稿筛选；按最近更新、最早发布或标题排序。
- **浏览器本地存储**：草稿和外观设置自动保存在 `localStorage`，刷新不丢失。
- **内容版本同步**：内容文件变化后，页面会自动加载新版本，同时保留浏览器中新建的本地草稿。
- **导入导出**：支持 JSON 备份和单篇 Markdown 导出。
- **深色模式与响应式布局**：浅色、深色、跟随系统三种外观；移动端侧栏变为抽屉。

## 快速开始

```bash
npm run dev
# 打开 http://127.0.0.1:8000
```

`npm run dev` 会先构建一次内容，然后监听 `data/`。新增或修改 Markdown、图片后会自动重新生成内容文件，刷新浏览器即可看到更新。

也可以只构建内容：

```bash
npm run build
python -m http.server 8000
```

## 新建一篇 Markdown 文章

例如创建：

```text
data/tech/2026/10/my-new-post.md
```

文章会自动归入第一层文件夹 `tech` 对应的分类。文件名可以随意，建议在 frontmatter 中写一个稳定的 `id`：

```md
---
id: "my-new-post"
title: "一篇文章的标题"
date: "2026-10-21T10:00:00+08:00"
updated: "2026-10-21T10:00:00+08:00"
excerpt: "显示在目录和搜索结果中的一句话摘要。"
tags: [写作, 日常]
draft: false
---

正文从这里开始。

## 小标题

支持标题、列表、引用、代码块和 Markdown 图片。
```

### frontmatter 字段

| 字段 | 是否必填 | 说明 |
| --- | --- | --- |
| `id` | 建议 | 稳定且唯一的文章 ID；不写则由文件路径生成 |
| `title` | 建议 | 文章标题；不写时读取正文第一个 `# 标题` |
| `date` | 建议 | 发布时间；不写时尝试读取文件名日期，再退回文件修改时间 |
| `updated` | 否 | 更新时间，默认与 `date` 相同 |
| `excerpt` | 否 | 摘要，不写则自动截取正文 |
| `tags` | 否 | 标签数组或逗号分隔字符串 |
| `status` | 否 | `published` 或 `draft` |
| `draft` | 否 | 设为 `true` 时作为草稿 |
| `category` | 否 | 分类 id 或显示名称，可覆盖文件夹分类 |
| `ignore` | 否 | 设为 `true` 时跳过这个文件 |

没有 frontmatter 也可以写普通 Markdown，但建议至少提供 `title` 和 `date`。

## 图片

图片路径相对于 Markdown 文件所在目录解析。例如：

```text
data/tech/2026/10/my-new-post.md
data/tech/2026/10/images/diagram.png
```

在 Markdown 中这样引用：

```md
![示意图](images/diagram.png)
```

构建后会生成：

```md
![示意图](data/tech/2026/10/images/diagram.png)
```

图片文件会随 `data/` 目录一起部署。支持相对路径、子目录、空格和中文文件名。

## 分类

分类显示名称、颜色和描述在 `data/categories.json` 中配置：

```json
[
  {
    "id": "tech",
    "name": "技术随笔",
    "color": "#4176e6",
    "description": "关于代码、工具与产品。",
    "folder": "tech"
  }
]
```

规则：

1. 优先使用 frontmatter 的 `category`。
2. 否则使用第一层文件夹匹配 `categories.json` 中的 `folder`、`id` 或 `name`。
3. 目录没有登记时，自动用文件夹名创建分类，颜色自动分配。

### 在网页中新建的分类怎么发布样式

网页中新建或编辑分类时，名称、颜色、描述和目录名保存在当前浏览器。发布分类样式：

1. 在博客中新建分类并选好颜色、填写描述。
2. 点击左下角头像 → **导出分类配置**，下载 `categories.json`。
3. 用这个文件替换仓库中的 `data/categories.json`。
4. 在 `data/` 下创建与分类的 `folder` 字段同名的文件夹，把 Markdown 放进去。
5. 提交到 `main`，GitHub Actions 构建后分类样式会出现在线上。

网页新建分类时，`folder` 默认使用分类名称；如果希望目录用英文或其他名字，可以导出后直接修改 `categories.json` 里的 `folder` 值。导出的文件包含当前所有分类，因此可以安全地覆盖 `data/categories.json`。

## 作者名宏

作者名由 `assets/site-config.js` 中的一个宏统一控制：

```js
window.SITE_CONFIG = Object.freeze({
  author: '新的作者名'
});
```

只改这一处，侧栏作者、文章署名、JSON-LD、`<meta name="author">` 和正文里的 `{{author}}` 都会同步更新。

## 内容文件说明

- `data/`：Markdown 源文件、图片、分类配置和站点配置。
- `data/blog-content.json`：由构建脚本生成，不要手动编辑；每次构建会覆盖。
- `assets/data.js`：告诉页面读取 `../data/blog-content.json`。
- `assets/site-config.js`：作者名宏。

## 发布到 GitHub Pages

仓库已包含 `.github/workflows/pages.yml`。GitHub Actions 会自动执行：

```text
Markdown 文件 → node scripts/build-content.mjs → data/blog-content.json → GitHub Pages
```

因此每次只需要把新的 Markdown 和图片提交到仓库的 `data/` 目录，推送到 `main` 后等待 `Deploy blog to GitHub Pages` 完成即可。

## 文件结构

```text
.
├── index.html
├── assets/
│   ├── app.js
│   ├── styles.css
│   ├── data.js
│   ├── site-config.js
│   └── favicon.svg
├── data/
│   ├── categories.json
│   ├── site.json
│   ├── blog-content.json        # 自动生成
│   ├── tech/
│   │   ├── a-quiet-desk.md
│   │   └── 2026/10/
│   │       ├── my-new-post.md
│   │       └── images/
│   ├── reading/
│   ├── city/
│   ├── fragments/
│   └── notes/                   # 新文件夹会自动成为分类
├── scripts/
│   ├── build-content.mjs
│   └── dev.mjs
├── .github/workflows/pages.yml
└── package.json
```

## 设计说明

界面沿用了 DeepSeek Harness 的视觉语言：280px 侧栏、`#f9fafb` 的浅色工作区、`#4176e6` 的强调色、细边框、20px 用户气泡圆角，以及低干扰的滚动条和按钮。文章区在此基础上加入了一点编辑感：标题使用衬线字体，正文保持系统无衬线字体，让长文更易读。
