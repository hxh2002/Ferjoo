# 酵种医生 · Dr. Ferjoo — 开发者文档

Vue 3 + Vite + Supabase

本文件是项目唯一的开发者文档，集中覆盖目录结构、本地运行、Supabase 部署、用户系统、数据库设计、算法边界、测试与部署说明。

## 目录结构

```text
.
├── src/
│   ├── algorithms/          # 诊断/解析/时间预测算法 + 2,016 场景枚举
│   ├── assets/              # 令牌、字体、手机/桌面/后台样式；welcome/ 为欢迎页图片
│   ├── constants/           # 经典资产常量
│   ├── references/          # 运行时证据目录 + 参考文献资料库
│   ├── components/          # 产品外壳 MobileShell、宽屏侧栏 DesktopNav；mobile/ 为基础组件；admin/ 为后台控件
│   ├── views/               # 欢迎页 WelcomeView、产品页面（mobile/）与后台（admin/）
│   ├── services/            # UI 与算法/数据库之间的调用边界，含 admin.service.js
│   ├── composables/         # 登录会话、养护草稿、768px 断点、酵种名称查询
│   ├── lib/                 # 站点入口、导航、埋点口径、账号导航，以及可单测的纯逻辑
│   ├── platform/            # 浏览器对话框等平台适配
│   └── router/
├── scripts/                 # fetch-classic-assets.mjs、subset-fangyuan.py
├── supabase/
│   ├── migrations/          # SQL 后端逻辑（001–034，005 为空号）
│   └── functions/           # Edge Function：高度与过峰提醒推送
├── tests/
├── public/assets/           # 经典 PNG 资产
├── public/fonts/            # 方圆体 WOFF2 子集
└── AlimamaFangYuanTiVF-Thin-2.ttf   # 字体源文件，网页不直接加载
```

界面字体是阿里妈妈方圆体。`public/fonts/fangyuan-ui.woff2` 进入首屏；其余汉字在 `fangyuan-ext-XX.woff2` 里按 `unicode-range` 分段，浏览器只在画面上出现这些字时下载。字重轴为 200–700。根目录的 TTF 只作为切分源文件，重新生成用 `npm run fonts:subset`（依赖 Python 的 fontTools 与 brotli）。

`src/lib/` 里可单测、且不直接访问 Supabase 的纯逻辑：

| 文件 | 职责 |
| --- | --- |
| `mobile-records.js` | 日记日期、轮次状态、正式采样日期标记（`formalMeasurementDays`）、详情返回目标与读取缓存 |
| `checkin-flow.js` | 观察流程「下一步 / 上一步」落点与错误定位；可疑 / 不确定时直达核对，只校验当前页可见字段 |
| `record-detail.js` | 轮次详情的窗口口径、「已发酵 / 历时」、曲线裁剪（窗口外、非 `fer`、传感器故障点剔除）与空态文案 |
| `starter-labels.js` | 同名酵种的次要说明（创建日期，同日再补时分） |
| `profile-options.js` | 资料选项；手机端性别面板只列男 / 女，旧值仍可回显 |
| `site-entry.js` | 按 hostname 区分欢迎页与产品主体，不看视口宽度 |
| `desktop-nav.js` | 宽屏侧栏与后台分区的路由和匹配规则 |
| `page-title.js` | 手机顶栏与桌面顶栏共用的页面标题 |
| `height-band.js` | 膨胀倍数到文案区间的唯一映射 |
| `rise-phase.js` | 过峰锁定；过峰提醒晚于实际峰值 |
| `admin-access.js` | 后台展示口径；真正的拒绝在数据库函数与 RLS |
| `analytics-pages.js` / `analytics-report.js` | 埋点页面名，以及后台观察用的汇总口径 |

## 架构总览

项目没有自建应用服务器：“后端”由 Supabase 托管服务（Auth / REST API / Storage）、PostgreSQL 内的触发器 / 存储过程 / RLS，以及负责高度提醒投递的 Edge Function 共同承担；前端构建成静态文件后完全运行在浏览器中。

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
                │  │ ├── 欢迎页 / 产品外壳 / 诊断 │  │
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
| 定时推送          | pg_cron 扫描 → Edge Function 投递 Web Push      | Supabase 托管实例 / Edge Functions                       | `supabase/functions/process-height-alerts/` |
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

没有配置 Supabase 时，本地打开的是产品主体：游客可以看设备首页、填写观察并生成本地建议。保存到云端、读取账号记录和设备数据需要配置 Supabase 并登录。

## 站点入口与布局

产品只有一套页面。宽窄屏由 CSS 的 `768px` 断点决定：窄屏是底部三个标签（设备 / 日记 / 我的），宽屏是同一批路由的侧栏。路由不看 User-Agent，也没有手动切换布局的入口。日记在窄屏用周条、宽屏用整月，这是唯一一处跟随断点改变结构的地方（`useDesktopLayout`）。

### 两个域名

| 主机 | `/` | 其它路径 |
| --- | --- | --- |
| `ferjoo.com`、`www.ferjoo.com` | 欢迎页 `WelcomeView` | 原样跳到 `https://dr.ferjoo.com` 的同一路径 |
| `ferjoo.localhost`、`www.ferjoo.localhost` | 本地预览欢迎页 | 跳到 `dr.ferjoo.localhost`（保留端口） |
| `dr.ferjoo.com`、`localhost`、预览域名 | 进入 `/device` | 产品主体 |

欢迎页是英文起始轮播（Device / Data / Journal / Doctor / Timing），以及 `#stay`、`#contact` 两个表单。两个表单都调用 `submit_welcome_inquiry`，把一行写入 `welcome_inquiries`（`kind` 为 `stay` 或 `contact`）。页面只确认已经保存，不发送邮件。Supabase 未配置或写入失败时显示错误，不显示成功。

### 产品路由

全部产品页面挂在 `MobileShell` 下，源码在 `src/views/mobile/`。宽屏外观在 `desktop.css`，由侧栏组件引入，并只在 `768px` 以上生效。

| 路径 | 能力 | 登录要求 |
| --- | --- | --- |
| `/device` | 设备首页：连接状态、酵种罐、本次喂养摘要与喂养入口 | 游客可进入，账号数据需登录 |
| `/checkin` | 分步骤填写观察、生成本地建议；没有 `feeding` 或 `edit=session` 时转到酵种医生 | 游客可生成，云端保存需登录 |
| `/doctor/rounds` | 按日期 / 年月选择发酵轮次后进入诊断 | 需要登录 |
| `/doctor/records` | 诊断记录列表 | 需要登录 |
| `/login`、`/register` | 邀请制登录与注册，保留合法站内 `redirect` | 游客可进入 |
| `/feeding` | 记录喂养；保存确认后回到设备首页 | 需要登录 |
| `/diary` | 按日期与酵种查看喂养轮次 | 云端记录需登录 |
| `/diary/records/:id` | 发酵轮次或观察记录详情 | 需要登录 |
| `/reports/session` | 当前本地观察建议 | 游客可查看当前会话 |
| `/reports/:id` | 已保存的观察快照 | 需要登录 |
| `/me` | 个人与账号入口 | 游客可进入 |
| `/me/profile`、`/me/profile/edit` | 查看与编辑资料 | 需要登录 |
| `/me/account` | 修改密码 | 需要登录 |
| `/me/invite` | 邀请码查看与分享 | 需要登录 |
| `/me/help` | 关于与帮助 | 游客可进入 |
| `/me/help/faq`、`/me/help/privacy` | 常见问题、隐私与权限 | 游客可进入 |
| `/me/help/feedback` | 意见反馈 | 需要登录 |
| `/me/notifications` | 高度提醒、过峰提醒与系统通知授权 | 需要登录 |
| `/me/devices`、`/me/devices/add`、`/me/devices/:deviceId`、`/me/devices/:deviceId/info` | 设备列表、添加、设置与设备信息 | 需要登录 |
| `/devices/:deviceId/trend` | 设备趋势、指标与时间范围 | 需要登录 |
| `/claim` | 用绑定码认领设备 | 需要登录 |
| `/admin` 及其子路径 | 管理员后台，见下表 | 需要登录且 `role = A` |

旧地址仍可用，进入后替换为现在的路径：`/login`、`/register` 进入同一套登录注册页；`/history` → `/doctor/records`；`/profile` → `/me/profile`；`/today` → `/device`；`/records` → `/diary`。

### 后台

宽屏侧栏在管理员登录后多出「后台」。窄屏没有这条侧栏，后台页自己提供分区链接。分区为：概览、用户与权限、绑定关系、发酵轮次、设备、养护与反馈、埋点观察。

普通管理员可以查阅，也可以修改设备名称。任命其他管理员和手工建号只有首位管理员可以做。「养护与反馈」中的「网站留言」列出欢迎页写入的留资和留言（类型、邮箱、姓名、内容、提交时间）。只有 `role = A` 能读这些行；欢迎页只提交，不展示列表。

### 仍需分开验收的事

- 真实账号登录、邮箱确认、生产登录态，以及高度 / 过峰推送在真机上的投递，不能用本地游客流程代替。
- 欢迎页留资和留言写入 `welcome_inquiries`。迁移 `034_welcome_inquiries.sql` 应用到数据库之后，提交才会真正保存，后台「网站留言」也才能读到这些行。

## 喂养基线与膨胀倍数

规则集中在 `src/services/feeding-analysis.service.js`。设备首页、日记、记录详情、酵种医生和高度推送共用同一份汇总结果。

- **取样范围**：本轮喂养时间之后、设备关联有效、`mode = fer` 且无 `sensor_error` 的读数；`height_mm > 0` 才算有效点。
- **起点基线**：取最早的 5 个采样点。首个有效点出现即可用（此时膨胀倍数为 1.00），随后按已有有效点的均值实时更新；收满 5 个点后按 MAD 剔除离群值并冻结——阈值 `max(5mm, 中位数 × 25%, 3 × 1.4826 × MAD)`，最多剔到只剩 3 个有效点。5 个点内不足 3 个有效点时退回其中最低点（`baselineSource = sensor-min`）。手填的 `baseline_source = manual` 始终优先。
- **当前高度**：取最近一次有效读数；缺测时沿用上一个点的读数，不因断档显示空值。
- **新鲜度**：最近有效高度超过 40 分钟未更新会标记 `heightStale`，页面继续展示上次膨胀倍数，高度推送不采用旧读数。
- **区间映射**：界面 `膨胀倍数 = 当前高度 / 基线`，统一保留两位小数（如 1.50），按倍率映射为「几乎没涨 / 轻微上涨 / 接近翻倍 / 约 2 倍 / 超过 3 倍」，边界只定义在 `src/lib/height-band.js`。内部 `expansionPercent` 仍是涨幅百分比，用于兼容已有记录与诊断证据。
- **页面提示**：`pending` →「基线计算中」，`insufficient` →「基线采样不足」，基线未收满 5 个点 →「基线采样未满，仅供参考」，`heightStale` →「数据偏旧，沿用上次读数」。提示只说明状态，不在界面展示计算过程。

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

迁移 `031_analytics_events.sql` 新增产品行为埋点表 `analytics_events`（只追加）：`(user_id, client_event_id)` 唯一保证重试幂等，客户端只能读写自己的事件，敏感信息不入库。详细列、校验与索引见「数据库设计」。

Auth 提供商、邮件、回跳地址及平台集成等设置需在对应控制台单独核对，不能把迁移成功等同于所有平台配置已同步。

## 用户系统

### 系统用户 ID

普通用户注册后自动分配展示 ID，例如：`U26090001`

格式为 `权限(U/A) + 年月(YYMM) + 4 位月内序号`，普通注册固定为 `U`。系统 ID 使用独立计数器表，在事务中 `INSERT ... ON CONFLICT DO UPDATE` 分配，避免并发注册得到重复序号。

数据库内部关系全部使用 `auth.users.id` 的 UUID；展示 ID 只用于对外识别。因此即使以后调整角色、重新分配展示 ID，设备与历史数据也不会断链。

### 管理员

角色仍是 `profiles.role`：`U` 普通用户，`A` 管理员。首位管理员是其中 `is_super_admin = true` 的那一位，不另建账号表。

第一位管理员这样产生：在 SQL Editor 中以数据库管理员身份把一个已有账号提升为 `A`。如果当时还没有首位管理员，这次提升会自动带上 `is_super_admin`。

```sql
select private.set_user_role('AUTH_USER_UUID', 'A');
```

该函数会分配新的 `A + YYMM + 4 位序号`，例如 `A26090001`。不要把密码或首位管理员邮箱写进前端环境变量。

转移首位管理员（只在数据库里做，网页不能做）：

```sql
select private.designate_super_admin('email@example.com');
```

被指定的账号会成为唯一的首位管理员；如果原来不是管理员，会先提升为 `A`。原来的首位管理员仍是普通管理员。

宽屏侧栏的「后台」只对 `role = A` 的登录用户显示；窄屏在后台页内用分区链接，它不是底部标签。普通管理员可以查阅用户、绑定、发酵轮次、设备、养护反馈和埋点，也可以修改设备名称。任命其他管理员、手工创建账号只有首位管理员可以做，数据库函数会拒绝其他人的调用。新账号写入现有的 Auth 用户，并立即可以登录；初始密码由首位管理员设置一次，不落在资料表里。

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

- 游客可以在设备首页浏览，并生成本地观察建议；云端保存需要登录。日记中的云端记录、设备数据、`/claim` 和 `/admin` 均要求登录。`/history`、`/profile` 会转到 `/doctor/records`、`/me/profile`。
- 登录、注册、个人资料 / 头像、邀请码、修改密码等均依赖 Supabase。

### 浏览器端能力

已接入 Supabase JS：邮箱注册（携带邀请码）、邮箱密码登录、自动读取系统 ID/权限、退出、设备选择/改名/在线状态、绑定码绑定设备（含 `/claim`）、设备成员管理、设备趋势、喂养与日记、酵种医生、个人资料编辑（用户名 / 性别 / 出生年月日 / 身份）、头像上传（正方形裁剪）、邀请码查看复制、修改密码、高度提醒与过峰提醒、意见反馈、欢迎页留资与留言，以及管理员后台。

当前部署约定保持 Supabase **Confirm email** 开启，注册后需完成邮箱确认。若另行决定取消邮箱所有权验证，须显式调整 Supabase 配置；前端仍受基本邮箱格式校验约束。

## 数据库设计

### profiles

| 字段                          | 用途                                                     |
| ----------------------------- | -------------------------------------------------------- |
| `id uuid`                   | 与`auth.users.id` 一一对应，内部稳定主键               |
| `system_user_id varchar(9)` | 对外 ID：`U/A + YYMM + 0001`                           |
| `role`                      | `U` 普通用户 / `A` 管理员                            |
| `is_super_admin`            | 首位管理员。只有这一位能任命管理员和手工建号         |
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

### fermentation_window_closures（迁移 `023`）

- 一轮发酵的业务结束只由「下一次喂养」或用户手动结束决定；设备缺测、断线、关联失效只降低观测质量，不写入结束记录。
- 每个 `(user_id, feeding_id)` 只保存一条结束事实，重复请求返回原记录；`ended_at` 不会晚于下一次喂养时间与当前时间。
- 写入走 `close_fermentation_window` RPC（校验酵种归属与时间边界），表对 `authenticated` 只开放 `SELECT`。

#### 自动结束（迁移 `030`）

- `reason` 区分结束来源：`manual` 为用户手动结束，`auto` 为自动结束（last-peak 触发后设备连续 2 小时无读数，结束时刻 = 断档前最后一条读数）。
- 自动结束由客户端按读数判定，经 `auto_close_fermentation_window` RPC 归档；服务端校验结束时刻在本轮内、不晚于下一次喂养、且距今至少 2 小时。
- 与手动结束共用 `(user_id, feeding_id)` 唯一约束：先写入者生效，之后的请求原样返回已有记录，手动结束不会被自动结束覆盖。
- 归档前（或迁移未执行时）界面仍按读数实时算出“自动结束”。

### analytics_events（迁移 `031`）

产品行为埋点表，只追加：一次交互一行，用于统计页面选择、日历切换、高度提醒与酵种医生等真实使用情况。

- `id uuid`：主键，默认 `gen_random_uuid()`。
- `user_id uuid not null`：默认 `auth.uid()`，外键指向 `auth.users(id)`，随账号删除级联清理。
- `client_event_id uuid not null`：客户端生成的幂等编号，同一次操作的安全重试不会写入第二行。
- `event_name varchar(80)`：事件名，校验 `^[a-z][a-z0-9_]{1,79}$`。
- `session_id uuid not null`：一次前台会话共用的编号。
- `page varchar(80)`：来源页面，校验 `^[a-z][a-z0-9_/-]{0,79}$`。
- `properties jsonb not null default '{}'`：业务字段，必须是 JSON 对象且 `pg_column_size` 不超过 8192 字节。
- `occurred_at timestamptz not null`：事件发生时间，须在 `2026-01-01` 之后且不晚于当前时间 + 5 分钟。
- `created_at timestamptz not null default now()`：入库时间。

幂等性由 `unique (user_id, client_event_id)` 保证。查询走两个索引：`analytics_events_user_time_idx (user_id, occurred_at desc)` 和 `analytics_events_event_time_idx (event_name, occurred_at desc)`。后台「埋点观察」读取的是这张表的汇总，普通用户仍然只能看到自己的事件。

### 过峰提醒（迁移 `032`）

沿用高度提醒的评估和投递链路。`height_alert_settings.peak_alert` 按酵种开关。`height_alert_events.kind` 为 `ratio`（目标 2 / 2.5 / 3 倍）或 `peak`。过峰由 `src/lib/rise-phase.js` 在峰后连续回落时锁定，所以提醒晚于实际峰值。同一轮喂养里，每个倍数一条、过峰一条。

### 管理后台（迁移 `033`）

为 `profiles` 增加 `is_super_admin`，并提供网页调用的 `admin_overview`、`admin_set_role`、`admin_create_account`、`admin_list_rounds`、`admin_get_round`。权限规则见上文「管理员」。隐藏按钮不是权限边界，函数会先检查调用者。

### 数据分辨率

`device_measurements.recorded_at` 保存采样时间，数据库按原始数据逐条存储，不做时间分辨率分割。10 分钟展示桶在 Web 查询时计算：每个 10 分钟区间自动选取 `recorded_at` 最新的一条用于曲线和表格展示。

### 安全

- 所有 public 数据表开启 RLS。
- `anon` 无表权限。欢迎页写入只开放函数 `submit_welcome_inquiry`；匿名角色和普通登录用户都不能读取 `welcome_inquiries`。管理员（`profiles.role = 'A'`，策略调用 `private.is_admin()`）在后台「养护与反馈 → 网站留言」查看这些行。
- `authenticated` 只有业务需要的权限。
- 历史数据默认 append-only：客户端只有 `SELECT/INSERT`，没有 UPDATE/DELETE。
- 行为埋点（`analytics_events`）同样按账号隔离：普通用户只能读取和插入自己的事件（`user_id = auth.uid()`），不能更新或删除历史；更新与删除仅限管理角色（`private.is_admin()`）。
- 埋点不采集敏感数据：不记录密码、令牌、邀请码、诊断自由文本，也不记录传感器原始数据。

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

`src/algorithms/` 集中核心诊断、预测模型与场景枚举；服务层和界面仍包含输入适配、分桶与图表派生计算。只有 `services/diagnosis.service.js` 可以导入算法公共入口，`tests/architecture.test.js` 会拒绝其它文件直接调用：

```js
import { diagnoseStarter, parseStarterInput } from '../algorithms/index.js';
```

手机观察经 `services/mobile-diagnosis.service.js`，再调用 `diagnosis.service.js`。算法需要文献时通过 `../references/index.js`，不得复制 citation 元数据。

文件职责：

- `dimensions.js`：有限轴与先验配置。
- `normalization.js`：归一化、文本解析、污染信号。
- `doubling-predictor.js`：纯数值预测与传感器 crossing。
- `diagnosis.js`：规则编排与结果生成。
- `index.js`：唯一公共 API。
- `enumerate-scenarios.js`：2,016 组合遍历。
- `scenario-catalog.json`：完整预生成组合。
- `build-review-queue.js` / `review-queue.json`：审核队列。

依赖方向约定见上文「架构说明」。`tests/architecture.test.js` 已接入 `npm test`，检查依赖方向、2,016 条 catalog 结构与 Supabase 迁移契约。

## 测试

```bash
npm test           # 32 个测试脚本 + 2,016 场景自检（与 CI 同一条命令）
npm run audit      # 仅运行 2,016 场景枚举自检
npm run build      # Vite 生产构建
npm run fonts:subset   # 从根目录 TTF 重新生成 public/fonts
```

`npm test` 覆盖：诊断行为、架构边界与迁移契约、本地缓存与草稿、观察流程与决策（`mobile-checkin-flow`）、外壳隔离与基础组件、设备首页、喂养页、日记、酵种医生轮次、记录详情、我的与设备设置、曲线交互与颜色、喂养幂等、基线与膨胀倍数、高度区间与过峰、喂养比例换算、高度提醒与 Web Push 策略、意见反馈、欢迎页留资与留言（`welcome-inquiry`）、行为埋点、站点入口与宽屏导航（`site-entry`）、管理后台（`admin-console`）、字体子集（`font-subset`），末尾串行执行 2,016 场景自检。脚本是显式命令链而非通配扫描，新增测试文件必须追加到 `package.json` 的 `test`。`.github/workflows/ci.yml` 的 `test-and-build` 使用同一命令。

这组测试不代替真实账号登录、邮箱确认或生产环境推送验收。

`npm run audit` 必须完整遍历 6 × 6 × 8 × 7 = **2,016** 组合并保持无异常。

关键验收：

- 2,016 组合可完整枚举，结构异常为 0；
- 温度高于有效域时不会继续给线性“越热越快”预测；
- 污染安全规则覆盖高度、pH 等正常信号；
- 文献引用可解析，且只能从 `src/references/` 取；
- Vue 代码不能绕过 service 深度调用算法；
- Supabase migration 包含用户 ID、RLS、设备与历史数据表。

说明：`diagnosis-algorithms`、`doubling-predictor`、`enumerate-scenarios`、`review-queue`、`rule-engine`、`v0.4-regressions` 六个用例属于上一轮规则引擎架构的归档，不在 `npm test` 链中；它们仍引用已重构的算法 API（如 `normalizeStage`），单独运行会失败，不作为回归门禁。

## 部署

### 默认发布路径：GitHub → Vercel + Supabase

GitHub `hxh2002/Ferjoo` 的 `main` 是生产环境唯一发布入口。默认流程如下：

1. 在本地修改代码或新增 `supabase/migrations/00X_*.sql`。
2. 本地运行必要的测试与构建检查。
3. 提交并推送到 GitHub `main`（或通过 Pull Request 合并到 `main`）。
4. GitHub Actions 运行测试与构建；Vercel Git 集成自动构建前端并发布 `dist`；Supabase 原生 GitHub Integration 自动应用待执行迁移。
5. 检查 GitHub Actions、Vercel Deployment 和 Supabase migration 日志，确认三处均成功。

不要把生产发布默认理解为本地直接部署：不使用 `vercel deploy`、Supabase MCP、生产 SQL Editor 或本地 `supabase db push` 作为常规发布路径。只有在明确的故障恢复或迁移修复场景下，才单独执行平台控制台或 CLI 操作。

### 一次性平台授权清单

自动化链路只需要在首次接入时完成以下授权；之后的发布完全由 git push 触发，无需本地登录任何平台。

| 平台 | 需要的授权 | 在哪里配置 | 验证方式 |
| --- | --- | --- | --- |
| GitHub | 本地 git 凭据可写 `hxh2002/Ferjoo` | `git config credential.helper osxkeychain` 或 GitHub PAT | `git push origin main` 成功 |
| Vercel | Git 集成已关联本仓库 `main` 分支；Vercel 账号有 `team_5RBhfRXHkZG39ZzoDZRofX5b` 的部署权限 | Vercel → Project `ferjoo` → Settings → Git | push 后 Vercel 自动产生 Production deployment |
| Vercel 环境变量 | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `VITE_VAPID_PUBLIC_KEY` 仅 Production | Vercel → Project → Settings → Environment Variables | 部署后页面可登录并读取设备 |
| Supabase | GitHub Integration 已关联 `hxh2002/Ferjoo`，工作目录 `.`，生产分支 `main` | Supabase Dashboard → Project `yccvmeepajpdagizplgp` → Integrations → GitHub | push 新迁移后 migration 日志出现对应版本 |
| Supabase 扩展 | `pg_cron`、`pg_net` 已启用 | Database → Extensions | 迁移 `020_height_web_push.sql` 能成功执行 |
| Supabase Edge Function | 函数 `process-height-alerts` 已部署，secrets 含 VAPID 三件套与内部密钥 | `npx supabase@latest functions deploy process-height-alerts --no-verify-jwt` 与 `secrets set` | 函数详情页显示已部署版本 |

其中 GitHub、Vercel Git 集成、Supabase GitHub Integration 是发布链路的必要条件；VAPID、Edge Function 属于高度提醒推送功能的上线前置，与常规代码发布解耦。本地 CLI 登录态（`vercel whoami`、`supabase login`）过期**不会**影响自动部署，仅影响手动运维操作。

CI 和平台部署由各自集成触发，当前工作流没有实现“CI 成功后才允许平台发布”的串行门禁。一次提交是否上线，以该提交自己的 GitHub Actions、Vercel Deployment 和 Supabase migration 日志为准。

### GitHub Actions 的职责

`.github/workflows/ci.yml` 只负责在 `main` 推送和 Pull Request 上执行 `npm install`、`npm test` 与 `npm run build`，不执行数据库迁移。数据库迁移由 Supabase 原生 GitHub Integration 负责，前端发布由 Vercel Git 集成负责。

### 自动同步 Supabase

项目已启用 Supabase 原生 GitHub Integration：仓库 `hxh2002/Ferjoo`、工作目录 `.`、生产分支 `main`，合并到 `main` 后由 Supabase 自动执行数据库迁移。项目不再使用 GitHub Actions 执行迁移，避免重复应用。

当前仓库包含 `001`～`034` 范围内的 33 个迁移（`005` 仍是历史空号）；实际是否已在远端执行，以 Supabase Dashboard 的 migration 日志为准。若本地需要查看迁移状态，使用：

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
- Vue 不导入算法内部文件，也不导入 `algorithms/index.js`。诊断只经过 `diagnosis.service.js`。
- 算法引用文献只通过 `src/references/index.js`。
- `tests/architecture.test.js` 随 `npm test` 执行，覆盖依赖方向、catalog 结构与迁移契约；它仍是静态检查，不能替代真实 RLS 或端到端验收。
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
