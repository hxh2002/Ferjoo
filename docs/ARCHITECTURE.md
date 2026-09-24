# 架构说明

## 依赖方向

```text
Vue Views / Components
        ↓
     services
        ↓
┌───────────────────┬───────────────────┐
│ algorithms/index  │ Supabase services │
└─────────┬─────────┴─────────┬─────────┘
          ↓                   ↓
 references/index          Supabase
```

### 强制边界

- `src/algorithms/`：所有算法、有限组合、规则、数值模型、枚举与审核工具的唯一归属。
- `src/references/`：全部参考文献库、证据注册表、引用 schema 与运行时引用元数据的唯一归属。
- Vue 组件不得直接 import 算法内部文件；只允许通过 `services/diagnosis.service.js`。
- 算法引用文献只通过 `src/references/index.js`。
- `tests/architecture.test.js` 会扫描这些边界，防止后续重构时重新产生跨层耦合。

## 算法目录职责

- `dimensions.js`：6 阶段 × 6 比例 × 8 高度 × 7 温区的有限轴与时间先验。
- `normalization.js`：字段归一化、自然语言解析、污染信号解析。
- `doubling-predictor.js`：纯数值翻倍时间模型、温度积分、2x crossing 检测。
- `diagnosis.js`：阶段规则、活性判断、时间上下文、安全覆盖、结果格式化。
- `index.js`：唯一公共 API。
- `enumerate-scenarios.js`：2,016 组合的全量黑盒枚举与结构审计。
- `scenario-catalog.json`：预生成的 2,016 组合完整结果。
- `build-review-queue.js` / `review-queue.json`：边界和证据复核队列。

## 数据层

Supabase Auth 负责邮箱/密码会话；`public.profiles` 负责系统展示 ID 与 U/A 角色。
设备和历史数据通过 `device_members` 成员关系 + RLS 隔离，浏览器 anon key 不能越权访问他人数据。
