# Algorithms boundary

本目录是项目中算法与有限组合的唯一归属。

## 公共调用

业务代码只能：

```js
import { diagnoseStarter, parseStarterInput } from '../algorithms/index.js';
```

当前 Vue 层进一步收紧：组件不直接 import 本目录，只通过 `services/diagnosis.service.js`。

## 文件职责

- `dimensions.js`：有限轴与先验配置。
- `normalization.js`：归一化、文本解析、污染信号。
- `doubling-predictor.js`：纯数值预测与传感器 crossing。
- `diagnosis.js`：规则编排与结果生成。
- `index.js`：唯一公共 API。
- `enumerate-scenarios.js`：2,016 组合遍历。
- `scenario-catalog.json`：完整预生成组合。
- `build-review-queue.js` / `review-queue.json`：审核队列。

算法需要文献时只允许调用 `../references/index.js`，不得复制 citation 元数据。
