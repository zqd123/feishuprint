# 飞书多维表格导出/打印插件

一个在飞书多维表格（Bitable）侧边栏中使用的导出与打印工具，支持字段自由勾选、拖拽排序、记录范围控制、模板保存与应用，以及导出 Word 和直接打印等能力。

## 主要功能
- 字段管理
  - 勾选需要导出的字段
  - 拖拽调整字段顺序（支持跟随视图顺序）
- 记录范围
  - 支持“当前视图可见/视图选中/整表”三种范围
  - 可选按指定字段升/降序排序
- 模板能力
  - 关联当前数据表的模板（每个表拥有自己的模板集合）
  - 仅显示当前数据表的模板，并在切换表时默认选中第一个模板
  - 模板保存的内容包含：字段选择与顺序、自定义标题、是否显示序号列
- 打印与导出
  - 导出为 Word（docx）
  - 直接浏览器打印
  - 标题在打印与导出中均居中显示
- 表切换自动刷新
  - 监听选择变化，检测到数据表切换时自动刷新，确保状态与新表保持一致

## 环境要求
- Node.js 16+（建议 18+）
- 包管理器：npm（已提供 lock 文件）

## 快速开始
```bash
# 安装依赖
npm install

# 开发启动（默认端口 5173，可用环境变量覆盖）
npm run start
# Windows PowerShell 指定端口示例
$env:PORT=5174; npm run start
# macOS/Linux 指定端口示例
PORT=5174 npm run start
```
启动成功后，浏览器打开 http://localhost:5173/（或你指定的端口）。

## 构建打包
```bash
npm run build
```
构建产物输出在 dist/ 目录（index.html + bundle.js）。

## 作为飞书多维表格侧边栏插件使用
1. 在飞书开发者后台创建侧边栏插件，配置“上线地址”为你部署后的 HTTPS 地址（开发阶段可用本地代理/内网穿透，正式推荐 GitHub Pages 或自部署）。
2. 打开多维表格，在对应表格中从侧边栏打开插件即可使用。
3. 切换数据表时组件会自动刷新，确保载入新表的字段与记录。

## 模板能力说明
- 模板与“数据表 ID”绑定：在某个表保存的模板只会在该表显示。
- 下拉只展示当前表的模板，并在有模板时自动选中第一个。
- 模板保存内容：
  - 字段选择列表
  - 字段顺序
  - 自定义标题
  - 是否显示序号列
- 模板数据存储在浏览器 localStorage 中（键名：export_print_templates_v1）。

## 打印与导出
- 打印：点击“打印”按钮会新开窗口并自动调用浏览器打印。标题使用居中样式。
- 导出 Word：点击“导出 Word”生成 docx 文件并下载。标题使用居中样式（docx 段落 AlignmentType.CENTER）。

## 常见问题
- 打印窗口被拦截：浏览器可能拦截弹窗，请允许本页面弹出窗口。
- 没看到字段：可点击“刷新字段”按钮，或稍后重试（受多维表格权限/网络影响）。
- 模板跨表共享：当前按表隔离。如需跨表共享或“表+视图”维度的模板，可在 issue 中提出需求。

## 部署到 GitHub Pages（可选）
最简单的方式是使用 gh-pages：
```bash
npm i -D gh-pages
```
在 package.json 增加脚本：
```json
{
  "scripts": {
    "predeploy": "npm run build",
    "deploy": "gh-pages -d dist"
  }
}
```
然后执行：
```bash
npm run deploy
```
部署成功后，在 GitHub 仓库 Settings > Pages 查看访问地址（通常是 https://<你的用户名>.github.io/<仓库名>/ ）。

也可以使用 GitHub Actions 配置自动化部署（push 到 main 自动构建并发布）。

## 目录结构
```
├── src/            # 源码（React + TypeScript）
│   ├── index.html
│   └── index.tsx
├── dist/           # 构建产物
├── webpack.config.js
├── tsconfig.json
├── package.json
└── Base-js-sdk-docs.md 等
```

## 开源许可
MIT License