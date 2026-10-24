# 生成规范测试输入

`valid/minimal.json`是正确的最小非空资料，可运行：

```sh
node scripts/validate-math-review.cjs tests/fixtures/authoring/valid/minimal.json
```

以下文件均故意错误，应退出1，不要导入学习系统：

| 文件 | 预期错误码 |
| --- | --- |
| invalid/invalid-kind.json | kind |
| invalid/duplicate-id.json | duplicate-node |
| invalid/dangling-reference.json | reference |
| invalid/parent-cycle.json | cycle |
| invalid/missing-chapter.json | chapter |
| invalid/wrong-self-check.json | type |
| invalid/unknown-field.json | unknown-field |
| invalid/latex-control-character.json | control-character |
| invalid/cross-chapter-parent.json | parent |
| invalid/trailing-comma.json | json |
| invalid/duplicate-key.json | duplicate-key |

完整教学示例位于`examples/learning/`；这些数据均为原创教学/测试内容，没有用户真实作答或个人笔记。测试会逐个运行错误夹具，确认不是“所有输入都通过”的假校验。
