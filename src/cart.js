import { track } from './queue'
import { userParameters } from './user'
import { log, normalizeCartItems, SOURCE } from './utils'
import { currencyOf, fetchOrderForm, isOrderForm, postJson, rememberNativeFetch } from './vtex'

// Legacy CMS stores add to cart in many ways (vtex.js, raw Checkout API calls,
// /checkout/cart/add links or AJAX). The only store-agnostic signal is the
// cart itself, so every orderForm we see is compared with the last one seen,
// which is kept in localStorage to survive page loads and dedupe across tabs.
const STORAGE_KEY = 'hellotext:vtex-legacy-cms:cart'

// orderForm(/...) but not orderForms/simulation, which is not the cart.
const ORDER_FORM_REQUEST = /^\/api\/checkout\/pub\/orderForm(\/|$)/
const CART_ADD_REQUEST = /^\/checkout\/cart\/add(\/|$)/

// Coalesces bursts of cart requests into one orderForm read.
const REFRESH_DELAY = 250

let memorySnapshot = null
let refreshTimer = null

const readSnapshot = () => {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)

    return value ? JSON.parse(value) : null
  } catch (error) {
    return memorySnapshot
  }
}

const writeSnapshot = snapshot => {
  memorySnapshot = snapshot

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch (error) {
    // A stale stored snapshot would replay old changes, so drop it.
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch (_error) {
      // Storage is unavailable; the in-memory snapshot still covers this page.
    }
  }
}

// Only the fields normalizeCartItems reads.
const storedItem = item => ({
  id: item.id,
  productId: item.productId,
  name: item.name,
  skuName: item.skuName,
  seller: item.seller,
  price: item.price,
  sellingPrice: item.sellingPrice,
  priceDefinition: item.priceDefinition
    ? { calculatedSellingPrice: item.priceDefinition.calculatedSellingPrice }
    : undefined,
  imageUrl: item.imageUrl,
  productCategories: item.productCategories,
  additionalInfo: item.additionalInfo ? { brandName: item.additionalInfo.brandName } : undefined,
})

// The same SKU can appear on several lines (attachments, split offers), so
// lines are summed per SKU and seller. Promotion gifts are added by VTEX, not
// the shopper, so they are not cart changes.
const cartLines = orderForm =>
  orderForm.items.reduce((lines, item) => {
    if (item.isGift) return lines

    const key = `${item.id}:${item.seller || ''}`
    const quantity = (lines[key]?.quantity || 0) + (item.quantity || 0)

    lines[key] = { ...storedItem(item), quantity }

    return lines
  }, {})

const cartChanges = (previous, next) => {
  const added = []
  const removed = []
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)])

  keys.forEach(key => {
    const delta = (next[key]?.quantity || 0) - (previous[key]?.quantity || 0)

    if (delta > 0) added.push({ ...next[key], quantity: delta })
    if (delta < 0) removed.push({ ...(next[key] || previous[key]), quantity: -delta })
  })

  return { added, removed }
}

// Same shape as the VTEX app's cart events. source is only set for items
// Hellotext itself added (e.g. from a webchat carousel).
const trackCart = (action, items, orderForm, source = null) =>
  track(action, () => ({
    ...(source && { source }),
    user_parameters: userParameters(),
    object_parameters: {
      reference: orderForm.orderFormId,
      source: SOURCE,
      items: normalizeCartItems(items, currencyOf(orderForm), 100),
    },
  }))

// Set while a Hellotext add is in flight, and given to the next cart.added.
let pendingAddSource = null

export const observeOrderForm = orderForm => {
  if (!isOrderForm(orderForm)) return

  const lines = cartLines(orderForm)
  const previous = readSnapshot()

  writeSnapshot({ orderFormId: orderForm.orderFormId, lines })

  // No snapshot yet, or a new cart (e.g. after an order was placed): nothing
  // to compare against, so this orderForm only becomes the baseline.
  if (previous?.orderFormId !== orderForm.orderFormId) return

  const { added, removed } = cartChanges(previous.lines || {}, lines)

  if (added.length) {
    trackCart('cart.added', added, orderForm, pendingAddSource)
    pendingAddSource = null
  }

  if (removed.length) trackCart('cart.removed', removed, orderForm)
}

// Copied from the VTEX app: theme code listening to vtex.js's
// orderFormUpdated.vtex (minicarts, header totals) never hears about a raw
// Checkout API write unless the same signal is replayed with the new cart.
const notifyOrderFormUpdated = orderForm => {
  const jquery = window.jQuery || window.$
  const eventName = 'orderFormUpdated.vtex'

  if (typeof jquery === 'function') {
    const wrappedWindow = jquery(window)

    if (typeof wrappedWindow?.trigger === 'function') {
      wrappedWindow.trigger(eventName, [orderForm])
    }
  }

  if (typeof window.CustomEvent === 'function') {
    window.dispatchEvent(new CustomEvent(eventName, { detail: orderForm }))
  }
}

const addFailed = error => {
  pendingAddSource = null
  log('error', 'Failed to add items to VTEX cart', error)
}

// Handles the SDK's cart.added event: Hellotext (e.g. a webchat product
// carousel) asks the store to add items. The resulting cart change is
// tracked by the cart observer like any other add, tagged with the source.
export const addItems = async data => {
  // VTEX Checkout wants SKU ids in orderItems.id. Hellotext carries the VTEX
  // SKU as item.reference.
  const items = (data?.object_parameters?.items || []).map(item => ({
    id: item.reference,
    quantity: item.quantity,
    seller: '1',
  }))

  if (!items.length) return

  pendingAddSource = data.source || null

  // VTEX answers an add of a SKU already in the cart with the unchanged cart,
  // so there may be no cart.added to take the source. It must not be left for
  // the shopper's next add.
  const settle = orderForm => {
    observeOrderForm(orderForm)
    pendingAddSource = null
  }

  // vtex.js keeps its own cart state and fires orderFormUpdated.vtex itself,
  // which is what Legacy CMS minicarts listen to. observeXhr may see its
  // response first; observing the same cart twice tracks it once.
  const checkout = window.vtexjs?.checkout

  if (typeof checkout?.addToCart === 'function') {
    const pending = checkout.addToCart(items)

    if (typeof pending?.done === 'function') pending.done(settle)
    if (typeof pending?.fail === 'function') pending.fail(addFailed)
    return
  }

  const orderForm = await fetchOrderForm()

  if (!orderForm) return addFailed('No VTEX orderForm')

  const { ok, body } = await postJson(
    `/api/checkout/pub/orderForm/${orderForm.orderFormId}/items`,
    {
      orderItems: items,
    },
  )

  // Checkout answers validation failures with JSON too. Only an orderForm
  // with items is fresh cart state.
  if (!ok || !isOrderForm(body)) return addFailed(body)

  settle(body)
  notifyOrderFormUpdated(body)
}

const scheduleRefresh = () => {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(async () => observeOrderForm(await fetchOrderForm()), REFRESH_DELAY)
}

// Checkout responses that carry the orderForm are used directly. Anything
// else (/checkout/cart/add answers with HTML) triggers a fresh read.
const handleCartResponse = body => {
  if (isOrderForm(body)) {
    observeOrderForm(body)
  } else {
    scheduleRefresh()
  }
}

const isCartRequest = url => {
  try {
    const parsed = new URL(String(url), window.location.href)

    if (parsed.origin !== window.location.origin) return false

    return ORDER_FORM_REQUEST.test(parsed.pathname) || CART_ADD_REQUEST.test(parsed.pathname)
  } catch (error) {
    return false
  }
}

const observeFetch = () => {
  const originalFetch = window.fetch

  if (typeof originalFetch !== 'function') return

  rememberNativeFetch(originalFetch)

  window.fetch = function (input) {
    const request = originalFetch.apply(this || window, arguments)
    const url = input && typeof input === 'object' && 'url' in input ? input.url : input

    if (isCartRequest(url)) {
      request.then(
        response => {
          if (!response.ok) return

          response
            .clone()
            .json()
            .then(handleCartResponse, () => scheduleRefresh())
        },
        () => {},
      )
    }

    return request
  }
}

const observeXhr = () => {
  const Xhr = window.XMLHttpRequest

  if (!Xhr) return

  const { open, send } = Xhr.prototype
  const cartRequests = new WeakSet()

  Xhr.prototype.open = function (method, url) {
    if (isCartRequest(url)) {
      cartRequests.add(this)
    } else {
      cartRequests.delete(this)
    }

    return open.apply(this, arguments)
  }

  Xhr.prototype.send = function () {
    if (cartRequests.has(this)) {
      this.addEventListener('load', () => {
        if (this.status < 200 || this.status >= 300) return

        let body = null

        try {
          if (this.responseType === 'json') {
            body = this.response
          } else if (this.responseType === '' || this.responseType === 'text') {
            body = JSON.parse(this.responseText)
          }
        } catch (error) {
          body = null
        }

        handleCartResponse(body)
      })
    }

    return send.apply(this, arguments)
  }
}

export const observeCartRequests = () => {
  observeFetch()
  observeXhr()
}
