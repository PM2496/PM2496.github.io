# 余白 · 个人博客

一个仿照 DeepSeek Harness 界面气质搭建的静态个人博客。左侧是文章分类与文章目录，右侧以对话式排版阅读文章：标题靠右，像一次提问；正文靠左，像一次完整的回答。

## 功能

- **文章分类目录**：新建、重命名、删除分类；删除分类时文章会移入「未分类」。
- **文章管理**：新建、编辑、发布/存为草稿、删除文章，支持 Markdown 正文。
- **搜索、筛选、排序**：搜索标题、摘要、标签和正文；按全部/已发布/草稿筛选；按最近更新、最早发布或标题排序。
- **对话式阅读区**：文章标题在右侧气泡中，正文在左侧，沿用 Harness 的留白、圆角和层级节奏。
- **浏览器本地存储**：文章、分类和外观设置自动保存在 `localStorage`，刷新不丢失。
- **导入导出**：支持导出全部文章与分类的 JSON 备份，也支持单篇 Markdown 导出与 JSON 导入。
- **深色模式与响应式布局**：浅色、深色、跟随系统三种外观；移动端侧栏变为抽屉。
- **键盘快捷键**：`/` 搜索，`N` 新建文章，`Esc` 关闭弹层，`Alt + ←/→` 切换上一篇/下一篇，编辑器内 `Ctrl/⌘ + Enter` 保存。

## 本地运行

这是纯静态站点，没有构建步骤。可以直接双击 `index.html`，或用任意静态服务器打开：

```bash
python -m http.server 8000
# 打开 http://127.0.0.1:8000
```

## 发布到 GitHub Pages

仓库已包含 `.github/workflows/pages.yml`。把代码推送到 `main` 后：

1. 打开仓库的 **Settings → Pages**。
2. 在 **Build and deployment** 中将 Source 设为 **GitHub Actions**。
3. 等待 `Deploy blog to GitHub Pages` 工作流完成。

站点使用相对路径和 hash 路由，因此用户站点（`username.github.io`）和项目站点（`username.github.io/repo`）都可以直接部署。

## 修改示例内容

示例文章在 `assets/data.js` 中，包含分类、文章正文、标签和日期。可以直接编辑这个文件来准备初始内容；也可以只在浏览器中写作，然后从设置菜单导出 JSON 备份。

站点名称、作者名、简介在 `assets/data.js` 的 `site` 字段中修改：

```js
site: {
  title: '余白',
  subtitle: 'WORDS IN MARGIN',
  tagline: '把想法写下来，让时间慢一点。',
  author: '林白',
  role: '写作者 · 杭州'
}
```

> 浏览器本地存储是按浏览器隔离的。清空浏览器数据前，记得先导出备份。

## 文件结构

```text
.
├── index.html                  # 页面骨架与图标精灵
├── assets/
│   ├── styles.css              # 设计令牌、布局、响应式与打印样式
│   ├── app.js                  # 状态、Markdown、交互与本地持久化
│   ├── data.js                 # 示例分类和文章
│   └── favicon.svg
├── .github/workflows/pages.yml # GitHub Pages 部署
└── build-blog.md               # 原始任务说明
```

## 设计说明

界面沿用了 DeepSeek Harness 的视觉语言：280px 侧栏、`#f9fafb` 的浅色工作区、`#4176e6` 的强调色、细边框、20px 用户气泡圆角，以及低干扰的滚动条和按钮。文章区在此基础上加入了一点编辑感：标题使用衬线字体，正文保持系统无衬线字体，让长文更易读。
