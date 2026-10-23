export const SOURCE = 'vtex'

export const log = (level, ...args) => console[level]('[Hellotext]', ...args)

// Calls fn and reports both synchronous throws and rejected thenables. Stores
// often replace window.Promise with old polyfills such as Bluebird, so this
// relies on the thenable contract only.
export const attempt = (message, fn) => {
  try {
    const result = fn()

    if (result && typeof result.then === 'function') {
      result.then(null, error => log('error', message, error))
    }
  } catch (error) {
    log('error', message, error)
  }
}

// cleanUrl and normalizeCartItems are copied from the Hellotext VTEX app
// (hellotext/vtex, pixel/head.html) so Legacy CMS stores send the same
// payloads as Store Framework stores. Keep them in sync.
export const cleanUrl = url => {
  try {
    const urlObj = new URL(url)
    return `${urlObj.origin}${urlObj.pathname}`
  } catch (error) {
    return url.split('?')[0].split('#')[0]
  }
}

export const normalizeCartItems = (items, currency, priceDivisor = 1) => {
  return items.map(item => {
    const amount =
      (item.priceDefinition?.calculatedSellingPrice ?? item.sellingPrice ?? item.price ?? 0) /
      priceDivisor
    const categories = item.productCategories
      ? Object.values(item.productCategories)
      : Array.isArray(item.category)
      ? item.category
      : [item.category].filter(Boolean)
    const reference = item.skuId || item.id
    const brand = item.brand || item.additionalInfo?.brandName

    return {
      quantity: item.quantity || 1,
      price: { amount, currency: currency || 'USD' },
      product: {
        reference,
        categories,
        name: item.variant || item.skuName || item.name,
        image_url: item.imageUrl,
        sku: reference,
        source: SOURCE,
        price: { amount, currency: currency || 'USD' },
        brand,
        product: {
          reference: item.productId,
          name: item.name,
          source: SOURCE,
          categories,
          brand,
        },
      },
    }
  })
}
