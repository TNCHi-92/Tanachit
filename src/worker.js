import html from "../pro.html";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return json({ ok: true, edge: "cloudflare-worker", db: false });
    }

    if (url.pathname === "/api/state") {
      // Keep frontend in local mode until Neon-backed Worker API is added.
      return json({ error: "State API is not configured on Worker yet" }, 503);
    }

    if (url.pathname === "/" || url.pathname === "/pro.html") {
      return new Response(html, {
        headers: { "content-type": "text/html; charset=utf-8" }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};
