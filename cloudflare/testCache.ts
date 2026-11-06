import type { CacheLike } from "./edgeCache";

/** In-memory stand-in for Cloudflare's Cache API in tests (keyed by URL; no expiry of its own). */
export class MemoryCache implements CacheLike {
  readonly entries = new Map<string, Response>();

  async match(request: Request): Promise<Response | undefined> {
    return this.entries.get(request.url)?.clone();
  }

  async put(request: Request, response: Response): Promise<void> {
    this.entries.set(request.url, response.clone());
  }
}
