// Free public APIs ke liye chhota helper: timeout + friendly error
export class ApiDown extends Error {}

export async function getJSON (url, { timeout = 12000, headers = {}, fetchImpl = fetch } = {}) {
  let r
  try {
    r = await fetchImpl(url, { headers: { 'User-Agent': 'AQDAS-MD-Bot/1.0', Accept: 'application/json', ...headers }, signal: AbortSignal.timeout(timeout) })
  } catch (e) { throw new ApiDown('API abhi jawab nahi de rahi (timeout/network). Thori dair baad try karo.') }
  if (r.status === 404) return null
  if (!r.ok) throw new ApiDown(`API down hai (${r.status}). Baad mein try karo.`)
  try { return await r.json() } catch { throw new ApiDown('API ne ajeeb jawab diya. Baad mein try karo.') }
}

export async function getText (url, { timeout = 12000, fetchImpl = fetch } = {}) {
  let r
  try { r = await fetchImpl(url, { headers: { 'User-Agent': 'AQDAS-MD-Bot/1.0' }, signal: AbortSignal.timeout(timeout) }) } catch { throw new ApiDown('API abhi jawab nahi de rahi. Thori dair baad try karo.') }
  if (!r.ok) throw new ApiDown(`API down hai (${r.status}).`)
  return r.text()
}

export async function getBuffer (url, { timeout = 20000, fetchImpl = fetch } = {}) {
  let r
  try { r = await fetchImpl(url, { headers: { 'User-Agent': 'AQDAS-MD-Bot/1.0' }, signal: AbortSignal.timeout(timeout) }) } catch { throw new ApiDown('Image download nahi hui. Baad mein try karo.') }
  if (!r.ok) throw new ApiDown(`Image nahi mili (${r.status}).`)
  return Buffer.from(await r.arrayBuffer())
}
