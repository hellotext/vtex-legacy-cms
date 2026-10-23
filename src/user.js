import { identify } from './queue'
import { SOURCE } from './utils'

// Same shape as the VTEX app's current.user, so user_parameters match.
let user = null

// VTEX masks orderForm profile data (e.g. "*******0123") when the session may
// not see it. A masked value is worse than none.
const unmasked = value =>
  typeof value === 'string' && value && !value.includes('*') ? value : null

export const resolveUser = (profile, orderForm) => {
  if (!profile?.IsUserDefined || !profile.UserId) {
    user = null
    document.cookie = 'hello_identified=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
    return
  }

  // getProfile has no phone or document. They come from the orderForm once
  // the shopper fills them in at checkout.
  const client = orderForm?.clientProfileData || {}

  user = {
    id: profile.UserId,
    user_id: profile.UserId,
    firstName: profile.FirstName || unmasked(client.firstName),
    lastName: profile.LastName || unmasked(client.lastName),
    email: profile.Email || unmasked(client.email),
    phone: unmasked(client.phone),
    document: unmasked(client.document),
    isAuthenticated: true,
  }

  identify(user.id, () => ({
    id: user.id,
    first_name: user.firstName,
    last_name: user.lastName,
    email: user.email,
    phone_number: user.phone,
    source: SOURCE,
  }))
}

export const userParameters = () => ({ source: SOURCE, ...user })
