# Hellotext for VTEX Legacy CMS

Hellotext SDK for VTEX stores built on the Legacy CMS Portal. Connects the storefront to Hellotext: tracking, webchat, popups and alerts.

## Why

The Hellotext VTEX app only runs on Store Framework (VTEX IO) storefronts. VTEX doesn't load apps on Legacy CMS Portal storefronts, so those stores add this script to their templates instead.

## Installation

### 1. Add Hellotext to the storefront

1. In the VTEX Admin, go to **Storefront > Layout > CMS > HTML Templates**.
2. Open the subtemplate that every page includes, usually the header. If there isn't one, repeat these steps for each page template.
3. Paste the snippet inside `<head>`.
4. Replace `YOUR_BUSINESS_ID` with your Hellotext business ID, from the Hellotext settings page.
5. Save the template.

```html
<!-- Hellotext -->
<script>
  ;(function () {
    var script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/npm/@hellotext/vtex-legacy-cms@1/dist/storefront.js'
    script.onload = function () {
      HellotextLegacyCMS.initialize('YOUR_BUSINESS_ID')
    }
    document.head.appendChild(script)
  })()
</script>
```

### 2. Add Hellotext to the checkout

Follow the [Hellotext for VTEX Checkout](https://github.com/hellotext/vtex-checkout-sdk#installation) installation in **Admin > Checkout > Code > checkout6-custom.js**. Don't paste the storefront snippet there.

## How it works

1. Loads the latest Hellotext.js and initializes it with your business ID.
2. Tracks page views, product views and cart changes, and identifies logged-in shoppers.
3. Shows Hellotext alerts on the home, collection and product pages.
4. Attributes orders from Hellotext campaigns by saving the campaign's UTM on the VTEX cart.
5. Adds products to the VTEX cart from webchat product carousels.

## Development

```bash
yarn install
yarn build       # produces dist/storefront.js
yarn test        # runs jest
```
