# 酵种医生：前置知识审校

本文件把“用户提供知识库中的原始规则”“适合进入产品的保守规则”“不宜作为绝对科学结论的经验命题”分开。

## 1. 可以直接作为网页核心规则的内容

### 阶段、比例、高度、温度四维输入
原始 `starter-doctor.js` 已经把起种初期、活跃期、稳定期、复活、冷藏和成熟期做成标准枚举；喂养比例、8 种高度状态、7 个温度区间与比例基准翻倍时间也已经结构化。这非常适合作为前端表单和规则引擎的核心。

### 污染优先级
原规则把粉红/橙/黑/绿、霉斑/长毛和腐臭/氨味等设为最高优先级，直接弃用并重新消毒起种。这一产品设计方向与食品安全推广资料一致：有色或绒毛状霉变的 starter 应弃用，而不是只刮掉表面。

### 低温变慢、冷藏近休眠
文献综述与食品安全推广资料都支持“温度显著影响酵种微生物活性；低温会减慢发酵”的方向。网页继续保留温度作为时间修正维度。

### 乳酸菌通常多于酵母
综述通常描述成熟 sourdough 中 LAB 的细胞数量高于酵母 1–2 个数量级，因此“乳酸菌多于酵母”可以保留为背景知识。但精确到固定 100:1 不宜当作每罐酵种都成立的定值。

## 2. 本次产品化时做的专业修正

### 增加“喂养后经过时间”
原规则在高度“几乎无变化”时会立即给出“活性不足”，但如果用户才刚喂 1–2 小时，这个结论过早。本版加入可选的 `elapsedHours`：
- 未达到预期窗口起点：改为“观察时间尚早/正常观察中”；
- 落在窗口内：提示继续观察；
- 超过窗口上限仍不涨：才强化“偏慢/活性不足”的判断。

这是把“状态”变成“状态 × 时间”的必要修正。

### pH 作为辅助，不作为唯一成熟/安全判据
用户知识库给出 pH 3.3–3.8、3.5 为经验目标。研究与行业资料中的 sourdough pH 范围更宽，且受类型、工艺和时间影响。本版：
- 保留 3.3–3.8 为**品牌经验目标区间**；
- 把 pH 4.6 以下作为**酸化安全参考线之一**；
- 明确 pH 不能替代卫生、污染观察和充分烘烤。

### 浮水试验不再作为唯一活性确认
原规则在稳定期写有“用浮水试验确认活性”。浮水受水合度、气泡结构和操作影响，因此本版不把它当作唯一验证手段，优先看重复的上升/翻倍周期与实际面团表现。

## 3. 需要降级为“品牌经验/假说”的内容

### “基因匹配论 / 原产地气候匹配”
用户知识库把“材料相近、地域相近更容易融合”作为核心理论。早期小样本研究确实观察到环境/地域与传统 sourdough LAB 组成的关系，但更大规模的跨地区研究（500 个 starter）发现地理位置对菌群组成的解释力很有限，维护实践与微生物相互作用更重要。

因此建议产品表达：
- 可以保留为品牌方法论或风味研发思路；
- 不要写成“地域决定菌群”或“匹配原产地气候一定更好”的科学定论。

### “高温一定是酵母菌在工作”
不建议保留绝对措辞。温度会同时改变酵母、乳酸菌及其代谢；文献常见的是“较高温度会改变微生物优势与有机酸生成”，而不是“高温只代表酵母”。

### “膨胀 3 倍以上 = 纯酒精、风味最差”
可以保留为你的经验性风味警报，但不宜做微生物学等式。网页改写为“发酵非常强、明显越过常规翻倍观察点，更容易进入过峰与代谢产物累积”。

### “pH 3.5 是通用黄金点”
可作为品牌目标点，不建议宣称为所有面粉、所有 starter 类型的通用最佳值。

## 4. 外部核验来源（用于审校，不替代你的品牌知识库）

1. Landis EA, Oliverio AM, et al. *The diversity and function of sourdough starter microbiomes*. eLife. 2021;10:e61644. DOI: 10.7554/eLife.61644  
   https://elifesciences.org/articles/61644  
   - 500 个 starter 的大规模调查；地理位置与菌群多样性的相关性很弱；维护方式、微生物相互作用与 AAB 等对功能有重要影响。

2. Reese AT, Madden AA, et al. *Influences of Ingredients and Bakers on the Bacteria and Fungi in Sourdough Starters and Bread*. mSphere. 2020.  
   https://pmc.ncbi.nlm.nih.gov/articles/PMC6968659/  
   - 说明 flour 是 starter 微生物的重要来源之一，同时烘焙环境/人也会贡献菌群。

3. Scheirlinck I, et al. *Influence of geographical origin and flour type on diversity of lactic acid bacteria in traditional Belgian sourdoughs*. Appl Environ Microbiol. 2007;73(19):6262–6269. DOI: 10.1128/AEM.00894-07  
   https://pubmed.ncbi.nlm.nih.gov/17675431/  
   - 早期比利时样本中，bakery environment 对 LAB 组成的影响较强；不能简单推导成全球“地域决定论”。

4. Calvert MD, et al. *A review of sourdough starters: ecology, practices, and sensory quality with applications for baking and recommendations for future research*. PeerJ. 2021;9:e11389.  
   https://pmc.ncbi.nlm.nih.gov/articles/PMC8117929/  
   - 温度会改变微生物优势、细胞密度、酸和挥发物生成；“高温只代表某一类微生物工作”过于绝对。

5. Colorado State University Extension. *Sourdough Starter Best Practices*（reviewed 2025）  
   https://extension.colostate.edu/resource/sourdough-starter-best-practices/  
   - 不食用生 starter；酸化到 pH 4.6 以下有助于限制有害微生物；有色/绒毛状霉变应弃用；酒精液层本身可为正常发酵副产物。

## 5. 下一版可以继续扩展的专业输入

当前版本已经适合“用户自查与操作建议”。如果后续要从专业级继续升级到烘焙师/门店 SOP 级，建议增加：
- 面粉类型与全谷比例；
- starter 水合度与真实喂养配方（把“比例”和“硬种/液种”正式拆成两个维度）；
- 上一次喂养时间、连续 2–3 次峰值时间；
- 峰值高度、顶部形态与气泡密度；
- pH 与 TTA（总滴定酸度）；
- 目标产品（硬欧、软欧、甜面包、酸味偏好）；
- 冷藏温度与冷藏时长；
- 用水类型和维护历史。

这些字段加入后，可以从“单次诊断”升级为“发酵曲线管理”和“风味目标反推”。
