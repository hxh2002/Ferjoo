# Ferjoo v0.5 参考文献校对与扩展

检索/复核日期：2026-08-29

## 本轮校正

- Colorado State University Extension 的 `Sourdough Starter Best Practices` 当前页面明确标注 **Reviewed: October 2025**。v0.5 已更新运行时引用与研究卡，不再只写模糊的 “Reviewed 2025”。
- 用户端“参考文献”只展示外部公开资料；内部经验规则仍保留在 `ruleTrace / evidenceRefs` 中供测试与审计，不再冒充学术参考文献。
- 复制报告同样隐藏内部规则 ID，避免把开发实现细节暴露给普通用户。

## 本轮新增同行评议资料

1. De Vuyst L, Vrancken G, Ravyts F, Rimaux T, Weckx S. (2009). *Biodiversity, ecological determinants, and metabolic exploitation of sourdough microbiota*. Food Microbiology, 26(7), 666–675. DOI: 10.1016/j.fm.2009.07.012.
2. Minervini F, De Angelis M, Di Cagno R, Gobbetti M. (2014). *Ecological parameters influencing microbial diversity and stability of traditional sourdough*. International Journal of Food Microbiology, 171, 136–146. DOI: 10.1016/j.ijfoodmicro.2013.11.021.
3. Gänzle MG. (2014). *Enzymatic and bacterial conversions during sourdough fermentation*. Food Microbiology, 37, 2–10. DOI: 10.1016/j.fm.2013.04.007.

## 用户端展示原则

每条参考文献最多展示四类信息：

- 文献类型（官方指南 / 原始研究 / 综述）
- 作者、期刊或机构、年份
- 文献题目
- 一句与当前判断直接相关的中文说明

内部规则名称、审计 ID、证据等级、映射规则和研究限制仍保留在 `research/`，但不放进普通用户结果页。
