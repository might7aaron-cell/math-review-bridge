# math-review v2：真实导入契约与生成规范

这套文档与辅助脚本用于把不同 ChatGPT 学习窗口的内容稳定送入数学复习台和数学学习桥，不改变插件导入行为，不增加插件版本，不参与 0.1.1 Release。`authoring-v1` 是本文对**生成约定**的称呼，不是 JSON 新字段，也不是 `schemaVersion: 3`。

核对基线：2026-10-24，main 提交 [`e0bfc8156e42cee715d37731a2e922acbe2ef337`](https://github.com/might7aaron-cell/math-review-bridge/commit/e0bfc8156e42cee715d37731a2e922acbe2ef337)。该基线已含 PR #1 的 0.1.1 显示修复；当时已发布的安装包仍为 0.1.0。本工作只在独立分支添加生成资料工具。

## 依据与适用边界

| 实现依据 | 本次核对的行为 |
| --- | --- |
| [`src/archive.cjs`](https://github.com/might7aaron-cell/math-review-bridge/blob/e0bfc8156e42cee715d37731a2e922acbe2ef337/src/archive.cjs) 的 `recognized`、`readInputs` | 输入文件扩展名、JSON解析、识别格式、大小限制、ZIP逐文件读取 |
| [`src/core.cjs`](https://github.com/might7aaron-cell/math-review-bridge/blob/e0bfc8156e42cee715d37731a2e922acbe2ef337/src/core.cjs) 的 `ingest`、`requireId`、`sections`、`selfCheck`、`md` | 字段读取、身份键、树、关联、公式定界符及正文生成 |
| 同文件的 `generate`、`reconcile`，及 [`src/writer.cjs`](https://github.com/might7aaron-cell/math-review-bridge/blob/e0bfc8156e42cee715d37731a2e922acbe2ef337/src/writer.cjs) | 章节目录、Canvas、重复导入、保留个人笔记及冲突副本 |
| [`tests/import.test.cjs`](https://github.com/might7aaron-cell/math-review-bridge/blob/e0bfc8156e42cee715d37731a2e922acbe2ef337/tests/import.test.cjs)、[`tests/display.test.cjs`](https://github.com/might7aaron-cell/math-review-bridge/blob/e0bfc8156e42cee715d37731a2e922acbe2ef337/tests/display.test.cjs) | 两学科、跨章链接、公式、重复导入、循环拒绝、显示迁移 |
| [`examples/demo.math-review.json`](../examples/demo.math-review.json) | 一个已存在的有效样本；不是完整 Schema |
| [新增校验器](../scripts/validate-math-review.cjs)、[新增测试](../tests/authoring.test.cjs) | 明确约束生成格式；不修改导入器的宽松兼容行为 |

另外核对了工作区中现有“拾阶”复习台 v2 的 `public/station/app.js`（`validatePack`、`mergeArray`、`exportData`）和 `review.schema.json`。其约束比插件严格：全局 ID、同章 group 父节点、字符串关联、正文数组等。因此以下规范取两端可用的共同格式，并进一步要求关联完整。这个前端快照不属于本仓库，未复制其代码、未修改或部署该站点；其他版本仍需先做小样导入。旧 `math-review-chapter` / `math-review-backup` 与本格式不是同一种包。

## 实现接受什么，与我们要求生成什么

| 项目 | 插件真实行为 | 本生成规范（脚本会执行） |
| --- | --- | --- |
| 根对象 | 读取 `format: math-review`；`Number(schemaVersion || 1)` 允许1/2；需要 chapters/nodes 数组 | 必须准确写 `format: "math-review"`、数字 `schemaVersion: 2` |
| 顶层字段 | id 用于原始文件名；title 不生成独立正文；其他未知字段通常被忽略 | 只允许 format、schemaVersion、id、title、coverage、chapters、nodes；id/title/coverage 可选，提示词要求提供 |
| 章节 | id 有效；subjectId/subject 可回退到根对象，缺省偏向高代；title 可回退到id | id、subjectId、title 必填；subjectId 只用 algebra / analysis；禁止靠默认学科猜测 |
| 节点 | id、可解析的 chapterId 必需；title可回退；kind映射 group→目录、knowledge→知识点、question→追问，其他值可透传 | 必填 id、chapterId、kind、title、sections；kind只取这三种。**sections 是字段，不是节点类型** |
| ID | 非空字符串、最长300；章节按学科+id，节点按学科+章+id区分 | 全包章节 ID 各自唯一、节点 ID 各自唯一，跨学科也不能重名；字母开头，仅字母数字 `_ . -`，最长120；禁用 constructor/prototype/__proto__ |
| 层级 | parentId只在同一学科/章节的记录空间解析；父缺失警告并暂列根目录；循环拒绝；没有要求父类型必须group | 根节点省略parentId或null；其余必须指向**本包同章group**；无循环，最多32层，建议2–4层 |
| related | 数组元素可以是字符串或含id对象；只读取对象的id；本章优先，其次当前JSON中唯一同id节点；未解析给警告 | 只用字符串ID，必须在最终同一JSON里存在；禁止重复和自关联；允许跨章跨学科的有向关系 |
| 正文 | 读取 summary/question/evidence、sections[].title/body、selfCheck、historicalDiagnosis、source、tags | 文本必须为字符串；严格检查已知字段，未知字段报错，防止正文被无声忽略 |
| 更新 | 同一来源+学科+章节+节点ID更新记录；不删除旧条目；本次review正文整体重建 | 旧ID与所属章保持稳定；更新节点提供完整正文，不只提供新增一句话；更新文件不是删除指令 |

**“严格校验失败”不等于“旧插件一定拒绝”。** 例如旧资料使用自定义kind、较长ID或`related:[{"id":"..."}]`，插件可能接受，但不属于新的可复用生成约定。不要为通过检查批量重命名现有 ID；先确认历史包和迁移影响。

## 字段表

长度按 JavaScript 字符串长度计。以下文本除摘要/可选说明可为空外应有实际内容。空包 `chapters:[], nodes:[]` 可通过但会警告“没有可学习内容”，适用于无可见资料时明确留空。

| 位置 | 字段与要求 |
| --- | --- |
| 根对象 | 必需 format、schemaVersion、chapters（≤200）、nodes（≤5000）；可选 id、title、coverage。coverage仅辅助记录可见来源范围，插件不将它写入知识正文，因此重要出处也写到节点source/evidence |
| chapter | 必需 id、subjectId、title（≤200）；可选 description（≤200000）、number（1–100整数）。number是原有章节编号，不要把窗口号伪装成教材章节号；插件不单独显示number，标题中保留实际小节编号 |
| node | 必需 id、chapterId、kind、title（≤500）、sections；可选 subjectId（若填，须与章节一致）、parentId、summary（≤4000）、question/evidence（各≤200000）、related、selfCheck、source、tags、historicalDiagnosis |
| sections | ≤100个对象，每项只有 title（≤300）、body（≤200000）；group可用[]；非group无正文时给警告 |
| related | ≤100个字符串ID。方向不是自动双向；要互链则两边都写。只关联有意义的数学关系，不靠数量凑网 |
| selfCheck | 单个对象 `{ "prompt": "…", "answer": "…" }`，两者均必填、各≤200000；不是数组。多个自测另建knowledge节点或在同一prompt中编号，不能发明checks数组 |
| source | `{ "label": "来源性质", "references": ["实际文件/章节/题号或记录定位"] }`；label必需≤500；references可选≤100条、每条≤3000。插件支持更一般对象，但此结构也能供复习台显示 |
| tags | ≤100个非空字符串、每项≤200；用于“定义”“定理”“数学思想”“母题”“变式”“未检验”等分类，不是自动掌握状态 |
| historicalDiagnosis | 可选JSON对象，最多8层；字段可用 evidence/bottleneck/nextCheck/stages 等，插件会展示原记录。只放有证据的诊断；没有作答就省略。示例中的诊断明确标注教学模拟 |

不要增加 `definition`、`proof`、`formula`、`variants`、`mastery`、`progress` 等自创顶层或节点字段。定义、证明、题目与变式内容放在sections；掌握状态由实际独立检验决定，资料包不替用户填写。完整备份的progress是另一类格式，不能直接当作本规范的输入。

## 跨窗口身份与引用

1. 先把现有导出JSON或ID清单给窗口。已存在的章节与节点沿用原ID，不根据新标题重造ID，也不把旧节点移动到另一个chapterId。
2. 新内容采用`ma-`（数分）或`alg-`（高代）前缀。用主题而非日期命名，例如`ma-sequences-monotone`。窗口分工建议见[16窗口协作](multi-window-guide.md)。包id可以变，节点id不要变。
3. 每份单独导入的文件都包含自己的章节和所需父分组。树只表示同章包含关系；跨章“依赖/迁移/类比”用related，并在正文解释关系。
4. **跨章关联在当前JSON内解析，不是整个Vault的全局检索。** 同时选择两个文件、先导入目标章、或把文件打成ZIP，均不能保证跨文件的跨章related正确；插件按文档建立索引。尤其不要用`{id,chapterId,subjectId}`假装限定目标，解析器只看id。
5. 推荐独立窗口暂把未来联系写在sections的“待建立联系”，先输出可独立校验的包。汇总时拿到目标真实ID，再加入related，运行合并校验并导入**合并输出**。也可以先写跨文件真实ID，接受单文件暂报reference错误，待所有依赖文件合并后再导入。
6. 合并器将完全相同的章节/节点对象折叠为一份；同ID但内容不同会拒绝，要求选定完整版本。它不会按文件顺序猜测哪个更新。各文件本身的重复ID仍然报错。工具不删除或自动修复用户文件。
7. Canvas只画当前章节内部关联；跨章/跨学科链接会出现在笔记的“关联内容”，不会自动变成一张全学科大画布。

```sh
# 单文件：通过为0，资料错误为1，参数/读写错误为2
node scripts/validate-math-review.cjs my-chapter.json
# 多窗口：必须合成一份后导入，输出路径必须尚不存在
node scripts/validate-math-review.cjs window01.json window02.json --out combined.math-review.json
# 给自动流程读取，不改变输出包内容
node scripts/validate-math-review.cjs --json my-chapter.json
```

合并有冲突时先保留原文件，向生成窗口提供错误路径、冲突ID与两个版本，明确更新的完整节点；不要把换ID当作修复冲突的默认办法。同一JSON里允许跨科related，但父子树不能跨科。

## 数学公式与JSON转义

正文使用普通段落、换行、加粗、行内代码与标准LaTeX。不依赖HTML、Markdown表格或外部图片才能读懂；公式不要放在行内代码或代码围栏中。节点标题尽量用中文主题名，把复杂公式放正文。

| 阅读中的数学内容 | JSON文件中的字符串写法 |
| --- | --- |
| 行内极限 | `"$\\lim_{n\\to\\infty}a_n=L$"` |
| 独立公式 | `"推导：\n$$\n\\frac{1}{n}\\to0\n$$"` |
| 二阶矩阵 | `"$\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}$"` |
| 括号定界符 | `"\\(x+y\\)"` / `"\\[x+y\\]"`，插件会转为美元定界符；新包优先直接用美元格式 |

JSON文本中一个LaTeX反斜杠需写成`\\`，矩阵换行的两个LaTeX反斜杠需写成`\\\\`。字符串中的换行用`\n`；若有编程环境，优先构造普通对象再`JSON.stringify`，避免手工双重转义。

校验器拒绝JSON语法错误、重复对象键、常见控制字符损坏（例如单反斜杠`\frac`变成换页字符）。它**不是TeX解析器或数学证明器**，不能发现所有仍合法的错误转义（例如`\nabla`误变成换行加abla）、定理漏条件、错误题号或伪造学习反馈。还需读一遍公式，并在复习台与Obsidian做样例显示检查。

## 大小、检查与维护

生成文件使用 UTF-8 无 BOM。插件会剥离 BOM，但已核对的复习台直接解析 JSON，因此辅助校验器将 BOM 作为 encoding 错误，避免一端通过、一端无法读取。

辅助工具采用≤30 MiB的保守输入/合并输出限制，与已核对复习台的普通JSON限制对齐。插件自身普通文件≤32 MiB、每次≤64 MiB，ZIP展开≤80 MiB、单条目≤16 MiB；不要把这些宽松上限当作ChatGPT一次生成目标。长章节按主题小批生成，保持引用闭合；大型文件使用JSON而非含很多附件的ZIP。

无需安装依赖，Node.js 18+即可：

```sh
node scripts/validate-math-review.cjs examples/learning/analysis.math-review.json
node scripts/validate-math-review.cjs examples/learning/algebra.math-review.json
node --test tests/authoring.test.cjs
npm test
# 修改校验器后，单独刷新可选浏览器工具；不构建插件
node scripts/build-math-review-check.cjs
```

[错误夹具](../tests/fixtures/authoring/invalid)都应返回退出码1，不能用于导入。测试覆盖字段、ID、归属、循环、缺失引用、合并冲突、重复JSON键、转义损坏、CLI输出保护，以及真实`readInputs → ingest → generate → writer`链路和重复导入。已有插件测试仍照常运行；`package.json`、版本文件、`src/`与`main.js`不需要修改。
