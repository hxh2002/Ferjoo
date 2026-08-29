# Dr. Ferjoo 食品安全与污染证据子库

**主题范围：** 传统面粉—水酸面团酵种（sourdough starter）的霉菌、异常颜色、腐败/异味、丢弃边界、家庭制作卫生与原料安全。
**检索日期：** 2026-08-28
**证据用途：** 为诊断规则、场景归并、提示语和回归测试提供可追溯依据；不是微生物实验室鉴定手册，也不替代当地食品安全法规或医疗建议。

## 1. 先给规则系统的结论

1. **一旦出现可见霉菌或异常的有色生长，应丢弃整份酵种，不应刮去表层“抢救”。** 这是目前最直接、最稳健的酵种专门指导。低 pH、仍能起发、气味尚可或之后会烘烤，都不能覆盖这一停止规则。[FS-01][FS-05][FS-06]
2. **粉红、橙、红等异常色斑应作为“未知有色污染”处理并丢弃，但界面不应仅凭颜色宣称其必然是 *Serratia marcescens*。** 同一种细菌可因培养条件表现为红、粉、洋红或橙色，也可能不显色；其他微生物同样可能带色。家庭照片不足以做物种鉴定。[FS-01][FS-15]
3. **“黑色”必须拆成两个互斥状态。** 连续、可流动、无绒毛且带酒精气味的深色液层（hooch）可见于饥饿/久置酵种，通常可以倒掉或搅回后喂养；黑色点状、岛状、环状、绒毛状或不可流动生长则按污染丢弃。[FS-01][FS-02]
4. **pH 是屏障和成熟度指标，不是“已灭菌”证明。** CSU 的家庭酵种指导把降至 4.6 以下视为有助于限制有害微生物；但 FDA 对高水分、未热处理食品的 pH/水活度矩阵表明，单看 pH 4.2–4.6 仍可能需要产品评估。规则不得输出“pH≤4.6，所以可以生吃”。[FS-01][FS-07][FS-08][FS-10][FS-11]
5. **生面粉、酵种和面团均不应品尝。** 面粉通常没有经过杀灭致病菌的处理；发酵不能被等同于验证过的杀菌步骤。安全提示应始终保留“不要尝生酵种/生面团，按配方充分烘烤”。[FS-03][FS-04][FS-09]
6. **气味可用于发现腐败，却不能证明安全。** “酸、发酵、酵母、酒精/醋”可以出现在正常酵种中；真正腐烂、腐败、污水/尸腐样气味，尤其伴随黏滑、异常颜色或霉菌时应丢弃。但“闻起来正常”不能排除致病菌。[FS-01][FS-12][FS-13]
7. **传统酸面团与商业酵母长时间无揉面面团、含奶/糖的 friendship starter 不能共用安全规则。** 前者依赖乳酸菌持续酸化；后二者的组成和微生物屏障不同。已有挑战试验显示，商业酵母无揉面面团在 21–38°C 长时间放置可支持 *Salmonella* 与 *S. aureus* 增长。[FS-01][FS-14]

## 2. 证据分级与使用方式

| 等级 | 定义 | 在规则系统中的用途 |
|---|---|---|
| A | 政府/监管机构或大学 Extension 的直接酵种安全指导；或政府原料安全指导 | 可形成硬停止规则、固定警示语 |
| B | 同行评议的酸面团原始研究、挑战试验或系统性/结构化综述 | 支持机理、阈值边界、阶段判断；不单独外推成家庭“绝对安全”结论 |
| C | 政府/国际机构的一般食品霉菌、毒素或高风险人群指导 | 支持保守处置和风险说明，但须标注为间接证据 |
| D | 与传统酸面团不同的面团/发酵体系的研究或指导 | 只用于“不可套用酸面团规则”的反例和边界 |

**冲突处理原则：** 食品安全采用保守优先；直接酵种处置指导优先于爱好者经验。任何“继续喂养/观察”规则都不得覆盖可见霉菌、异常有色生长、明确腐败气味或已知召回原料。

## 3. 可直接映射到规则引擎的决策表

| 输入证据 | 归并后的场景 | 决策 | 对用户的核心表述 | 主要依据 |
|---|---|---|---|---|
| 任意绒毛/毛状/粉状生长；绿色、蓝色、黑色、白色等点状/岛状菌落 | `VISIBLE_MOLD_OR_COLORED_GROWTH` | `DISCARD_ALL` | 不要刮去表层；整份丢弃，彻底清洗容器后重建 | FS-01, FS-05, FS-06 |
| 粉红、橙或红色条纹、膜、点、斑块，且不是已知有色原料 | `ABNORMAL_PIGMENTED_GROWTH` | `DISCARD_ALL` | 颜色不足以鉴定物种，但足以判定为异常污染信号 | FS-01, FS-15 |
| 连续、可流动的灰/褐/深色液层；无绒毛或固体菌落；酒精气味 | `HOOCH_STARVATION` | `FEED_AND_OBSERVE` | 这是久置/缺粮信号；倒掉或搅回，转入规律喂养 | FS-01, FS-02 |
| 深色点、环、岛、绒毛、黏附性膜，或无法确认是液层 | `DARK_GROWTH_UNCERTAIN` | `DISCARD_ALL` | 不能把“深色液层”的例外扩展到黑色生长 | FS-01, FS-02 |
| 冰箱久置酵种的液层表面出现白色小团，但无绒毛、无颜色扩散 | `WHITE_CLUMPS_ON_HOOCH` | `CLARIFY_OR_CONSERVATIVE_DISCARD` | CSU 指出可能是安全酵母；照片不清、形态可疑或使用者高风险时按污染处理 | FS-01 |
| 明确“腐烂/腐败/恶臭”，且伴异常颜色、霉菌或黏滑 | `PUTRID_SPOILAGE` | `DISCARD_ALL` | 不品尝，不用烘烤补救 | FS-01, FS-12, FS-13 |
| 只有酸、醋、酒精、发酵或酵母气味；无可见污染 | `NORMAL_OR_HUNGRY_AROMA` | `CONTINUE_DIAGNOSIS` | 气味本身不是污染证据；继续结合阶段、pH、喂养和活性判断 | FS-01, FS-11, FS-16 |
| 闻起来“正常”但用户问是否绝对安全 | `SENSORY_NOT_SAFETY_PROOF` | `NO_SAFETY_GUARANTEE` | 致病菌可能不改变外观、气味或味道；执行卫生和烘烤控制 | FS-03, FS-04, FS-13 |
| pH > 4.6 或无持续下降趋势的新酵种 | `NOT_ACIDIFIED` | `NOT_READY` | 不判定成熟，不生吃；核验量测与喂养流程，继续观察或重建 | FS-01, FS-07, FS-08, FS-10 |
| pH ≤ 4.6，无可见污染 | `ACIDIFIED_BUT_RAW` | `BARRIER_PRESENT_NOT_RTE` | 酸化有助抑菌，但不是生食许可；仍需充分烘烤 | FS-01, FS-03, FS-07 |
| pH ≤ 4.0，且多次喂养后活性稳定、无污染 | `FUNCTIONALLY_MATURE_CANDIDATE` | `READY_FOR_BAKING_CANDIDATE` | 与研究中的成熟标志一致，但不能替代原料卫生和烘烤 | FS-08, FS-11 |
| 用户尝生酵种/计划生食 discard | `RAW_FLOUR_CONSUMPTION` | `DO_NOT_TASTE` | 生面粉可能带 *Salmonella* 或 STEC；发酵不等于验证杀菌 | FS-03, FS-04, FS-09 |
| 配方含奶/乳制品/大量糖的 friendship starter，或含蛋长时间室温 | `NON_TRADITIONAL_ENRICHED_STARTER` | `OUT_OF_STANDARD_MODEL` | 不套用传统面粉—水酵种规则；使用巴氏杀菌原料并遵循经验证配方与冷藏要求 | FS-01, FS-14 |
| 商业酵母无揉面面团长时间室温 | `YEAST_ONLY_LONG_FERMENT` | `OUT_OF_STANDARD_MODEL_HIGH_RISK` | 没有乳酸菌酸化屏障；不可按酸面团处理 | FS-01, FS-14 |

### 3.1 规则优先级

建议固定为：

1. **已知召回原料/可见污染/明确腐败**；
2. **异常颜色与霉菌形态**；
3. **原料体系是否仍属于传统面粉—水酵种**；
4. **生食与卫生警示**；
5. **pH 与阶段**；
6. **气味、液层、活性和喂养诊断**。

这可以防止以下错误覆盖：

- `pH 3.8 + 粉红斑` 仍必须丢弃；
- `涨到三倍 + 可见霉菌` 仍必须丢弃；
- `准备高温烘烤 + 霉菌` 仍不得抢救，因为部分霉菌毒素可耐受加工；
- `闻起来正常 + 使用召回面粉` 仍必须停止使用；
- `黑色输入` 不能在未问“液体还是斑点/绒毛”前直接归类。

## 4. 证据条目

### FS-01 — Colorado State University Extension：酵种专门安全指导

**完整引用：** Colorado State University Extension. *Sourdough Starter Best Practices*. Food Smart Colorado / CSU Extension. 页面原始发布日期标示为 2019，现行页面更新版可访问于 2025；检索于 2026-08-28。
**URL：** <https://extension.colostate.edu/resource/sourdough-starter-best-practices/>；镜像页面 <https://foodsmartcolorado.colostate.edu/food-safety/safe-preparation-handling-and-storage/sourdough-starter-best-practices/>
**证据类型/等级：** 大学 Extension 直接酵种食品安全指导，A。

**主要观点：**

- 面粉是生的农业产品，不是即食食品；不要在烘烤前品尝生酵种。
- 发酵产生酸，有助于限制致病菌；烘烤是最终杀灭步骤。
- 乳酸菌使 pH 降至 4.6 以下，快速酸化有助限制有害微生物，包括霉菌。
- 任何有色和/或绒毛状霉菌都意味着酵种不可使用；应丢弃污染酵种并彻底清洗、冲净容器后重建。
- 酒精气味的液层是酵母代谢副产物，可倒掉或搅回。
- 冰箱久置酵种的液层上可能出现安全酵母形成的白色小团，需与霉菌区分。
- 传统酸面团、含奶/糖的 Amish Friendship Bread 和仅用商业酵母的 no-knead bread 具有不同安全边界；后两者不能直接套用传统酵种规则。

**适用边界：** 面向家庭传统酵种的专家指导，不是按菌种和毒素进行的挑战试验。其“pH 4.6 以下”应解释为有利的酸化屏障，不能被改写为“可以生吃”或“排除所有风险”。

**可映射规则：** `visible_mold -> DISCARD_ALL`；`raw_starter -> DO_NOT_TASTE`；`alcoholic_liquid_layer -> HOOCH`；`friendship_or_yeast_only -> OUT_OF_STANDARD_MODEL`；`pH_below_4_6 -> ACIDIFICATION_BARRIER`。

---

### FS-02 — University of California Agriculture and Natural Resources：深色 hooch 例外

**完整引用：** University of California Agriculture and Natural Resources, Master Food Preserver Program of San Luis Obispo and Santa Barbara Counties. (2020, May 6). *Can This Sourdough Starter be Saved? Or is this Starter a Goner?* 检索于 2026-08-28。
**URL：** <https://ucanr.edu/blog/master-food-preserver-slo/sb-counties/article/can-sourdough-starter-be-saved-or-starter-goner>
**证据类型/等级：** 大学 Extension 体系的家庭食品保藏实务案例，A−。

**主要观点：** 冰箱久置的酵种可形成深色、可流动的液层（hooch）；在没有霉菌且气味正常/酸香的前提下，该液层本身不是必须丢弃的污染证据，可搅回后通过连续喂养恢复。

**适用边界：** 这是单一实务案例而非挑战试验。只有在输入明确为“液层、可流动、无绒毛/固体色斑、无腐败气味”时才能使用；不能推导为“任何黑色都安全”。

**可映射规则：** `dark_color + liquid_layer + no_growth + alcoholic_or_tangy -> FEED_AND_OBSERVE`；若形态不明，先追问 `liquid_vs_spot_or_fuzz`。

---

### FS-03 — U.S. FDA：面粉是生食材

**完整引用：** U.S. Food and Drug Administration. (2023, December 5). *Flour Is a Raw Food and Other Safety Facts*. 检索于 2026-08-28。
**URL：** <https://www.fda.gov/consumers/consumer-updates/flour-raw-food-and-other-safety-facts>
**证据类型/等级：** 国家监管机构消费者安全指导，A。

**主要观点：** 多数面粉未经杀菌处理；田间或制粉过程中可能引入 *Salmonella* 或致病性 *E. coli*。烹饪/烘烤才是杀灭步骤；不要吃或品尝生面粉、生面团或面糊。

**适用边界：** 直接证明原料风险与禁止生食，未测试每一种成熟酵种。不能以“酵种很酸”删除此警示。

**可映射规则：** 所有结果页常驻 `do_not_taste_raw_starter_or_dough`；接触后洗手和清洁器具；若面粉处于召回批次，直接丢弃相关酵种和产品。

---

### FS-04 — U.S. CDC：生面粉与交叉污染

**完整引用：** Centers for Disease Control and Prevention. (2025, November 24). *Raw Flour and Dough*. 检索于 2026-08-28。
**URL：** <https://www.cdc.gov/food-safety/foods/no-raw-dough.html>
**证据类型/等级：** 国家公共卫生机构消费者安全指导，A。

**主要观点：** 未烹调面粉和生蛋可带来食源性疾病风险；不应品尝生面团/面糊；处理后要清洗手、碗、器具和台面，并按配方充分加热。

**适用边界：** 一般面粉/面团指导，不是酵种微生物挑战研究；用于卫生底线而非判定某罐酵种是否污染。

**可映射规则：** `raw_consumption -> STOP`；每次涉及儿童、孕妇、老年人或免疫功能低下者时强化同一警示，但不暗示其他成年人可以生食。

---

### FS-05 — USDA FSIS：多孔食品出现霉菌时整份丢弃

**完整引用：** U.S. Department of Agriculture, Food Safety and Inspection Service. (2013, August 22; current web version). *Molds on Food: Are They Dangerous?* 检索于 2026-08-28。
**URL：** <https://www.fsis.usda.gov/food-safety/safe-food-handling-and-preparation/food-safety-basics/molds-food-are-they-dangerous>
**证据类型/等级：** 国家监管机构一般霉菌处置指导，C（对酵种为间接，但处置高度相关）。

**主要观点：** 面包和烘焙食品属于多孔食品；可见霉菌以下可能已有污染，故应整份丢弃，而不是切掉/刮掉表面继续使用。

**适用边界：** 表格直接针对面包和烘焙食品，不专门研究液态酵种。与 CSU 的酵种直接指导方向一致，可加强“不能只刮表层”的保守规则。

**可映射规则：** `visible_mold -> DISCARD_ALL_NO_SALVAGE`；禁止输出“取底部一勺重新喂养”。

---

### FS-06 — WHO：霉菌毒素可能耐加工

**完整引用：** World Health Organization. (2023, October 2). *Mycotoxins*. 检索于 2026-08-28。
**URL：** <https://www.who.int/news-room/fact-sheets/detail/mycotoxins>
**证据类型/等级：** 国际公共卫生机构事实说明，C。

**主要观点：** 某些霉菌能在谷物等食品上产生霉菌毒素；健康影响可从急性中毒到长期免疫损害和癌症；多数霉菌毒素化学稳定，可能在食品加工后仍存在。

**适用边界：** 可见霉菌不等于一定产生了某种霉菌毒素，家庭也无法从颜色判断毒素。该来源支持“存在霉菌时不能以烘烤作为补救”，不支持给某个酵种计算毒素概率。

**可映射规则：** `mold + user_plans_to_bake -> still DISCARD_ALL`；解释语使用“部分霉菌可能产生耐加工毒素”，避免断言“这罐一定有毒素”。

---

### FS-07 — FDA Food Code：pH 必须与水活度、热处理状态一起解释

**完整引用：** U.S. Food and Drug Administration. (2023). *Food Code 2022: Recommendations of the United States Public Health Service, Food and Drug Administration*. January 18, 2023 version. 另参见 FDA *Job Aid: Time and Temperature Control for Safety Foods*. 检索于 2026-08-28。
**URL：** <https://www.fda.gov/media/164194/download>；辅助表 <https://www.fda.gov/media/101004/download>
**证据类型/等级：** 监管模型规范与判定辅助，A（通用食品安全边界；非酵种专门标准）。

**主要观点：** 对未热处理/未包装食品，是否需要时间—温度控制不能只看 pH；FDA 辅助表把 pH 与水活度共同使用。在 `a_w > 0.92` 时，`pH < 4.2` 落入非 TCS 区，而 `pH 4.2–4.6` 仍落入需要产品评估的区域。

**适用边界：** Food Code 是零售/餐饮监管模型，不是家庭酵种成熟指南；酵种的实际水活度在项目中通常没有测量。因此它最重要的作用是阻止错误表述：不能把 4.6 当成所有湿酵种的单一“绝对安全线”。

**可映射规则：** `pH<=4.6 -> barrier_present`，不得映射为 `safe_raw=true`；若项目未来要对商业销售或室温储存作合规判断，必须增加水活度、配方、热处理和挑战试验字段。

---

### FS-08 — McKenney et al.：新酵种存在可重复的微生物演替阶段

**完整引用：** McKenney, E. A., Nichols, L. M., Alvarado, S., Hardy, S., Kemp, K., Polmanteer, R., Shoemaker, A., & Dunn, R. R. (2023). Sourdough starters exhibit similar succession patterns but develop flour-specific climax communities. *PeerJ, 11*, e16163.
**DOI/URL：** <https://doi.org/10.7717/peerj.16163>；NC State 研究摘要 <https://news.ncsu.edu/2023/10/flour-sourdough-bacteria/>
**证据类型/等级：** 同行评议原始研究；40 份酵种、10 种面粉、14 天、16S rRNA 测序与功能/气味测量，B。

**主要观点：** 研究识别出 6 个演替阶段。第 1 天由面粉/植物相关微生物占主导；第 2–6 天多样性达到高峰并由机会型/广适细菌转向专门化群落；第 10–14 天形成酸耐受的成熟群落。该实验中，功能成熟约需 10 天，成熟标志包括 pH≤4 以及乳酸菌/醋酸菌类群富集。

**适用边界：** 这是特定喂养协议下的 40 份实验酵种，不证明“所有酵种第 10 天必然安全”，也没有通过病原挑战来验证家庭食用安全。其价值在于支持“新酵种不是从第 1 天就稳定”和“成熟要结合时间、pH、连续活性而非单次冒泡”。

**可映射规则：** `age_days < 10` 只能作为“可能仍在演替”的提示而非自动丢弃；`pH<=4 + repeatable_rise + no_contamination` 可标记为 `functional_maturity_candidate`；单次早期暴涨不能标记成熟。

---

### FS-09 — Forghani et al.：致病菌可在干面粉中长期存活

**完整引用：** Forghani, F., den Bakker, M., Liao, J.-Y., Payton, A. S., Futral, A. N., & Diez-Gonzalez, F. (2019). Salmonella and enterohemorrhagic *Escherichia coli* serogroups O45, O121, O145 in wheat flour: Effects of long-term storage and thermal treatments. *Frontiers in Microbiology, 10*, 323.
**DOI/URL：** <https://doi.org/10.3389/fmicb.2019.00323>
**证据类型/等级：** 同行评议原始挑战试验，B。

**主要观点：** 在约 23°C 储存时，接种的 EHEC 和 *Salmonella* 可在面粉中长时间存活；EHEC 可培养计数至 84 天且富集检测至 168 天，*Salmonella* 可计数至 112 天且富集检测至 365 天。研究还量化了 55–70°C 下的热失活动力学，显示低水活度面粉中的热抗性不应被低估。

**适用边界：** 研究对象是干面粉而不是酸化酵种；它证明“原料不是无菌”和“久放面粉不会自动变安全”，不能直接预测致病菌在每罐酵种中的生长/死亡曲线。

**可映射规则：** 强化 `raw_flour_not_RTE`；不能使用“面粉存放很久”作为安全依据；烘烤是独立控制点。

---

### FS-10 — Dinardo et al.：酸化是排除肠杆菌科的重要因素，但效果依赖基质

**完整引用：** Dinardo, F. R., Minervini, F., De Angelis, M., Gobbetti, M., & Gänzle, M. G. (2019). Dynamics of Enterobacteriaceae and lactobacilli in model sourdoughs are driven by pH and concentrations of sucrose and ferulic acid. *LWT—Food Science and Technology, 114*, 108394.
**DOI/URL：** <https://doi.org/10.1016/j.lwt.2019.108394>；机构记录 <https://bia.unibz.it/esploro/outputs/journalArticle/Dynamics-of-Enterobacteriaceae-and-lactobacilli-in/991006161909001241>
**证据类型/等级：** 同行评议模型酸面团挑战研究，B。

**主要观点：** 在接种 *Cronobacter sakazakii*、*Klebsiella pneumoniae* 与乳酸菌的模型中，肠杆菌科在白面粉和全麦酸面团的数次发酵循环后消失，但在磷酸盐缓冲或麦麸体系中可持续存在。研究结论是 pH 是谷物发酵中排除肠杆菌科的关键因素，同时基质组成和缓冲能力会改变结果。

**适用边界：** 研究使用指定菌株和模型配方；“数次循环后消失”不能外推成家庭酵种的固定天数，也不能证明所有病原体均被杀灭。麦麸/高缓冲配方提示不能只用同一时间表覆盖所有面粉。

**可映射规则：** `acidification_trend` 应成为成熟核验字段；`high_bran_or_buffered_formula` 降低对固定天数/pH 速度的置信度；规则表述用“抑制/排除能力增强”，避免“灭菌”。

---

### FS-11 — Oshiro et al.：低 pH 推动乳酸菌群落演替，但并非唯一因素

**完整引用：** Oshiro, M., Tanaka, M., Zendo, T., & Nakayama, J. (2020). Impact of pH on succession of sourdough lactic acid bacteria communities and their fermentation properties. *Bioscience of Microbiota, Food and Health, 39*(3), 152–159.
**DOI/URL：** <https://doi.org/10.12938/bmfh.2019-038>
**证据类型/等级：** 同行评议原始研究，B。

**主要观点：** 在设定 pH 6.7、5.5、4.5 的模型培养基及天然酸面团连续转接中，较低 pH 有利于群落最终向 *Lactobacillus* 优势转变；作者同时指出 pH 之外仍有其他影响群落演替的因素。

**适用边界：** 研究关注乳酸菌群落而非家庭病原挑战。它支持 pH 作为重要轴，不支持把 pH 当作唯一成熟/安全判断。

**可映射规则：** pH 必须与喂养次数、温度、面粉、活性和污染信号联合；不得在 pH 正常时覆盖霉菌/异常颜色。

---

### FS-12 — University of Illinois Extension：腐败/腐烂与黏滑的保守处置

**完整引用：** University of Illinois Extension. (2025, May; modified). *Fermenting Foods*. College of Agricultural, Consumer and Environmental Sciences.
**URL：** <https://extension.illinois.edu/media/6878/download?inline=>
**证据类型/等级：** 大学 Extension 家庭发酵一般指导，C（并非酵种专门页）。

**主要观点：** 家庭发酵产品若黏滑或闻起来已经腐败/腐烂，应丢弃并清洁、消毒容器；正常发酵通常应是令人可接受的轻微酸香。

**适用边界：** 文件重点是蔬菜乳酸发酵，不能把蔬菜的“黏滑”标准机械套给所有高水合或黑麦酵种，因为谷物多糖/面筋本身会改变黏度。用于规则时，“黏滑”应与腐败气味、异常颜色或突变性状组合，不宜单独成为硬丢弃条件。

**可映射规则：** `slimy + putrid_or_rotten -> DISCARD_ALL`；`viscous_only -> ASK_HYDRATION_AND_FLOUR_TYPE`。

---

### FS-13 — USDA/CDC：感官正常不能证明没有致病菌

**完整引用：** U.S. Department of Agriculture, Food Safety and Inspection Service. (2022, September 1). *Food Safety Education Month: Preventing Cross-Contamination*. 另参见 CDC (2024, October 4), *How Salmonella Infections Happen*. 检索于 2026-08-28。
**URL：** <https://www.fsis.usda.gov/news-events/events-meetings/food-safety-education-month-preventing-cross-contamination>；<https://www.cdc.gov/salmonella/spread/index.html>
**证据类型/等级：** 国家公共卫生一般指导，C。

**主要观点：** 引起疾病的有害细菌通常不能凭视觉、气味或味道识别；受 *Salmonella* 等污染的食品往往看起来、闻起来和尝起来都正常。

**适用边界：** 一般食品安全原则，不意味着家用酵种普遍高风险；用于限制模型的过度保证。

**可映射规则：** 禁止输出“闻起来正常，所以安全”；应输出“未发现明显腐败信号，但感官不能保证微生物安全”，随后给出卫生与烘烤措施。

---

### FS-14 — Pao et al.：商业酵母长时间发酵不是酸面团安全模型

**完整引用：** Pao, S., Kim, C., Jordan, L., Long, W., Inserra, P., & Sayre, B. (2011). Growth of *Salmonella enterica* and *Staphylococcus aureus* in no-knead bread dough during prolonged yeast fermentation. *Journal of Food Protection, 74*(2), 285–288.
**DOI/URL：** <https://doi.org/10.4315/0362-028X.JFP-10-319>；PubMed <https://pubmed.ncbi.nlm.nih.gov/21333150/>
**证据类型/等级：** 同行评议挑战试验，D（配方使用商业酵母，不是乳酸菌酸化的传统酸面团）。

**主要观点：** 在面粉、水、盐和商业酵母的无揉面面团中，接种的 *S. enterica* 与 *S. aureus* 在 21–38°C 的长时间发酵中显著增长；增长随温度和时间增加。作者据此警告，长时间发酵可能损害家庭厨房卫生与食品安全。

**适用边界：** 不能用来说明成熟酸面团必然有同样增长，因为其缺乏乳酸菌酸化；正因为体系不同，应作为“禁止错误迁移规则”的证据。

**可映射规则：** 先问“是否由成熟酸酵种发酵，还是只有商业酵母”；后者不得获得 `low_pH_sourdough_protection`。含奶、蛋等配方还需额外的温控和经验证配方，项目当前若无专门证据应转出标准诊断。

---

### FS-15 — Mahlen：粉/橙/红颜色不能在家庭条件下等同于单一菌种

**完整引用：** Mahlen, S. D. (2011). Serratia infections: From military experiments to current practice. *Clinical Microbiology Reviews, 24*(4), 755–791.
**DOI/URL：** <https://doi.org/10.1128/CMR.00017-11>
**证据类型/等级：** 同行评议临床微生物学综述，C（用于鉴定边界，不是酵种处置研究）。

**主要观点：** *S. marcescens* 的 prodigiosin 色素受温度、pH、光、氧和营养影响；同一菌株在不同条件下可呈红、粉、洋红或橙色，临床还常见不显色菌株。其他 *Serratia* 及其他生物也可产类似色素，可靠物种鉴定需要实验室表型/分子方法，而不是看颜色。

**适用边界：** 不证明粉红酵种必然含 *Serratia*，也不负责给出家庭食用处置。处置仍由 CSU 的“异常有色/霉菌生长应丢弃”规则承担。

**可映射规则：** 结果文案写“粉红/橙/红色是异常污染信号，家庭条件不能可靠确定菌种”；禁止写“这就是沙雷氏菌”或罗列未经检测的毒素。

---

### FS-16 — Landis et al. 与 Calvert et al.：家庭酵种群落和宏观表现高度多样

**完整引用 1：** Landis, E. A., Oliverio, A. M., McKenney, E. A., Nichols, L. M., Kfoury, N., Biango-Daniels, M., Shell, L. K., Madden, A. A., Shapiro, L., Sakunala, S., Drake, K., Robbat, A., Booker, M., Dunn, R. R., Fierer, N., & Wolfe, B. E. (2021). The diversity and function of sourdough starter microbiomes. *eLife, 10*, e61644. <https://doi.org/10.7554/eLife.61644>
**完整引用 2：** Calvert, M. D., Madden, A. A., Nichols, L. M., Haddad, N. M., Lahne, J., Dunn, R. R., & McKenney, E. A. (2021). A review of sourdough starters: Ecology, practices, and sensory quality with applications for baking and recommendations for future research. *PeerJ, 9*, e11389. <https://doi.org/10.7717/peerj.11389>
**证据类型/等级：** 大样本同行评议原始研究（500 份家庭酵种）+ 结构化综述，B。

**主要观点：** 500 份家庭酵种具有明显微生物多样性；醋酸菌丰度可显著影响醋味和起发速度。综述指出，利用气泡、体积、气味和味道等宏观观察定义成熟酵种，在科学文献中仍缺乏良好标准化。

**适用边界：** 这些研究不是食品安全挑战试验。它们支持“气味/起发速度存在正常多样性”和“不要用单一感官词做过度精确诊断”，而不削弱可见霉菌等硬停止规则。

**可映射规则：** `vinegar_aroma + slow_rise` 不自动判污染；多轴联合判断；低置信度时明确说明证据缺口并请求照片、形态、pH、阶段和喂养记录。

## 5. 颜色、外观和气味的安全词典

### 5.1 可自动判定为丢弃

- 任意绒毛、毛发状、粉尘状或明显扩展的菌落；
- 不是已知配料造成的粉红、橙、红色膜/条纹/斑点；
- 绿色、蓝色、黑色等点状、环状、岛状或绒毛状生长；
- 颜色异常同时伴腐败/腐烂气味；
- 黏滑/拉丝突然出现并伴腐败气味或异常颜色；
- 使用了处于监管召回批次的面粉。

### 5.2 不能只看颜色自动丢弃，但必须追问形态

- 灰、褐、深褐或近黑的**连续可流动液层**：优先考虑 hooch；
- 冰箱久置酵种液层上的**白色小团**：可能是酵母，但与霉菌照片难区分；
- 全麦、黑麦、荞麦、红曲、可可、果蔬等本身带色原料引起的均匀底色：必须先核验配方和颜色是否在加料后立即出现。

### 5.3 气味分层

| 气味输入 | 建议类别 | 说明 |
|---|---|---|
| 酸、发酵、酵母、酒精、醋 | `EXPECTED_OR_HUNGRY` | 常见于成熟、过峰或饥饿酵种；继续结合活性与喂养判断 |
| 强烈醋味且起发较慢 | `AAB_POSSIBLE_NOT_HAZARD` | 醋酸菌可能影响气味和起发；不能仅凭气味鉴定菌种 |
| 新酵种第 2–6 天出现陌生气味，但无霉菌/有色生长 | `SUCCESSION_UNCERTAIN` | 处于高多样性的演替期；不品尝，核验 pH 趋势和卫生，避免立即给出病原体名称 |
| 明确腐烂、腐败、尸腐/污水样恶臭 | `PUTRID_SPOILAGE` | 特别是伴黏滑、异常颜色、霉菌时整份丢弃 |
| “闻起来正常” | `NOT_A_SAFETY_TEST` | 只能表示未发现感官腐败；不能据此保证无致病菌 |

## 6. 需要从遍历空间剔除或转交的组合

这些组合不应与普通“阶段×温度×涨幅×比例”继续做同一套叙事遍历，而应先被高优先级安全路由截断：

1. `visible_mold=true` 与任何 pH、温度、涨幅、阶段组合：全部归并成一个停止类；
2. `abnormal_pink_orange_red=true` 与任何“仍能涨/闻起来酸”组合：全部归并成异常有色污染停止类；
3. `dark_color=true` 但缺少 `liquid/spot/fuzzy`：不是诊断场景，而是**缺少关键输入**，必须追问；
4. `raw_tasting_intent=true` 与任何成熟度：统一加禁止生食；
5. `milk/egg/friendship/yeast-only=true`：转入非传统配方安全模块，不继续套普通酵种时间表；
6. `slimy=true` 但面粉类型/水合度未知：先追问；只有同时出现腐败气味或异常色才进入硬丢弃；
7. `pH<=4.6 + visible_contamination=true`：污染规则覆盖 pH；
8. `will_bake=true + mold=true`：仍丢弃，烘烤不能作为霉菌毒素的可靠补救。

## 7. 建议的数据字段

为避免当前“颜色”与“气味”选项过粗，食品安全层至少需要：

```yaml
safety_observation:
  visible_growth: none | fuzzy | powdery | spots | ring | film | clumps | unknown
  color: normal_flour | white | pink | orange | red | green | blue | gray | brown | black | mixed | unknown
  color_source_known: true | false | unknown
  state: liquid_layer | solid_growth | both | unknown
  liquid_mobility: flows | adheres | unknown
  odor_family: tangy | yeasty | alcoholic | vinegary | fruity | putrid | rotten | sewage_like | unknown
  raw_tasting_intent: true | false
  recalled_flour: true | false | unknown
  added_ingredients: [flour, water, salt, milk, egg, sugar, fruit, other]
  user_high_risk: true | false | unknown
process_evidence:
  starter_age_days: number | unknown
  pH: number | unknown
  pH_method: calibrated_meter | strip | unknown
  flour_type: white_wheat | whole_wheat | rye | gluten_free | mixed | unknown
  hydration_percent: number | unknown
  storage: room_temp | refrigerator | freezer | unknown
  repeatable_rise_after_feed: true | false | unknown
```

**关键设计点：** `color` 与 `state/texture` 必须分开；“黑色液体”与“黑色菌落”不能共用一个枚举值。`color_source_known` 用来排除红曲、可可、深色全谷粉等配方造成的本底色。

## 8. 推荐的用户文案约束

### 8.1 可以使用

- “出现了异常有色或绒毛状生长。按照大学 Extension 的酵种安全指导，应整份丢弃，不要只刮去表层。”
- “这层深色物质如果是连续、可流动且带酒精气味的液体，可能是久置酵种产生的 hooch；如果是点状、成膜、绒毛或无法确认，则不要冒险使用。”
- “pH 已经下降，说明酸化屏障正在形成；这不代表酵种可以生吃，仍应充分烘烤。”
- “粉红/橙色是异常污染信号，但仅凭照片不能可靠确定是哪一种微生物。”
- “未发现明显感官腐败信号；不过外观和气味不能保证不存在致病菌。”

### 8.2 禁止或需要降级

- 禁止：“粉红色就是沙雷氏菌”；应改为“可能由多种带色微生物或其他原因造成，家庭不能可靠鉴定”。
- 禁止：“pH 4.6 以下就完全安全/可以生吃”；应改为“酸化有助抑制，仍需烘烤”。
- 禁止：“刮掉霉菌，再取底部继续喂”；与直接酵种指导和多孔食品霉菌处置冲突。
- 禁止：“烤熟就能修复发霉酵种”；部分霉菌毒素可耐加工。
- 禁止：“闻起来正常，所以安全”；感官不是致病菌检测。
- 降级：“第 X 天一定成熟”；研究中的约 10 天是特定协议结果，应结合 pH 与重复活性。

## 9. 仍然缺乏直接证据的地方

1. 缺少针对家庭自然酵种、覆盖多种面粉和喂养法的标准化病原挑战研究；
2. 缺少把“粉/橙/红污染”与具体家庭酵种菌种、毒素和发病风险对应起来的高质量研究；
3. 缺少通过照片或肉眼形态可靠区分酵母膜、kahm-like film 与霉菌的验证研究；
4. 缺少用于家庭酵种的统一 pH—水活度—时间—温度安全判定矩阵；
5. 缺少对新酵种早期各种气味的标准化、可复现、可用于安全诊断的词典；
6. 对含蛋、奶、果汁、蜂蜜或大量糖的“酵种”需要单独证据库，不能由传统面粉—水酵种推演。

因此，在这些缺口被补足之前，规则应使用“异常污染信号/无法可靠鉴定/保守丢弃或转交”的表述，而不是给出菌种级确定结论。

## 10. 最小回归测试集

| 编号 | 输入摘要 | 必须输出 | 不得输出 |
|---|---|---|---|
| S01 | pH 3.8、涨三倍、表面粉红条纹 | 丢弃整份；不能凭颜色鉴定菌种 | 继续喂养、刮表层 |
| S02 | 冰箱 30 天、深褐可流动液层、酒精味、无绒毛 | 饥饿/hooch；倒掉或搅回并连续喂养 | “黑霉”确定诊断 |
| S03 | 黑色点状斑块、无法流动 | 丢弃整份 | 当作 hooch |
| S04 | 白色小团漂在酒精液层、冰箱久置、照片不清 | 说明窄例外并请求清晰形态；不确定时保守丢弃 | 直接保证安全 |
| S05 | 新酵种第 3 天突然暴涨、pH 5.2 | 演替期/尚未成熟；不品尝 | “活性成熟可直接用” |
| S06 | 第 12 天、pH 3.9、连续三次稳定起发、无污染 | 可作为烘烤成熟候选；仍不生吃 | “已灭菌” |
| S07 | 明确霉菌但用户说会 250°C 烘烤 | 仍丢弃，部分毒素可耐加工 | 烘烤补救 |
| S08 | 仅有强醋味和慢起发，无异常外观 | 继续从喂养/醋酸菌可能性诊断 | 自动判污染 |
| S09 | 商业酵母无揉面面团在 32°C 放 18 小时 | 转入非酸面团高风险路径 | 套用酵种 pH 规则 |
| S10 | 含奶/大量糖的 friendship starter 室温久置 | 转入特殊配方；使用巴氏杀菌原料和经验证冷藏流程 | 当作普通面粉—水酵种 |
| S11 | “闻起来正常，能否尝一口？” | 禁止生尝；充分烘烤 | 以气味保证安全 |
| S12 | 黑麦高水合、黏稠拉丝但无腐败味/异常色 | 追问面粉与水合度，不单凭黏度丢弃 | 直接判腐败 |

## 11. 维护建议

- 每条运行时规则保存 `evidence_ids`（如 `FS-01`, `FS-06`）、`evidence_role`（direct/indirect/boundary）和 `last_reviewed`。
- 用户可见引用优先展示 CSU/FDA/CDC/USDA/WHO；同行评议论文用于展开“为什么”和处理边界。
- 每 12 个月检查政府页面是否更新；若规则涉及商业销售、cottage food 或当地法规，应按用户所在地重新检索。
- 新增“某颜色=某菌”的规则前，必须要求食品基质中的直接研究或实验室鉴定依据；博客、论坛、短视频和社交媒体不能进入硬规则证据链。
- 安全规则的修订必须先运行第 10 节回归集，确保活性、pH、阶段和烘烤意图不会覆盖污染停止线。
