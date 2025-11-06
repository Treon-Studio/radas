// Cloudflare Pages middleware for advanced routing & analytics
export async function onRequest(context) {
  const { request, next } = context
  const url = new URL(request.url)

  // Version routing
  const versionMatch = url.pathname.match(/^\/v([\d.]+)\//)
  const version = versionMatch ? versionMatch[1] : 'latest'

  // Analytics tracking (optional - uncomment if you have analytics endpoint)
  // context.waitUntil(
  //   fetch('https://analytics.yourdomain.com/track', {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({
  //       version,
  //       path: url.pathname,
  //       referer: request.headers.get('Referer'),
  //       userAgent: request.headers.get('User-Agent'),
  //       country: request.cf?.country,
  //       timestamp: Date.now()
  //     })
  //   }).catch(console.error)
  // )

  const response = await next()

  // Add custom headers
  const newHeaders = new Headers(response.headers)
  newHeaders.set('X-Widget-Version', version)
  newHeaders.set('X-Powered-By', 'Cloudflare Pages')

  // Cache control based on version
  if (version !== 'latest') {
    newHeaders.set('Cache-Control', 'public, max-age=31536000, immutable')
  } else {
    newHeaders.set('Cache-Control', 'public, max-age=300') // 5 minutes
  }

  // CORS headers
  newHeaders.set('Access-Control-Allow-Origin', '*')
  newHeaders.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  newHeaders.set('Access-Control-Allow-Headers', 'Content-Type')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  })
}
