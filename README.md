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
│   ├── views/               # 电脑端页面、共享账号页及 mobile/ 手机端页面
│   ├── services/            # UI 与算法/数据库之间的调用边界
│   ├── composables/         # 登录会话、养护草稿、酵种名称查询
│   ├── lib/                 # Supabase 客户端、设备识别、UUID、本地时间与账号导航
│   └── router/
├── scripts/                 # fetch-classic-assets.mjs（postinstall 自动执行）
├── supabase/
│   └── migrations/          # SQL 后端逻辑与设备注册迁移
├── tests/
└── public/assets/           # 经典 PNG 资产
```

## 架构总览

项目没有自建应用服务器：“后端”由 Supabase 托管服务（Auth / REST API / Storage）加 PostgreSQL 内的触发器、存储过程与 RLS 共同承担；前端构建成静态文件后完全运行在浏览器中。

```text
 ┌──────────────────────────────────────────────────────────────────────────┐
 │                源代码层  GitHub 仓库 hxh2002/Ferjoo （main 分支）           │
 │  src/（Vue 前端）   supabase/migrations/（SQL 后端逻辑）  tests/           │
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

没有配置 Supabase 时，电脑端核心诊断页仍可打开，但诊断、账号与设备云端功能不可用。手机端支持游客填写观察、生成本地建议；保存到云端、读取账号记录和设备数据需要配置 Supabase 并登录。

## 电脑端与手机端

### 入口与布局边界

- 电脑端诊断入口为 `/`，设备历史入口为 `/history`。移动设备访问 `/` 时自动进入 `/today`；可通过 `/?view=desktop` 明确访问电脑端诊断页。
- 手机端任务页面位于 `src/views/mobile/`，统一使用 `MobileShell`；电脑端保留经典布局。入口识别只负责选择默认首页，不禁止显式访问另一端路由。
- `/login`、`/register`、`/profile`、`/claim` 是共享账号页面：在移动浏览器或手机端回跳场景下使用手机外壳。登录、注册切换保留合法站内 `redirect`，绑定完成返回相应设备页面。
- 两端共用 Supabase 账号与服务层，但**目前不是全部功能逐项对等，也不是所有页面组件完全分离**。本轮已修复手机端主流程与账号闭环，尚未进行全量手机 UI 美化重构。

### 手机端路由与能力

| 路径 | 能力 | 登录要求 |
| --- | --- | --- |
| `/today` | 今日任务入口、酵种选择及养护操作入口 | 游客可进入，账号数据需登录 |
| `/checkin` | 分步骤填写观察、生成本地建议 | 游客可生成，云端保存需登录 |
| `/feeding` | 记录喂养事实、保存确认与连续新增 | 云端保存需登录 |
| `/records` | 观察/喂养记录列表，酵种、类型、日期筛选与分页 | 云端记录需登录 |
| `/reports/session` | 当前本地观察建议 | 游客可查看当前会话 |
| `/reports/:id` | 已保存观察快照或喂养事实详情 | 云端记录需登录 |
| `/me` | 个人与账号操作入口 | 游客可进入 |
| `/me/devices`、`/me/devices/:deviceId` | 设备列表与设备设置 | 需要登录 |
| `/devices/:deviceId/trend` | 设备趋势、指标与时间范围选择 | 需要登录 |

### 最新主流程修复（`15eb40f`）

- **详情分流**：观察记录读取保存时的建议快照，不重新诊断；喂养记录仅展示时间、酵种与比例等事实，不生成观察建议。
- **记录筛选与返回**：空酵种筛选表示“全部酵种”；列表每页 40 条，筛选与页码保存在路由 query，详情通过 `returnTo` 恢复列表位置。
- **喂养幂等生命周期**：首次提交锁定请求编号与负载，结果未确认时使用同一内容重试；保存确认后，通过“开始下一条喂养记录”生成新的请求编号，不复用上一条已确认请求。草稿写入本地存储，存储不可用时阻止无法安全重试的提交。
- **安全 UUID**：观察与喂养统一使用 `crypto.randomUUID()`；不可用时通过 `crypto.getRandomValues()` 构造 UUID v4。没有安全随机源则明确提示失败，不用时间戳冒充 UUID。
- **时间语义**：`datetime-local` 使用本地时间字符串，查询/保存前转换为 UTC ISO；拒绝无效日期及夏令时跳过时段。趋势取消编辑会恢复已应用范围；查询结束边界采用排他上界，允许覆盖所选日期，而新增记录仍不得晚于当前时间。
- **对象名称与账号闭环**：业务界面显示酵种名称及名称加载状态，不直接以裸 UUID 代替名称；名称查询随账号切换隔离，手机登录、注册及设备绑定保留合法站内回跳。

### 当前边界与后续验收

- 手机端尚未补齐电脑设备历史的全部分析交互，例如日期定位、手动刷新、采样详情、Δ高度、自动区间与统计；不要将当前状态理解为双端功能已经完全一致。
- 真实账号登录、邮箱确认、生产登录态保存及真机视觉仍需专项验收；本地游客流程验证不能替代这些检查。
- 后续界面调整应保持电脑端经典布局与手机端样式隔离，并通过公共服务层维持相同业务规则，避免分别实现算法或数据库权限逻辑。

## Supabase 部署

**默认通过 GitHub 部署，完整流程见下文「部署」。** 当前项目为 `yccvmeepajpdagizplgp`，数据库结构、业务 SQL 与设备注册均以仓库中的迁移为准。

1. 首次建立环境时，在 Supabase 中关联 GitHub 仓库 `hxh2002/Ferjoo`，工作目录设为 `.`，生产分支设为 `main`，由原生 GitHub Integration 应用 `supabase/migrations/` 中的迁移。
2. 后续变更只新增迁移文件，经检查、提交并推送或合并到 GitHub `main` 后自动部署；不默认使用 SQL Editor、CLI `db push` 或 Supabase MCP 直接修改生产库。
3. 在 **Authentication → Providers → Email** 中确认 Email/Password 已启用，并保持 **Confirm email** 开启。
   - 注册后会发送验证邮件，用户完成邮箱确认后才能登录。
4. 从 Project Settings 获取 Project URL 与 anon/public key；本地开发复制项目根目录 `.env.example` 为 `.env` 并填入：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. 运行 `npm install && npm run dev`。Vercel 生产环境变量另在平台配置，不提交 `.env`。

### 高度预约 Web Push 上线前置

迁移 `020_height_web_push.sql` 使用 `pg_cron` 每分钟触发事务性扫描，`pg_net` 只调用同项目的 Edge Function；订阅、事件与投递表均有显式 grant/RLS，推送私钥不进入仓库。内部密钥存放在 `private.height_push_config` 配置表（private schema 不经 API 暴露，对所有 API 角色 revoke；PG17 新项目不提供 supabase_vault，故不依赖 Vault）。上线前由项目管理员在 Supabase 控制台确认 `pg_cron`、`pg_net` 已启用，然后执行：

```bash
supabase functions deploy process-height-alerts --no-verify-jwt
supabase secrets set HEIGHT_PUSH_INTERNAL_SECRET='<至少32字符随机值>' VAPID_PUBLIC_KEY='<VAPID公钥>' VAPID_PRIVATE_KEY='<VAPID私钥>' VAPID_SUBJECT='mailto:ops@example.com'
```

再以数据库管理员身份在 SQL Editor 写入配置（值不要提交）：

```sql
insert into private.height_push_config(name, value) values
  ('height_push_worker_url', 'https://<project-ref>.supabase.co/functions/v1/process-height-alerts'),
  ('height_push_internal_secret', '<与 HEIGHT_PUSH_INTERNAL_SECRET 相同的值>');
```

将 `VITE_VAPID_PUBLIC_KEY` 配到 Vercel；仅公钥可进入浏览器。迁移、函数部署、扩展权限、真实浏览器推送和 iOS 主屏幕行为未在本地环境验证，不要将本地测试视为已上线。投递是有限重试和去重，不承诺恰好一次；浏览器/供应商仍可能延迟或丢弃推送。

迁移 `021_device_ingest_upsert.sql` 只调整设备批量上传函数：同一 `(device_id, recorded_at)` 已存在即跳过，重放同一批数据幂等；不删除、不覆盖既有读数，也不新增唯一约束（数据库层自 013 起保持追加语义，十分钟桶去重在查询层完成）。

Auth 提供商、邮件、回跳地址及平台集成等设置需在对应控制台单独核对，不能把迁移成功等同于所有平台配置已同步。

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

- 电脑端未登录时点击「开始诊断」会弹出登录提醒；手机端允许游客生成本地观察建议，但云端保存需要登录。`history`、`profile`、`claim` 及手机设备路由均要求登录。
- 登录、注册、个人资料 / 头像、邀请码、修改密码等均依赖 Supabase。

### 浏览器端能力

已接入 Supabase JS：邮箱注册（携带邀请码）、邮箱密码登录、自动读取系统 ID/权限、退出、设备选择/改名/在线状态、绑定码绑定设备（含 `/claim` 扫码落地页）、设备成员管理、历史数据读取（最新读数卡片 + 温度/高度/湿度/电量趋势图 + 明细表）、手工写入测试数据点、个人资料编辑（用户名 / 性别 / 出生年月日 / 身份）、头像上传（正方形裁剪）、邀请码查看复制、修改密码。

当前部署约定保持 Supabase **Confirm email** 开启，注册后需完成邮箱确认。若另行决定取消邮箱所有权验证，须显式调整 Supabase 配置；前端仍受基本邮箱格式校验约束。

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

### starters / care_records（迁移 `015`）

- `starters` 保存账号拥有的酵种：`id`、`user_id`、`name`、`created_at`。
- `care_records` 保存养护事实：`request_id`、`starter_id`、`kind`（`feeding` / `observation`）、`occurred_at`、输入 `input`、建议快照 `result`、喂养比例 `ratio` 与创建时间。
- 两张表均启用 RLS，仅允许用户读取和新增自己的数据；养护记录不是设备传感器数据，不与 `device_measurements` 混用。
- 保存走 `save_care_record` RPC，校验酵种归属。`(user_id, request_id)` 唯一约束保证相同请求重复提交只返回同一记录；同一编号携带不同内容时返回 `REQUEST_ID_CONFLICT`。
- 本次主流程修复复用现有 `015_mobile_care.sql`，没有新增数据库迁移。

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

> 📘 硬件工程师的完整接入说明见本文件「硬件 HTTP 接入」一节。

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
- 原始数据逐条落库，无分桶唯一约束：同一 `(device_id, recorded_at)` 已存在即跳过（重复投递同一批数据幂等，不覆盖已写入行），不同时间戳的读数仍逐条保存；网页端每个 10 分钟桶只展示 `recorded_at` 最新的一条，固件仍需做好本地去重。单批最多 288 条，超出返回 `TOO_MANY_MEASUREMENTS`。
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

`src/algorithms/` 集中核心诊断、预测模型与场景枚举；服务层和界面仍包含输入适配、分桶与图表派生计算。调用核心算法应使用公共入口，不深度导入内部文件：

```js
import { diagnoseStarter, parseStarterInput } from '../algorithms/index.js';
```

当前电脑诊断主调用经 `services/diagnosis.service.js`，手机观察经 `services/mobile-diagnosis.service.js`。`DoctorView.vue` 与 `DiagnosisResult.vue` 仍直接从算法公共入口导入解析、选项或格式化能力，因此尚未实现严格的 Vue → service 单一路径。算法需要文献时通过 `../references/index.js`，不得复制 citation 元数据。

文件职责：

- `dimensions.js`：有限轴与先验配置。
- `normalization.js`：归一化、文本解析、污染信号。
- `doubling-predictor.js`：纯数值预测与传感器 crossing。
- `diagnosis.js`：规则编排与结果生成。
- `index.js`：唯一公共 API。
- `enumerate-scenarios.js`：2,016 组合遍历。
- `scenario-catalog.json`：完整预生成组合。
- `build-review-queue.js` / `review-queue.json`：审核队列。

依赖方向约定见上文「架构说明」。`tests/architecture.test.js` 是历史架构检查用例，未接入当前默认测试链，需更新其断言后再作为持续集成门禁。

## 测试

```bash
npm test           # 诊断行为测试 + 2,016 场景结构自检
npm run audit      # 仅运行 2,016 场景枚举自检
node tests/mobile-care.test.js
node tests/mobile-device.service.test.js
npm run build
```

手机养护与设备服务测试需单独运行，目前未包含在 `npm test` 脚本中；架构边界测试也不在当前默认测试链中。

最新主流程修复已验证构建、诊断测试、手机养护契约和设备服务测试；另验证了 `Asia/Singapore` / `America/New_York` 本地时间往返、夏令时跳过时段拒绝及游客观察到本地报告流程。这些结果不代表已经完成真实账号或生产环境端到端验收。

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

### 默认发布路径：GitHub → Vercel + Supabase

GitHub `hxh2002/Ferjoo` 的 `main` 是生产环境唯一发布入口。默认流程如下：

1. 在本地修改代码或新增 `supabase/migrations/00X_*.sql`。
2. 本地运行必要的测试与构建检查。
3. 提交并推送到 GitHub `main`（或通过 Pull Request 合并到 `main`）。
4. GitHub Actions 运行测试与构建；Vercel Git 集成自动构建前端并发布 `dist`；Supabase 原生 GitHub Integration 自动应用待执行迁移。
5. 检查 GitHub Actions、Vercel Deployment 和 Supabase migration 日志，确认三处均成功。

不要把生产发布默认理解为本地直接部署：不使用 `vercel deploy`、Supabase MCP、生产 SQL Editor 或本地 `supabase db push` 作为常规发布路径。只有在明确的故障恢复或迁移修复场景下，才单独执行平台控制台或 CLI 操作。

### 部署状态核查（2026-10-16）

通过 GitHub API 核查提交 `6c40b9307d9af14dc7ecef1e91d47ccd7adf0236`（包含此前的设备注册迁移）：

- GitHub `test-and-build`：`completed / success`。
- Vercel：提交状态为 `success`，对应 `Production` deployment 状态为 `success`，描述为 `Deployment has completed`。
- Supabase：名为 `Supabase Preview` 的 check 为 `completed / success`。该结果证明集成检查通过，但不能单凭名称推断生产库中 `016`、`017` 的迁移记录及设备行已确认；这部分仍需生产 migration 日志或只读数据库查询证据。

以上是该提交的检查快照，不代表后续提交自动成功；CI 和平台部署由各自集成触发，当前工作流没有实现“CI 成功后才允许平台发布”的串行门禁。

### GitHub Actions 的职责

`.github/workflows/ci.yml` 只负责在 `main` 推送和 Pull Request 上执行 `npm install`、`npm test` 与 `npm run build`，不执行数据库迁移。数据库迁移由 Supabase 原生 GitHub Integration 负责，前端发布由 Vercel Git 集成负责。

### 自动同步 Supabase

项目已启用 Supabase 原生 GitHub Integration：仓库 `hxh2002/Ferjoo`、工作目录 `.`、生产分支 `main`，合并到 `main` 后由 Supabase 自动执行数据库迁移。项目不再使用 GitHub Actions 执行迁移，避免重复应用。

当前仓库包含 `001`～`017` 范围内的 16 个迁移（`005` 是历史空号）；实际是否已在远端执行，以 Supabase Dashboard 的 migration 日志为准。若本地需要查看迁移状态，使用：

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

## 架构说明

### 依赖方向

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

### 设计约定与当前边界

- `src/algorithms/`：核心诊断、数值预测与场景枚举的归属；服务/UI 的适配和派生计算不等同于核心诊断模型。
- `src/references/`：参考文献库、证据注册表、引用 schema 与运行时引用元数据的归属。
- Vue 不应深度导入算法内部文件；主诊断通过电脑/手机各自的 service 调用。当前两处 Vue 直接使用公共入口的例外见「算法边界」。
- 算法引用文献只通过 `src/references/index.js`。
- `tests/architecture.test.js` 是历史静态检查，未接入默认测试或 CI；其 catalog 结构、允许的 service 及 scripts 目录断言与当前实现不兼容，不能视为有效门禁。
- 默认枚举自检检查 2,016 条结果数量及 `status/title` 非空，不代表完整业务正确性、引用完整性或真实 RLS 已验收。

### 数据层

Supabase Auth 负责邮箱/密码会话；`public.profiles` 负责系统展示 ID 与 U/A 角色。设备和历史数据通过 `device_members` 成员关系与 RLS 隔离，浏览器 anon key 不能越权访问他人数据。

## 硬件 HTTP 接入

设备通过 HTTPS POST 调用 Supabase RPC `ingest_device_measurements`，不需要用户登录或用户 JWT；设备使用自身的 `device_id` 和 `api_key`，请求头仅携带项目级 `anon` key：

```text
POST https://yccvmeepajpdagizplgp.supabase.co/rest/v1/rpc/ingest_device_measurements
apikey: <VITE_SUPABASE_ANON_KEY>
Content-Type: application/json
```

请求体示例：

```json
{
  "p_device_id": "dev_xxxx",
  "p_api_key": "xxxx",
  "p_measurements": [
    {
      "recorded_at": "2026-09-04T08:00:00Z",
      "temperature_c": 24.5,
      "height_mm": 12.3,
      "height_delta_mm": 0.5,
      "humidity_percent": 78.1,
      "battery_percent": 91,
      "payload": {}
    }
  ]
}
```

### 出厂注册与安全

- 每台设备必须由管理员预先插入 `public.devices`，数据库只保存 `api_key` 的 SHA-256 摘要，明文只在受控烧录流程中出现。
- 插入设备后数据库自动生成 8 位 `bind_code`；生产端读取它并打印到标签，用户通过 HISTORY 或 `/claim?code=XXXX-XXXX` 认领设备。
- `api_key` 不得写入源码、日志、工单、共享 SQL 文本或 Git；设备端将其写入 Flash/NVS。
- `anon` 角色没有表级读写权限，仅被授权执行设备上传 RPC；设备不得携带 `Authorization` 请求头。
- 单批最多上传 288 条；`recorded_at` 使用 ISO 8601 UTC。重复上传会保留原始记录，网页端按十分钟桶展示最新一条。

### 设备验收

- 每台设备拥有独立的 `device_id` 和 `api_key`。
- 首次上传前完成 SNTP 校时；断网数据写入 Flash 缓冲区并在恢复后批量补传。
- 收到 `INVALID_DEVICE_CREDENTIALS` 后停止重试；`TOO_MANY_MEASUREMENTS` 则拆分批次。
- 量产固件启用 TLS 证书校验，不使用 `setInsecure()`。

## 更多说明

- [`src/references/README.md`](src/references/README.md)
- [`public/assets/CLASSIC_ASSETS.md`](public/assets/CLASSIC_ASSETS.md)（资产说明）
