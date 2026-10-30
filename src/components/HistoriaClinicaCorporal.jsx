import { useRef, useState } from 'react'
import { LoaderCircle, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase } from '@/lib/supabase'
import { useVisualViewport } from '@/hooks/useVisualViewport'
import PatientSignatureField from '@/components/PatientSignatureField'
import { uploadClinicalSignature } from '@/lib/clinicalSignature'
import { calculateAgeAtDate, civilStatusOptions, normalizeHeightToMeters, saveClinicalGeneralDataToHistory, saveClinicalPatientData } from '@/lib/clinicalPatientData'
import { parseClinicalHistoryContent } from '@/lib/clinicalHistoryContent'

const columns = [
	[
		['enf_cardiacas', 'Enf. Cardíacas'], ['enf_renales', 'Enf. Renales'],
		['enf_circulatorias', 'Enf. Circulatorias'], ['enf_pulmonares', 'Enf. Pulmonares'],
		['enf_digestivas', 'Enf. Digestivas'], ['enf_hematologicas', 'Enf. Hematológicas'],
		['enf_endocrinas', 'Enf. Endocrinas'], ['enf_neurologicas', 'Enf. Neurológicas'],
	],
	[
		['problemas_presion', 'Problemas de Presión'], ['tipo_alergia', 'Algún tipo de Alergia'],
		['problemas_piel', 'Problemas en la Piel'], ['sufre_convulsiones', 'Sufre Convulsiones'],
		['tabaco', 'Tabaco'], ['alcohol', 'Alcohol'], ['drogas', 'Drogas'], ['marcapaso', 'Posee Marcapaso'],
	],
]
const clinicalKeys = columns.flat()
const zones = [
	['cintura', 'Cintura'], ['pecho', 'Pecho'], ['cadera', 'Cadera'], ['abdomen', 'Abdomen'],
	['brazo_izquierdo', 'Brazo Izquierdo'], ['brazo_derecho', 'Brazo Derecho'],
	['muslo_izquierdo', 'Muslo Izquierdo'], ['muslo_derecho', 'Muslo Derecho'],
	['pantorrilla_derecha', 'Pantorrilla Derecha'], ['pantorrilla_izquierda', 'Pantorrilla Izquierda'],
]
const points = ['inicio', 'medio', 'final']
const initialClinical = Object.fromEntries(clinicalKeys.map(([key]) => [key, false]))

function readMeasurements(saved = {}) {
	return Object.fromEntries(zones.map(([key]) => {
		const values = saved[key] ?? {}
		return [key, Object.fromEntries(points.map((point) => [point, values[point] ?? '']))]
	}))
}

function formatToday() {
	return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date())
}

function errorText(error) {
	if (error?.code === '42501' || error?.code === 'PGRST301') return 'Tu cuenta no tiene permiso para guardar historias clínicas.'
	if (error?.code === 'PGRST205') return 'Supabase no encuentra public.historia_clinica. Verifica la tabla y sus permisos.'
	return 'No se pudo guardar la historia clínica. Revisa los datos e inténtalo de nuevo.'
}

function HistoryValue({ label, value }) {
	return <div className="clinical-history__data-item"><dt>{label}</dt><dd>{value || 'No registrado'}</dd></div>
}

function HistoriaClinicaCorporal({ cita, onGuardado, onCerrar }) {
	const client = Array.isArray(cita.cliente) ? cita.cliente[0] : cita.cliente
	const existingHistory = cita.historiaClinica ?? null
	const initialContent = parseClinicalHistoryContent(existingHistory?.contenido)
	const initialGeneralData = initialContent.datos_generales ?? {}
	const initialPhysical = initialContent.datos_fisicos ?? {}
	const overlayRef = useRef(null)
	const signatureRef = useRef(null)
	useVisualViewport(overlayRef)
	const [motivo, setMotivo] = useState(initialContent.motivo_consulta ?? '')
	const [fechaNacimiento, setFechaNacimiento] = useState(initialGeneralData.fecha_nacimiento ?? client?.fecha_nacimiento?.slice(0, 10) ?? '')
	const [estadoCivil, setEstadoCivil] = useState(initialGeneralData.estado_civil ?? client?.estado_civil ?? '')
	const [physical, setPhysical] = useState({
		peso: initialPhysical.peso == null ? '' : String(initialPhysical.peso),
		estatura: normalizeHeightToMeters(initialPhysical.estatura ?? client?.estatura),
	})
	const [clinical, setClinical] = useState({ ...initialClinical, ...(initialContent.datos_clinicos ?? {}) })
	const [measurements, setMeasurements] = useState(() => readMeasurements(initialContent.medidas_corporales))
	const [sessions, setSessions] = useState(Array.isArray(initialContent.sesiones) && initialContent.sesiones.length ? initialContent.sesiones : [{ numero: 1, fecha: '', observaciones: '', firmado: false }])
	const [hasSignature, setHasSignature] = useState(false)
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState('')
	const [submitAttempted, setSubmitAttempted] = useState(false)
	const [savedHistory, setSavedHistory] = useState(null)
	const existingSignaturePath = initialContent.firma_url ?? ''
	const professional = Array.isArray(cita.profesional) ? cita.profesional[0] : cita.profesional
	const currentAge = calculateAgeAtDate(fechaNacimiento)
	const ageAtAppointment = calculateAgeAtDate(fechaNacimiento, cita.fecha)

	function updateMeasure(zone, point, value) {
		setMeasurements((current) => ({ ...current, [zone]: { ...current[zone], [point]: value } }))
	}

	function updateSession(index, field, value) {
		setSessions((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, [field]: value } : item))
	}

	function handleHeightBlur() {
		setPhysical((current) => ({ ...current, estatura: normalizeHeightToMeters(current.estatura) }))
	}

	function makeContent(signaturePath) {
		return {
			motivo_consulta: motivo.trim(),
			datos_generales: { fecha_nacimiento: fechaNacimiento, edad_al_momento: ageAtAppointment, estado_civil: estadoCivil },
			datos_fisicos: {
				edad: ageAtAppointment,
				peso: physical.peso === '' ? null : Number(physical.peso),
				estatura: physical.estatura === '' ? null : Number(normalizeHeightToMeters(physical.estatura)),
			},
			datos_clinicos: clinical,
			medidas_corporales: Object.fromEntries(zones.map(([key]) => [key, Object.fromEntries(points.map((point) => [point, measurements[key][point] === '' ? null : Number(measurements[key][point])]))])),
			sesiones: sessions,
			firma_url: signaturePath || null,
		}
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
		const heightValue = normalizeHeightToMeters(physical.estatura)
		const heightNumber = Number(heightValue)
		if (heightValue && (!Number.isFinite(heightNumber) || heightNumber < 0.3 || heightNumber > 3)) {
			setError('Ingresa la estatura entre 0.30 y 3.00 m; por ejemplo, 1.70 o 170 cm.')
			return
		}
		setSaving(true)
		setError('')
		try {
			if (savedHistory) {
				await finishHistory(savedHistory)
				setSaving(false)
				return
			}
			if (!supabase) throw new Error('La conexión con Supabase no está configurada.')
			const patientError = await saveClinicalPatientData(cita, fechaNacimiento, estadoCivil, physical.estatura)
			if (patientError) throw new Error(patientError)
			let existing = existingHistory
			if (!existing) {
				const { data, error: existingError } = await supabase.from('historia_clinica').select('*').eq('cita_id', cita.id).eq('tipo', 'corporal').limit(1).maybeSingle()
				if (existingError) throw new Error(errorText(existingError))
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
			const historyValues = {
				cliente_id: cita.cliente_id,
				cita_id: cita.id,
				profesional_id: cita.profesional_id,
				tipo: 'corporal',
				contenido: makeContent(signaturePath),
				...(existingHistory ? {} : { fecha: new Date().toISOString().split('T')[0] }),
			}
			const { data, error: saveError } = existingHistory
				? await supabase.from('historia_clinica').update(historyValues).eq('id', existingHistory.id).select('*').single()
				: await supabase.from('historia_clinica').insert(historyValues).select('*').single()
			if (saveError) throw new Error(errorText(saveError))
			setSavedHistory(data)
			await finishHistory(data)
		} catch (saveError) {
			setError(saveError instanceof Error ? saveError.message : 'No se pudo guardar la historia clínica.')
		}
		setSaving(false)
	}

	function addSession() {
		setSessions((current) => current.length >= 20 ? current : [...current, { numero: current.length + 1, fecha: '', observaciones: '', firmado: false }])
	}

	return (
		<div ref={overlayRef} className="creation-overlay clinical-history-overlay">
			<section className="clinical-history-dialog" role="dialog" aria-modal="true" aria-labelledby="body-history-title">
				<header className="clinical-history__header">
					<div><span className="eyebrow text-dorado-oscuro">EXPEDIENTE CLÍNICO</span><h2 id="body-history-title">{existingHistory ? 'Editar ficha corporal' : 'Ficha Corporal'}</h2><p>{client?.nombre || 'Cliente'}</p></div>
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
							<label className="clinical-history__field"><span>Peso (kg)</span><Input type="number" min="0" max="500" step="0.1" value={physical.peso} onChange={(event) => setPhysical((current) => ({ ...current, peso: event.target.value }))} /></label>
							<label className="clinical-history__field"><span>Estatura (m)</span><Input type="number" min="0.30" max="3" step="0.01" value={physical.estatura} onChange={(event) => setPhysical((current) => ({ ...current, estatura: event.target.value }))} onBlur={handleHeightBlur} /></label>
							<label className="clinical-history__field clinical-history__field--wide"><span>Motivo de la consulta *</span><textarea value={motivo} onChange={(event) => setMotivo(event.target.value)} rows={3} maxLength={2000} placeholder="Describe el motivo de la consulta..." aria-required="true" /></label>
						</div>
					</section>
					<section className="clinical-history__section">
						<h3 className="clinical-history__section-title">Datos clínicos</h3>
						<div className="clinical-history__clinical-grid">{columns.map((column, index) => <div className="clinical-history__clinical-column" key={index}>{column.map(([key, label]) => <label className="clinical-history__checkbox-field" key={key}><input type="checkbox" checked={clinical[key]} onChange={(event) => setClinical((current) => ({ ...current, [key]: event.target.checked }))} /><span>{label}</span></label>)}</div>)}</div>
					</section>
					<section className="clinical-history__section">
						<h3 className="clinical-history__section-title">Medidas corporales</h3>
						<div className="clinical-history__table-scroll"><table className="clinical-history__measurement-table">
							<thead><tr><th>Zona</th><th>Inicio (cm)</th><th>Medio (cm)</th><th>Final (cm)</th></tr></thead>
							<tbody>{zones.map(([key, label]) => <tr key={key}><th scope="row">{label}</th>{points.map((point) => <td key={point}><Input aria-label={`${label}, ${point}`} type="number" min="0" max="200" step="0.5" placeholder="—" value={measurements[key][point]} onChange={(event) => updateMeasure(key, point, event.target.value)} /></td>)}</tr>)}</tbody>
						</table></div>
					</section>
					<section className="clinical-history__section">
						<h3 className="clinical-history__section-title">Sesiones programadas</h3>
						<div className="clinical-history__table-scroll"><table className="clinical-history__session-table">
							<thead><tr><th>#</th><th>Fecha</th><th>Observaciones</th><th>Firmado</th></tr></thead>
							<tbody>{sessions.map((session, index) => <tr key={session.numero}><th scope="row">{session.numero}</th><td><Input aria-label={`Fecha de sesión ${session.numero}`} type="date" value={session.fecha} onChange={(event) => updateSession(index, 'fecha', event.target.value)} /></td><td><Input aria-label={`Observaciones de sesión ${session.numero}`} value={session.observaciones} onChange={(event) => updateSession(index, 'observaciones', event.target.value)} maxLength={500} /></td><td><input aria-label={`Firmado, sesión ${session.numero}`} type="checkbox" checked={session.firmado} onChange={(event) => updateSession(index, 'firmado', event.target.checked)} /></td></tr>)}</tbody>
						</table></div>
						<Button className="clinical-history__add-session" type="button" variant="outline" onClick={addSession} disabled={sessions.length >= 20}><Plus size={16} aria-hidden="true" /> {sessions.length >= 20 ? 'Máximo 20 sesiones' : 'Agregar sesión'}</Button>
					</section>
					{existingHistory
						? <p className="clinical-history__signature-instruction" role="status">La firma original se conserva y no se puede cambiar al editar la historia.</p>
						: <PatientSignatureField signatureRef={signatureRef} hasSignature={hasSignature} onSignatureChange={setHasSignature} />}
					{error && <p className="form-message form-message--error" role="alert">{error}</p>}
					<div className="clinical-history__actions"><Button type="button" variant="outline" onClick={onCerrar} disabled={saving}>Cancelar</Button><Button type="submit" className="clinical-history__submit" disabled={saving} aria-disabled={!fechaNacimiento || !estadoCivil || !motivo.trim() || (!hasSignature && !savedHistory && !existingHistory)}>{saving ? <LoaderCircle className="clinical-history__spinner" size={17} aria-hidden="true" /> : null}{savedHistory ? 'Reintentar finalizar cita' : saving ? 'Guardando…' : existingHistory ? 'Guardar cambios' : 'Guardar historia clínica'}</Button></div>
					{submitAttempted && (!fechaNacimiento || !estadoCivil || !motivo.trim()) && <p className="clinical-history__missing-fields" role="alert">Faltan: {[!fechaNacimiento && 'Fecha de nacimiento', !estadoCivil && 'Estado civil', !motivo.trim() && 'Motivo de la consulta'].filter(Boolean).join(', ')}.</p>}
				</form>
			</section>
		</div>
	)
}

export default HistoriaClinicaCorporal
