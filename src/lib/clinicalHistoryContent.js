export function parseClinicalHistoryContent(content) {
  if (!content) return {}
  if (typeof content !== 'string') return content
  try {
    const parsed = JSON.parse(content)
    return parsed && typeof parsed === 'object' ? parsed : { observaciones_generales: content }
  } catch {
    return { observaciones_generales: content }
  }
}