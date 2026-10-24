# 学习资料生成工具：验证记录

验证日期：2026-10-24。仓库基线main：`e0bfc8156e42cee715d37731a2e922acbe2ef337`。本记录只对应文档与辅助工具，不替代插件原有的[VALIDATION.md](../VALIDATION.md)，也不是0.1.1发布记录。

## 可重复自动验证

使用Node.js v24.22.1实际执行`npm test`：**38项通过，0项失败**，包括原有15项插件测试和新增23项生成资料测试。仓库声明的工具最低版本为Node18；新增GitHub Actions使用Node22。本地并未宣称测试过所有Node版本。

新增测试覆盖：

- 既有demo与两科完整示例通过规范；错误夹具逐个运行CLI并返回1。
- 字段类型、缺失字段、未知字段、允许kind、学科与章节归属、ID唯一性、保留名、长度边界。
- 父节点类型与章节约束、缺失父节点、循环、深度、重复关联、自关联、缺失关联。
- JSON语法、重复对象键、BOM、LaTeX误转义产生的控制字符。
- 多窗口合并后的跨章跨学科引用、输入顺序、完全相同条目折叠、冲突内容拒绝。
- CLI退出码、机器可读结果、输出不覆盖已有文件、无效输入不产生输出文件。
- 调用真实`readInputs → ingest → generate → writer`；检查笔记链接、Canvas文件/边、折叠自测、重复导入无新增/更新/冲突。
- 固定现有导入限制的契约测试：插件可透传未知kind；分文件批量导入不能保证跨章关联。
- 浏览器工具与CLI使用同一份校验器；浏览器事件脚本在DOM测试环境中验证有效下载、输入变更后结果失效、文件合并、错误时禁止下载。

```sh
node scripts/validate-math-review.cjs examples/demo.math-review.json
node scripts/validate-math-review.cjs examples/learning/analysis.math-review.json
node scripts/validate-math-review.cjs examples/learning/algebra.math-review.json
npm test
```

新增工作流[learning-materials.yml](../.github/workflows/learning-materials.yml)只执行上述检查，没有发布、写入Vault或处理个人资料步骤；GitHub Actions的实际远端运行状态以PR检查页为准。

## 本次额外兼容检查

以下为使用工作区可访问版本完成的一次性检查，不是把相关外部实现复制进测试仓库：

| 检查 | 实际结果 |
| --- | --- |
| 两科完整教学示例 | 数分2章11节点；高代2章12节点；没有用户真实作答 |
| 已发布tag `0.1.0` 的 `src/core.cjs` | 读取这23节点，0警告，生成36个文件条目；不要求升级插件 |
| 现有“拾阶”v2前端`validatePack` | 两个示例均通过，返回内容与输入逐字段一致 |
| 现有复习台KaTeX解析器 | 两个示例的151个公式片段通过严格解析；这只说明语法可渲染，不证明数学结论 |
| 内容审阅 | 检查递推不变区间、收敛证明、误差上界、秩一公式适用条件与奇异参数分支；出处均标为原创补充，反馈均标为模拟 |

## 没有完成的验证

没有在真实iPad、Safari或原生Obsidian上操作。当前环境没有可启动的Playwright浏览器二进制；云浏览器访问本地预览被阻止，因此浏览器界面未做真实浏览器点击验收，完成的是共享校验逻辑和DOM事件测试。浏览器工具也没有发布在线URL。使用指南不保证iPad文件快速预览可以执行HTML脚本。

未对所有数学教材章节或未提供的个人题库做覆盖审核。示例是完整流程样例，不是整本数分/高代教材。校验器不是LaTeX解释器、数学证明器或学习掌握度判定器，不能验证出处真实性和个人观察。
