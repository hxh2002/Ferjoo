# Ferjoo v0.2 完整仓库打包清单

本包由公开仓库 `hxh2002/Ferjoo` 的基线提交加上本次提供的完整补丁重建。

## 来源与应用

- 基线提交：`75e342feeed20672a640ac30c30bc588b4976daa`
- 应用方式：`git apply`，预检查与应用均无冲突
- 补丁 SHA-256：`6d4c90300e276a4a41a7ff8ee7494365e2a4eb9da73c2200a78744ad0b8da93e`
- 主报告 SHA-256：`27d24fee81df4a1f05804df18cdf53256ccd608b0812a910d2b5ade34eff0150`
- 审阅队列 SHA-256：`ee84c436627b13bb172b36962ab500f589e75456f1dd9bbf119f634716e7e840`
- 核心遍历结果 SHA-256：`05d747693a5c51dcef649f6ca058174d9deb74e44d532f784d7c8bc96a05be04`

## 包含内容

- 原公开仓库全部网页、样式、图片与规则文件；
- 应用后的单一规则源、Node 兼容入口、遍历器、审阅队列生成器与测试；
- `research/` 证据库、场景模型、引用体系与 JSON Schema；
- `reports/FERJOO-RULE-SYSTEM-REPORT.md`；
- `reports/scenarios.json`（2,016 个核心组合）；
- `reports/review-queue.json`（614 条三步审阅队列）；
- `reports/ferjoo-v0.2.patch`（本次应用的补丁副本，便于复核）。

## 离线验证

- 规则测试：9/9 通过；
- 枚举测试：8/8 通过；
- 审阅队列测试：614 条、56 个核心叙事类通过；
- 全量核心组合：2,016 条，异常 0；
- 引用 Schema JSON 解析通过，本地 `$ref` 解析通过；
- HTML 引用的 7 个本地静态资源均存在；
- 浏览器与 Node 入口共享同一规则实现。

压缩包不包含 `.git` 目录，也不包含本地重新生成的临时副本 `reports/review-queue.generated.json`；公开仓库基线提交和补丁哈希已记录于本清单。
