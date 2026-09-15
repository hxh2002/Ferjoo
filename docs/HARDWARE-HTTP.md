# 硬件 HTTP 接入指南（Dr. Ferjoo）

## 0. 架构一句话

```text
设备 ──HTTPS POST(JSON)──▶ Supabase RPC ingest_device_measurements
                            → 原始数据逐条落库 → 网页按 10 分钟桶选取展示
```

- 设备**不需要用户登录、不携带用户 JWT**，只用设备自己的一对凭据。
- 设备以数据库 `anon` 角色调用唯一被授权的函数，**只能上传，读不到任何数据**。

## 1. 领取设备凭据（每台一次，出厂前完成）

设备只有一条出生通道：**管理员 SQL 批量插入 `devices` 行**（SQL 见 §1.1）。设备出生时无主，用户拿到设备后凭标签上的绑定码在网页端自行认领（首个绑定者为 owner，之后为 member）。

出厂备产时自行生成 `device_id` 与 `api_key`：`api_key` 明文只出现在生成现场并立即烧录，库中只存其 SHA-256 摘要；`bind_code` 由列默认值自动签发，插入后读出即可打印标签：

```json
{
  "device_id": "dev_a1b2c3d4e5f60708",
  "api_key": "<64 位十六进制，生成现场立即烧录>",
  "bind_code": "ABCD-EFGH（插入后由数据库自动签发，SELECT 读出）"
}
```

| 事项          | 要求                                                                                |
| ------------- | ----------------------------------------------------------------------------------- |
| `api_key`   | 等同密码。库中只存 SHA-256 摘要，**丢失不可找回，只能重新生成并更新库中摘要** |
| 存储位置      | 每台设备独立写入 Flash / NVS，禁止写进源码仓库                                      |
| `device_id` | 非机密，与 key 一起存放即可                                                         |

### 1.1 随设备交付的绑定码（bind_code）

每台设备还有一串 **8 位绑定码**（如 `ABCD-EFGH`，字母表排除了 `0/O/1/I/L` 等易混淆字符），作用与 `api_key` 完全不同：

| 凭据          | 用途                                       | 机密性                            |
| ------------- | ------------------------------------------ | --------------------------------- |
| `api_key`   | 设备固件上传数据的密钥                     | 机密，只烧录在设备里              |
| `bind_code` | 用户把设备绑到自己账号的凭据（持有即拥有） | 半公开，印在设备标签 / 随附卡片上 |

- 用户拿到设备后注册账号，在 HISTORY 页输入绑定码即可完成绑定；设备与用户是多对多关系：首个绑定者为 owner，之后绑定者为 member。
- **二维码是绑定码的冗余载体**，内容为 URL：`https://<域名>/claim?code=ABCD-EFGH`。扫码后未登录会自动跳转登录/注册，完成后再回来自动绑定。
- 出厂注册即直接 SQL 插入 `devices` 行（不写 `device_members`，设备保持无主），`bind_code` 由列默认值自动生成，打印标签时读出即可：

```sql
-- 出厂批量注册示例（SQL Editor，一次一台）
insert into public.devices (device_id, name, model, api_key_hash)
values ('dev_a1b2c3d4e5f60708', 'Ferjoo Sensor', 'ESP32-S3',
        encode(extensions.digest('<明文 api_key>', 'sha256'), 'hex'));

-- 读出自动签发的绑定码用于打印标签
select device_id, bind_code from public.devices where device_id = 'dev_a1b2c3d4e5f60708';
```

## 2. 上传接口规范

### 2.1 请求

```http
POST https://yccvmeepajpdagizplgp.supabase.co/rest/v1/rpc/ingest_device_measurements
apikey: <VITE_SUPABASE_ANON_KEY>
Content-Type: application/json
```

- `apikey` 头必填（项目公钥，见前端 `.env` 的 `VITE_SUPABASE_ANON_KEY`）。
- **不要**带 `Authorization` 头，设备上传不需要。

### 2.2 请求体

```json
{
  "p_device_id": "dev_a1b2c3d4e5f60708",
  "p_api_key": "<64 位十六进制>",
  "p_measurements": [
    {
      "recorded_at": "2026-09-10T08:00:00Z",
      "temperature_c": 24.5,
      "height_mm": 12.3,
      "height_delta_mm": 0.5,
      "humidity_percent": 78.1,
      "battery_percent": 91
    }
  ]
}
```

### 2.3 字段字典

| 字段                 | 类型          | 必填 | 说明                                                 |
| -------------------- | ------------- | ---- | ---------------------------------------------------- |
| `p_device_id`      | string        | ✅   | 设备 ID                                              |
| `p_api_key`        | string        | ✅   | 设备密钥                                             |
| `p_measurements`   | array         | ✅   | 测量数组，单批最多 288 条（约 48 h）                 |
| `recorded_at`      | ISO 8601 UTC  | 建议 | 如`"2026-09-10T08:00:00Z"`；省略则服务端用到达时间 |
| `temperature_c`    | number\| null | 否   | 摄氏度                                               |
| `height_mm`        | number\| null | 否   | 当前液面高度                                         |
| `height_delta_mm`  | number\| null | 否   | 相对上次的高度变化                                   |
| `humidity_percent` | number\| null | 否   | 0–100，越界被拒                                     |
| `battery_percent`  | number\| null | 否   | 0–100，越界被拒                                     |
| `payload`          | object        | 否   | 扩展字段（如未来 pH），默认`{}`                    |

注意：数值一律是 JSON number，不加引号；传感器读不到就传 `null`，**不要用 0 冒充**。

### 2.4 存储与十分钟展示桶（重要）

服务端**按原始数据逐条保存**，不再做时间分辨率上的分割，也没有"同桶唯一"约束：

- 同一批次里多条数据落入同一 10 分钟区间也照单全收，不会再报 `21000` 冲突错误；
- 10 分钟展示桶在网页查询时自动计算：每个桶选取 `recorded_at` 最新的一条展示，"后到覆盖先到"的语义由展示层保证；
- 重传安全，但同一数据重复上传会作为多条原始记录保存，网页端只显示其中最新一条，固件仍应做好本地去重。

### 2.5 响应

成功 `200 OK`：`{"written": 2}`（实际写入条数）。

失败为统一错误 JSON，按 `message` 判断：

| message / 状态                 | 含义             | 设备动作                           |
| ------------------------------ | ---------------- | ---------------------------------- |
| `INVALID_DEVICE_CREDENTIALS` | 凭据错误         | **停止重试**，进入待配置状态 |
| `INVALID_MEASUREMENTS`       | 数组格式错误     | 修固件 bug                         |
| 约束错误（23514）              | 字段越界         | 固件侧先夹紧 0–100 等范围         |
| 404                            | URL / 函数名错误 | 核对 URL                           |
| 429                            | 限流             | 指数退避                           |
| 5xx / 超时                     | 网络或服务端问题 | 数据入缓冲区，下轮重发             |

## 3. 先用 curl 打通（必做）

```bash
curl -X POST \
  "https://yccvmeepajpdagizplgp.supabase.co/rest/v1/rpc/ingest_device_measurements" \
  -H "apikey: <VITE_SUPABASE_ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "p_device_id": "dev_a1b2c3d4e5f60708",
    "p_api_key": "<64 位十六进制>",
    "p_measurements": [
      { "recorded_at": "2026-09-10T08:00:00Z", "temperature_c": 24.5, "battery_percent": 91 }
    ]
  }'
```

期望：`{"written":1}`，且网页 HISTORY 中该设备出现记录、`last_seen` 更新。
**curl 通但设备不通 = 固件 TLS/HTTP 栈问题**，可直接二分定位。

## 4. 固件实现要点（ESP32 为例）

### 4.1 TLS 强制

```cpp
WiFiClientSecure client;
client.setInsecure();              // 联调可用；量产必须改为 client.setCACert(ISRG_ROOT_X1)
HTTPClient http;
http.begin(client, ENDPOINT);
http.addHeader("Content-Type", "application/json");
http.addHeader("apikey", ANON_KEY);
int code = http.POST(body);        // body 形如 {"p_device_id":"...","p_api_key":"...","p_measurements":[...]}
```

### 4.2 时钟校准（SNTP）

分桶依赖 `recorded_at`，**首次上传前必须完成校时**：

```cpp
configTime(0, 0, "pool.ntp.org", "time.nist.gov");   // 统一 UTC
// 等到 time(nullptr) > 1700000000 再开始上传
char iso[25];
strftime(iso, sizeof(iso), "%Y-%m-%dT%H:%M:%SZ", gmtime(&now));
```

### 4.3 离线缓冲与重试

```text
每 10 分钟：采样 → 组一条 measurement
  有网：POST（缓冲区存量 + 本条）→ 200 后清空缓冲区
  无网/失败：追加到 Flash 环形缓冲（JSON Lines），下轮一起发
```

- 单批 ≤ 288 条；缓冲区 FIFO；
- **周期外不重试**——幂等机制保证下一轮重发不会重复；
- 超时建议：connect 10 s / response 30 s。

### 4.4 资源参考

单条约 200–300 字节；满批 288 条约 60–80 KB；ESP32 TLS 握手约需 40–50 KB 空闲堆。

## 5. 出厂验收清单

```text
□ 每台设备有独立 device_id + api_key
□ api_key 不出现在源码 / 日志 / 串口打印
□ 标签 / 卡片印有 bind_code（及二维码 URL），与库中记录一致
□ curl 验证通过，HISTORY 可见记录
□ SNTP 校时完成后才首次上传
□ 断网 30 min → 恢复后补传，曲线无重复、无断档
□ 填错 api_key → 收到 INVALID_DEVICE_CREDENTIALS 后停止重试
□ humidity / battery 越界数据在固件侧已被拦截
□ 量产固件启用证书校验（非 setInsecure）
```

## 6. 数据库侧既成事实（无需硬件侧关心）

- 服务端自动完成：原始数据逐条落库、`devices.last_seen_at` 刷新；10 分钟展示桶在网页查询时计算。
- 设备与用户的绑定在网页端管理（`device_members`）：用户凭 `bind_code` 调 `claim_device` 自助绑定（持有即拥有，首绑为 owner、之后为 member），换绑用户不需要动固件。
- `api_key` 泄露的最坏后果：攻击者只能往该设备写数据；读操作被数据库 RLS 全部拦截。
