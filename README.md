# 酵种医生 · Dr. Ferjoo — 开发者文档

Vue 3 + Vite + Supabase 的酵种诊断应用：有限场景诊断算法 + 剩余翻倍时间估算 + 证据追踪 + 账号与设备 10 分钟测量历史，视觉为大更新前最后一版的**经典 UI**（橙色整页背景、磨砂玻璃卡片、双品牌 Logo、顶部居中页签切换）。

本文件是项目唯一的开发者文档，集中覆盖目录结构、本地运行、Supabase 部署、用户系统、数据库设计、算法边界、测试与部署说明。

## 目录结构

```text
.
├── src/
│   ├── algorithms/          # 诊断/解析/时间预测算法 + 2,016 场景枚举
│   ├── assets/              # 经典 UI 样式 main.css
│   ├── constants/           # 经典资产常量（固定提交基线）
│   ├── references/          # 运行时证据目录 + 参考文献资料库
│   ├── components/          # Vue 展示组件
│   ├── views/               # 路由页面（诊断 / 登录 / 注册 / 历史）
│   ├── services/            # UI 与算法/数据库之间的调用边界
│   ├── composables/         # 登录会话状态
│   ├── lib/                 # Supabase 客户端
│   └── router/
├── scripts/                 # fetch-classic-assets.mjs（postinstall 自动执行）
├── supabase/
│   └── migrations/001_initial.sql
├── docs/ARCHITECTURE.md     # 依赖方向图补充
├── tests/
└── public/assets/           # 经典 PNG 资产（固定在提交 0a8d43b）
```

## 本地运行

要求 Node.js 20.19+。

```bash
npm install        # 自动校验/补齐 public/assets 下的经典 PNG
cp .env.example .env
npm run dev
```

没有配置 Supabase 时，核心诊断页仍可使用；登录、注册、设备历史页会提示未配置。

## Supabase 部署

1. 新建 Supabase 项目。
2. 在 SQL Editor 执行 `supabase/migrations/001_initial.sql`。
3. 在 **Authentication → Providers → Email** 中确认 Email/Password 已启用，并保持 **Confirm email** 开启（默认）。
   - 注册后会发送验证邮件，用户完成邮箱确认后才能登录。
4. 从 Project Settings 获取 Project URL 与 anon/public key；复制项目根目录 `.env.example` 为 `.env` 并填入：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. 运行 `npm install && npm run dev`。

## 用户系统

### 系统用户 ID

普通用户注册后自动分配展示 ID，例如：`U26090001`

格式为 `权限(U/A) + 年月(YYMM) + 4 位月内序号`，普通注册固定为 `U`。系统 ID 使用独立计数器表，在事务中 `INSERT ... ON CONFLICT DO UPDATE` 分配，避免并发注册得到重复序号。

数据库内部关系全部使用 `auth.users.id` 的 UUID；展示 ID 只用于对外识别。因此即使以后调整角色、重新分配展示 ID，设备与历史数据也不会断链。

### 管理员

管理员不是由浏览器注册接口创建。需要管理员时，在 SQL Editor 中以数据库管理员身份调用：

```sql
select private.set_user_role('AUTH_USER_UUID', 'A');
```

该函数会分配新的 `A + YYMM + 4 位序号`，例如 `A26090001`。角色提升函数不授权给前端，仅数据库管理员可执行。

### 浏览器端能力

已接入 Supabase JS：邮箱注册、邮箱密码登录、自动读取系统 ID/权限、退出、设备绑定、历史数据读取、手工写入测试数据点。

“不验证邮箱正确性”按“不验证邮箱所有权”实现：部署时关闭 Supabase Confirm email；Supabase 仍保留基本邮箱格式要求。

## 数据库设计

### profiles

| 字段 | 用途 |
|---|---|
| `id uuid` | 与 `auth.users.id` 一一对应，内部稳定主键 |
| `system_user_id varchar(9)` | 对外 ID：`U/A + YYMM + 0001` |
| `role` | `U` 普通用户 / `A` 管理员 |
| `email` | Auth 邮箱镜像 |
| `display_name` | 可选显示名 |

### devices

`device_id` 是硬件/业务设备标识；`user_id` 是所有者 UUID。RLS 限制普通用户只管理自己的设备；设备 `last_seen` 由数据库自动更新。

### device_measurements

历史点包含：

- `device_id` / `user_id`
- `recorded_at`（原始采样时间）
- `bucket_start`（10 分钟桶）
- `temperature_c`（温度）
- `height_mm`（高度）
- `height_delta_mm`（高度变化）
- `humidity_percent`（湿度）
- `battery_percent`（电量）
- `payload jsonb`（任意扩展字段，给未来传感器留空间）

### 数据分辨率

`device_measurements.recorded_at` 保存采样时间；写入前数据库触发器使用 PostgreSQL `date_bin` 生成 `bucket_start`，固定为 10 分钟时间桶。唯一键 `(device_id, bucket_start)` 保证同一设备同一 10 分钟桶只有一个数据点。

### 安全

- 所有 public 数据表开启 RLS。
- `anon` 无表权限。
- `authenticated` 只有业务需要的权限。
- 历史数据默认 append-only：客户端只有 `SELECT/INSERT`，没有 UPDATE/DELETE。

## 算法边界

`src/algorithms/` 是项目中所有算法、有限组合、规则、数值模型、枚举与审核工具的唯一归属。业务代码只能：

```js
import { diagnoseStarter, parseStarterInput } from '../algorithms/index.js';
```

当前 Vue 层进一步收紧：组件不直接 import 算法目录，只通过 `services/diagnosis.service.js` 调用。算法需要文献时只允许调用 `../references/index.js`，不得复制 citation 元数据。

文件职责：

- `dimensions.js`：有限轴与先验配置。
- `normalization.js`：归一化、文本解析、污染信号。
- `doubling-predictor.js`：纯数值预测与传感器 crossing。
- `diagnosis.js`：规则编排与结果生成。
- `index.js`：唯一公共 API。
- `enumerate-scenarios.js`：2,016 组合遍历。
- `scenario-catalog.json`：完整预生成组合。
- `build-review-queue.js` / `review-queue.json`：审核队列。

依赖方向由 `tests/architecture.test.js` 强制约束，详见 [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)。

## 测试

```bash
npm test           # 诊断行为测试 + 2,016 场景结构自检 + 架构边界检查
npm run audit      # 仅运行 2,016 场景枚举自检
```

`npm run audit` 必须完整遍历 6 × 6 × 8 × 7 = **2,016** 组合并保持无异常。

关键验收：

- 2,016 组合可完整枚举，结构异常为 0；
- 温度高于有效域时不会继续给线性“越热越快”预测；
- 污染安全规则覆盖高度、pH 等正常信号；
- 文献引用可解析，且只能从 `src/references/` 取；
- Vue 代码不能绕过 service 深度调用算法；
- Supabase migration 包含用户 ID、RLS、设备和 10 分钟数据桶。

说明：`tests/` 下其余 `*.test.js` 为上一轮算法架构（规则引擎 / 审核队列）留存的归档用例，不属于当前 `npm test` 范围，单独运行可能失败。

## 部署

Vercel：

- Build command: `npm run build`
- Output: `dist`
- `vercel.json` 已包含 SPA rewrite

也可部署到任意能托管 Vite 静态产物的平台。

## v1.0 重构与迁移背景

从 v0.5 静态项目（`index.html + app.js + styles.css`）迁移而来：

1. 原 `starter-doctor.browser.js` 拆分为 `src/algorithms/` 中职责明确的模块，公共调用只走 `src/algorithms/index.js`。
2. 原 `scripts/` 与 `reports/` 不再散落：枚举器、审核器和 2,016 组合结果全部归入算法目录。
3. 原 `research/` 整体迁入 `src/references/`，运行时引用元数据全部从算法文件移出。
4. 原页面替换为 Vue 3 + Vue Router + Vite：组件化诊断表单与结果页、登录/注册页、设备历史页，并采用 service/composable 分层。
5. 新增 Supabase：邮箱/密码注册登录、自动系统用户 ID、U/A 权限字段、设备绑定、10 分钟历史数据、RLS 隔离。
6. 原诊断算法行为由迁移后的 Node 回归测试继续覆盖，2,016 组合枚举仍要求零结构异常。

完整验证命令：

```bash
npm install
npm test
npm run audit
npm run build
npm run dev
```

## 更多说明

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- [`src/references/README.md`](src/references/README.md)
- [`public/assets/CLASSIC_ASSETS.md`](public/assets/CLASSIC_ASSETS.md)（经典资产固定基线说明）
