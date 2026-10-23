import { log } from './utils'
import { fetchOrderForm, postJson } from './vtex'

// Ported from the VTEX app's stampHellotextUTM (hellotext/vtex,
// pixel/head.html): a Hellotext UTM collected on the storefront is written
// to the orderForm's marketingData so the VTEX order carries the attribution.

const parseUtm = value => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch (error) {
      return null
    }
  }

  if (value && typeof value === 'object') return value

  return null
}

export const stampUtm = async value => {
  const utm = parseUtm(value)

  // The SDK emits utm-set for every complete UTM it collects. Only a fresh
  // Hellotext source belongs to this integration; the long-lived hello_utm
  // cookie must not turn an unrelated visit into attribution.
  if (utm?.source !== 'hellotext' || !utm.medium) return

  const orderForm = await fetchOrderForm()

  if (!orderForm) {
    log('error', 'Failed to load VTEX orderForm for Hellotext UTM')
    return
  }

  const currentMarketingData = orderForm.marketingData || {}
  const campaign = utm.campaign || null
  const currentCampaign = currentMarketingData.utmCampaign || null

  if (
    currentMarketingData.utmSource === utm.source &&
    currentMarketingData.utmMedium === utm.medium &&
    currentCampaign === campaign
  ) {
    return
  }

  // VTEX attachments are complete replacements. Start with every standard
  // marketingData field, preserve the current coupon, tags, internal UTMs and
  // unknown merchant fields, then replace the external UTM as one tuple.
  const marketingData = {
    utmSource: null,
    utmMedium: null,
    utmCampaign: null,
    utmipage: null,
    utmiPart: null,
    utmiCampaign: null,
    coupon: null,
    marketingTags: [],
    ...currentMarketingData,
    utmSource: utm.source,
    utmMedium: utm.medium,
    utmCampaign: campaign,
  }

  const { ok, body } = await postJson(
    `/api/checkout/pub/orderForm/${orderForm.orderFormId}/attachments/marketingData`,
    marketingData,
  )

  if (!ok || !body?.orderFormId) {
    log('error', 'Failed to stamp Hellotext UTM on VTEX orderForm', body)
  }
}
