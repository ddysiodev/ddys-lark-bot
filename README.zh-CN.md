# ddys-lark-bot

[English](README.md)

低端影视 API 的官方飞书/Lark 机器人集成。它把飞书开放平台事件回调转换为 DDYS 搜索、最新、热门、帮助、诊断和清缓存命令，并通过飞书 IM 回复文本或消息卡片。

## 功能

- 飞书/Lark 事件回调处理，默认路径 `/lark/events`
- URL verification challenge 响应
- `X-Lark-Signature`、`X-Lark-Request-Timestamp`、`X-Lark-Request-Nonce` 签名校验
- Encrypt Key 加密回调解密
- Verification Token 校验
- `im.message.receive_v1` 文本消息命令
- `/ddys search 关键词`、`/ddys latest`、`/ddys hot`、`/ddys help`
- 管理员命令：`/ddys diag`、`/ddys clearcache`
- 私聊直接发送关键词搜索；群聊需要 `/ddys`、`ddys` 或 `低端影视` 前缀
- 飞书消息卡片（message card）、文本降级、按钮跳转
- open_id、user_id、chat_id、tenant_key 白名单
- 搜索缓存、事件去重、诊断接口
- Cloudflare Workers 和 Node.js 示例

## 安装

```bash
npm install ddys-lark-bot
```

## Cloudflare Workers

```js
import { createDdysLarkBot } from 'ddys-lark-bot';

export default createDdysLarkBot();
```

飞书开放平台事件订阅 URL 示例：

```text
https://your-worker.example.com/lark/events
```

健康检查：

```text
GET /lark/health
GET /lark/diagnostics
```

## Node.js

见 `examples/basic-node/src/server.js`。Node 20+ 内置 Web Request、Response、fetch 和 WebCrypto。

## 环境变量

```env
DDYS_LARK_APP_ID=cli_xxx
DDYS_LARK_APP_SECRET=xxx
DDYS_LARK_VERIFICATION_TOKEN=xxx
DDYS_LARK_ENCRYPT_KEY=xxx
DDYS_LARK_EVENTS_PATH=/lark/events

DDYS_API_BASE=https://ddys.io/api/v1
DDYS_PUBLIC_BASE=https://ddys.io
```

如果你已经自己维护 tenant access token，也可以传：

```env
DDYS_LARK_TENANT_ACCESS_TOKEN=t-xxx
```

常用可选项：

```env
DDYS_LARK_ALLOWED_OPEN_IDS=
DDYS_LARK_ALLOWED_USER_IDS=
DDYS_LARK_ALLOWED_CHAT_IDS=
DDYS_LARK_ALLOWED_TENANT_KEYS=
DDYS_LARK_ADMIN_OPEN_IDS=
DDYS_LARK_ADMIN_USER_IDS=
DDYS_LARK_MAX_RESULTS=5
DDYS_LARK_MIN_QUERY_LENGTH=2
DDYS_LARK_SEARCH_CACHE_TTL=300
DDYS_LARK_EVENT_DEDUPE_TTL=900
DDYS_LARK_SIGNATURE_TOLERANCE_SECONDS=300
DDYS_LARK_REPLY_MESSAGES=true
DDYS_LARK_DEFER_REPLIES=true
DDYS_LARK_USE_CARD_MESSAGES=true
DDYS_LARK_ENABLE_DIAGNOSTICS=true
DDYS_DEBUG=false
```

同时支持 `LARK_*` 和 `FEISHU_*` 别名，例如 `FEISHU_APP_ID`、`FEISHU_APP_SECRET`、`FEISHU_VERIFICATION_TOKEN`。

## 飞书开放平台配置

1. 创建企业自建应用。
2. 在「凭证与基础信息」复制 App ID 和 App Secret。
3. 在「事件订阅」配置 Request URL：`https://your-domain/lark/events`。
4. 填写并保存 Verification Token。
5. 建议启用 Encrypt Key；启用后包会校验 `X-Lark-Signature` 并解密 `encrypt` 回调体。
6. 订阅 `im.message.receive_v1`。
7. 给机器人开通并发布应用需要的消息权限。

官方文档：

- https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case
- https://open.feishu.cn/document/server-docs/im-v1/message/events/receive
- https://open.feishu.cn/document/server-docs/im-v1/message/reply
- https://open.feishu.cn/document/common-capabilities/message-card

## 命令

```text
/ddys search 流浪地球
/ddys 最新
/ddys 热门
/ddys 帮助
/ddys 诊断
/ddys 清缓存
```

英文命令也支持：

```text
/ddys search matrix
/ddys latest
/ddys hot
/ddys help
/ddys diag
/ddys clearcache
```

## 直接使用处理函数

```js
import { handleLarkEvent } from 'ddys-lark-bot';

export default {
  fetch(request, env, context) {
    return handleLarkEvent(request, env, context);
  }
};
```

## 安全建议

- 生产环境必须配置 `DDYS_LARK_VERIFICATION_TOKEN`。
- 建议配置 `DDYS_LARK_ENCRYPT_KEY`，这样会启用飞书签名校验和加密回调解密。
- 群聊部署建议配置 `DDYS_LARK_ALLOWED_CHAT_IDS` 或租户白名单。
- 管理员命令必须配置 `DDYS_LARK_ADMIN_OPEN_IDS` 或 `DDYS_LARK_ADMIN_USER_IDS`。
- 不要把 App Secret、tenant access token、`.env`、`.dev.vars`、`.npmrc` 提交到仓库或发布包。

## 测试

```bash
npm test
```
