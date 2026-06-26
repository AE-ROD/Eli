"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import {
  Upload, CheckCircle2, AlertCircle, X, RefreshCw,
  ChevronRight, History, Tag, DollarSign, Users, Calendar,
  Briefcase, BarChart2, FileText, UserCheck, ClipboardList,
} from "lucide-react"

type TipoImport =
  | "precios"
  | "listaNegra"
  | "clientes"
  | "cajaChica"
  | "bitacoraEventos"
  | "totales"
  | "empleadas"
  | "datosPersonal"
  | "registro"

interface FilaOk { indice: number; data: unknown }
interface FilaError { indice: number; mensaje: string }
interface FilaSinMatch { indice: number; campo: string; valor: string }

interface PreviewData {
  importId: string
  tipo: TipoImport
  rowsTotal: number
  ok: FilaOk[]
  errores: FilaError[]
  sinMatch: FilaSinMatch[]
}

interface ResultData { rowsOk: number; rowsErrored: number; errores: { indice: number; mensaje: string }[] }
interface HistorialItem { id: string; fileName: string; rowsTotal: number; rowsImported: number; rowsSkipped: number; createdAt: string; createdBy: { user: { name: string } } }

const TIPOS: { id: TipoImport; label: string; desc: string; icono: React.ElementType }[] = [
  { id: "registro", label: "Registro de citas", desc: "Citas históricas con método de pago y propina", icono: Calendar },
  { id: "clientes", label: "Clientes / Agenda", desc: "Pacientes con fecha de su primera cita", icono: Users },
  { id: "precios", label: "Servicios y precios", desc: "Catálogo de servicios con precio y duración", icono: DollarSign },
  { id: "listaNegra", label: "Lista negra", desc: "Clientes con restricción de agenda", icono: Tag },
  { id: "cajaChica", label: "Caja chica", desc: "Apertura, cierre y gastos por día", icono: ClipboardList },
  { id: "bitacoraEventos", label: "Bitácora de eventos", desc: "Producción diaria y no-shows", icono: BarChart2 },
  { id: "totales", label: "Totales declarados", desc: "Verificación de montos por método de pago", icono: FileText },
  { id: "empleadas", label: "Producción empleadas", desc: "Monto declarado por trabajadora", icono: Briefcase },
  { id: "datosPersonal", label: "Datos de personal", desc: "Contactos de emergencia del equipo", icono: UserCheck },
]

type Paso = "tipo" | "subir" | "resultado" | "done"

const TIPOS_VERIFICACION: TipoImport[] = ["totales", "empleadas"]

export default function ImportarPage() {
  const [paso, setPaso] = useState<Paso>("tipo")
  const [tipoSeleccionado, setTipoSeleccionado] = useState<TipoImport | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [result, setResult] = useState<ResultData | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [historial, setHistorial] = useState<HistorialItem[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/imports").then((r) => r.json()).then((d) => setHistorial(d.imports ?? [])).catch(() => {})
  }, [result])

  const subirArchivo = useCallback(async (file: File) => {
    if (!tipoSeleccionado) return
    setError(null)
    setCargando(true)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("tipo", tipoSeleccionado)
      const res = await fetch("/api/imports/preview", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al procesar el archivo")
      setPreview(data)
      setPaso("resultado")
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setCargando(false)
    }
  }, [tipoSeleccionado])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setArrastrando(false)
    const file = e.dataTransfer.files[0]
    if (file) subirArchivo(file)
  }, [subirArchivo])

  const confirmar = async () => {
    if (!preview) return
    setCargando(true)
    setError(null)
    try {
      const res = await fetch("/api/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importId: preview.importId, tipo: preview.tipo, filas: preview.ok.map((f) => f.data) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al confirmar")
      setResult(data)
      setPaso("done")
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setCargando(false)
    }
  }

  const reiniciar = () => {
    setPaso("tipo")
    setTipoSeleccionado(null)
    setPreview(null)
    setResult(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  const tipoInfo = tipoSeleccionado ? TIPOS.find((t) => t.id === tipoSeleccionado) : null
  const esVerificacion = tipoSeleccionado && TIPOS_VERIFICACION.includes(tipoSeleccionado)

  return (
    <div className="min-h-screen">
      <BarraSuperior titulo="Importar datos" subtitulo="Migra datos históricos desde Excel o CSV" />

      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Pasos */}
        <div className="flex items-center gap-2">
          {(["tipo", "subir", "resultado", "done"] as Paso[]).map((p, i) => {
            const labels: Record<Paso, string> = { tipo: "Tipo", subir: "Archivo", resultado: "Revisión", done: "Resultado" }
            const idx = ["tipo", "subir", "resultado", "done"].indexOf(paso)
            const este = i
            return (
              <div key={p} className="flex items-center gap-2 flex-1">
                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-colors ${este < idx ? "bg-emerald-500 text-white" : este === idx ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {este < idx ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span className={`text-xs font-medium ${este === idx ? "text-foreground" : "text-muted-foreground"}`}>{labels[p]}</span>
                {i < 3 && <div className="flex-1 h-px bg-border mx-1" />}
              </div>
            )
          })}
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Paso 1: Tipo */}
        {paso === "tipo" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <p className="text-sm text-muted-foreground">¿Qué tipo de datos quieres importar?</p>
            <div className="grid grid-cols-1 gap-2">
              {TIPOS.map(({ id, label, desc, icono: Icono }) => (
                <button
                  key={id}
                  onClick={() => { setTipoSeleccionado(id); setPaso("subir") }}
                  className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-colors hover:border-primary/50 hover:bg-primary/5 ${tipoSeleccionado === id ? "border-primary bg-primary/5" : "border-border bg-card"}`}
                >
                  <div className="p-2 rounded-lg bg-muted flex-shrink-0">
                    <Icono className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </button>
              ))}
            </div>

            {historial.length > 0 && (
              <div className="mt-6 bg-card border border-border/50 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-border/50">
                  <History className="h-4 w-4 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Importaciones recientes</p>
                </div>
                <div className="divide-y divide-border/30">
                  {historial.map((h) => (
                    <div key={h.id} className="flex items-center justify-between px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{h.fileName}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(h.createdAt).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" })}
                          {" · "}{h.createdBy?.user?.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                        <span className="text-xs text-emerald-600 font-medium">{h.rowsImported} importados</span>
                        {h.rowsSkipped > 0 && <span className="text-xs text-muted-foreground">{h.rowsSkipped} omitidos</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* Paso 2: Subir */}
        {paso === "subir" && tipoInfo && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-primary/5 border border-primary/20 rounded-xl">
              <tipoInfo.icono className="h-5 w-5 text-primary flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-foreground">{tipoInfo.label}</p>
                <p className="text-xs text-muted-foreground">{tipoInfo.desc}</p>
              </div>
              <button onClick={() => setPaso("tipo")} className="ml-auto text-xs text-muted-foreground hover:text-foreground underline">Cambiar</button>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`bg-card border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-colors ${arrastrando ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
            >
              {cargando ? <RefreshCw className="h-10 w-10 text-primary animate-spin" /> : (
                <div className="p-4 rounded-2xl bg-primary/10"><Upload className="h-8 w-8 text-primary" /></div>
              )}
              <div className="text-center">
                <p className="font-semibold text-foreground">{cargando ? "Analizando archivo..." : "Arrastra tu archivo aquí"}</p>
                <p className="text-sm text-muted-foreground mt-1">o haz clic para seleccionar · .xlsx, .xls, .csv · máx 5 MB</p>
              </div>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) subirArchivo(f) }} />
            </div>
          </motion.div>
        )}

        {/* Paso 3: Resultado del análisis */}
        {paso === "resultado" && preview && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-emerald-700">{preview.ok.length}</p>
                <p className="text-xs text-emerald-600 mt-1">{esVerificacion ? "Para verificar" : "Listos para importar"}</p>
              </div>
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-destructive">{preview.errores.length}</p>
                <p className="text-xs text-muted-foreground mt-1">Con errores</p>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-amber-700">{preview.sinMatch.length}</p>
                <p className="text-xs text-amber-600 mt-1">Sin coincidencia</p>
              </div>
            </div>

            {preview.errores.length > 0 && (
              <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
                <p className="text-xs font-medium text-muted-foreground px-4 py-2 border-b border-border/50">Filas con errores</p>
                <div className="divide-y divide-border/30 max-h-40 overflow-y-auto">
                  {preview.errores.map((e) => (
                    <div key={e.indice} className="flex items-start gap-3 px-4 py-2.5">
                      <AlertCircle className="h-3.5 w-3.5 text-destructive mt-0.5 flex-shrink-0" />
                      <span className="text-xs text-foreground"><span className="text-muted-foreground">Fila {e.indice}:</span> {e.mensaje}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {preview.sinMatch.length > 0 && (
              <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
                <p className="text-xs font-medium text-muted-foreground px-4 py-2 border-b border-border/50">Sin coincidencia — estas filas serán omitidas</p>
                <div className="divide-y divide-border/30 max-h-40 overflow-y-auto">
                  {preview.sinMatch.map((s) => (
                    <div key={s.indice} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="text-xs text-muted-foreground">Fila {s.indice}</span>
                      <span className="text-xs text-foreground">{s.campo}: <span className="font-medium">{s.valor}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setPaso("subir")} className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                Cambiar archivo
              </button>
              <button
                onClick={confirmar}
                disabled={cargando || preview.ok.length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {cargando ? <><RefreshCw className="h-4 w-4 animate-spin" />Importando...</> : (
                  esVerificacion
                    ? `Registrar ${preview.ok.length} filas verificadas`
                    : `Importar ${preview.ok.length} de ${preview.rowsTotal} filas`
                )}
              </button>
            </div>
          </motion.div>
        )}

        {/* Paso 4: Done */}
        {paso === "done" && result && (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
            <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-100 mb-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-1">
                {esVerificacion ? "Verificación registrada" : "Importación completada"}
              </h2>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                  <p className="text-3xl font-bold text-emerald-700">{result.rowsOk}</p>
                  <p className="text-sm text-emerald-600 mt-1">{esVerificacion ? "Registros" : "Importados"}</p>
                </div>
                <div className="bg-muted/50 border border-border rounded-xl p-4">
                  <p className="text-3xl font-bold text-muted-foreground">{result.rowsErrored}</p>
                  <p className="text-sm text-muted-foreground mt-1">Omitidos</p>
                </div>
              </div>

              {result.errores.length > 0 && (
                <div className="mt-4 text-left p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <p className="text-xs font-medium text-amber-700 mb-1">Filas con problemas:</p>
                  {result.errores.slice(0, 5).map((e, i) => (
                    <p key={i} className="text-xs text-amber-600">Fila {e.indice}: {e.mensaje}</p>
                  ))}
                </div>
              )}
            </div>
            <button onClick={reiniciar} className="w-full px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors">
              Importar otro archivo
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
