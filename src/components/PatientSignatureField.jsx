import { useEffect, useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'

function PatientSignatureField({ signatureRef, hasSignature, hasExistingSignature = false, onSignatureChange }) {
  const containerRef = useRef(null)
  const hasSignatureRef = useRef(false)
  const [canvasWidth, setCanvasWidth] = useState(640)

  useEffect(() => {
    const container = containerRef.current
    if (!container || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => {
      if (!hasSignatureRef.current) setCanvasWidth(Math.max(1, Math.floor(entry.contentRect.width)))
    })
    observer.observe(container)
    return () => observer.disconnect()
  }, [])

  function updateSignature() {
    const signed = Boolean(signatureRef.current && !signatureRef.current.isEmpty())
    hasSignatureRef.current = signed
    onSignatureChange(signed)
  }

  function clearSignature() {
    signatureRef.current?.clear()
    hasSignatureRef.current = false
    onSignatureChange(false)
  }

  return (
    <section className="clinical-history__section clinical-history__signature-section">
      <h3 className="clinical-history__section-title">FIRMA DEL PACIENTE</h3>
      <p className="clinical-history__signature-instruction">Firme en el recuadro con el dedo (tablet/celular) o con el cursor (computador)</p>
      <div className="clinical-history__signature-pad" ref={containerRef}>
        {!hasSignature && <span className="clinical-history__signature-placeholder" aria-hidden="true">✍ {hasExistingSignature ? 'Firma guardada' : 'Firme aquí'}</span>}
        <div className="clinical-history__signature-guide" aria-hidden="true" />
        <SignatureCanvas ref={signatureRef} penColor="#25291c" minWidth={0.8} maxWidth={2.2} onEnd={updateSignature} canvasProps={{ width: canvasWidth, height: 160, className: 'clinical-history__signature-canvas', 'aria-label': 'Firma del paciente' }} />
      </div>
      <div className="clinical-history__signature-footer"><button className="clinical-history__signature-clear" type="button" onClick={clearSignature} disabled={!hasSignature}>Limpiar firma</button><span>{hasExistingSignature ? 'Se conserva si no dibujas una nueva' : '(Firma obligatoria)'}</span></div>
    </section>
  )
}

export default PatientSignatureField
