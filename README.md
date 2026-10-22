# 数学学习桥 · Obsidian 插件测试版 0.1.0

把 Netlify 数学复习台 / 工作台导出的资料，转成 Obsidian 中可以直接阅读的章节笔记、关联链接和章节 Canvas。日常只需「导出 → 导入 → 打开学习首页」。

这是一个资料导入插件。AI 可以帮助开发和整理资料；插件运行本身不调用模型、不需要 API 密钥。GitHub 用于存放代码和安装版本，导入的学习资料保存在自己的 Obsidian 笔记库。

## 已实现

- 高等代数、数学分析两个入口；沿用资料中的章节编号和稳定 ID。
- 导入复习台 `math-review` JSON，保留知识点、追问、章节树、相关节点、历史诊断和折叠自测答案。
- 导入工作台 `gaodai-handoff` ZIP / JSON，生成题目、作答记录和草稿；ZIP 内的手写图片按原引用关联。
- 导入 `gaodai-feedback` JSON / ZIP，生成逐题讲解、诊断、方法卡和下一轮检验计划。
- 原样保留原始 JSON；未专门展示的字段仍可在「导入原文」查看。
- 保留 LaTeX，转换 `\(...\)` / `\[...\]` 为 Obsidian 的美元符号定界格式。
- 重复导入合并同一 ID。来源内容更新时，保留每页导入区之外的「我的笔记」。如果修改了导入区，而来源也更新了，新版本写入 `_冲突`，原笔记保留。
- 使用 Obsidian Vault API 和浏览器 ZIP 解码；不使用 Node/Electron 文件 API。清单声明支持移动端，**尚未在真实 iPad / Obsidian 上验证**。

## 日常使用

1. 在原来的复习台 / 工作台选择导出。复习资料选择 JSON；含手写图片的交接资料选择 ZIP。
2. 在 Obsidian 命令面板搜索「数学学习桥：导入复习资料」。也可以点击侧边栏的书本图标。
3. 选择文件，查看识别数量，点击「导入到 Obsidian」。可以同时选择复习资料、交接包和 AI 反馈。
4. 打开 `数学学习桥/首页.md`，选择学科，再点击章节。章节目录里有「打开章节关系画布」。
5. 在笔记末尾的「我的笔记」补充自己的理解。下次导入会保留这里的内容。

导入区由 `<!-- msb:... -->` 标记界定。已有自行改动不会被强制覆盖；插件不删除旧条目。讲解导入不会自动变成「已经独立掌握」。

同一章节在复习台和工作台的 ID 可能不同，本版分别放在「章节复习」「做题反馈」里，保留各自编号，不猜测两个编号是否等价。

## 安装

本仓库提供源码和已构建的 `main.js`。源码不包含个人题库、作答、手稿或真实测试输入。**插件尚未进入 Obsidian 社区插件目录。**

### iPad：仓库发布后通过 BRAT 安装

1. GitHub 仓库准备好后，创建名为 `0.1.0` 的 Release，将本项目根目录的 `main.js`、`manifest.json`、`styles.css` 作为 Release 附件上传。只上传 ZIP 源码压缩包不够。
2. 在 Obsidian「设置 → 第三方插件」安装并启用 **BRAT**。
3. 运行 **BRAT: Add a beta plugin for testing**，粘贴实际仓库链接，完成安装后启用「数学学习桥」。
4. 私有仓库需要在 BRAT 中另行设置具备读取该仓库权限的凭据；不要把凭据写进本插件或发到聊天中。公开代码仓库可以简化安装，但须由仓库所有者决定可见性。

GitHub Release 和 BRAT 属于一次性安装步骤，日常导入无需操作 GitHub。

BRAT 作者的安装说明：https://tfthacker.com/brat-quick-guide

### 电脑：手动安装测试

1. 先创建一个空白测试笔记库。
2. 将 `main.js`、`manifest.json`、`styles.css` 放在这个库的配置目录 `plugins/math-study-bridge/` 内。默认完整位置是 `<笔记库>/.obsidian/plugins/math-study-bridge/`；如果自行更改过配置目录，请使用实际目录。
3. 重启 Obsidian，开启第三方插件，启用「数学学习桥」。
4. 先导入 `examples/demo.math-review.json`，确认显示后再导入实际资料。

## 支持范围

| 内容 | 格式与要求 |
| --- | --- |
| 复习资料 | `format: math-review`；版本 1/2；必须有 `chapters`、`nodes` 数组。真实资料验证使用 v2。 |
| 工作台交接 | `format: gaodai-handoff`；版本 1；必须有 `chapterId` 和 `questionIndex`。 |
| 逐题反馈 | `format: gaodai-feedback`；版本 1/2；必须有稳定的 `id`、`chapterId`。真实资料验证使用 v2。 |
| 图片 | 交接 ZIP 的 `media[].photoId/path` 和作答 `photoIds`；PNG、JPG、GIF、WebP。 |
| 输入限制 | 单文件不超过 32 MB；每次合计不超过 64 MB；ZIP 展开合计不超过 80 MB、单条目不超过 16 MB。 |

本版不接收任意 HTML、扫描 PDF、未知的全库备份格式或嵌套 ZIP；这些文件不能仅通过改后缀变成兼容资料。数学分析可使用同一 `math-review` 格式并将章节 `subjectId` 设为 `analysis`，示例已包含两学科。

本版是单向导入。Obsidian 内的编辑、复习状态和用时不会自动回写 Netlify；没有重做网页端的刷题、计时或记忆调度功能。网页现有使用流程不受影响。

## 给维护者

不需要安装构建依赖；ZIP 浏览器库已随源码附带。Node.js 18 或更高版本仅用于开发，不用于移动端运行。

```sh
npm run build
npm test
```

- `src/archive.cjs`：读取文件、检查 ZIP、提取已支持的 JSON 与图片。
- `src/core.cjs`：格式适配、稳定 ID、笔记和 Canvas 生成、更新合并。
- `src/writer.cjs`：通过 Vault API 写入，使用 `Vault.process` 保留预览之后发生的编辑。
- `src/main.cjs`：导入窗口、命令和设置。
- `scripts/build.cjs`：生成 Obsidian 加载的单文件 CommonJS `main.js`。
- `vendor/jszip.min.js`：JSZip 3.10.1 浏览器发行版；许可见 `THIRD_PARTY_LICENSES.md`。

发布时更新 `manifest.json`、`package.json` 和 `versions.json`，重新构建并测试，再发布三个安装文件。不应把用户资料、插件 `data.json`、Vault 或测试手稿提交到源码仓库。

插件的 `data.json` 保存导入索引与合并基线；请在备份 Obsidian 笔记库时同时保留插件数据。若索引丢失，本版会保留未识别的旧笔记并生成冲突副本，不会按文件名强行覆盖。

## 验证状态

参见 `VALIDATION.md`。已完成真实文件的导入与重复导入验证、内部链接检查和自动测试。尚未完成原生 Obsidian / iPad 实机验证，第一次安装请使用测试笔记库。

官方开发文档：https://docs.obsidian.md/Plugins/Getting%20started/Mobile%20development

## 许可

项目代码采用 MIT License。第三方 ZIP 依赖的许可保留在 `THIRD_PARTY_LICENSES.md`。导入资料不因使用本插件而改变其原有权属或许可。
