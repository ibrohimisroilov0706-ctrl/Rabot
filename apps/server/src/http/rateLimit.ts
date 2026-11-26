// apps/server/src/http/rateLimit.ts
// Token bucket: har bir kalit (o'yinchi yoki IP) uchun alohida chelak.
// Bir nechta server nusxasi bo'lsa, buni Redis'ga ko'chirish kerak (16-hujjat, masshtablash).

interface Bucket { tokens: number; at: number }

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(private ratePerSec: number, private burst: number) {
    setInterval(() => this.sweep(), 60_000).unref();
  }
  take(key: string, cost = 1): boolean {
    const now = Date.now();
    const b = this.buckets.get(key) ?? { tokens: this.burst, at: now };
    b.tokens = Math.min(this.burst, b.tokens + ((now - b.at) / 1000) * this.ratePerSec);
    b.at = now;
    if (b.tokens < cost) { this.buckets.set(key, b); return false; }
    b.tokens -= cost;
    this.buckets.set(key, b);
    return true;
  }
  private sweep() {
    const cutoff = Date.now() - 10 * 60_000;
    for (const [k, b] of this.buckets) if (b.at < cutoff) this.buckets.delete(k);
  }
}
