export function reportError(error: Error, site?: string | null) {
  const device = {
    userAgent:    navigator.userAgent,
    platform:     navigator.platform,
    language:     navigator.language,
    screenWidth:  screen.width,
    screenHeight: screen.height,
  }

  fetch('/api/errors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: error.message,
      stack:   error.stack,
      url:     window.location.href,
      site,
      device,
    }),
  }).catch(() => {})
}
