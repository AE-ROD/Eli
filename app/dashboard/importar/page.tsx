"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { BarraSuperior } from "@/components/app/layout/barra-superior"
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  X,
  RefreshCw,
  Download,
  History,
} from "lucide-react"

interface ColumnMapping {
  nombre?: string
  apellido?: string
  telefono?: string
  email?: string
  notas?: string
}

interface PreviewData {
  columnas: string[]
  preview: Record<string, string>[]
  totalFilas: number
  mapeoSugerido: ColumnMapping
  fileName: string
}

interface ImportResult {
  importados: number
  omitidos: number
  errores: string[]
}

interface ImportHistorial {
  id: string
  fileName: string
  rowsTotal: number
  rowsImported: number
  rowsSkipped: number
  createdAt: string
  createdBy: { user: { name: string } }
}

type Paso = "subir" | "mapear" | "confirmar" | "resultado"

const CAMPOS_MAPEO = [
  { key: "nombre" as const, label: "Nombre *", requerido: true },
  { key: "apellido" as const, label: "Apellido", requerido: false },
  { key: "telefono" as const, label: "Teléfono", requerido: false },
  { key: "email" as const, label: "Correo electrónico", requerido: false },
  { key: "notas" as const, label: "Notas", requerido: false },
]

export default function ImportarPage() {
  const [paso, setPaso] = useState<Paso>("subir")
  const [archivoBase64, setArchivoBase64] = useState<string>("")
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [mapeo, setMapeo] = useState<ColumnMapping>({})
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ImportResult | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [historial, setHistorial] = useState<ImportHistorial[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/imports")
      .then((r) => r.json())
      .then((data) => setHistorial(data.imports ?? []))
      .catch(() => {})
  }, [resultado])

  const procesarArchivo = useCallback(async (file: File) => {
    setError(null)
    setCargando(true)

    // Store as base64 for the confirm step
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1]
      setArchivoBase64(base64)
    }

    const form = new FormData()
    form.append("file", file)

    try {
      const res = await fetch("/api/imports/preview", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al procesar el archivo")
      setPreview(data)
      setMapeo(data.mapeoSugerido)
      setPaso("mapear")
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setCargando(false)
    }
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setArrastrando(false)
      const file = e.dataTransfer.files[0]
      if (file) procesarArchivo(file)
    },
    [procesarArchivo]
  )

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) procesarArchivo(file)
  }

  const confirmarImport = async () => {
    if (!preview || !archivoBase64) return
    setCargando(true)
    setError(null)

    try {
      const res = await fetch("/api/imports/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: preview.fileName,
          mapeo,
          file: archivoBase64,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Error al importar")
      setResultado(data)
      setPaso("resultado")
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setCargando(false)
    }
  }

  const reiniciar = () => {
    setPaso("subir")
    setPreview(null)
    setMapeo({})
    setArchivoBase64("")
    setResultado(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="min-h-screen">
      <BarraSuperior
        titulo="Importar clientes"
        subtitulo="Carga tu lista desde Excel o CSV"
      />

      <div className="p-6 max-w-3xl mx-auto space-y-6">
        {/* Pasos */}
        <div className="flex items-center gap-2">
          {(["subir", "mapear", "confirmar", "resultado"] as Paso[]).map((p, i) => {
            const pasos = ["subir", "mapear", "confirmar", "resultado"]
            const actual = pasos.indexOf(paso)
            const este = pasos.indexOf(p)
            const labels: Record<Paso, string> = {
              subir: "Archivo",
              mapear: "Columnas",
              confirmar: "Vista previa",
              resultado: "Resultado",
            }
            return (
              <div key={p} className="flex items-center gap-2 flex-1">
                <div
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-colors ${
                    este < actual
                      ? "bg-emerald-500 text-white"
                      : este === actual
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {este < actual ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={`text-xs font-medium ${
                    este === actual ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {labels[p]}
                </span>
                {i < 3 && <div className="flex-1 h-px bg-border mx-1" />}
              </div>
            )
          })}
        </div>

        {/* Error global */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm"
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto">
                <X className="h-4 w-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* PASO 1: Subir archivo */}
        {paso === "subir" && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <div
              onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
              onDragLeave={() => setArrastrando(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              className={`bg-card border-2 border-dashed rounded-2xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-colors ${
                arrastrando
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
              }`}
            >
              {cargando ? (
                <RefreshCw className="h-10 w-10 text-primary animate-spin" />
              ) : (
                <div className="p-4 rounded-2xl bg-primary/10">
                  <Upload className="h-8 w-8 text-primary" />
                </div>
              )}
              <div className="text-center">
                <p className="font-semibold text-foreground">
                  {cargando ? "Procesando archivo..." : "Arrastra tu archivo aquí"}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  o haz clic para seleccionar · .xlsx, .xls, .csv · máx 5 MB
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={onFileChange}
              />
            </div>

            <div className="mt-4 p-4 bg-muted/50 rounded-xl">
              <p className="text-xs font-medium text-foreground mb-2">Columnas que Eli reconoce automáticamente:</p>
              <div className="flex flex-wrap gap-2">
                {["Nombre", "Apellido", "Teléfono", "Email", "Notas"].map((c) => (
                  <span key={c} className="text-xs bg-background border border-border px-2 py-1 rounded-md text-muted-foreground">
                    {c}
                  </span>
                ))}
              </div>
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
                          {new Date(h.createdAt).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" })}
                          {" · "}{h.createdBy?.user?.name}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 ml-4 flex-shrink-0">
                        <span className="text-xs text-emerald-600 font-medium">{h.rowsImported} importados</span>
                        {h.rowsSkipped > 0 && (
                          <span className="text-xs text-muted-foreground">{h.rowsSkipped} omitidos</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {/* PASO 2: Mapear columnas */}
        {paso === "mapear" && preview && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="bg-card border border-border/50 rounded-xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <FileSpreadsheet className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-semibold text-foreground">{preview.fileName}</p>
                  <p className="text-xs text-muted-foreground">{preview.totalFilas} filas detectadas</p>
                </div>
              </div>

              <p className="text-sm text-muted-foreground mb-4">
                Eli detectó las columnas de tu archivo. Confirma a qué campo corresponde cada una:
              </p>

              <div className="space-y-3">
                {CAMPOS_MAPEO.map(({ key, label, requerido }) => (
                  <div key={key} className="flex items-center gap-3">
                    <label className="text-sm font-medium text-foreground w-40 flex-shrink-0">
                      {label}
                    </label>
                    <select
                      value={mapeo[key] ?? ""}
                      onChange={(e) =>
                        setMapeo((prev) => ({
                          ...prev,
                          [key]: e.target.value || undefined,
                        }))
                      }
                      className="flex-1 text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      <option value="">— No importar —</option>
                      {preview.columnas.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                    {requerido && !mapeo[key] && (
                      <span className="text-xs text-destructive flex-shrink-0">Requerido</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={reiniciar}
                className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cambiar archivo
              </button>
              <button
                onClick={() => setPaso("confirmar")}
                disabled={!mapeo.nombre}
                className="flex-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Ver vista previa
              </button>
            </div>
          </motion.div>
        )}

        {/* PASO 3: Vista previa + confirmar */}
        {paso === "confirmar" && preview && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            <div className="bg-card border border-border/50 rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border/50 flex items-center justify-between">
                <p className="font-semibold text-foreground">
                  Vista previa · {Math.min(preview.preview.length, 20)} de {preview.totalFilas} filas
                </p>
                <span className="text-xs text-muted-foreground">Se importarán todos los registros</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 bg-muted/30">
                      {CAMPOS_MAPEO.filter((c) => mapeo[c.key]).map(({ key, label }) => (
                        <th key={key} className="text-left px-4 py-2.5 font-medium text-muted-foreground">
                          {label.replace(" *", "")}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.preview.map((row, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                        {CAMPOS_MAPEO.filter((c) => mapeo[c.key]).map(({ key }) => (
                          <td key={key} className="px-4 py-2.5 text-foreground">
                            {row[mapeo[key]!] ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setPaso("mapear")}
                className="px-4 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Ajustar columnas
              </button>
              <button
                onClick={confirmarImport}
                disabled={cargando}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {cargando ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Importar {preview.totalFilas} clientes
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}

        {/* PASO 4: Resultado */}
        {paso === "resultado" && resultado && (
          <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-4">
            <div className="bg-card border border-border/50 rounded-2xl p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-100 mb-4">
                <CheckCircle2 className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-1">Importación completada</h2>
              <p className="text-muted-foreground text-sm">{preview?.fileName}</p>

              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                  <p className="text-3xl font-bold text-emerald-700">{resultado.importados}</p>
                  <p className="text-sm text-emerald-600 mt-1">Clientes importados</p>
                </div>
                <div className="bg-muted/50 border border-border rounded-xl p-4">
                  <p className="text-3xl font-bold text-muted-foreground">{resultado.omitidos}</p>
                  <p className="text-sm text-muted-foreground mt-1">Omitidos o duplicados</p>
                </div>
              </div>

              {resultado.errores.length > 0 && (
                <div className="mt-4 text-left p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <p className="text-xs font-medium text-amber-700 mb-1">Filas con problemas:</p>
                  {resultado.errores.slice(0, 5).map((e, i) => (
                    <p key={i} className="text-xs text-amber-600">{e}</p>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={reiniciar}
              className="w-full px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Importar otro archivo
            </button>
          </motion.div>
        )}
      </div>
    </div>
  )
}
