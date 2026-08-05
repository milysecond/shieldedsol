// src/index.ts
var ShieldedSolError = class extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = "ShieldedSolError";
    this.status = status;
    this.body = body;
  }
};
var ShieldedSolClient = class {
  constructor(opts = {}) {
    this.baseUrl = (opts.baseUrl || "https://www.shieldedsol.com").replace(
      /\/$/,
      ""
    );
    this.fetchImpl = opts.fetch || fetch.bind(globalThis);
    this.headers = {
      Accept: "application/json",
      ...opts.headers || {}
    };
  }
  async get(path, query) {
    const url = new URL(path, this.baseUrl + "/");
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v != null && v !== "") url.searchParams.set(k, v);
      }
    }
    const res = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: this.headers
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new ShieldedSolError(
        body?.error || `HTTP ${res.status}`,
        res.status,
        body
      );
    }
    return body;
  }
  health() {
    return this.get("/api/v1/health");
  }
  listProtocols() {
    return this.get("/api/v1/protocols");
  }
  getProtocol(id) {
    return this.get(
      `/api/v1/protocols/${encodeURIComponent(id)}`
    );
  }
  tvlHistory(range = "7d") {
    return this.get("/api/v1/history/tvl", { range });
  }
  protocolHistory(protocol, range = "7d") {
    return this.get("/api/v1/history/protocol", {
      protocol,
      range
    });
  }
};
function createClient(opts) {
  return new ShieldedSolClient(opts);
}
var index_default = ShieldedSolClient;
export {
  ShieldedSolClient,
  ShieldedSolError,
  createClient,
  index_default as default
};
