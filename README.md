# 酵种医生 · Dr. Ferjoo

Vue 3 + Vite + Supabase 的酵种诊断应用：有限场景诊断算法 + 剩余翻倍时间估算 + 证据追踪 + 账号与设备 10 分钟测量历史，视觉为大更新前最后一版的**经典 UI**（橙色整页背景、磨砂玻璃卡片、双品牌 Logo、顶部居中页签切换）。

## 目录

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
├── docs/
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

## Supabase

1. 创建项目。
2. SQL Editor 执行 `supabase/migrations/001_initial.sql`。
3. Authentication → Providers → Email：确认 Email 已启用，并保持 **Confirm email** 开启（默认）。
4. `.env` 填入 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`。

开启 Confirm email 后，注册会发送验证邮件，用户需完成邮箱确认后才能登录。

## 用户 ID

普通用户注册后自动分配，例如：

`U26090001`

格式为 `权限(U/A) + 年月(YYMM) + 4位序号`。普通注册固定为 `U`。管理员通过数据库管理员函数提升为 `A`；数据外键始终使用 UUID，因此角色变化不会断开设备历史关系。

## 设备历史

`device_measurements` 保存每台设备的数据，并由数据库强制归一到 **10 分钟时间桶**：

- 温度
- 高度
- 高度变化
- 湿度
- 电量
- 任意扩展 `payload`
- 原始时间戳与 10 分钟桶时间戳

## 测试

```bash
npm test           # 诊断行为测试 + 2,016 场景结构自检
npm run audit      # 仅运行 2,016 场景枚举自检
```

`npm run audit` 必须完整遍历 6 × 6 × 8 × 7 = **2,016** 组合并保持无异常。

说明：`tests/` 下其余 `*.test.js` 为上一轮算法架构（规则引擎 / 审核队列）留存的归档用例，不属于当前 `npm test` 范围，单独运行可能失败。

## 部署

Vercel：

- Build command: `npm run build`
- Output: `dist`
- `vercel.json` 已包含 SPA rewrite

也可部署到任意能托管 Vite 静态产物的平台。

更多说明见：

- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/MIGRATION.md`
- `supabase/README.md`
- `public/assets/CLASSIC_ASSETS.md`（经典资产固定基线说明）
