import { addItems, observeCartRequests, observeOrderForm } from './cart'
import { trackPage } from './pages'
import { markUserResolved } from './queue'
import { resolveUser } from './user'
import { log } from './utils'
import { stampUtm } from './utm'
import { currencyOf, fetchOrderForm, fetchProfile } from './vtex'

export { markSdkReady } from './queue'

let sdkListenersRegistered = false

// Must run before Hellotext.initialize: the SDK emits utm-set during
// initialization. Registered once, so a retried initialization never
// duplicates listeners.
export const registerSdkListeners = () => {
  if (sdkListenersRegistered || typeof window.Hellotext?.on !== 'function') return

  sdkListenersRegistered = true

  window.Hellotext.on('utm-set', value =>
    stampUtm(value).then(null, error => log('error', 'Failed to process Hellotext UTM', error)),
  )

  window.Hellotext.on('cart.added', data =>
    addItems(data).then(null, error => log('error', 'Failed to add items to VTEX cart', error)),
  )
}

const collect = async () => {
  try {
    // Both requests start together. Awaiting them in turn avoids Promise.all,
    // since window.Promise may be a store's polyfill.
    const profileRequest = fetchProfile()
    const orderFormRequest = fetchOrderForm()
    const profile = await profileRequest
    const orderForm = await orderFormRequest

    resolveUser(profile, orderForm)
    observeOrderForm(orderForm)

    // Product views wait on a catalog request. Not awaited, so a slow catalog
    // never holds back identify or cart events.
    trackPage(currencyOf(orderForm)).then(null, error =>
      log('error', 'Failed to track the page', error),
    )
  } catch (error) {
    log('error', 'Failed to collect storefront data', error)
  } finally {
    markUserResolved()
  }
}

// Runs before Hellotext.js has loaded: cart requests are observed from the
// start, and everything tracked waits in the queue until the SDK is ready.
export const startTracking = () => {
  observeCartRequests()
  collect()
}
