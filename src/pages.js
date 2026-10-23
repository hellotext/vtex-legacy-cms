import { enqueue, track } from './queue'
import { userParameters } from './user'
import { cleanUrl, SOURCE } from './utils'
import { fetchProductCategories, pageInfo, productJson } from './vtex'

// Same skip rule as the VTEX app: checkout and cart pages carry per-session
// tokens and are not useful for segmentation or attribution.
const CHECKOUT_OR_CART = /^\/(checkout|cart)/i

// Fired by VTEX's portal-sku-selector when the shopper picks a variant.
const SKU_SELECTED = 'skuSelected.vtex'

// The VTEX app's alert sections (homeView, categoryView, departmentView,
// productPageInfo), by the pageCategory VTEX gives Legacy CMS pages.
const ALERT_SECTIONS = {
  Home: 'homepage',
  Department: 'product_collection',
  Category: 'product_collection',
  Product: 'product_details',
}

let lastViewedSku = null

const isProductPage = () => pageInfo().pageCategory === 'Product' || Boolean(productJson())

// skuJson images are resized ("/ids/172663-292-292/"). The VTEX app sends
// the original, which drops the size suffix.
const originalImage = url => url && url.replace(/\/ids\/(\d+)-\d+-\d+\//, '/ids/$1/')

const productId = () => productJson()?.productId ?? pageInfo().productId

const productCategories = async () => {
  const id = productId()
  const categories = id ? await fetchProductCategories(id) : null

  if (categories) return categories

  const info = pageInfo()

  return [info.productDepartmentName, info.productCategoryName].filter(
    (name, index, names) => name && names.indexOf(name) === index,
  )
}

// skuJson comes from the product template's SKU controls. A theme without
// them still gets VTEX's dataLayer, which has the product and its SKU ids.
const productSkus = () => {
  const product = productJson()

  if (Array.isArray(product?.skus) && product.skus.length) {
    return product.skus.map(sku => ({
      id: String(sku.sku),
      name: sku.skuname,
      price: sku.bestPrice / 100,
      image: originalImage(sku.image),
      available: sku.available,
    }))
  }

  const info = pageInfo()

  return Object.keys(info.skuStocks || {}).map(id => ({
    id,
    name: info.productName,
    price: parseFloat(info.productPriceTo),
    image: null,
    available: info.skuStocks[id] > 0,
  }))
}

const trackProductView = (sku, { currency, categories }) => {
  if (sku.id === lastViewedSku) return

  lastViewedSku = sku.id

  const info = pageInfo()
  const product = productJson()
  const url = cleanUrl(window.location.href)
  const brand = info.productBrandName

  track('product.viewed', () => ({
    user_parameters: userParameters(),
    object_parameters: {
      reference: sku.id,
      name: sku.name,
      image_url: sku.image,
      url,
      sku: sku.id,
      categories,
      brand,
      price: sku.price ? { amount: sku.price, currency } : null,
      source: SOURCE,
      product_parameters: {
        reference: String(productId()),
        name: product?.name || info.productName,
        source: SOURCE,
        categories,
        brand,
        url,
        image_url: sku.image,
      },
    },
  }))
}

const watchSkuSelection = context => {
  const jquery = window.jQuery || window.$

  if (typeof jquery !== 'function') return

  jquery(document).on(SKU_SELECTED, (event, selectedProductId, selected) => {
    const id = String(selected?.sku ?? selected)
    const sku = productSkus().find(candidate => candidate.id === id)

    if (sku) trackProductView(sku, context)
  })
}

// Each Legacy CMS navigation is a full page load, so the section is decided
// once per page. Pages without a section hide the alert, like the VTEX app.
const showAlert = () => {
  const section = isProductPage() ? ALERT_SECTIONS.Product : ALERT_SECTIONS[pageInfo().pageCategory]

  enqueue('Failed to update the alert', () =>
    section ? window.Hellotext.alert?.show(section) : window.Hellotext.alert?.hide(),
  )
}

export const trackPage = async currency => {
  showAlert()

  if (CHECKOUT_OR_CART.test(window.location.pathname)) return

  if (!isProductPage()) {
    track('page.viewed', () => ({ user_parameters: userParameters() }))
    return
  }

  const skus = productSkus()

  if (!skus.length) return

  const context = { currency, categories: await productCategories() }

  trackProductView(skus.find(sku => sku.available) || skus[0], context)
  watchSkuSelection(context)
}
