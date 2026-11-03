import config from '../config.js'

const history = new Map() // chat -> last messages (thori memory)

export const AQDAS_AI = `You are "AQDAS AI", a friendly WhatsApp assistant made by AQDAS HACKER, chatting on behalf of this WhatsApp number. Reply in the same language and script the user writes in (Roman Urdu, Urdu, or English). Keep replies short and natural (1-4 sentences), warm and respectful, no markdown headings. If asked who you are, say you are AQDAS AI by AQDAS HACKER.`
export async function askAI (chatId, prompt, { fetchImpl = fetch, key = config.openrouterKey, model = config.openrouterModel, system = null, keep = 8 } = {}) {
  if (!key) throw new Error('AI ke liye .env mein OPENROUTER_API_KEY daalo')
  const past = history.get(chatId) || []
  const messages = [
    { role: 'system', content: system || `You are ${config.botName}, a friendly WhatsApp assistant made by ${config.ownerName}. Reply short and helpful. If the user writes Roman Urdu, reply in Roman Urdu.` },
    ...past, { role: 'user', content: prompt }
  ]
  const res = await fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'HTTP-Referer': 'https://github.com/aqdas-md', 'X-Title': config.botName },
    body: JSON.stringify({ model, messages, max_tokens: 800 })
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data?.error?.message || `OpenRouter error ${res.status}`)
  const answer = data?.choices?.[0]?.message?.content?.trim()
  if (!answer) throw new Error('AI ne jawab nahi diya')
  history.set(chatId, [...past, { role: 'user', content: prompt }, { role: 'assistant', content: answer }].slice(-keep))
  return answer
}
export function clearAI (chatId) { history.delete(chatId) }
