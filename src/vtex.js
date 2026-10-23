// Readers for what the Legacy CMS platform gives every store, independent of
// the store's theme code: the dataLayer VTEX fills on each page, the skuJson
// product controls, and the public Checkout and profile endpoints.

const ORDER_FORM_PATH = '/api/checkout/pub/orderForm'
const PROFILE_PATH = '/no-cache/profileSystem/getProfile'

// Our own requests must bypass the cart request observer (cart.js), so they
// use the fetch the page had before it was wrapped.
let nativeFetch = null

export const rememberNativeFetch = fetch => {
  nativeFetch = nativeFetch || fetch
}

// VTEX answers Checkout validation failures with JSON bodies too, so callers
// get both the status and the body.
export const request = async (path, { headers, ...init } = {}) => {
  try {
    const response = await (nativeFetch || window.fetch).call(window, path, {
      credentials: 'include',
      ...init,
      headers: { Accept: 'application/json', ...headers },
    })

    let body = null

    try {
      body = await response.json()
    } catch (error) {
      body = null
    }

    return { ok: response.ok, body }
  } catch (error) {
    return { ok: false, body: null }
  }
}

const getJson = async path => {
  const { ok, body } = await request(path)

  return ok ? body : null
}

export const isOrderForm = value => Boolean(value?.orderFormId) && Array.isArray(value.items)

export const fetchOrderForm = async () => {
  const orderForm = await getJson(ORDER_FORM_PATH)

  return isOrderForm(orderForm) ? orderForm : null
}

export const postJson = (path, body) =>
  request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

export const fetchProfile = () => getJson(PROFILE_PATH)

export const currencyOf = orderForm => orderForm?.storePreferencesData?.currencyCode

// VTEX pushes the page context (pageCategory, productId, brand...) as the
// first dataLayer entry, but GTM or theme code may push before it.
export const pageInfo = () => {
  const dataLayer = Array.isArray(window.dataLayer) ? window.dataLayer : []

  return dataLayer.find(entry => entry && entry.pageCategory) || {}
}

export const productJson = () => window.skuJson || window.skuJson_0 || null

// The catalog has the full category tree as paths ("/Gatos/Alimentar/Comida/",
// "/Gatos/Alimentar/", "/Gatos/"); the dataLayer only has the department and
// the leaf. Paths are split into names, like the cart items' categories.
export const fetchProductCategories = async productId => {
  const products = await getJson(
    `/api/catalog_system/pub/products/search?fq=productId:${encodeURIComponent(productId)}`,
  )
  const paths = Array.isArray(products) ? products[0]?.categories : null

  if (!Array.isArray(paths)) return null

  const names = []

  paths.forEach(path => {
    String(path)
      .split('/')
      .forEach(name => {
        if (name && !names.includes(name)) names.push(name)
      })
  })

  return names.length ? names : null
}
