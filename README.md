# 酵种医生 · Dr. Ferjoo — 开发者文档

Vue 3 + Vite + Supabase

本文件是项目唯一的开发者文档，集中覆盖目录结构、本地运行、Supabase 部署、用户系统、数据库设计、算法边界、测试与部署说明。

## 目录结构

```text
.
├── src/
│   ├── algorithms/          # 诊断/解析/时间预测算法 + 2,016 场景枚举
│   ├── assets/              # 经典 UI 样式 main.css
│   ├── constants/           # 经典资产常量
│   ├── references/          # 运行时证据目录 + 参考文献资料库
│   ├── components/          # Vue 展示组件
│   ├── views/               # 路由页面（诊断 / 登录 / 注册 / 历史）
│   ├── services/            # UI 与算法/数据库之间的调用边界
│   ├── composables/         # 登录会话状态
│   ├── lib/                 # Supabase 客户端
│   └── router/
├── scripts/                 # fetch-classic-assets.mjs（postinstall 自动执行）
├── supabase/
│   └── migrations/          # 001~015 SQL（后端逻辑）
├── docs/ARCHITECTURE.md     # 依赖方向图补充
├── tests/
└── public/assets/           # 经典 PNG 资产
```

## 架构总览

项目没有自建应用服务器：“后端”由 Supabase 托管服务（Auth / REST API / Storage）加 PostgreSQL 内的触发器、存储过程与 RLS 共同承担；前端构建成静态文件后完全运行在浏览器中。

```text
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                源代码层  GitHub 仓库 hxh2002/Ferjoo （main 分支）           │
 │  src/（Vue 前端）   supabase/migrations/（SQL 后端逻辑）  tests/ docs/      │
 └──────────────────────────────────────────────────────────────────────────┘
                  push / merge 到 main
        ┌─────────────────┼────────────────────────────┐
        ▼                 ▼                            ▼
 ┌──────────────┐  ┌─────────────────────┐   ┌───────────────────────┐
 │ GitHub CI    │  │ Vercel（构建+托管）   │   │ Supabase GitHub 集成   │
 │ npm test     │  │ npm run build → dist│   │ 自动将新 migrations 应  │
 │ npm run build│  │ vercel.json SPA 直达 │   │ 用到远端 Postgres      │
 └──────────────┘  └─────────────────────┘   └───────────────────────┘
                         │（CDN 全球加速分发 dist 静态文件）
                         │ HTTPS（index.html / css / js）
                         ▼
                ┌───────────────────────────────┐
                │ 用户浏览器（前端真正运行的地方）   │
                │  ┌─────────────────────────┐  │
                │  │ Vue 3 SPA               │  │
                │  │ ├── 路由 /ui / 诊断算法   │  │
                │  │ └── supabase-js 客户端   │  │
                │  └────────────┬────────────┘  │
                └───────────────┼───────────────┘
        使用 VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
        登录后请求头携带 JWT（Auth 签发的 access token）
              │                 │                  │
              ▼                 ▼                  ▼
      ┌───────────────┐  ┌─────────────────┐  ┌───────────────┐
      │ Supabase Auth │  │ Supabase API    │  │ Supabase      │
      │ (GoTrue)      │  │ (PostgREST/REST)│  │ Storage       │
      │ 登录/注册/改密  │  │ 表读写 + RPC     │  │ avatars 头像   │
      └──────┬────────┘  └───────┬─────────┘  └──────┬────────┘
             │                   │                   │
             └───────────────────┼───────────────────┘
                                ▼
                    ┌───────────────────────────┐
                    │ PostgreSQL（Supabase 托管）│
                    │ profiles / devices /      │
                    │ device_members /          │
                    │ device_measurements       │
                    │                           │
                    │ ★后端业务逻辑所在：          │
                    │ 触发器（注册邀请码校验）      │
                    │ 存储过程（claim_device…）   │
                    │ 行级安全策略 RLS            │
                    └───────────────────────────┘
                                ▲
        IoT 设备（温度/高度传感器等） HTTP POST
        /rest/v1/rpc/ingest_device_measurements
        （不用用户登录，用设备一次性 api_key，anon 角色）
```

各部分职责：

| 层次              | 是什么                                           | 在哪里运行                                              | 关键文件                           |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------- | ---------------------------------- |
| 前端源码          | Vue 3 + Vite SPA（诊断、注册/登录/资料页、算法） | 本地`npm run dev` 调试；构建产物运行在浏览器          | `src/`                           |
| 前端托管          | 静态构建 + CDN 分发                              | Vercel 云                                               | `vercel.json`（SPA 重写）        |
| 后端服务          | Auth（GoTrue）、REST/RPC（PostgREST）、Storage   | Supabase 云`https://yccvmeepajpdagizplgp.supabase.co` | —                                 |
| 数据库 + 业务逻辑 | PostgreSQL：数据表、触发器、存储过程、RLS        | Supabase 托管实例                                       | `supabase/migrations/*.sql`      |
| CI/CD             | 测试/构建、迁移应用、前端发布                    | GitHub Actions / Supabase GitHub 集成 / Vercel Git 集成 | `.github/workflows/ci.yml`       |
| 设备数据上传      | IoT 设备直连 REST RPC（一次性设备 api_key）      | 设备固件                                                | `src/services/device.service.js` |

核心关系：

1. **浏览器 ↔ Supabase**：前端经 `@supabase/supabase-js` 直连 Auth/REST/Storage；登录后带 JWT，由 Postgres RLS 决定可见与可写范围。
2. **Git 仓库是单一事实源**：前端改动合入 `main` 由 Vercel 自动构建发布；`supabase/migrations/` 新增 SQL 合入 `main` 由 Supabase GitHub 集成自动应用。
3. **“服务端逻辑”落在数据库对象**：注册邀请码校验与配额扣减在 `handle_new_auth_user` 触发器，管理员配额在 `set_user_role`，头像文件隔离在 Storage 策略。

## 本地运行

要求 Node.js 20.19+。

```bash
npm install        # 自动校验/补齐 public/assets 下的经典 PNG
cp .env.example .env
npm run dev
```

没有配置 Supabase 时，核心诊断页仍可打开，但诊断按钮、登录、注册、个人资料、设备历史页均会提示需要登录 / 未配置。

## Supabase 部署

1. 新建 Supabase 项目。
2. 首次部署可在 SQL Editor 按文件名顺序执行 `supabase/migrations/` 下的所有 `.sql`；当前项目的 `001`～`015` 已完成远端同步。
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

### 邀请制注册

自 `004` 迁移起，注册改为邀请制：**每个注册请求必须携带一个 8 位数字邀请码**，由 `profiles` 注册触发器在 `auth.users` 插入时强制校验并原子扣减邀请人名额，随后为新用户生成自己的专属邀请码。

- 存量用户（迁移前已注册）与**管理员**账号的可邀请人数上限为 `100`；
- 通过邀请码注册的新用户，其邀请码可邀请人数默认为 `1`；
- 可邀请人数可在数据库中手动修改（见下方「邀请配额管理」）；
- 邀请码只允许看，不允许改；`invite_quota` / `invited_count` 仅数据库管理员可写。

注册错误码与提示：

| 服务端返回                       | 含义                     |
| -------------------------------- | ------------------------ |
| `INVALID_INVITE_CODE`          | 邀请码不存在或已失效     |
| `INVITE_QUOTA_EXCEEDED`        | 邀请码可邀请人数已达上限 |
| `REGISTRATION_REQUIRES_INVITE` | 未提供邀请码             |

> 触发器同样作用于 Supabase Dashboard / Admin API 创建的账号：如确需绕过邀请校验直接建号，请在 `raw_user_meta_data` 中携带一个有效 `invite_code`（例如用某个高配额账号的邀请码）。

#### 邀请配额管理

管理员在 SQL Editor 中以数据库管理员身份手动调整单个用户的可邀请人数：

```sql
-- 将某用户的邀请上限改为 10（system_user_id 为对外 ID）
update public.profiles
set invite_quota = 10
where system_user_id = 'U26090001';
```

#### 诊断与账号

- 未登录账号不能使用诊断功能：点击「开始诊断」会弹出登录提醒；路由层面 `history`、`profile` 均要求登录。
- 登录、注册、个人资料 / 头像、邀请码、修改密码等均依赖 Supabase。

### 浏览器端能力

已接入 Supabase JS：邮箱注册（携带邀请码）、邮箱密码登录、自动读取系统 ID/权限、退出、设备选择/改名/在线状态、绑定码绑定设备（含 `/claim` 扫码落地页）、设备成员管理、历史数据读取（最新读数卡片 + 温度/高度/湿度/电量趋势图 + 明细表）、手工写入测试数据点、个人资料编辑（用户名 / 性别 / 出生年月日 / 身份）、头像上传（正方形裁剪）、邀请码查看复制、修改密码。

“不验证邮箱正确性”按“不验证邮箱所有权”实现：部署时关闭 Supabase Confirm email；Supabase 仍保留基本邮箱格式要求。

## 数据库设计

### profiles

| 字段                          | 用途                                                     |
| ----------------------------- | -------------------------------------------------------- |
| `id uuid`                   | 与`auth.users.id` 一一对应，内部稳定主键               |
| `system_user_id varchar(9)` | 对外 ID：`U/A + YYMM + 0001`                           |
| `role`                      | `U` 普通用户 / `A` 管理员                            |
| `email`                     | Auth 邮箱镜像                                            |
| `display_name`              | 可选显示名（用户名）                                     |
| `invite_code varchar(8)`    | 8 位数字邀请码，唯一，注册后自动生成，仅可读             |
| `invited_by uuid`           | 注册时消耗谁的邀请码（溯源）                             |
| `invite_quota int`          | 可邀请人数上限：存量 / 管理员 100，新用户默认 1          |
| `invited_count int`         | 已邀请人数（注册触发器原子自增）                         |
| `gender varchar(10)`        | 性别（male / female / other / secret）                   |
| `birth_date date`           | 出生年月日                                               |
| `profile_identity varchar`  | 身份（secondary / college / graduate / working / other） |
| `avatar_url text`           | 头像公网 URL（Storage bucket`avatars`）                |

### avatars（Storage bucket）

公共读、按 `{user_id}/avatar_*.png` 目录隔离写：仅登录后可写，且只能写自己目录下的文件。删除旧头像时按 URL 解析路径一并清理。配额受限时可通过 Storage 控制台调整。

### devices

`device_id` 是硬件/业务设备标识，设备本身不持有单一所有者。设备与用户的绑定关系记录在 `device_members` 中，实现多对多：一个设备可绑定多个用户，一个用户可绑定多个设备。

每台设备带一串 **8 位绑定码 `bind_code`**（Crockford 字母表，无 `0/O/1/I/L` 混淆字符），遵循「持有即拥有」原则：

- 用户注册后在 HISTORY 页输入绑定码（或访问 `/claim?code=XXXX-XXXX` 扫码路径），调用 `claim_device` RPC 即可把设备绑到自己账号；
- 无人认领的设备第一个绑定者成为 `owner`，之后绑定者为 `member`；
- 设备一律由出厂 SQL 插入 `devices` 行创建（不写成员，设备无主），`bind_code` 由列默认值自动签发；网页端不提供创建设备入口；
- 绑定码在设备详情中对成员可见，可直接分享给家人/同事完成二次绑定。

### device_members

绑定关系表，字段：

- `device_id` / `user_id`
- `role`：`owner`（创建者，可管理绑定）/ `member`（普通绑定成员）

设备 `last_seen` 由数据库自动更新。

### device_measurements

历史点包含：

- `device_id`
- `recorded_at`（原始采样时间）
- `temperature_c`（温度）
- `height_mm`（高度）
- `height_delta_mm`（高度变化）
- `humidity_percent`（湿度）
- `battery_percent`（电量）
- `mode`（`sleep` 休眠 / `fer` 发酵，由服务端从 `payload` 提升为独立列）
- `sensor_error`（传感器故障标记，由服务端从 `payload` 提升为独立列）
- `payload jsonb`（任意扩展字段，给未来传感器留空间）

### 数据分辨率

`device_measurements.recorded_at` 保存采样时间，数据库按原始数据逐条存储，不做时间分辨率分割。10 分钟展示桶在 Web 查询时计算：每个 10 分钟区间自动选取 `recorded_at` 最新的一条用于曲线和表格展示。

### 安全

- 所有 public 数据表开启 RLS。
- `anon` 无表权限。
- `authenticated` 只有业务需要的权限。
- 历史数据默认 append-only：客户端只有 `SELECT/INSERT`，没有 UPDATE/DELETE。

### 数据可见性

- 绑定成员（`device_members` 中任意 `member`/`owner`）可看到所绑定设备的全部历史数据。
- 一个设备可绑定多个用户，一个用户可绑定多个设备。
- 管理员（`profiles.role = 'A'`）无需绑定即可看到全部设备与全部历史数据。
- 普通用户只能看到自己的绑定记录（`device_members` 仅返回 `user_id = 自己` 的行），看不到管理员或其他用户的绑定信息。

### 设备 HTTP 上传

> 📘 面向硬件工程师的完整接入指南（凭据烧录、字段字典、十分钟桶机制、错误码、ESP32 实现、验收清单）：[`docs/HARDWARE-HTTP.md`](docs/HARDWARE-HTTP.md)

设备通过 WiFi/HTTP 每 10 分钟上传一次数据，单批最多 288 条采样（约覆盖 48 小时离线缓冲）。上传走 Supabase PostgREST RPC，不需要用户登录态。

设备必须在出厂前由管理员预先创建。生产端为每台设备生成唯一的 `device_id` 和高熵随机 `api_key`，将 `api_key` 的 SHA-256 摘要写入 `devices.api_key_hash`，再把明文 `api_key` 烧录到该设备的 Flash/NVS。数据库不会自动为未注册的设备创建凭据；设备上传前必须已有对应的 `devices` 行。

`device_id` 是设备标识，不属于机密；`api_key` 是每台设备独立的上传密码，只在受控生成/烧录流程中出现，禁止写入源码、日志、工单、共享 SQL 文本或 Git。插入设备后，数据库自动生成 `bind_code`，生产端读取它并打印在标签或卡片上，供用户在网页端认领设备。`bind_code` 不需要烧录进固件。

硬件端需要配置：

- `device_id`：该设备专属 ID；
- `api_key`：该设备专属密钥；
- `VITE_SUPABASE_ANON_KEY`：Supabase 项目的 `anon/public` key，作为 HTTP `apikey` 请求头。它是项目级公开客户端 key，不承担设备身份认证，可以写入固件；
- 上传接口 URL：`https://yccvmeepajpdagizplgp.supabase.co/rest/v1/rpc/ingest_device_measurements`。

`VITE_SUPABASE_ANON_KEY` 可从 Supabase Dashboard → **Project Settings → API** → **anon public** 获取；前端项目本地副本位于根目录 `.env` 的 `VITE_SUPABASE_ANON_KEY`。不要把整个 `.env` 文件交给硬件方。

设备上传（使用设备自身凭据，不需要用户 token）：

```text
POST https://yccvmeepajpdagizplgp.supabase.co/rest/v1/rpc/ingest_device_measurements
apikey: <VITE_SUPABASE_ANON_KEY>
Content-Type: application/json

{
  "p_device_id": "dev_xxxx",
  "p_api_key": "xxxx",
  "p_measurements": [
    { "recorded_at": "2026-09-04T08:00:00Z", "temperature_c": 24.5, "height_mm": 12.3, "height_delta_mm": 0.5, "humidity_percent": 78.1, "battery_percent": 91, "payload": {} }
  ]
}
```

- `recorded_at` 为 ISO 8601 时间；各数值字段可省略或传 `null`。
- 原始数据逐条落库，无分桶唯一约束：重复上传会保存为多条原始记录，网页端每个 10 分钟桶只展示 `recorded_at` 最新的一条，固件仍需做好本地去重。单批最多 288 条，超出返回 `TOO_MANY_MEASUREMENTS`。
- `api_key` 仅在受控出厂生成/烧录流程中出现，数据库只存 SHA-256 摘要；设备不得携带用户 JWT，也不要添加 `Authorization` 请求头。
- `anon` 角色没有表级读写权限，仅被单独授权执行设备上传 RPC；RPC 通过 `device_id + api_key` 校验设备，并限制数据格式、范围和批量大小。

绑定 / 解绑用户（需登录；绑定由设备 owner 或管理员发起，成员本人也可解绑自己）：

```text
POST https://<project-ref>.supabase.co/rest/v1/rpc/bind_device_member
Authorization: Bearer <用户 access token>
apikey: <anon public key>
Content-Type: application/json

{ "p_device_id": "dev_xxxx", "p_system_user_id": "U26090002" }
```

```text
POST https://<project-ref>.supabase.co/rest/v1/rpc/unbind_device_member
Authorization: Bearer <用户 access token>
apikey: <anon public key>
Content-Type: application/json

{ "p_device_id": "dev_xxxx", "p_system_user_id": "U26090002" }
```

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
- Supabase migration 包含用户 ID、RLS、设备与历史数据表。

说明：`tests/` 下其余 `*.test.js` 为上一轮算法架构（规则引擎 / 审核队列）留存的归档用例，不属于当前 `npm test` 范围，单独运行可能失败。

## 部署

### 自动同步 Supabase

项目已启用 Supabase 原生 GitHub Integration：仓库 `hxh2002/Ferjoo`、工作目录 `.`、生产分支 `main`，合并到 `main` 后由 Supabase 自动执行数据库迁移。项目不再使用 GitHub Actions 执行迁移，避免重复应用。

当前 `001`～`015` 已在远端执行。若本地需要查看迁移状态，使用：

```bash
npx supabase@latest link --project-ref yccvmeepajpdagizplgp
npx supabase@latest migration list
```

之后只要提交新的 `supabase/migrations/00X_*.sql` 并合并到 `main`，Supabase GitHub Integration 就会自动应用待执行迁移。`004_invites_and_profiles.sql` 设计为幂等迁移：若已通过 SQL Editor 手动执行过一次，再次由 GitHub Integration 应用也不会报错。不要把数据库密码、Supabase access token 或 secret key 写入 `.env`、源码或 Vercel 前端变量。

迁移文件一经应用就不要改名：远端 `supabase_migrations.schema_migrations` 记录的是应用时的文件版本号，重命名会让远端出现「本地不存在的版本」，集成检查随即失败并报 `Remote migration versions not found in local migrations directory.`。`005` 是历史空号，不再补号；`008` 曾在远端缺失，已于修复历史后补执行。确需修正历史时用 `npx supabase@latest migration repair --status applied|reverted <version>` 对齐，不要手工改 `schema_migrations`。

Vercel 已通过 Supabase Integration 连接项目 `ferjoo`。由于应用使用 Vite，前端变量应使用以下名称，并只同步到 Production：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Preview 和 Development 环境无需同步生产数据库凭据。

Vercel：

- Build command: `npm run build`
- Output: `dist`
- `vercel.json` 已包含 SPA rewrite

也可部署到任意能托管 Vite 静态产物的平台。

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
- [`docs/HARDWARE-HTTP.md`](docs/HARDWARE-HTTP.md)（硬件工程师 HTTP 接入指南）
- [`src/references/README.md`](src/references/README.md)
- [`public/assets/CLASSIC_ASSETS.md`](public/assets/CLASSIC_ASSETS.md)（资产说明）
