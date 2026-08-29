# Ferjoo v0.5 发布验证

## 结论

**PASS**

v0.5 以 v0.4 为算法基线，重点优化普通用户可见的解释、参考文献与安全措辞。

## 自动化门禁

- `npm test`: PASS
- `npm run audit`: PASS
- `npm run enumerate`: PASS
- `npm run review-queue`: PASS
- 标准组合：2016
- 语义结构变化：0 / 2016
- 有意的用户文案变化：288 / 2016

语义结构对比包含状态、等级、原因/建议数量、时间范围数值及高温估时可靠性。
`0 / 2016` 表示本轮界面与文献改造没有改变标准场景的诊断结构。

## 用户端改造

- `HOW IT THINKS` → `HOW IT WORKS`
- 6 步开发者流程 → 4 步用户理解流程
- “证据与规则出处” → “参考文献”
- 用户端隐藏 `FERJOO-EXP-*` 内部规则 ID
- 参考文献改为卡片：类型、作者/来源/年份、题目、相关说明、原文链接
- 旧版“规则库 / 实验室检测 / 规则优先”等说明已移除
- 污染提示直接告诉用户停止使用
- 高温提示不再使用“非线性 / 线性外推”等技术措辞

## 参考文献库

- 研究卡片：30（v0.4 为 27）
- food-safety：16
- fermentation：14
- research cutoff：2026-08-29

新增：
1. De Vuyst et al. (2009), *Food Microbiology*
2. Minervini et al. (2014), *International Journal of Food Microbiology*
3. Gänzle (2014), *Food Microbiology*

校正：
- Colorado State University Extension `Sourdough Starter Best Practices`：`Reviewed October 2025`

## UI 基线

v0.2 的品牌视觉、卡片选择、温度/时间滑杆、双栏结果区、弹窗和主要交互结构继续保留。
