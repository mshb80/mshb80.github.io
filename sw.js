/**
 * سرویس‌ورکر گلزار شهدای کرمان (v4 — پیش‌بارگذاری فایل‌های کد)
 * - باز شدن اپ (ناوبری): اول شبکه → همیشه تازه‌ترین نسخه؛ آفلاین → نسخهٔ ذخیره‌شده
 * - روایت صوتی: کاملاً آنلاین و بدون کش — پخش مستقیم از سرور
 * - API لیست شهدا: network-first با fallback به کش؛ بقیهٔ APIها بدون کش
 * - ویدیوی صفحه آغازین: کش-اول با پاسخ کامل → فقط یک بار دانلود می‌شود
 * - عکس‌ها و فونت‌ها: کش-اول
 */
const CACHE_NAME = 'golzar-kerman-v2'
const SHELL_CACHE = 'golzar-shell-v4'
const DATA_CACHE = 'golzar-data-v2'
const VIDEO_CACHE = 'golzar-video-v2'
const SPLASH_VIDEO = '/images/splash-video.mp4'

// فایل‌های کد نسخهٔ پروداکشن — هنگام نصب سرویس‌ورکر یک‌بار ذخیره می‌شوند
const PRECACHE_ASSETS = [
  "/",
  "/_next/static/chunks/556c8b59b4c9a879.js",
  "/_next/static/chunks/6fe825cd47c3fec4.js",
  "/_next/static/chunks/86cef5f8f0e284a5.js",
  "/_next/static/chunks/9c9e24b6b214e588.js",
  "/_next/static/chunks/a6dad97d9634a72d.js",
  "/_next/static/chunks/abc386bdde209760.js",
  "/_next/static/chunks/d2be314c3ece3fbe.js",
  "/_next/static/chunks/ec83cdd06487ab38.css",
  "/_next/static/chunks/f00fec13beafc913.js",
  "/_next/static/chunks/fb6efb343d9465e5.js",
  "/_next/static/chunks/ff1a16fafef87110.js",
  "/_next/static/chunks/turbopack-be56f9d16f4eeb84.js"
]

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // هر فایل جداگانه — اگر یکی نشد، بقیه ذخیره می‌شوند و دفعه بعد ادامه پیدا می‌کند
      Promise.all(
        PRECACHE_ASSETS.map((u) =>
          cache.add(u).catch(() => {})
        )
      )
    ).catch(() => {})
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![CACHE_NAME, SHELL_CACHE, DATA_CACHE, VIDEO_CACHE].includes(k))
          .map((k) => caches.delete(k))
      ).then(() => self.clients.claim())
    )
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // باز شدن اپ (ناوبری): اول شبکه تا همیشه تازه‌ترین نسخهٔ کد بیاید؛ آفلاین → نسخهٔ ذخیره‌شده
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(SHELL_CACHE).then((c) => c.put(req, copy))
            return res
          }
          // سرور خاموش (۵۰۲/۵۰۰ و…) → نسخهٔ ذخیره‌شدهٔ اپ نشان داده شود
          return caches.match(req).then((cached) => cached || res)
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('/')))
    )
    return
  }

  // روایت صوتی: کاملاً آنلاین — سرویس‌ورکر هیچ دخالتی نمی‌کند (استریم مستقیم با پشتیبانی Range)
  if (url.pathname.startsWith('/uploads/audio/')) return

  // ویدیوی صفحه آغازین: همیشه پاسخ کامل (بدون Range) کش و برگردانده می‌شود
  if (url.pathname === SPLASH_VIDEO) {
    event.respondWith(
      caches.open(VIDEO_CACHE).then(async (cache) => {
        const cached = await cache.match(SPLASH_VIDEO)
        if (cached) return cached
        const res = await fetch(SPLASH_VIDEO)
        if (res.ok) await cache.put(SPLASH_VIDEO, res.clone())
        return res
      }).catch(() => fetch(req))
    )
    return
  }

  // API داده شهدا: اول شبکه، بعد کش
  if (url.pathname.startsWith('/api/martyrs')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(DATA_CACHE).then((c) => c.put(req, copy))
            return res
          }
          // سرور خاموش → فهرست ذخیره‌شدهٔ شهدا
          return caches.match(req).then((cached) => cached || res)
        })
        .catch(() =>
          caches.match(req).then(
            (cached) =>
              cached ||
              new Response(JSON.stringify({ martyrs: [], offline: true }), {
                headers: { 'Content-Type': 'application/json' },
              })
          )
        )
    )
    return
  }

  // بقیهٔ APIها (مدیریت، پیام‌ها، خاطرات): همیشه مستقیم از شبکه — بدون کش
  if (url.pathname.startsWith('/api/')) return

  // فونت و تصاویر: کش اول
  if (url.pathname.startsWith('/fonts/') || url.pathname.startsWith('/images/')) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            const copy = res.clone()
            caches.open(CACHE_NAME).then((c) => c.put(req, copy))
            return res
          })
      )
    )
    return
  }

  // بقیه (پوسته اپ): stale-while-revalidate
  event.respondWith(
    caches.open(SHELL_CACHE).then(async (cache) => {
      const cached = await cache.match(req)
      const network = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone())
          return res
        })
        .catch(() => cached)
      return cached || network
    })
  )
})
