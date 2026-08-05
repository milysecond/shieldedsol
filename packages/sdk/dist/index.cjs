"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ShieldedSolClient: () => ShieldedSolClient,
  ShieldedSolError: () => ShieldedSolError,
  createClient: () => createClient,
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ShieldedSolClient,
  ShieldedSolError,
  createClient
});
