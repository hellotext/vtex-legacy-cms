jest.mock('../tracking', () => ({
  startTracking: jest.fn(),
  markSdkReady: jest.fn(),
  registerSdkListeners: jest.fn(),
}))

const { SDK_URL } = require('../storefront')

let tracking

const loadStorefront = () => {
  let storefront

  jest.isolateModules(() => {
    storefront = require('../storefront').default
    tracking = require('../tracking')
  })

  return storefront
}

const sdkScripts = () => document.querySelectorAll('script[src*="/@hellotext/hellotext"]')

const finishSdkLoad = (script = sdkScripts()[0], sdk = { initialize: jest.fn() }) => {
  window.Hellotext = sdk
  script.dispatchEvent(new Event('load'))

  return sdk
}

const flushAsyncWork = async () => {
  await Promise.resolve()
  await Promise.resolve()
}

describe('storefront.initialize', () => {
  let storefront

  beforeEach(() => {
    delete window.Hellotext
    delete window.__hellotextVtexLegacyCmsStarted
    document.head.innerHTML = ''
    window.history.pushState({}, '', '/')

    jest.spyOn(console, 'warn').mockImplementation(() => {})
    jest.spyOn(console, 'error').mockImplementation(() => {})

    storefront = loadStorefront()
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('loads the same Hellotext.js build as the VTEX app', () => {
    expect(SDK_URL).toBe('https://cdn.jsdelivr.net/npm/@hellotext/hellotext/dist/hellotext.min.js')
  })

  it('loads Hellotext.js from jsDelivr and initializes it with the business ID', () => {
    storefront.initialize('business-123')

    const [script] = sdkScripts()

    expect(sdkScripts()).toHaveLength(1)
    expect(script.src).toBe(SDK_URL)
    expect(script.async).toBe(true)

    const sdk = finishSdkLoad(script)

    expect(sdk.initialize).toHaveBeenCalledWith('business-123')
  })

  it('starts tracking before Hellotext.js loads and marks the SDK ready once initialized', async () => {
    storefront.initialize('business-123')

    expect(tracking.startTracking).toHaveBeenCalledTimes(1)
    expect(tracking.markSdkReady).not.toHaveBeenCalled()

    finishSdkLoad(undefined, { initialize: jest.fn(() => Promise.resolve()) })
    await flushAsyncWork()

    expect(tracking.markSdkReady).toHaveBeenCalledTimes(1)
  })

  it('registers the SDK listeners before Hellotext.initialize runs', () => {
    storefront.initialize('business-123')

    const sdk = finishSdkLoad()

    expect(tracking.registerSdkListeners).toHaveBeenCalledTimes(1)
    expect(tracking.registerSdkListeners.mock.invocationCallOrder[0]).toBeLessThan(
      sdk.initialize.mock.invocationCallOrder[0],
    )
  })

  it('marks the SDK ready right away when initialize returns synchronously', () => {
    storefront.initialize('business-123')
    finishSdkLoad()

    expect(tracking.markSdkReady).toHaveBeenCalledTimes(1)
  })

  it('does not mark the SDK ready when initialization fails', async () => {
    storefront.initialize('business-123')
    finishSdkLoad(undefined, { initialize: jest.fn(() => Promise.reject(new Error('boom'))) })
    await flushAsyncWork()

    expect(tracking.markSdkReady).not.toHaveBeenCalled()
  })

  it('does nothing on checkout pages', () => {
    window.history.pushState({}, '', '/checkout/')

    storefront.initialize('business-123')

    expect(sdkScripts()).toHaveLength(0)
    expect(tracking.startTracking).not.toHaveBeenCalled()
  })

  it('still runs on storefront paths that only start with "checkout"', () => {
    window.history.pushState({}, '', '/checkout-tips')

    storefront.initialize('business-123')

    expect(sdkScripts()).toHaveLength(1)
  })

  it('warns and does nothing without a business ID', () => {
    storefront.initialize()

    expect(sdkScripts()).toHaveLength(0)
    expect(console.warn).toHaveBeenCalledWith(
      '[Hellotext]',
      'Missing business ID, skipping initialization',
    )
  })

  it('reuses Hellotext.js when it is already on the page', () => {
    window.Hellotext = { initialize: jest.fn() }

    storefront.initialize('business-123')

    expect(sdkScripts()).toHaveLength(0)
    expect(window.Hellotext.initialize).toHaveBeenCalledWith('business-123')
  })

  it('leaves an existing Hellotext initialization alone but still tracks', () => {
    window.Hellotext = { initialize: jest.fn(), isInitialized: true }

    storefront.initialize('business-123')

    expect(window.Hellotext.initialize).not.toHaveBeenCalled()
    expect(tracking.markSdkReady).toHaveBeenCalledTimes(1)
  })

  it('waits for a Hellotext.js tag that is still loading instead of adding another', () => {
    const pending = document.createElement('script')

    pending.src = 'https://cdn.jsdelivr.net/npm/@hellotext/hellotext@2/dist/hellotext.js'
    document.head.appendChild(pending)

    storefront.initialize('business-123')

    expect(sdkScripts()).toHaveLength(1)

    const sdk = finishSdkLoad(pending)

    expect(sdk.initialize).toHaveBeenCalledWith('business-123')
  })

  it('initializes once when the snippet is included in more than one template', () => {
    const firstTracking = tracking
    const otherCopy = loadStorefront()

    tracking = firstTracking
    storefront.initialize('business-123')
    otherCopy.initialize('business-123')

    expect(sdkScripts()).toHaveLength(1)

    const sdk = finishSdkLoad()

    expect(sdk.initialize).toHaveBeenCalledTimes(1)
    expect(tracking.startTracking).toHaveBeenCalledTimes(1)
  })

  it('logs when Hellotext.js fails to load', () => {
    storefront.initialize('business-123')

    sdkScripts()[0].dispatchEvent(new Event('error'))

    expect(console.error).toHaveBeenCalledWith(
      '[Hellotext]',
      'Failed to load Hellotext.js from',
      SDK_URL,
    )
  })

  it('logs when the loaded script does not expose window.Hellotext', () => {
    storefront.initialize('business-123')

    sdkScripts()[0].dispatchEvent(new Event('load'))

    expect(console.error).toHaveBeenCalledWith(
      '[Hellotext]',
      'Hellotext.js loaded without exposing window.Hellotext',
    )
  })

  it('logs a rejected initialization without throwing', async () => {
    const error = new Error('boom')

    storefront.initialize('business-123')
    finishSdkLoad(undefined, { initialize: jest.fn(() => Promise.reject(error)) })
    await flushAsyncWork()

    expect(console.error).toHaveBeenCalledWith('[Hellotext]', 'Failed to initialize', error)
  })

  it('logs a synchronous initialization error without throwing', () => {
    const error = new Error('boom')

    storefront.initialize('business-123')

    expect(() =>
      finishSdkLoad(undefined, {
        initialize: jest.fn(() => {
          throw error
        }),
      }),
    ).not.toThrow()
    expect(console.error).toHaveBeenCalledWith('[Hellotext]', 'Failed to initialize', error)
  })
})
