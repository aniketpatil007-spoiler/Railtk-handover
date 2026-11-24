export class MockBucket {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    if (!this.store.has(key)) return null;
    const item = this.store.get(key);
    return {
      etag: item.etag,
      customMetadata: item.customMetadata,
      json: async () => JSON.parse(item.data),
      text: async () => item.data
    };
  }

  async put(key, data, options = {}) {
    const etag = Math.random().toString(36).slice(2);
    if (options.onlyIf?.etagMatches) {
      const existing = this.store.get(key);
      if (existing && existing.etag !== options.onlyIf.etagMatches) {
        return null;
      }
    }
    this.store.set(key, {
      data: String(data),
      etag,
      customMetadata: options.customMetadata || {}
    });
    return { etag };
  }

  async delete(key) {
    this.store.delete(key);
    return true;
  }

  async head(key) {
    if (!this.store.has(key)) return null;
    const item = this.store.get(key);
    return { etag: item.etag, customMetadata: item.customMetadata };
  }

  async list({ prefix = '', cursor } = {}) {
    const keys = Array.from(this.store.keys()).filter(k => k.startsWith(prefix));
    const objects = keys.map(k => ({
      key: k,
      etag: this.store.get(k).etag,
      customMetadata: this.store.get(k).customMetadata
    }));
    return { objects, truncated: false };
  }
}
