# 酵种医生 · Dr. Ferjoo

## 目录

```text
.
├── src/
│   ├── algorithms/          # 所有算法 + 2,016组合 + 审核工具
│   ├── references/          # 全部参考文献、证据库、引用schema
│   ├── components/          # Vue 展示组件
│   ├── views/               # 路由页面
│   ├── services/            # UI 与算法/数据库之间的调用边界
│   ├── composables/         # 登录会话状态
│   ├── lib/                 # Supabase 客户端
│   └── router/
├── supabase/
│   └── migrations/001_initial.sql
├── docs/
├── tests/
└── public/assets/
```

## 本地运行

要求 Node.js 20.19+。

```bash
npm install
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
npm test
npm run audit
```

`npm run audit` 必须完整遍历 6 × 6 × 8 × 7 = **2,016** 组合并保持结构异常为 0。

更多说明见：

- `docs/ARCHITECTURE.md`
- `docs/DATABASE.md`
- `docs/MIGRATION.md`
- `supabase/README.md`
