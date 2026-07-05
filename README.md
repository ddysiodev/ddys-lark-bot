# ddys-lark-bot

[中文](README.zh-CN.md)

Official Feishu/Lark bot integration for the DDYS API. It receives Lark event callbacks, verifies and decrypts them, runs DDYS search/latest/hot/help/diagnostic/cache commands, and replies with Lark text messages or message cards.

## Features

- Feishu/Lark event callback handler mounted at `/lark/events`
- URL verification challenge response
- `X-Lark-Signature`, `X-Lark-Request-Timestamp`, and `X-Lark-Request-Nonce` verification
- Encrypt Key callback decryption
- Verification Token validation
- `im.message.receive_v1` text commands
- `/ddys search query`, `/ddys latest`, `/ddys hot`, `/ddys help`
- Admin commands: `/ddys diag`, `/ddys clearcache`
- Private-chat bare keyword search; group chats require `/ddys`, `ddys`, or `低端影视`
- Lark message cards, text fallback, and link buttons
- open_id, user_id, chat_id, and tenant_key allowlists
- Search cache, event dedupe, and diagnostics endpoints
- Cloudflare Workers and Node.js examples

## Install

```bash
npm install ddys-lark-bot
```

## Cloudflare Workers

```js
import { createDdysLarkBot } from 'ddys-lark-bot';

export default createDdysLarkBot();
```

Lark event subscription URL:

```text
https://your-worker.example.com/lark/events
```

Health endpoints:

```text
GET /lark/health
GET /lark/diagnostics
```

## Node.js

See `examples/basic-node/src/server.js`. Node 20+ provides Web Request, Response, fetch, and WebCrypto.

## Environment

```env
DDYS_LARK_APP_ID=cli_xxx
DDYS_LARK_APP_SECRET=xxx
DDYS_LARK_VERIFICATION_TOKEN=xxx
DDYS_LARK_ENCRYPT_KEY=xxx
DDYS_LARK_EVENTS_PATH=/lark/events

DDYS_API_BASE=https://ddys.io/api/v1
DDYS_PUBLIC_BASE=https://ddys.io
```

You can also provide a tenant access token directly:

```env
DDYS_LARK_TENANT_ACCESS_TOKEN=t-xxx
```

Common options:

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

`LARK_*` and `FEISHU_*` aliases are supported, such as `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, and `FEISHU_VERIFICATION_TOKEN`.

## Lark Developer Console

1. Create an internal app.
2. Copy App ID and App Secret.
3. Configure the event subscription Request URL: `https://your-domain/lark/events`.
4. Save the Verification Token.
5. Enable Encrypt Key when possible; this package then verifies `X-Lark-Signature` and decrypts encrypted callbacks.
6. Subscribe to `im.message.receive_v1`.
7. Grant and publish the message permissions required by the bot.

Official docs:

- https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case
- https://open.feishu.cn/document/server-docs/im-v1/message/events/receive
- https://open.feishu.cn/document/server-docs/im-v1/message/reply
- https://open.feishu.cn/document/common-capabilities/message-card

## Commands

```text
/ddys search matrix
/ddys latest
/ddys hot
/ddys help
/ddys diag
/ddys clearcache
```

Chinese commands are also supported:

```text
/ddys search 流浪地球
/ddys 最新
/ddys 热门
/ddys 帮助
/ddys 诊断
/ddys 清缓存
```

## Direct Handler

```js
import { handleLarkEvent } from 'ddys-lark-bot';

export default {
  fetch(request, env, context) {
    return handleLarkEvent(request, env, context);
  }
};
```

## Security Notes

- `DDYS_LARK_VERIFICATION_TOKEN` is required in production.
- `DDYS_LARK_ENCRYPT_KEY` is recommended to enable Lark signature verification and encrypted callback decryption.
- For group chats, configure `DDYS_LARK_ALLOWED_CHAT_IDS` or tenant allowlists when needed.
- Admin commands require `DDYS_LARK_ADMIN_OPEN_IDS` or `DDYS_LARK_ADMIN_USER_IDS`.
- Do not commit or publish App Secret, tenant access token, `.env`, `.dev.vars`, or `.npmrc`.

## Test

```bash
npm test
```
