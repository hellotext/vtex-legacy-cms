const ORIGIN = window.location.origin
const STORAGE_KEY = 'hellotext:vtex-legacy-cms:cart'
const CATEGORY_PATHS = ['/Pets Lovers/Hogar/Smart Home/', '/Pets Lovers/Hogar/', '/Pets Lovers/']
const CATEGORY_NAMES = ['Pets Lovers', 'Hogar', 'Smart Home']

const createOrderForm = (overrides = {}) => ({
  orderFormId: 'order-form-123',
  storePreferencesData: { currencyCode: 'USD' },
  clientProfileData: null,
  items: [
    {
      id: '7725',
      productId: '5224',
      name: 'Robot de Vigilancia',
      skuName: 'Robot de Vigilancia SE',
      seller: '1',
      quantity: 1,
      price: 19130,
      sellingPrice: 10434,
      priceDefinition: { calculatedSellingPrice: 10434 },
      imageUrl: 'https://petsec.vteximg.com.br/arquivos/ids/172663-55-55/robot.png',
      productCategories: { 4: 'Pets Lovers', 230: 'Smart Home' },
      additionalInfo: { brandName: 'Honor' },
    },
  ],
  ...overrides,
})

const withQuantity = (orderForm, quantity) => ({
  ...orderForm,
  items: orderForm.items.map(item => ({ ...item, quantity })),
})

const expectedCartItem = quantity => ({
  quantity,
  price: { amount: 104.34, currency: 'USD' },
  product: {
    reference: '7725',
    categories: ['Pets Lovers', 'Smart Home'],
    name: 'Robot de Vigilancia SE',
    image_url: 'https://petsec.vteximg.com.br/arquivos/ids/172663-55-55/robot.png',
    sku: '7725',
    source: 'vtex',
    price: { amount: 104.34, currency: 'USD' },
    brand: 'Honor',
    product: {
      reference: '5224',
      name: 'Robot de Vigilancia',
      source: 'vtex',
      categories: ['Pets Lovers', 'Smart Home'],
      brand: 'Honor',
    },
  },
})

const productPage = {
  pageCategory: 'Product',
  productId: '5224',
  productName: 'Robot de Vigilancia',
  productBrandName: 'Honor',
  productDepartmentName: 'Pets Lovers',
  productCategoryName: 'Smart Home',
  productPriceTo: '104.34',
  skuStocks: { 7725: 10 },
}

const skuJson = {
  productId: 5224,
  name: 'Robot de Vigilancia',
  skus: [
    {
      sku: 7725,
      skuname: 'Robot de Vigilancia SE',
      bestPrice: 10434,
      image: 'https://petsec.vteximg.com.br/arquivos/ids/172663-292-292/robot.png?v=1',
      available: true,
    },
    {
      sku: 7726,
      skuname: 'Robot de Vigilancia Pro',
      bestPrice: 0,
      image: 'https://petsec.vteximg.com.br/arquivos/ids/172664-292-292/robot-pro.png?v=1',
      available: false,
    },
  ],
}

const jsonResponse = body => {
  const response = {
    ok: true,
    json: async () => body,
    clone: () => response,
  }

  return response
}

const htmlResponse = () => {
  const response = {
    ok: true,
    json: async () => {
      throw new SyntaxError('Unexpected token <')
    },
    clone: () => response,
  }

  return response
}

// Minimal XMLHttpRequest the cart observer can patch, standing in for the
// requests vtex.js and theme code send with jQuery.
class FakeXhr {
  constructor() {
    this.listeners = {}
    this.responseType = ''
  }

  open(method, url) {
    this.url = url
  }

  send() {}

  addEventListener(name, listener) {
    this.listeners[name] = listener
  }

  respond(status, body) {
    this.status = status
    this.responseText = typeof body === 'string' ? body : JSON.stringify(body)
    this.listeners.load?.()
  }
}

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve()
}

let tracking
let state

const setup = ({
  profile = { IsUserDefined: false },
  orderForm = createOrderForm(),
  page = { pageCategory: 'Home' },
  product = null,
  path = '/',
  catalog = [{ productId: '5224', categories: CATEGORY_PATHS }],
} = {}) => {
  state = { profile, orderForm, catalog, skuSelected: null, sdkListeners: {}, trigger: jest.fn() }

  window.history.pushState({}, '', path)
  window.dataLayer = [{ event: 'gtm.js' }, page]
  window.skuJson = product
  delete window.vtexjs
  window.jQuery = jest.fn(() => ({
    on: (name, handler) => {
      if (name === 'skuSelected.vtex') state.skuSelected = handler
    },
    trigger: state.trigger,
  }))
  // A fresh subclass per test, so patches from earlier tests' module copies
  // never stack on the prototype this test uses.
  window.XMLHttpRequest = class extends FakeXhr {}
  window.fetch = state.fetch = jest.fn(async (url, init) => {
    if (url === '/no-cache/profileSystem/getProfile') return jsonResponse(state.profile)
    if (url === '/api/checkout/pub/orderForm') return jsonResponse(state.orderForm)
    if (url === '/api/catalog_system/pub/products/search?fq=productId:5224') {
      return state.catalog === 'hang' ? new Promise(() => {}) : jsonResponse(state.catalog)
    }

    return state.fetchResponse ? state.fetchResponse(url, init) : htmlResponse()
  })
  window.Hellotext = {
    track: jest.fn(),
    identify: jest.fn(),
    on: jest.fn((name, listener) => {
      state.sdkListeners[name] = listener
    }),
    alert: { show: jest.fn(), hide: jest.fn() },
  }

  jest.isolateModules(() => {
    tracking = require('../tracking')
  })
}

const start = async ({ ready = true } = {}) => {
  tracking.startTracking()
  await flush()

  if (ready) tracking.markSdkReady()
}

const tracked = action => window.Hellotext.track.mock.calls.filter(([name]) => name === action)

// Seeds the snapshot a previous page load would have left.
const storeSnapshot = orderForm => {
  jest.isolateModules(() => {
    require('../cart').observeOrderForm(orderForm)
  })
}

describe('storefront tracking', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.cookie = 'hello_identified=1; path=/'
    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
    delete window.skuJson
    delete window.jQuery
  })

  describe('queue', () => {
    it('tracks nothing until Hellotext.js is initialized, then flushes in order', async () => {
      setup({ profile: { IsUserDefined: true, UserId: 'user-1', Email: 'shopper@example.com' } })

      await start({ ready: false })

      expect(window.Hellotext.identify).not.toHaveBeenCalled()
      expect(window.Hellotext.track).not.toHaveBeenCalled()

      tracking.markSdkReady()

      expect(window.Hellotext.identify).toHaveBeenCalledTimes(1)
      expect(window.Hellotext.track).toHaveBeenCalledWith('page.viewed', expect.any(Object))
      expect(window.Hellotext.identify.mock.invocationCallOrder[0]).toBeLessThan(
        window.Hellotext.track.mock.invocationCallOrder[0],
      )
    })

    it('still tracks when the profile and orderForm requests fail', async () => {
      setup()
      window.fetch.mockImplementation(async () => {
        throw new TypeError('Failed to fetch')
      })

      await start()

      expect(window.Hellotext.track).toHaveBeenCalledWith('page.viewed', {
        user_parameters: { source: 'vtex' },
      })
    })

    it('reports a failing track call without stopping the queue', async () => {
      setup()
      window.Hellotext.identify = jest.fn()
      window.Hellotext.track = jest.fn(() => {
        throw new Error('boom')
      })

      await start()

      expect(console.error).toHaveBeenCalledWith(
        '[Hellotext]',
        'Failed to track page.viewed',
        expect.any(Error),
      )
    })
  })

  describe('identify', () => {
    it('identifies a logged-in shopper and adds them to every event', async () => {
      setup({
        profile: {
          UserId: 'user-1',
          IsUserDefined: true,
          FirstName: null,
          LastName: null,
          Email: 'shopper@example.com',
        },
        orderForm: createOrderForm({
          clientProfileData: {
            email: 'shopper@example.com',
            firstName: 'Ada',
            lastName: 'Lovelace',
            phone: '+593999999999',
            document: '0912345678',
          },
        }),
      })

      await start()

      expect(window.Hellotext.identify).toHaveBeenCalledWith('user-1', {
        id: 'user-1',
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'shopper@example.com',
        phone_number: '+593999999999',
        source: 'vtex',
      })
      expect(window.Hellotext.track).toHaveBeenCalledWith('page.viewed', {
        user_parameters: {
          source: 'vtex',
          id: 'user-1',
          user_id: 'user-1',
          firstName: 'Ada',
          lastName: 'Lovelace',
          email: 'shopper@example.com',
          phone: '+593999999999',
          document: '0912345678',
          isAuthenticated: true,
        },
      })
    })

    it('ignores masked orderForm profile data', async () => {
      setup({
        profile: { UserId: 'user-1', IsUserDefined: true, Email: 'shopper@example.com' },
        orderForm: createOrderForm({
          clientProfileData: { phone: '*******9999', document: '******678' },
        }),
      })

      await start()

      expect(window.Hellotext.identify).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ phone_number: null }),
      )
    })

    it('does not identify a logged-out shopper and clears the identified cookie', async () => {
      setup({ profile: { IsUserDefined: false } })

      await start()

      expect(window.Hellotext.identify).not.toHaveBeenCalled()
      expect(document.cookie).not.toContain('hello_identified=1')
      expect(window.Hellotext.track).toHaveBeenCalledWith('page.viewed', {
        user_parameters: { source: 'vtex' },
      })
    })
  })

  describe('page views', () => {
    it('tracks page.viewed on storefront pages', async () => {
      setup({ page: { pageCategory: 'Department' }, path: '/perros' })

      await start()

      expect(tracked('page.viewed')).toHaveLength(1)
    })

    it('skips cart pages, like the VTEX app', async () => {
      setup({ path: '/cart' })

      await start()

      expect(tracked('page.viewed')).toHaveLength(0)
    })
  })

  describe('product views', () => {
    it('tracks product.viewed instead of page.viewed on product pages', async () => {
      setup({ page: productPage, product: skuJson, path: '/robot-de-vigilancia/p' })

      await start()

      expect(tracked('page.viewed')).toHaveLength(0)
      expect(window.Hellotext.track).toHaveBeenCalledWith('product.viewed', {
        user_parameters: { source: 'vtex' },
        object_parameters: {
          reference: '7725',
          name: 'Robot de Vigilancia SE',
          image_url: 'https://petsec.vteximg.com.br/arquivos/ids/172663/robot.png?v=1',
          url: `${ORIGIN}/robot-de-vigilancia/p`,
          sku: '7725',
          categories: CATEGORY_NAMES,
          brand: 'Honor',
          price: { amount: 104.34, currency: 'USD' },
          source: 'vtex',
          product_parameters: {
            reference: '5224',
            name: 'Robot de Vigilancia',
            source: 'vtex',
            categories: CATEGORY_NAMES,
            brand: 'Honor',
            url: `${ORIGIN}/robot-de-vigilancia/p`,
            image_url: 'https://petsec.vteximg.com.br/arquivos/ids/172663/robot.png?v=1',
          },
        },
      })
    })

    it('tracks the variant the shopper selects, once per variant', async () => {
      setup({ page: productPage, product: skuJson, path: '/robot-de-vigilancia/p' })

      await start()

      state.skuSelected({}, 5224, skuJson.skus[0])
      state.skuSelected({}, 5224, skuJson.skus[1])
      state.skuSelected({}, 5224, skuJson.skus[1])

      const views = tracked('product.viewed')

      expect(views).toHaveLength(2)
      expect(views[1][1].object_parameters).toEqual(
        expect.objectContaining({
          reference: '7726',
          name: 'Robot de Vigilancia Pro',
          price: null,
        }),
      )
    })

    it('falls back to the dataLayer when the theme has no skuJson', async () => {
      setup({ page: productPage, path: '/robot-de-vigilancia/p' })

      await start()

      expect(window.Hellotext.track).toHaveBeenCalledWith(
        'product.viewed',
        expect.objectContaining({
          object_parameters: expect.objectContaining({
            reference: '7725',
            name: 'Robot de Vigilancia',
            price: { amount: 104.34, currency: 'USD' },
            product_parameters: expect.objectContaining({ reference: '5224' }),
          }),
        }),
      )
    })

    it('splits every catalog category path into unique names', async () => {
      setup({
        page: productPage,
        product: skuJson,
        path: '/robot-de-vigilancia/p',
        catalog: [
          {
            categories: [
              '/Infantil/Juguetería/Carros de Juguete/',
              '/Infantil/Juguetería/',
              '/Infantil/',
              '/Infantil/Juguetería/Juguetes para Niños/',
              '/Envio express/',
            ],
          },
        ],
      })

      await start()

      expect(tracked('product.viewed')[0][1].object_parameters.categories).toEqual([
        'Infantil',
        'Juguetería',
        'Carros de Juguete',
        'Juguetes para Niños',
        'Envio express',
      ])
    })

    it('does not hold back identify or cart events while the catalog request is pending', async () => {
      storeSnapshot(createOrderForm())
      setup({
        profile: { IsUserDefined: true, UserId: 'user-1', Email: 'shopper@example.com' },
        orderForm: withQuantity(createOrderForm(), 2),
        page: productPage,
        product: skuJson,
        path: '/robot-de-vigilancia/p',
        catalog: 'hang',
      })

      await start()

      expect(window.Hellotext.identify).toHaveBeenCalledTimes(1)
      expect(tracked('cart.added')).toHaveLength(1)
      expect(tracked('product.viewed')).toHaveLength(0)
    })

    it('falls back to the dataLayer categories when the catalog request fails', async () => {
      setup({ page: productPage, product: skuJson, path: '/robot-de-vigilancia/p', catalog: [] })

      await start()

      expect(tracked('product.viewed')[0][1].object_parameters.categories).toEqual([
        'Pets Lovers',
        'Smart Home',
      ])
    })

    it('reads the page context even when GTM pushed to the dataLayer first', async () => {
      setup({ page: productPage, product: skuJson, path: '/robot-de-vigilancia/p' })
      window.dataLayer.unshift({ event: 'consent' })

      await start()

      expect(tracked('product.viewed')).toHaveLength(1)
    })
  })

  describe('cart changes', () => {
    it('only records a baseline the first time it sees a cart', async () => {
      setup()

      await start()

      expect(tracked('cart.added')).toHaveLength(0)
      expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)).orderFormId).toBe(
        'order-form-123',
      )
    })

    it('tracks items added since the last page, e.g. by a full-page /checkout/cart/add', async () => {
      storeSnapshot(createOrderForm())
      setup({ orderForm: withQuantity(createOrderForm(), 3) })

      await start()

      expect(window.Hellotext.track).toHaveBeenCalledWith('cart.added', {
        user_parameters: { source: 'vtex' },
        object_parameters: {
          reference: 'order-form-123',
          source: 'vtex',
          items: [expectedCartItem(2)],
        },
      })
    })

    it('tracks removals from Checkout API responses sent with XMLHttpRequest', async () => {
      setup({ orderForm: withQuantity(createOrderForm(), 2) })
      await start()

      const xhr = new window.XMLHttpRequest()

      xhr.open('POST', '/api/checkout/pub/orderForm/order-form-123/items/update')
      xhr.send()
      xhr.respond(200, createOrderForm({ items: [] }))

      expect(window.Hellotext.track).toHaveBeenCalledWith('cart.removed', {
        user_parameters: { source: 'vtex' },
        object_parameters: {
          reference: 'order-form-123',
          source: 'vtex',
          items: [expectedCartItem(2)],
        },
      })
    })

    it('reads the cart again after a /checkout/cart/add request that returns HTML', async () => {
      jest.useFakeTimers()
      setup()
      await start()

      state.orderForm = withQuantity(createOrderForm(), 2)

      const xhr = new window.XMLHttpRequest()

      xhr.open('GET', '/checkout/cart/add?sku=7725&qty=1&seller=1&redirect=false&sc=1')
      xhr.send()
      xhr.respond(200, '<html></html>')

      expect(tracked('cart.added')).toHaveLength(0)

      jest.advanceTimersByTime(250)
      await flush()

      expect(tracked('cart.added')).toHaveLength(1)
      expect(tracked('cart.added')[0][1].object_parameters.items).toEqual([expectedCartItem(1)])
    })

    it('observes cart requests sent with fetch', async () => {
      setup()
      await start()

      state.fetchResponse = () => jsonResponse(withQuantity(createOrderForm(), 4))
      await window.fetch(`${ORIGIN}/api/checkout/pub/orderForm/order-form-123/items`, {
        method: 'POST',
      })
      await flush()

      expect(tracked('cart.added')[0][1].object_parameters.items).toEqual([expectedCartItem(3)])
    })

    it('tracks the same change once even when it is seen twice', async () => {
      setup()
      await start()

      const updated = withQuantity(createOrderForm(), 2)

      ;[1, 2].forEach(() => {
        const xhr = new window.XMLHttpRequest()

        xhr.open('GET', '/api/checkout/pub/orderForm')
        xhr.send()
        xhr.respond(200, updated)
      })

      expect(tracked('cart.added')).toHaveLength(1)
    })

    it('treats a new orderForm as a new baseline instead of removing everything', async () => {
      storeSnapshot(withQuantity(createOrderForm(), 2))
      setup({ orderForm: createOrderForm({ orderFormId: 'order-form-456', items: [] }) })

      await start()

      expect(tracked('cart.removed')).toHaveLength(0)
    })

    it('ignores promotion gifts VTEX adds to the cart', async () => {
      setup()
      await start()

      const withGift = createOrderForm()

      withGift.items.push({ ...withGift.items[0], id: '9999', isGift: true })

      const xhr = new window.XMLHttpRequest()

      xhr.open('GET', '/api/checkout/pub/orderForm')
      xhr.send()
      xhr.respond(200, withGift)

      expect(tracked('cart.added')).toHaveLength(0)
    })

    it('sums lines of the same SKU and seller', async () => {
      setup()
      await start()

      const split = createOrderForm()

      split.items.push({ ...split.items[0], quantity: 2 })

      const xhr = new window.XMLHttpRequest()

      xhr.open('GET', '/api/checkout/pub/orderForm')
      xhr.send()
      xhr.respond(200, split)

      expect(tracked('cart.added')[0][1].object_parameters.items).toEqual([expectedCartItem(2)])
    })

    it.each([
      ['shipping simulations', '/api/checkout/pub/orderForms/simulation'],
      ['other origins', 'https://other.example.com/api/checkout/pub/orderForm'],
      ['unrelated requests', '/api/catalog_system/pub/products/search'],
    ])('ignores %s', async (_label, url) => {
      jest.useFakeTimers()
      setup()
      await start()

      const xhr = new window.XMLHttpRequest()

      xhr.open('POST', url)
      xhr.send()
      xhr.respond(200, withQuantity(createOrderForm(), 5))
      jest.advanceTimersByTime(250)
      await flush()

      expect(tracked('cart.added')).toHaveLength(0)
    })

    it('ignores failed cart requests', async () => {
      setup()
      await start()

      const xhr = new window.XMLHttpRequest()

      xhr.open('POST', '/api/checkout/pub/orderForm/order-form-123/items')
      xhr.send()
      xhr.respond(400, { error: { message: 'Item unavailable' } })

      expect(tracked('cart.added')).toHaveLength(0)
    })

    it('reads the cart once per refresh, without observing its own reads', async () => {
      jest.useFakeTimers()
      setup()
      await start()

      const xhr = new window.XMLHttpRequest()

      xhr.open('GET', '/checkout/cart/add?sku=7725&qty=1&seller=1')
      xhr.send()
      xhr.respond(200, '<html></html>')
      jest.advanceTimersByTime(1000)
      await flush()
      jest.advanceTimersByTime(1000)
      await flush()

      // getProfile, the first orderForm read, and one refresh.
      expect(state.fetch).toHaveBeenCalledTimes(3)
    })
  })

  describe('alerts', () => {
    it.each([
      ['Home', 'homepage'],
      ['Department', 'product_collection'],
      ['Category', 'product_collection'],
    ])('shows the section for %s pages', async (pageCategory, section) => {
      setup({ page: { pageCategory } })

      await start()

      expect(window.Hellotext.alert.show).toHaveBeenCalledTimes(1)
      expect(window.Hellotext.alert.show).toHaveBeenCalledWith(section)
    })

    it('shows the product section on product pages', async () => {
      setup({ page: productPage, product: skuJson, path: '/robot-de-vigilancia/p' })

      await start()

      expect(window.Hellotext.alert.show).toHaveBeenCalledWith('product_details')
    })

    it('hides the alert on pages without a section', async () => {
      setup({ page: { pageCategory: 'InternalSiteSearch' } })

      await start()

      expect(window.Hellotext.alert.show).not.toHaveBeenCalled()
      expect(window.Hellotext.alert.hide).toHaveBeenCalledTimes(1)
    })

    it('waits for Hellotext.js before showing the section', async () => {
      setup()

      await start({ ready: false })

      expect(window.Hellotext.alert.show).not.toHaveBeenCalled()

      tracking.markSdkReady()

      expect(window.Hellotext.alert.show).toHaveBeenCalledWith('homepage')
    })

    it('keeps tracking when the SDK has no alerts', async () => {
      setup()
      window.Hellotext.alert = null

      await start()

      expect(tracked('page.viewed')).toHaveLength(1)
      expect(console.error).not.toHaveBeenCalled()
    })
  })

  describe('SDK listeners', () => {
    it('registers utm-set and cart.added once', () => {
      setup()

      tracking.registerSdkListeners()
      tracking.registerSdkListeners()

      expect(window.Hellotext.on).toHaveBeenCalledTimes(2)
      expect(Object.keys(state.sdkListeners)).toEqual(['utm-set', 'cart.added'])
    })

    it('does nothing when the SDK has no event listeners', () => {
      setup()
      delete window.Hellotext.on

      expect(() => tracking.registerSdkListeners()).not.toThrow()
    })
  })

  describe('UTM stamping', () => {
    const stampRequests = () =>
      state.fetch.mock.calls.filter(([url]) => url.endsWith('/attachments/marketingData'))

    const emitUtm = async value => {
      tracking.registerSdkListeners()
      state.sdkListeners['utm-set'](value)
      await flush()
    }

    it('stamps a Hellotext UTM on the orderForm, keeping the other marketing data', async () => {
      setup({
        orderForm: createOrderForm({
          marketingData: {
            id: 'marketingData',
            utmSource: 'google',
            utmMedium: 'cpc',
            utmCampaign: 'old_campaign',
            utmiCampaign: 'home_banner',
            coupon: 'SAVE10',
            marketingTags: ['vip'],
          },
        }),
      })
      state.fetchResponse = () => jsonResponse(createOrderForm())

      await emitUtm(
        JSON.stringify({ source: 'hellotext', medium: 'whatsapp', campaign: 'summer_sale' }),
      )

      const [[url, init]] = stampRequests()

      expect(url).toBe('/api/checkout/pub/orderForm/order-form-123/attachments/marketingData')
      expect(init).toEqual(
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        }),
      )
      expect(JSON.parse(init.body)).toEqual({
        id: 'marketingData',
        utmSource: 'hellotext',
        utmMedium: 'whatsapp',
        utmCampaign: 'summer_sale',
        utmipage: null,
        utmiPart: null,
        utmiCampaign: 'home_banner',
        coupon: 'SAVE10',
        marketingTags: ['vip'],
      })
    })

    it('clears an older campaign when the Hellotext UTM has none', async () => {
      setup({
        orderForm: createOrderForm({
          marketingData: { utmSource: 'google', utmMedium: 'cpc', utmCampaign: 'old_campaign' },
        }),
      })
      state.fetchResponse = () => jsonResponse(createOrderForm())

      await emitUtm({ source: 'hellotext', medium: 'webchat' })

      expect(JSON.parse(stampRequests()[0][1].body)).toEqual(
        expect.objectContaining({
          utmSource: 'hellotext',
          utmMedium: 'webchat',
          utmCampaign: null,
        }),
      )
    })

    it('does not rewrite an unchanged Hellotext UTM', async () => {
      setup({
        orderForm: createOrderForm({
          marketingData: { utmSource: 'hellotext', utmMedium: 'sms', utmCampaign: 'welcome' },
        }),
      })

      await emitUtm({ source: 'hellotext', medium: 'sms', campaign: 'welcome' })

      expect(stampRequests()).toHaveLength(0)
    })

    it.each([
      ['other sources', JSON.stringify({ source: 'google', medium: 'cpc' })],
      ['UTMs without a medium', { source: 'hellotext' }],
      ['unreadable values', 'not json'],
    ])('ignores %s', async (_label, value) => {
      setup()

      await emitUtm(value)

      expect(state.fetch).not.toHaveBeenCalled()
    })

    it('reports a rejected stamp', async () => {
      setup()
      state.fetchResponse = () => ({
        ok: false,
        json: async () => ({ error: { message: 'Invalid attachment' } }),
      })

      await emitUtm({ source: 'hellotext', medium: 'sms' })

      expect(console.error).toHaveBeenCalledWith(
        '[Hellotext]',
        'Failed to stamp Hellotext UTM on VTEX orderForm',
        { error: { message: 'Invalid attachment' } },
      )
    })
  })

  describe('carousel add-to-cart', () => {
    const carouselAdd = {
      source: 'webchat',
      object_parameters: { items: [{ reference: '7725', quantity: 2 }] },
    }

    const emitCartAdded = async data => {
      tracking.registerSdkListeners()
      state.sdkListeners['cart.added'](data)
      await flush()
    }

    it('adds through vtex.js and tracks the add with its source', async () => {
      setup()
      await start()

      const addToCart = jest.fn(() => ({ fail: jest.fn() }))

      window.vtexjs = { checkout: { addToCart } }

      await emitCartAdded(carouselAdd)

      expect(addToCart).toHaveBeenCalledWith([{ id: '7725', quantity: 2, seller: '1' }])

      // vtex.js's own request, seen by the cart observer.
      const xhr = new window.XMLHttpRequest()

      xhr.open('POST', '/api/checkout/pub/orderForm/order-form-123/items')
      xhr.send()
      xhr.respond(200, withQuantity(createOrderForm(), 3))

      expect(window.Hellotext.track).toHaveBeenCalledWith('cart.added', {
        source: 'webchat',
        user_parameters: { source: 'vtex' },
        object_parameters: {
          reference: 'order-form-123',
          source: 'vtex',
          items: [expectedCartItem(2)],
        },
      })
    })

    describe('when vtex.js resolves the add', () => {
      let resolveAdd

      const useVtexjs = () => {
        window.vtexjs = {
          checkout: {
            addToCart: jest.fn(() => ({
              done: callback => {
                resolveAdd = callback
              },
              fail: jest.fn(),
            })),
          },
        }
      }

      const observeXhrResponse = orderForm => {
        const xhr = new window.XMLHttpRequest()

        xhr.open('POST', '/api/checkout/pub/orderForm/order-form-123/items')
        xhr.send()
        xhr.respond(200, orderForm)
      }

      it('tracks once when the observer saw the response first', async () => {
        setup()
        await start()
        useVtexjs()

        const updated = withQuantity(createOrderForm(), 3)

        await emitCartAdded(carouselAdd)
        observeXhrResponse(updated)
        resolveAdd(updated)

        expect(tracked('cart.added')).toHaveLength(1)
        expect(tracked('cart.added')[0][1].source).toBe('webchat')
      })

      it('tracks once when vtex.js resolves before the observer sees the response', async () => {
        setup()
        await start()
        useVtexjs()

        const updated = withQuantity(createOrderForm(), 3)

        await emitCartAdded(carouselAdd)
        resolveAdd(updated)
        observeXhrResponse(updated)

        expect(tracked('cart.added')).toHaveLength(1)
        expect(tracked('cart.added')[0][1].source).toBe('webchat')
      })

      it('does not tag the next add when VTEX ignores a SKU already in the cart', async () => {
        setup()
        await start()
        useVtexjs()

        await emitCartAdded(carouselAdd)
        resolveAdd(createOrderForm())
        observeXhrResponse(withQuantity(createOrderForm(), 2))

        expect(tracked('cart.added')).toHaveLength(1)
        expect(tracked('cart.added')[0][1]).not.toHaveProperty('source')
      })
    })

    it('does not tag later adds when vtex.js rejects the add', async () => {
      setup()
      await start()

      let reject

      window.vtexjs = {
        checkout: {
          addToCart: jest.fn(() => ({
            fail: callback => {
              reject = callback
            },
          })),
        },
      }

      await emitCartAdded(carouselAdd)
      reject({ status: 400 })

      const xhr = new window.XMLHttpRequest()

      xhr.open('GET', '/api/checkout/pub/orderForm')
      xhr.send()
      xhr.respond(200, withQuantity(createOrderForm(), 2))

      expect(console.error).toHaveBeenCalledWith(
        '[Hellotext]',
        'Failed to add items to VTEX cart',
        {
          status: 400,
        },
      )
      expect(tracked('cart.added')[0][1]).not.toHaveProperty('source')
    })

    it('adds through the Checkout API without vtex.js and notifies the store', async () => {
      setup()
      await start()

      const updated = withQuantity(createOrderForm(), 3)
      const orderFormUpdated = jest.fn()

      window.addEventListener('orderFormUpdated.vtex', orderFormUpdated)
      state.fetchResponse = () => jsonResponse(updated)

      await emitCartAdded(carouselAdd)

      const [url, init] = state.fetch.mock.calls.find(([path]) => path.endsWith('/items'))

      expect(url).toBe('/api/checkout/pub/orderForm/order-form-123/items')
      expect(JSON.parse(init.body)).toEqual({
        orderItems: [{ id: '7725', quantity: 2, seller: '1' }],
      })
      expect(window.Hellotext.track).toHaveBeenCalledWith(
        'cart.added',
        expect.objectContaining({
          source: 'webchat',
          object_parameters: expect.objectContaining({ items: [expectedCartItem(2)] }),
        }),
      )
      expect(state.trigger).toHaveBeenCalledWith('orderFormUpdated.vtex', [updated])
      expect(orderFormUpdated).toHaveBeenCalledWith(expect.objectContaining({ detail: updated }))

      window.removeEventListener('orderFormUpdated.vtex', orderFormUpdated)
    })

    it('reports a Checkout API rejection without tracking', async () => {
      setup()
      await start()

      state.fetchResponse = () => ({
        ok: false,
        json: async () => ({ error: { message: 'Item unavailable' } }),
      })

      await emitCartAdded(carouselAdd)

      expect(tracked('cart.added')).toHaveLength(0)
      expect(console.error).toHaveBeenCalledWith(
        '[Hellotext]',
        'Failed to add items to VTEX cart',
        {
          error: { message: 'Item unavailable' },
        },
      )
    })

    it('ignores events without items', async () => {
      setup()
      await start()

      const callsBefore = state.fetch.mock.calls.length

      await emitCartAdded({ object_parameters: { items: [] } })

      expect(state.fetch.mock.calls.length).toBe(callsBefore)
    })
  })
})
