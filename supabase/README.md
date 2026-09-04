# Supabase 部署

1. 新建 Supabase 项目。
2. 在 SQL Editor 执行 `migrations/001_initial.sql`。
3. 在 **Authentication → Providers → Email** 中开启 Email/Password，并保持 **Confirm email** 开启（默认）。
   - 注册后会发送验证邮件，用户完成邮箱确认后才能登录。
4. 从 Project Settings 获取 Project URL 与 anon/public key：
   - 复制项目根目录 `.env.example` 为 `.env`
   - 填入 `VITE_SUPABASE_URL` 和 `VITE_SUPABASE_ANON_KEY`
5. 运行 `npm install && npm run dev`。

## 用户 ID

注册用户默认角色为 `U`，自动生成：

`U + YYMM + 4位月内序号`

例如 2026 年 09 月首位普通用户：`U26090001`。

数据库内部关系全部使用 `auth.users.id` 的 UUID；展示 ID 只用于对外识别。因此即使以后调整角色、重新分配展示 ID，设备与历史数据也不会断链。

管理员不是由浏览器注册接口创建。需要管理员时，在 SQL Editor 中以数据库管理员身份调用：

```sql
select private.set_user_role('AUTH_USER_UUID', 'A');
```

该函数会分配新的 `A + YYMM + 4位序号`，例如 `A26090001`。

## 数据分辨率

`device_measurements.recorded_at` 保存采样时间；写入前数据库触发器使用 PostgreSQL `date_bin` 生成 `bucket_start`，固定为 10 分钟时间桶。唯一约束 `(device_id, bucket_start)` 保证同一设备同一 10 分钟桶只有一个历史点。
