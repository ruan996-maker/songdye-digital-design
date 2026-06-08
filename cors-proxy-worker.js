/**
 * Kimi API CORS Proxy - Cloudflare Worker
 *
 * 用途：为宋染非遗数字设计系统的 AI 助手提供 CORS 代理
 * 部署方式：
 *   1. 登录 https://dash.cloudflare.com → Workers & Pages → 创建应用程序
 *   2. 创建 Worker，粘贴此文件内容
 *   3. 部署后获得 URL，如 https://songdye-proxy.yourname.workers.dev
 *   4. 在宋染系统的 Kimi 助手设置中填入该 URL
 *
 * 安全说明：此代理仅转发请求到 api.moonshot.cn，不做任何数据存储。
 *           建议在 Cloudflare Dashboard 中添加访问来源限制（可选）。
 */

export default {
  async fetch(request) {
    // 仅允许 POST 请求
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      const targetUrl = 'https://api.moonshot.cn/v1/chat/completions';

      // 转发请求头（安全过滤）
      const headers = new Headers();
      headers.set('Content-Type', 'application/json');
      const authHeader = request.headers.get('Authorization');
      if (authHeader) {
        headers.set('Authorization', authHeader);
      }

      // 转发请求体
      const body = await request.text();

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: headers,
        body: body
      });

      // 创建带 CORS 头的响应
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: { message: err.message } }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};
