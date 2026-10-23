import { markSdkReady, registerSdkListeners, startTracking } from './tracking'
import { log } from './utils'

// The same unversioned Hellotext.js build the VTEX app (hellotext/vtex,
// pixel/head.html) loads, so Legacy CMS stores always run the latest SDK.
export const SDK_URL = 'https://cdn.jsdelivr.net/npm/@hellotext/hellotext/dist/hellotext.min.js'

// Checkout belongs to @hellotext/vtex-checkout (checkout6-custom.js). A second
// initialization there would restart the Hellotext session mid-checkout.
const CHECKOUT_PATH = /^\/checkout(\/|$)/i

// Kept on window rather than in module scope: a store that pastes the snippet
// into two templates evaluates this bundle twice, and each copy has its own
// module scope.
const STARTED_FLAG = '__hellotextVtexLegacyCmsStarted'

const sdkLoaded = () => typeof window.Hellotext?.initialize === 'function'

const loadSdk = onLoad => {
  if (sdkLoaded()) return onLoad()

  // Another tag may already be fetching Hellotext.js. Wait for it instead of
  // evaluating the SDK twice.
  const pending = document.querySelector('script[src*="/@hellotext/hellotext"]')

  if (pending) {
    pending.addEventListener('load', onLoad)
    return
  }

  const script = document.createElement('script')

  script.src = SDK_URL
  script.async = true
  script.addEventListener('load', onLoad)
  script.addEventListener('error', () => log('error', 'Failed to load Hellotext.js from', SDK_URL))
  ;(document.head || document.documentElement).appendChild(script)
}

const initializeSdk = businessId => {
  if (!sdkLoaded()) {
    log('error', 'Hellotext.js loaded without exposing window.Hellotext')
    return
  }

  registerSdkListeners()

  // The merchant may also initialize Hellotext.js themselves. Initializing
  // again restarts the session, forms and widgets, so leave theirs alone.
  if (window.Hellotext.isInitialized) return markSdkReady()

  try {
    const result = window.Hellotext.initialize(businessId)

    // Legacy CMS themes often replace window.Promise with old polyfills such
    // as Bluebird, so only rely on the thenable contract.
    if (result && typeof result.then === 'function') {
      result.then(markSdkReady, error => log('error', 'Failed to initialize', error))
    } else {
      markSdkReady()
    }
  } catch (error) {
    log('error', 'Failed to initialize', error)
  }
}

export default {
  initialize: businessId => {
    if (!businessId) {
      log('warn', 'Missing business ID, skipping initialization')
      return
    }

    if (window[STARTED_FLAG]) return
    if (CHECKOUT_PATH.test(window.location.pathname)) return

    window[STARTED_FLAG] = true

    startTracking()
    loadSdk(() => initializeSdk(businessId))
  },
}
