// Valor com codificação malformada (ex.: `%E0%A4%A`) segue como veio, sem URIError.
const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch (error) {
    if (error instanceof URIError) return value
    throw error
  }
}

export const constructEndpointUrl = (
  value: string | null | undefined
): string => {
  if (!value) return ''

  if (value.startsWith('http://') || value.startsWith('https://')) {
    return safeDecode(value)
  }

  // Check if the endpoint is localhost or an IP address
  if (
    value.startsWith('localhost') ||
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(value)
  ) {
    return `http://${safeDecode(value)}`
  }

  // For all other cases, default to HTTPS
  return `https://${safeDecode(value)}`
}
