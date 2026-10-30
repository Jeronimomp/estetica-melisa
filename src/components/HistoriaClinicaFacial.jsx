import { useRef, useState } from 'react'
import { Droplet, Leaf, LoaderCircle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useVisualViewport } from '@/hooks/useVisualViewport'
import PatientSignatureField from '@/components/PatientSignatureField'
import { uploadClinicalSignature } from '@/lib/clinicalSignature'
import { calculateAgeAtDate, civilStatusOptions, saveClinicalGeneralDataToHistory, saveClinicalPatientData } from '@/lib/clinicalPatientData'
import { parseClinicalHistoryContent } from '@/lib/clinicalHistoryContent'

const columns = [
	[
		['enf_cardiacas', 'Enf. Cardíacas'], ['enf_renales', 'Enf. Renales'],
		['enf_digestivas', 'Enf. Digestivas'], ['lentes_contacto', 'Lentes de Contacto'],
		['implantes_dentales', 'Implantes Dentales'], ['trat_dermatologico', 'Trat. Dermatológico'],
	],
	[
		['enf_circulatorias', 'Enf. Circulatorias'], ['problemas_azucar', 'Problemas de Azúcar'],
		['problemas_presion', 'Problemas de Presión'], ['problema_piel', 'Problema en la Piel'],
		['fractura_facial', 'Fractura Facial'], ['auto_tratamiento_facial', 'Auto Tratamiento Facial'],
	],
	[
		['presenta_alergias', 'Presenta Alergias'], ['sufre_convulsiones', 'Sufre Convulsiones'],
		['cremas_uso_actual', 'Cremas de Uso Actual'], ['cirugia_previa', 'Alguna Cirugía'],
		['consume_medicamento', 'Consume Medicamento'], ['observaciones', 'Observaciones', true],
	],
]
const definitions = columns.flat()
const initialPathology = Object.fromEntries(definitions.map(([key, , booleanOnly]) => [key, booleanOnly ? false : { valor: false, especifique: '' }]))
function getPathologyInitialValue(saved = {}) {
	return Object.fromEntries(definitions.map(([key, , booleanOnly]) => {
		const value = saved[key]
		if (booleanOnly) return [key, typeof value === 'boolean' ? value : false]
		return [key, value && typeof value === 'object' ? { ...initialPathology[key], ...value } : initialPathology[key]]
	}))
}

function getSkinTypeValue(value, label) {
	return new RegExp(`${label}:\\s*([^;]+)`, 'i').exec(String(value ?? ''))?.[1]?.trim() ?? ''
}

const skinOptions = {
	seca: ['Piel seca', 'Piel levemente seca', 'Piel medianamente seca', 'Piel muy seca'],
	grasa: ['Piel grasa', 'Piel levemente grasa', 'Piel medianamente grasa', 'Piel muy grasa'],
}

function formatToday() {
	return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
}

function formError(error) {
	if (error?.code === '42501' || error?.code === 'PGRST301') return 'Tu cuenta no tiene permiso para guardar historias clínicas.'
	if (error?.code === 'PGRST205') return 'Supabase no encuentra public.historia_clinica. Verifica la tabla y sus permisos.'
	return 'No se pudo guardar la historia clínica. Revisa los datos e inténtalo de nuevo.'
}

function HistoryValue({ label, value }) {
	return <div className="clinical-history__data-item"><dt>{label}</dt><dd>{value || 'No registrado'}</dd></div>
}

function HistoriaClinicaFacial({ cita, onGuardado, onCerrar }) {
	const client = Array.isArray(cita.cliente) ? cita.cliente[0] : cita.cliente
	const existingHistory = cita.historiaClinica ?? null
	const initialContent = parseClinicalHistoryContent(existingHistory?.contenido)
	const initialGeneralData = initialContent.datos_generales ?? {}
	const overlayRef = useRef(null)
	const signatureRef = useRef(null)
	useVisualViewport(overlayRef)
	const [motivo, setMotivo] = useState(initialContent.motivo_consulta ?? '')
	const [fechaNacimiento, setFechaNacimiento] = useState(initialGeneralData.fecha_nacimiento ?? client?.fecha_nacimiento?.slice(0, 10) ?? '')
	const [estadoCivil, setEstadoCivil] = useState(initialGeneralData.estado_civil ?? client?.estado_civil ?? '')
	const [pathology, setPathology] = useState(() => getPathologyInitialValue(initialContent.informe_patologico))
	const [drySkin, setDrySkin] = useState(() => getSkinTypeValue(initialContent.clase_cutis, 'Piel seca'))
	const [oilySkin, setOilySkin] = useState(() => getSkinTypeValue(initialContent.clase_cutis, 'Piel grasa'))
	const [skinNotes, setSkinNotes] = useState(initialContent.observaciones_cutis ?? '')
	const [hasSignature, setHasSignature] = useState(false)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState('')
	const [submitAttempted, setSubmitAttempted] = useState(false)
	const [savedHistory, setSavedHistory] = useState(null)
	const professional = Array.isArray(cita.profesional) ? cita.profesional[0] : cita.profesional
	const existingSignaturePath = initialContent.firma_url ?? ''
	const currentAge = calculateAgeAtDate(fechaNacimiento)
	const ageAtAppointment = calculateAgeAtDate(fechaNacimiento, cita.fecha)

	function setPathologyValue(key, value) {
		const definition = definitions.find((item) => item[0] === key)
		setPathology((current) => definition?.[2]
			? { ...current, [key]: value }
			: { ...current, [key]: { valor: value, especifique: value ? current[key].especifique : '' } })
	}

	async function finishHistory(history) {
		const result = await onGuardado(history)
		if (result?.error) {
			setError(`La historia se guardó, pero ${result.error}`)
			return
		}
		onCerrar()
	}

	async function handleSubmit(event) {
		event.preventDefault()
		if (saving) return
		const missingFields = [
			!fechaNacimiento && 'Fecha de nacimiento',
			!estadoCivil && 'Estado civil',
			!motivo.trim() && 'Motivo de la consulta',
		].filter(Boolean)
		if (missingFields.length) {
			setSubmitAttempted(true)
			return
		}
		if (!hasSignature && !savedHistory && !existingHistory) return
		setSaving(true)
		setError('')
		try {
			if (savedHistory) {
				await finishHistory(savedHistory)
				setSaving(false)
				return
			}
			if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
			const patientError = await saveClinicalPatientData(cita, fechaNacimiento, estadoCivil)
			if (patientError) throw new Error(patientError)

			let existing = existingHistory
			if (!existing) {
				const { data, error: existingError } = await supabase.from('historia_clinica').select('*').eq('cita_id', cita.id).eq('tipo', 'facial').limit(1).maybeSingle()
				if (existingError) throw new Error(formError(existingError))
				existing = data
			}
			if (existing) {
				if (!existingHistory) {
					const { history, error: generalDataError } = await saveClinicalGeneralDataToHistory(existing, fechaNacimiento, estadoCivil, cita.fecha)
					if (generalDataError) throw new Error(generalDataError)
					setSavedHistory(history)
					await finishHistory(history)
					setSaving(false)
					return
				}
			}

			let signaturePath = existingHistory ? existingSignaturePath : ''
			if (hasSignature) {
				const { path, error: signatureError } = await uploadClinicalSignature(signatureRef.current, cita.id)
				if (signatureError) throw new Error(signatureError)
				signaturePath = path
			}
			if (!signaturePath && !existingHistory) throw new Error('La firma del paciente es obligatoria.')
			const pathologyContent = Object.fromEntries(definitions.map(([key]) => [key, pathology[key]]))
			const content = {
				motivo_consulta: motivo.trim(),
				datos_generales: { fecha_nacimiento: fechaNacimiento, edad_al_momento: ageAtAppointment, estado_civil: estadoCivil },
				informe_patologico: pathologyContent,
				clase_cutis: [drySkin && `Piel seca: ${drySkin}`, oilySkin && `Piel grasa: ${oilySkin}`].filter(Boolean).join('; '),
				observaciones_cutis: skinNotes.trim(),
				firma_url: signaturePath || null,
			}
			const historyValues = {
				cliente_id: cita.cliente_id,
				cita_id: cita.id,
				profesional_id: cita.profesional_id,
				tipo: 'facial',
				contenido: content,
				...(existingHistory ? {} : { fecha: new Date().toISOString().split('T')[0] }),
			}
			const { data, error: saveError } = existingHistory
				? await supabase.from('historia_clinica').update(historyValues).eq('id', existingHistory.id).select('*').single()
				: await supabase.from('historia_clinica').insert(historyValues).select('*').single()
			if (saveError) throw new Error(formError(saveError))
			setSavedHistory(data)
			await finishHistory(data)
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la historia clínica.')
		}
		setSaving(false)
	}

	return (
		<div ref={overlayRef} className="creation-overlay clinical-history-overlay">
					<section className="clinical-history-dialog" role="dialog" aria-modal="true" aria-labelledby="facial-history-title">
				<header className="clinical-history__header">
										<div><span className="eyebrow text-dorado-oscuro">EXPEDIENTE CLÍNICO</span><h2 id="facial-history-title">{existingHistory ? 'Editar ficha facial' : 'Ficha Facial'}</h2><p>{client?.nombre || 'Cliente'}</p></div>
					<button className="creation-dialog__close" type="button" aria-label="Cerrar ficha" onClick={onCerrar} disabled={saving}><X size={19} aria-hidden="true" /></button>
				</header>
				<form className="clinical-history__form" onSubmit={handleSubmit}>
					<section className="clinical-history__section">
						<h3 className="clinical-history__section-title">Datos del paciente</h3>
						<dl className="clinical-history__patient-grid">
							<HistoryValue label="Cliente" value={client?.nombre} />
							<HistoryValue label="Correo" value={client?.correo} />
							<HistoryValue label="Teléfono" value={client?.telefono} />
							<HistoryValue label="Especialista" value={professional?.nombre} />
							<HistoryValue label="Fecha de atención" value={formatToday()} />
						</dl>
					</section>
					<section className="clinical-history__section">
						<h3 className="clinical-history__complete-title">Completa los siguientes datos</h3>
						<div className="clinical-history__edit-grid">
							<label className="clinical-history__field"><span>Fecha de nacimiento *</span><Input type="date" placeholder="dd/mm/aaaa" value={fechaNacimiento} onChange={(event) => setFechaNacimiento(event.target.value)} aria-required="true" /><small>{currentAge !== null ? `Edad: ${currentAge} años` : 'Este dato se guardará en el expediente del cliente'}</small></label>
							<label className="clinical-history__field"><span>Estado civil *</span><select className="cliente-form__select" value={estadoCivil} onChange={(event) => setEstadoCivil(event.target.value)} aria-required="true"><option value="" disabled>Seleccionar estado civil</option>{civilStatusOptions.map(({ value, label }) => <option value={value} key={value}>{label}</option>)}</select></label>
							<label className="clinical-history__field clinical-history__field--wide"><span>Motivo de la consulta *</span><textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} rows={3} maxLength={2000} placeholder="Describe el motivo de la consulta..." aria-required="true" /></label>
						</div>
					</section>
					<section className="clinical-history__section">
						<h3 className="clinical-history__section-title">Informe patológico</h3>
						<div className="clinical-history__pathology-grid">
							{columns.map((column, index) => <div className="clinical-history__pathology-column" key={index}>
								{column.map(([key, label, booleanOnly]) => {
									const value = booleanOnly ? pathology[key] : pathology[key].valor
									return <fieldset className="clinical-history__pathology-field" key={key}>
										<legend>{label}</legend>
										<div className="radio-si-no">
											{[true, false].map((choice) => <label key={String(choice)}><input type="radio" name={`facial-${key}`} value={choice ? 'si' : 'no'} checked={value === choice} onChange={() => setPathologyValue(key, choice)} />{choice ? 'Sí' : 'No'}</label>)}
										</div>
										{!booleanOnly && value && <div className="clinical-history__specify"><Input aria-label={`Especifique: ${label}`} placeholder="Especifique..." value={pathology[key].especifique} onChange={(event) => setPathology((current) => ({ ...current, [key]: { ...current[key], especifique: event.target.value } }))} /></div>}
									</fieldset>
								})}
							</div>)}
						</div>
					</section>
					<section className="clinical-history__section">
						<h3 className="clinical-history__section-title">Clase de cutis</h3>
						<div className="clinical-history__skin-grid">
							{[['seca', 'Piel seca', Leaf, drySkin, setDrySkin], ['grasa', 'Piel grasa', Droplet, oilySkin, setOilySkin]].map(([key, title, Icon, value, setValue]) => <fieldset className="clinical-history__skin-group" key={key}>
								<legend><Icon size={18} aria-hidden="true" /> {title}</legend>
								{skinOptions[key].map((option) => <label className="clinical-history__skin-option" key={option}><input type="radio" name={`skin-${key}`} checked={value === option} onChange={() => setValue(option)} />{option}</label>)}
							</fieldset>)}
						</div>
						<label className="clinical-history__field clinical-history__field--wide"><span>Observaciones de cutis</span><textarea value={skinNotes} onChange={(event) => setSkinNotes(event.target.value)} rows={3} maxLength={2000} /></label>
					</section>
					  {existingHistory
						  ? <p className="clinical-history__signature-instruction" role="status">La firma original se conserva y no se puede cambiar al editar la historia.</p>
						  : <PatientSignatureField signatureRef={signatureRef} hasSignature={hasSignature} onSignatureChange={setHasSignature} />}
					{error && <p className="form-message form-message--error" role="alert">{error}</p>}
					<div className="clinical-history__actions">
						<Button type="button" variant="outline" onClick={onCerrar} disabled={saving}>Cancelar</Button>
						<Button type="submit" className="clinical-history__submit" disabled={saving} aria-disabled={!fechaNacimiento || !estadoCivil || !motivo.trim() || (!hasSignature && !savedHistory && !existingHistory)}>{saving ? <LoaderCircle className="clinical-history__spinner" size={17} aria-hidden="true" /> : null}{savedHistory ? 'Reintentar finalizar cita' : saving ? 'Guardando…' : existingHistory ? 'Guardar cambios' : 'Guardar historia clínica'}</Button>
					</div>
					{submitAttempted && (!fechaNacimiento || !estadoCivil || !motivo.trim()) && <p className="clinical-history__missing-fields" role="alert">Faltan: {[!fechaNacimiento && 'Fecha de nacimiento', !estadoCivil && 'Estado civil', !motivo.trim() && 'Motivo de la consulta'].filter(Boolean).join(', ')}.</p>}
				</form>
			</section>
		</div>
	)
}

export default HistoriaClinicaFacial
