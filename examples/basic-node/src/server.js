import { createServer } from 'node:http';
import { createDdysLarkBot } from 'ddys-lark-bot';

const bot = createDdysLarkBot();
const port = Number(process.env.PORT || 8787);

createServer(async (incoming, outgoing) => {
  const request = await toWebRequest(incoming);
  const response = await bot.fetch(request, process.env, {});
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, () => {
  console.log(`DDYS Lark bot listening on http://127.0.0.1:${port}`);
});

async function toWebRequest(incoming) {
  const url = new URL(incoming.url || '/', `http://${incoming.headers.host || '127.0.0.1'}`);
  const method = incoming.method || 'GET';
  const headers = new Headers();
  for (const [key, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) headers.set(key, value.join(', '));
    else if (value !== undefined) headers.set(key, value);
  }
  return new Request(url, {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : incoming,
    duplex: method === 'GET' || method === 'HEAD' ? undefined : 'half'
  });
}
