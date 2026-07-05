export const LarkMessageType = {
  TEXT: 'text',
  INTERACTIVE: 'interactive'
};

export const LarkEventType = {
  MESSAGE_RECEIVE: 'im.message.receive_v1',
  URL_VERIFICATION: 'url_verification'
};

export function ackResponse(message = 'ok') {
  return { code: 0, msg: message };
}

export function textMessage(content) {
  return {
    msg_type: LarkMessageType.TEXT,
    content: JSON.stringify({ text: truncate(String(content || ''), 4000) })
  };
}

export function cardMessage(card) {
  return {
    msg_type: LarkMessageType.INTERACTIVE,
    content: JSON.stringify(card)
  };
}

export function renderHelp(config) {
  const visibility = config.useCardMessages ? '默认使用飞书消息卡片。' : '默认使用文本消息。';
  return [
    'DDYS 飞书机器人',
    '',
    '可用命令：',
    '/ddys search 关键词',
    '/ddys latest 或 /ddys 最新',
    '/ddys hot 或 /ddys 热门',
    '/ddys help 或 /ddys 帮助',
    '/ddys diag 管理员诊断',
    '/ddys clearcache 管理员清缓存',
    '',
    '私聊里也可以直接发送关键词进行搜索。',
    visibility
  ].join('\n');
}

export function renderDiagnostics(config, runtime) {
  return [
    'DDYS Lark Bot diagnostics',
    `version: ${config.version || '0.1.0'}`,
    `apiBase: ${config.apiBase}`,
    `larkApiBase: ${config.larkApiBase}`,
    `eventsPath: ${config.eventsPath}`,
    `replyMessages: ${config.replyMessages}`,
    `deferReplies: ${config.deferReplies}`,
    `useCardMessages: ${config.useCardMessages}`,
    `searchCacheItems: ${runtime.searchCache?.size ?? 0}`,
    `eventDedupeItems: ${runtime.eventDeduper?.size ?? 0}`
  ].join('\n');
}

export function renderResultMessage(kind, query, results, config) {
  if (!results.length) {
    const suffix = kind === 'search' ? `：“${query}”` : '';
    return textMessage(`没有找到 DDYS 结果${suffix}。`);
  }
  const title = kind === 'search' ? `DDYS 搜索：${query}` : kind === 'latest' ? 'DDYS 最新更新' : 'DDYS 热门内容';
  if (!config.useCardMessages) {
    return textMessage([title, '', ...resultsToTextLines(results, config)].join('\n'));
  }
  return cardMessage(resultsToCard(title, results, config));
}

export function resultsToCard(title, results, config) {
  const elements = [];
  for (const [index, item] of results.slice(0, Math.min(config.maxResults, 5)).entries()) {
    elements.push({
      tag: 'div',
      text: {
        tag: 'lark_md',
        content: resultToMarkdown(item, index)
      }
    });
  }

  const actions = resultButtons(results);
  if (actions.length) elements.push({ tag: 'action', actions });

  return {
    config: { wide_screen_mode: true },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: truncate(title, 80) }
    },
    elements
  };
}

export function resultsToTextLines(results, config) {
  return results.slice(0, Math.min(config.maxResults, 10)).map((item, index) => {
    const meta = [item.year, item.region, item.type].filter(Boolean).join(' / ');
    const lines = [`${index + 1}. ${item.title}`];
    if (meta) lines.push(`   ${meta}`);
    if (item.description) lines.push(`   ${truncate(item.description, 120)}`);
    if (item.url) lines.push(`   ${item.url}`);
    return lines.join('\n');
  });
}

export function resultButtons(results) {
  return results
    .filter((item) => item.url)
    .slice(0, 5)
    .map((item, index) => ({
      tag: 'button',
      text: { tag: 'plain_text', content: `打开 ${index + 1}` },
      url: item.url,
      type: index === 0 ? 'primary' : 'default',
      value: { url: item.url }
    }));
}

export function parseLarkCommand(text, message = {}) {
  const cleaned = cleanCommandText(text);
  if (!cleaned) return { name: '', query: '', raw: '' };
  const isPrivateChat = message.chat_type === 'p2p';
  const prefixed = stripPrefix(cleaned);
  if (!prefixed) {
    return isPrivateChat ? { name: 'search', query: cleaned, raw: cleaned } : { name: '', query: '', raw: cleaned };
  }

  const [first = '', ...rest] = splitWords(prefixed);
  const keyword = first.toLowerCase();
  const query = rest.join(' ').trim();
  if (['search', 's', 'find', '搜索', '搜', '找'].includes(keyword)) return { name: 'search', query, raw: cleaned };
  if (['latest', 'new', 'newest', '最新', '更新'].includes(keyword)) return { name: 'latest', query, raw: cleaned };
  if (['hot', 'popular', '热门', '排行'].includes(keyword)) return { name: 'hot', query, raw: cleaned };
  if (['help', 'h', '帮助', '菜单'].includes(keyword)) return { name: 'help', query, raw: cleaned };
  if (['diag', 'diagnostics', '诊断'].includes(keyword)) return { name: 'diag', query, raw: cleaned };
  if (['clearcache', 'clear-cache', '清缓存', '清理缓存'].includes(keyword)) return { name: 'clearcache', query, raw: cleaned };
  return { name: 'search', query: prefixed, raw: cleaned };
}

export function extractTextFromMessage(message) {
  if (!message || message.message_type !== 'text') return '';
  const content = message.content;
  if (typeof content !== 'string') return '';
  try {
    const parsed = JSON.parse(content);
    return String(parsed.text || '').trim();
  } catch {
    return content.trim();
  }
}

function resultToMarkdown(item, index) {
  const meta = [item.year, item.region, item.type].filter(Boolean).join(' / ');
  const lines = [`**${index + 1}. ${escapeMarkdown(item.title || 'Untitled')}**`];
  if (meta) lines.push(escapeMarkdown(meta));
  if (item.description) lines.push(escapeMarkdown(truncate(item.description, 160)));
  if (item.poster) lines.push(`[封面](${item.poster})`);
  if (item.url) lines.push(`[打开详情](${item.url})`);
  return lines.join('\n');
}

function cleanCommandText(text) {
  return String(text || '')
    .replace(/<at\s+[^>]+>.*?<\/at>/gi, '')
    .replace(/@_user_\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripPrefix(text) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  for (const prefix of ['/ddys', 'ddys', '低端影视']) {
    const normalized = prefix.toLowerCase();
    if (lower === normalized) return 'help';
    if (lower.startsWith(`${normalized} `)) return raw.slice(prefix.length).trim();
  }
  return '';
}

function splitWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean);
}

function escapeMarkdown(value) {
  return String(value || '').replace(/[\\`*_{}[\]()#+\-.!|]/g, '\\$&');
}

function truncate(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}
