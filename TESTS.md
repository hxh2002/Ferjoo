# 可执行测试与遍历说明

## 一键运行

```bash
npm test
npm run audit
```

项目不依赖第三方测试库；Node.js 18 及以上即可运行。

## `tests/rule-engine.test.js`

规则语义回归覆盖：

- Node 与浏览器共用同一规则对象；
- `elapsedHours: null`、`0`、窗口前、窗口内、窗口后严格区分；
- `>32℃` 停止线性估时并带温度证据；
- 污染优先于高度缺失和看似正常的 pH；
- 自然语言污染信号进入安全分支；
- “没有发霉”和“黑麦面粉/绿色容器”不产生污染假阳性；
- 活跃期液体层、稳定期回落、冷藏期时点歧义不再被阶段覆盖吞并；
- pH 只作为辅助分层，不能生成生食许可。

## `tests/enumerate-scenarios.test.js`

全量结构回归覆盖：

- 6 × 6 × 8 × 7 = 2,016 个核心组合，顺序确定；
- 每个场景都返回完整、非空的状态、原因和动作；
- 输入轴回显一致，严重度合法；
- 每个有效输出具备非空 `ruleTrace`、`evidenceRefs` 和可解析引用；
- 叙事等价类成员总数等于有效场景总数；
- JSON、NDJSON 和命令行自检可重复运行；
- 引擎异常、缺失字段、空建议和格式化失败会进入异常报告，而不是静默通过。

## 生成遍历报告

```bash
node scripts/enumerate-scenarios.js --pretty -o reports/scenarios.json
node scripts/enumerate-scenarios.js --format ndjson -o reports/scenarios.ndjson
```

也可以用 `--stages`、`--ratios`、`--heights`、`--temps` 传入逗号分隔的规范值，只审阅某个子空间。

## 当前仍未覆盖

- 真实浏览器 DOM/视觉回归；
- 自然语言所有否定、指代和模糊表达；
- 基于用户时间序列的个体峰值曲线校准；
- 图片式污染识别；
- 面粉、水合度、容器、峰值形态等尚未进入 UI 的新轴；
- 食品微生物实验室验证。

这些项目不能用 2,016 个结构组合全部通过来替代；场景遍历验证的是实现一致性和规则覆盖，不自动证明科学正确性。
