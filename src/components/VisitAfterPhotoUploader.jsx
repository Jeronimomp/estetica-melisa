import { useEffect, useRef, useState } from 'react'
import { Camera, Check, LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { supabase } from '@/lib/supabase'

const photoBucket = 'fotos-cita'
const maxPhotoSize = 10 * 1024 * 1024

function getUploadError(error, photoLabel) {
  if (error?.statusCode === '404' || error?.status === 404) return 'Falta configurar el bucket privado fotos-cita en Supabase.'
  if (error?.statusCode === '403' || error?.status === 403) return 'Storage rechazó la foto. Revisa las políticas de fotos-cita.'
  if (error?.code === '42501' || error?.code === 'PGRST301') return 'Tu cuenta no tiene permiso para registrar esta foto.'
  return `No se pudo guardar la foto ${photoLabel}. Inténtalo de nuevo.`
}

function convertToJpeg(file) {
  return new Promise((resolve, reject) => {
    const sourceUrl = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
      const context = canvas.getContext('2d')
      if (!context) {
        URL.revokeObjectURL(sourceUrl)
        reject(new Error('No se pudo procesar la imagen.'))
        return
      }
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(sourceUrl)
        if (blob) resolve(blob)
        else reject(new Error('No se pudo convertir la imagen a JPEG.'))
      }, 'image/jpeg', 0.9)
    }
    image.onerror = () => {
      URL.revokeObjectURL(sourceUrl)
      reject(new Error('El formato de esta imagen no es compatible.'))
    }
    image.src = sourceUrl
  })
}

function VisitAfterPhotoUploader({ visit, clientId, hasAfterPhoto, hasPhoto, existingPhoto = null, photoType = 'despues', canUpload = true, allowReplace = true, onSaved }) {
  const fileInputRef = useRef(null)
  const successTimerRef = useRef(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const photoExists = Boolean(existingPhoto) || (hasPhoto ?? hasAfterPhoto)
  const photoLabel = photoType === 'antes' ? 'antes' : 'después'

  useEffect(() => {
    if (!previewUrl) return undefined
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  useEffect(() => () => window.clearTimeout(successTimerRef.current), [])

  function handleFileSelected(event) {
    const file = event.target.files?.[0]
    if (!file) return
    event.target.value = ''
    setError('')
    setSuccess(false)
    if (!file.type.startsWith('image/')) {
      setError('Selecciona un archivo de imagen válido.')
      return
    }
    if (file.size > maxPhotoSize) {
      setError('La foto debe pesar menos de 10 MB.')
      return
    }
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
  }

  function cancelSelection() {
    setSelectedFile(null)
    setPreviewUrl('')
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function savePhoto() {
    if (!selectedFile || !supabase || saving) return
    setSaving(true)
    setError('')
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) throw new Error('No se pudo verificar la sesión. Inicia sesión de nuevo.')
      const photoBlob = await convertToJpeg(selectedFile)
      const storagePath = `${visit.id}/${photoType}_${Date.now()}.jpg`
      const { data: uploaded, error: uploadError } = await supabase.storage.from(photoBucket).upload(storagePath, photoBlob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false })
      if (uploadError) throw new Error(getUploadError(uploadError, photoLabel))
      const photoValues = {
        cita_id: visit.id,
        cliente_id: clientId,
        tipo: photoType,
        url_foto: uploaded.path,
        fecha_subida: new Date().toISOString(),
        subida_por: user.id,
      }
      const photoResult = existingPhoto
        ? await supabase.from('fotos_cita').update(photoValues).eq('id', existingPhoto.id).select('id, cita_id, cliente_id, tipo, url_foto, fecha_subida').maybeSingle()
        : await supabase.from('fotos_cita').insert(photoValues).select('id, cita_id, cliente_id, tipo, url_foto, fecha_subida').single()
      if (photoResult.error || !photoResult.data) {
        await supabase.storage.from(photoBucket).remove([uploaded.path])
        throw photoResult.error
          ? new Error(getUploadError(photoResult.error, photoLabel))
          : new Error('No se pudo actualizar el registro de la foto. Ejecuta supabase/fotos_cita_update_policy.sql en Supabase y vuelve a intentarlo.')
      }
      const photo = photoResult.data
      if (existingPhoto?.url_foto && !/^https?:\/\//i.test(existingPhoto.url_foto)) {
        const { error: oldPhotoError } = await supabase.storage.from(photoBucket).remove([existingPhoto.url_foto])
        if (oldPhotoError) console.warn('La foto anterior quedó almacenada, pero la nueva quedó activa.', oldPhotoError)
      }
      const { data: signed, error: signedError } = await supabase.storage.from(photoBucket).createSignedUrl(uploaded.path, 60 * 60)
      onSaved({ ...photo, displayUrl: signedError ? '' : signed?.signedUrl ?? '' })
      setSelectedFile(null)
      setPreviewUrl('')
      setSuccess(true)
      window.clearTimeout(successTimerRef.current)
      successTimerRef.current = window.setTimeout(() => setSuccess(false), 2000)
      if (signedError) setError('La foto se guardó, pero no se pudo generar su vista previa.')
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la foto después.')
    }
    setSaving(false)
  }

  if (visit.estado === 'cancelada') return null

  return <div className="visit-photo-after">
    <input ref={fileInputRef} className="visit-photo-after__input" type="file" accept="image/*" capture="environment" onChange={handleFileSelected} />
    {!selectedFile && canUpload && (!photoExists || allowReplace) && <Button className="visit-photo-after__trigger" type="button" variant="outline" disabled={saving} onClick={() => fileInputRef.current?.click()}><Camera size={15} aria-hidden="true" /> {photoExists ? `Cambiar foto ${photoLabel}` : `Foto ${photoLabel}`}</Button>}
    {selectedFile && <div className="visit-photo-after__preview" aria-busy={saving}><img src={previewUrl} alt={`Vista previa de foto ${photoLabel} para ${selectedFile.name}`} /><div className="visit-photo-after__actions"><Button className="visit-photo-after__confirm" type="button" onClick={savePhoto} disabled={saving}>{saving ? <LoaderCircle className="visit-photo-after__spinner" size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}{saving ? `Cargando foto ${photoLabel}…` : 'Confirmar y guardar'}</Button><Button className="visit-photo-after__cancel" type="button" variant="outline" onClick={cancelSelection} disabled={saving}><X size={15} aria-hidden="true" /> Cancelar</Button></div>{saving && <p className="visit-photo-after__loading" role="status" aria-live="polite"><LoaderCircle className="visit-photo-after__spinner" size={14} aria-hidden="true" /> Cargando foto, espera un momento…</p>}</div>}
    {success && <p className="visit-photo-after__success" role="status">Foto {photoLabel} guardada.</p>}
    {error && <p className="visit-photo-after__error" role="alert">{error}</p>}
  </div>
}

export default VisitAfterPhotoUploader
