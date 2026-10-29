import { useEffect, useMemo, useState } from 'react'
import { Check, TriangleAlert, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { formatCivilStatus } from '@/lib/clinicalPatientData'

const facialConditions = [
	['enf_cardiacas', 'Enf. Cardíacas'], ['enf_circulatorias', 'Enf. Circulatorias'],
	['presenta_alergias', 'Alergias'], ['enf_renales', 'Enf. Renales'],
	['problemas_azucar', 'Problemas de Azúcar'], ['sufre_convulsiones', 'Convulsiones'],
	['enf_digestivas', 'Enf. Digestivas'], ['problemas_presion', 'Presión Arterial'],
	['cremas_uso_actual', 'Cremas en Uso'], ['lentes_contacto', 'Lentes de Contacto'],
	['problema_piel', 'Problema en la Piel'], ['cirugia_previa', 'Cirugía Previa'],
	['implantes_dentales', 'Implantes Dentales'], ['fractura_facial', 'Fractura Facial'],
	['consume_medicamento', 'Medicamentos'], ['trat_dermatologico', 'Trat. Dermatológico'],
	['auto_tratamiento_facial', 'Auto Tratamiento'], ['observaciones', 'Observaciones'],
]
const corporalConditions = [
	['enf_cardiacas', 'Enf. Cardíacas'], ['enf_renales', 'Enf. Renales'],
	['enf_circulatorias', 'Enf. Circulatorias'], ['enf_pulmonares', 'Enf. Pulmonares'],
	['enf_digestivas', 'Enf. Digestivas'], ['enf_hematologicas', 'Enf. Hematológicas'],
	['enf_endocrinas', 'Enf. Endocrinas'], ['enf_neurologicas', 'Enf. Neurológicas'],
	['problemas_presion', 'Problemas de Presión'], ['tipo_alergia', 'Algún tipo de Alergia'],
	['problemas_piel', 'Problemas en la Piel'], ['sufre_convulsiones', 'Convulsiones'],
	['tabaco', 'Tabaco'], ['alcohol', 'Alcohol'], ['drogas', 'Drogas'], ['marcapaso', 'Posee Marcapaso'],
]
const measureRows = [
	['cintura', 'Cintura'], ['pecho', 'Pecho'], ['cadera', 'Cadera'], ['abdomen', 'Abdomen'],
	['brazo_izquierdo', 'Brazo Izquierdo'], ['brazo_derecho', 'Brazo Derecho'],
	['muslo_izquierdo', 'Muslo Izquierdo'], ['muslo_derecho', 'Muslo Derecho'],
	['pantorrilla_derecha', 'Pantorrilla Derecha'], ['pantorrilla_izquierda', 'Pantorrilla Izquierda'],
]

function parseContent(content) {
	if (!content) return {}
	if (typeof content !== 'string') return content
	try {
		const parsed = JSON.parse(content)
		return parsed && typeof parsed === 'object' ? parsed : { observaciones_generales: content }
	} catch {
		return { observaciones_generales: content }
	}
}

function formatDate(value) {
	if (!value) return 'Fecha no registrada'
	const date = new Date(`${value.slice(0, 10)}T12:00:00`)
	return Number.isNaN(date.getTime()) ? 'Fecha no registrada' : new Intl.DateTimeFormat('es-MX', { dateStyle: 'long' }).format(date)
}

function displayValue(value) {
	if (value === null || value === undefined || value === '') return 'No registrado'
	if (typeof value === 'boolean') return value ? 'Sí' : 'No'
	return String(value)
}

function Section({ title, children }) {
	return <section className="history-viewer__section"><h3 className="history-viewer__section-title">{title}</h3>{children}</section>
}

function Conditions({ definitions, values }) {
	if (!values || Object.keys(values).length === 0) return <p className="history-viewer__empty">No hay datos clínicos registrados.</p>
	const entries = definitions.map(([key, label]) => {
		const value = values[key]
		const active = typeof value === 'object' && value !== null ? value.valor === true : value === true
		return { key, label, active, detail: typeof value === 'object' && value !== null ? value.especifique : '' }
	})
	const ordered = [...entries.filter((entry) => entry.active), ...entries.filter((entry) => !entry.active)]
	return <dl className="history-viewer__conditions">{ordered.map(({ key, label, active, detail }) => (
		<div className={`history-viewer__condition${active ? ' history-viewer__condition--active' : ''}`} key={key}>
			<dt>{label}</dt><dd>{active ? <><TriangleAlert size={16} aria-hidden="true" /> Sí</> : <><Check size={16} aria-hidden="true" /> No</>}</dd>
			{active && detail && <p>{detail}</p>}
		</div>
	))}</dl>
}

function FacialHistory({ content }) {
	const pathology = content.informe_patologico ?? {}
	return <>
		<Section title="Motivo de consulta"><p className={content.motivo_consulta ? 'history-viewer__paragraph' : 'history-viewer__empty'}>{content.motivo_consulta || 'No registrado'}</p></Section>
		<Section title="Informe patológico"><Conditions definitions={facialConditions} values={pathology} /></Section>
		<Section title="Clase de cutis">
			{content.clase_cutis ? <span className="history-viewer__skin-badge">{content.clase_cutis}</span> : <p className="history-viewer__empty">No registrado</p>}
			{content.observaciones_cutis && <div className="history-viewer__notes"><h4>Observaciones de cutis</h4><p>{content.observaciones_cutis}</p></div>}
		</Section>
	</>
}

function BodyHistory({ content }) {
	const physical = content.datos_fisicos ?? {}
	const clinical = content.datos_clinicos ?? {}
	const measurements = content.medidas_corporales ?? {}
	const sessions = Array.isArray(content.sesiones) ? content.sesiones : []
	return <>
		<Section title="Motivo de consulta"><p className={content.motivo_consulta ? 'history-viewer__paragraph' : 'history-viewer__empty'}>{content.motivo_consulta || 'No registrado'}</p></Section>
		<Section title="Datos físicos"><dl className="history-viewer__facts">
			<div><dt>Edad</dt><dd>{physical.edad == null ? 'No registrado' : `${physical.edad} años`}</dd></div>
			<div><dt>Peso</dt><dd>{physical.peso == null ? 'No registrado' : `${physical.peso} kg`}</dd></div>
			<div><dt>Estatura</dt><dd>{physical.estatura == null ? 'No registrado' : `${physical.estatura} m`}</dd></div>
		</dl></Section>
		<Section title="Datos clínicos"><Conditions definitions={corporalConditions} values={clinical} /></Section>
		<Section title="Medidas corporales"><div className="history-viewer__table-scroll"><table className="history-viewer__table">
			<thead><tr><th>Zona</th><th>Inicio</th><th>Medio</th><th>Final</th></tr></thead>
			<tbody>{measureRows.map(([key, label]) => { const values = measurements[key] ?? {}; return <tr key={key}><th scope="row">{label}</th><td>{displayValue(values.inicio)}</td><td>{displayValue(values.medio)}</td><td>{displayValue(values.final)}</td></tr> })}</tbody>
		</table></div></Section>
		<Section title="Sesiones programadas">{sessions.length ? <div className="history-viewer__table-scroll"><table className="history-viewer__table">
			<thead><tr><th>#</th><th>Fecha</th><th>Observaciones</th><th>Firmado</th></tr></thead>
			<tbody>{sessions.map((session, index) => <tr key={`${session.numero ?? index + 1}-${index}`}><th scope="row">{session.numero ?? index + 1}</th><td>{session.fecha ? formatDate(session.fecha) : 'Sin fecha'}</td><td>{session.observaciones || 'Sin observaciones'}</td><td>{session.firmado ? 'Sí' : 'No'}</td></tr>)}</tbody>
		</table></div> : <p className="history-viewer__empty">No hay sesiones programadas.</p>}</Section>
	</>
}

function GeneralHistory({ content }) {
	const fields = useMemo(() => Object.entries(content).filter(([key]) => key !== 'firma_url'), [content])
	return fields.length ? <dl className="history-viewer__facts history-viewer__facts--general">{fields.map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{typeof value === 'object' && value !== null ? JSON.stringify(value) : displayValue(value)}</dd></div>)}</dl> : <p className="history-viewer__empty">No hay observaciones registradas.</p>
}

function VisorHistoriaClinica({ historia, cliente, servicio, profesional, onCerrar }) {
	const content = parseContent(historia.contenido)
	const generalData = content.datos_generales ?? {}
	const path = content.firma_url
	const [loadedSignature, setLoadedSignature] = useState({ path: '', url: '', error: '' })
	const directUrl = typeof path === 'string' && /^(https?:|data:image\/)/i.test(path)
	const signatureUrl = directUrl ? path : loadedSignature.path === path ? loadedSignature.url : ''
	const signatureError = !directUrl && path && !supabase ? 'No se pudo conectar con Supabase para cargar la firma.' : loadedSignature.path === path ? loadedSignature.error : ''
	const signatureLoading = Boolean(path && !signatureUrl && !signatureError)
	const type = historia.tipo?.toLocaleLowerCase('es-MX')
	const facial = type === 'facial'
	const corporal = type === 'corporal'
	const title = facial ? 'Ficha Facial' : corporal ? 'Ficha Corporal' : 'Historia Clínica'

	useEffect(() => {
		if (!path || directUrl || !supabase) return undefined
		let active = true
		supabase.storage.from('firmas-consentimientos').createSignedUrl(path, 60 * 60).then(({ data, error }) => {
			if (!active) return
			setLoadedSignature(error || !data?.signedUrl
				? { path, url: '', error: 'No se pudo cargar la firma. Revisa los permisos de lectura del bucket firmas-consentimientos.' }
				: { path, url: data.signedUrl, error: '' })
		}).catch(() => {
			if (active) setLoadedSignature({ path, url: '', error: 'No se pudo cargar la firma. Revisa la conexión y los permisos del bucket firmas-consentimientos.' })
		})
		return () => { active = false }
	}, [directUrl, path])

	return <div className="creation-overlay history-viewer-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onCerrar() }}>
		<section className="history-viewer" role="dialog" aria-modal="true" aria-labelledby="history-viewer-title">
			<header className="history-viewer__header">
				<div><span className="eyebrow text-dorado-oscuro">EXPEDIENTE CLÍNICO</span><h2 id="history-viewer-title">{title}</h2><p className="history-viewer__meta"><span>{formatDate(historia.fecha)}</span>{profesional && <span>Atendió: {profesional}</span>}</p></div>
				<div className="history-viewer__header-context"><span>Paciente</span><strong>{cliente?.nombre || 'Cliente'}</strong>{servicio && <><span>Servicio</span><strong>{servicio}</strong></>}</div>
				<button className="creation-dialog__close" type="button" aria-label="Cerrar historia clínica" onClick={onCerrar}><X size={19} aria-hidden="true" /></button>
			</header>
			<div className="history-viewer__content">
				<Section title="Datos generales"><dl className="history-viewer__facts">
					<div><dt>Fecha de nacimiento</dt><dd>{generalData.fecha_nacimiento ? formatDate(generalData.fecha_nacimiento) : '—'}</dd></div>
					<div><dt>Edad al momento de la atención</dt><dd>{generalData.edad_al_momento == null ? '—' : `${generalData.edad_al_momento} años`}</dd></div>
					<div><dt>Estado civil</dt><dd>{formatCivilStatus(generalData.estado_civil)}</dd></div>
				</dl></Section>
				{facial ? <FacialHistory content={content} /> : corporal ? <BodyHistory content={content} /> : <GeneralHistory content={content} />}
				<Section title="Firma del paciente">{path ? signatureUrl ? <div className="history-viewer__signature-document"><div className="history-viewer__signature-ink"><img src={signatureUrl} alt={`Firma de ${cliente?.nombre || 'el paciente'}`} /></div></div> : <p className={signatureError ? 'history-viewer__empty history-viewer__signature-error' : 'history-viewer__empty'} role={signatureError ? 'alert' : 'status'}>{signatureError || (signatureLoading ? 'Cargando firma…' : 'La firma no está disponible.')}</p> : <p className="history-viewer__empty">Esta historia clínica no tiene una firma guardada.</p>}</Section>
				{historia.observaciones_sesion && <Section title="Observaciones de la sesión"><p className="history-viewer__paragraph">{historia.observaciones_sesion}</p></Section>}
			</div>
		</section>
	</div>
}

export default VisorHistoriaClinica
