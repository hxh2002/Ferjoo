# 数据库设计

## profiles

| 字段 | 用途 |
|---|---|
| `id uuid` | 与 `auth.users.id` 一一对应，内部稳定主键 |
| `system_user_id varchar(9)` | 对外 ID：`U/A + YYMM + 0001` |
| `role` | `U` 普通用户 / `A` 管理员 |
| `email` | Auth 邮箱镜像 |
| `display_name` | 可选显示名 |

系统 ID 使用独立计数器表，在事务中 `INSERT ... ON CONFLICT DO UPDATE` 分配，避免并发注册得到重复序号。

## devices

`device_id` 是硬件/业务设备标识；`user_id` 是所有者 UUID。RLS 限制普通用户只管理自己的设备。

## device_measurements

历史点包含：

- `device_id`
- `user_id`
- `recorded_at`
- `bucket_start`（10 分钟桶）
- `temperature_c`
- `height_mm`
- `height_delta_mm`
- `humidity_percent`
- `battery_percent`
- `payload jsonb`（给未来传感器字段留扩展空间）

唯一键 `(device_id, bucket_start)` 使同一设备在同一 10 分钟分辨率下只有一个数据点。

## 安全

- 所有 public 数据表开启 RLS。
- `anon` 无表权限。
- `authenticated` 只有业务需要的权限。
- 历史数据默认 append-only：客户端只有 `SELECT/INSERT`，没有 UPDATE/DELETE。
- 角色提升函数不授权给前端，仅数据库管理员可执行。
