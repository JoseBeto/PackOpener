const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  // Disabled to avoid stale service worker caches masking card rarity fixes.
  disable: true
});

module.exports = withPWA({
  reactStrictMode: true
});
