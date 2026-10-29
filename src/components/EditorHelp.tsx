import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  Download,
  Eye,
  EyeOff,
  FileText,
  Guitar,
  Hash,
  Layers,
  Link2,
  ListMusic,
  Minus,
  Music,
  Play,
  Plus,
  Search,
  StickyNote,
  Trash2,
  Type,
  type LucideIcon,
} from 'lucide-react'
import { Collapsible } from 'radix-ui'
import { NOTE_ICON } from '@/components/NoteIcon'
import { cn } from '@/lib/utils'
import { NOTE_LABEL, NOTE_TYPES, type NoteType } from '@/lib/types'

const STORAGE = 'songbook-editor-help-v1'

export const HELP_PARTES = 'ayuda-partes'

function readOpen() {
  try {
    return localStorage.getItem(STORAGE) === 'open'
  } catch {
    return false
  }
}

function writeOpen(open: boolean) {
  try {
    localStorage.setItem(STORAGE, open ? 'open' : 'closed')
  } catch {
    // Private mode or blocked storage: the panel just forgets.
  }
}

/** Open state that sticks, plus `show(id)` to open and jump to one group. */
export function useEditorHelp() {
  const [open, setOpenState] = useState(readOpen)
  const [target, setTarget] = useState<string | null>(null)
  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    writeOpen(next)
  }, [])
  const show = useCallback(
    (id: string) => {
      setOpen(true)
      setTarget(id)
    },
    [setOpen],
  )
  useEffect(() => {
    if (!open || !target) return
    const frame = requestAnimationFrame(() => {
      const node = document.getElementById(target)
      node?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      node?.focus({ preventScroll: true })
      setTarget(null)
    })
    return () => cancelAnimationFrame(frame)
  }, [open, target])
  return { open, setOpen, show }
}

/** A button as it looks on the page, for pointing at it in the help. */
function Chip({ icon: Icon, children }: { icon?: LucideIcon; children?: ReactNode }) {
  return (
    <span className="mx-0.5 inline-flex items-center gap-0.5 rounded border bg-background px-1 py-px align-baseline text-[11px] leading-tight font-medium whitespace-nowrap text-foreground">
      {Icon ? <Icon aria-hidden className="size-3" /> : null}
      {children}
    </span>
  )
}

const NOTE_USE: Record<NoteType, string> = {
  cue: 'cuándo entra la voz o un instrumento.',
  how: 'cómo se toca: arpegio, muteado, slide o riff.',
  repeat: 'una repetición, como ×2 o (//).',
  arrange: 'el arreglo: solo, batería, guitarra fuera.',
  free: 'cualquier otra cosa.',
}

type Group = { id: string; title: string; icon: LucideIcon; items: ReactNode[] }

const GROUPS: Group[] = [
  {
    id: 'ayuda-datos',
    title: 'Datos de la canción',
    icon: Music,
    items: [
      <>Título y Artista identifican la canción. Artista sugiere los que ya existen.</>,
      <>
        Tono de edición es el tono en que escribes. <Chip icon={Minus} /> <Chip icon={Plus} /> transponen todos los
        acordes un semitono. Tono original es el de la grabación.
      </>,
      <>
        YouTube: pega el enlace y verás la miniatura. <Chip icon={Search}>Buscar</Chip> trae el vídeo por título y
        artista, y llena duración y BPM si están vacíos.
      </>,
      <>
        BPM: usa <Chip icon={Minus} /> <Chip icon={Plus} />, escribe el número o toca <Chip>Tap</Chip> al ritmo.
      </>,
      <>Duración en m:ss (4:05) o en segundos (245).</>,
      <>
        Audio MP3: súbelo o pega una URL. <Chip icon={Play} /> lo prueba aquí.
      </>,
      <>
        En la reproducción, la duración (o la del audio) reparte la canción entre sus partes. Sin duración, manda el BPM.
      </>,
      <>Al crear una canción sin YouTube, la app busca uno en el idioma de la letra y llena duración y BPM si los halla.</>,
    ],
  },
  {
    id: 'ayuda-referencias',
    title: 'Referencias',
    icon: Link2,
    items: [
      <>
        <Chip icon={Plus}>Enlace</Chip> agrega una cifra, un tutorial o una letra.
      </>,
      <>La etiqueta ofrece YouTube, Cifra, Tutorial, Letra y Acordes, o escribe la tuya.</>,
      <>Si la dejas vacía, se sugiere según el sitio del enlace.</>,
      <>
        <Chip icon={Trash2} /> quita el enlace.
      </>,
    ],
  },
  {
    id: 'ayuda-traer',
    title: 'Traer de un enlace',
    icon: Download,
    items: [
      <>Pega un enlace de Cifra Club, La Cuerda u otra cifra y toca Convertir.</>,
      <>Reemplaza todo el borrador: úsalo antes de editar a mano.</>,
      <>Si el sitio bloquea la lectura, copia la cifra desde el navegador.</>,
    ],
  },
  {
    id: HELP_PARTES,
    title: 'Partes',
    icon: ListMusic,
    items: [
      <>
        <Chip icon={Plus}>Parte</Chip> agrega una parte vacía al final.
      </>,
      <>El nombre es lo que se lee: Verso, Coro, Puente…</>,
      <>
        × es cuántas veces seguidas se toca. <Chip icon={Minus} /> <Chip icon={Plus} /> lo cambian.
      </>,
      <>
        <Chip icon={ChevronUp} /> <Chip icon={ChevronDown} /> mueven la parte.
      </>,
      <>
        <Chip icon={EyeOff}>Plegar</Chip> esconde el contenido mientras editas. No cambia la canción.
      </>,
      <>
        <Chip>En Presentación</Chip> / <Chip>Oculta</Chip> la incluye o la quita de la primera versión.
      </>,
      <>
        <Chip>Duplicar</Chip> copia la parte al final con sus acordes y notas. <Chip icon={Trash2} /> la elimina, también de
        las versiones.
      </>,
    ],
  },
  {
    id: 'ayuda-id',
    title: 'Id e Igual que',
    icon: Hash,
    items: [
      <>Id es el nombre interno de la parte, sin espacios. Las versiones lo usan para ordenar.</>,
      <>Igual que toma la letra y los acordes de otra parte, sin escribirlos dos veces.</>,
      <>
        Ejemplo: en «Coro final» elige Igual que = Coro. Se ve la letra del Coro, y si cambias el Coro cambian los dos.
      </>,
    ],
  },
  {
    id: 'ayuda-lineas',
    title: 'Líneas y acordes',
    icon: Type,
    items: [
      <>
        <Chip icon={Plus}>Línea</Chip> agrega una línea al final de la parte.
      </>,
      <>
        Pon el cursor en la letra y toca <Chip icon={Plus}>Acorde</Chip>: cae en esa letra.
      </>,
      <>El número del acorde es la columna: el carácter de la letra donde suena. 0 es el inicio.</>,
      <>
        <Chip icon={ChevronLeft} /> <Chip icon={ChevronRight} /> mueven el acorde un carácter.
      </>,
      <>
        <Chip>Sin letra</Chip> deja una línea instrumental, solo acordes. <Chip>Con letra</Chip> la devuelve.
      </>,
      <>
        En cada línea, <Chip icon={ChevronUp} /> <Chip icon={ChevronDown} /> la mueven y <Chip icon={Trash2} /> la quita.
      </>,
    ],
  },
  {
    id: 'ayuda-marcas',
    title: 'Marcas',
    icon: StickyNote,
    items: [
      ...NOTE_TYPES.map((type) => {
        const Icon = NOTE_ICON[type]
        return (
          <>
            <Icon aria-hidden className="mr-1 inline size-3.5 align-[-2px] text-muted-foreground" />
            <strong className="font-medium text-foreground">{NOTE_LABEL[type]}</strong>: {NOTE_USE[type]}
          </>
        )
      }),
      <>Van en la parte (+ Notas de la parte), en la línea (+ Notas de la línea) o sobre un acorde (+ Nota).</>,
    ],
  },
  {
    id: 'ayuda-versiones',
    title: 'Versiones',
    icon: Layers,
    items: [
      <>Una versión es el orden en que se tocan las partes.</>,
      <>
        <Chip icon={ChevronUp} /> <Chip icon={ChevronDown} /> cambian el orden. Las partes que no están quedan ocultas.
      </>,
      <>Notas abiertas al empezar elige qué marcas se ven desplegadas.</>,
      <>Sin versiones, la canción muestra todas las partes en orden.</>,
    ],
  },
  {
    id: 'ayuda-guardar',
    title: 'Vista previa y guardar',
    icon: Eye,
    items: [
      <>
        <Chip>Vista previa</Chip> muestra la cifra como se ve en la canción.
      </>,
      <>
        <Chip>Guardar</Chip> la guarda y abre la canción. <Chip>Descargar .song.md</Chip> baja un archivo.
      </>,
      <>En el catálogo, Restaurar original descarta tus cambios.</>,
    ],
  },
  {
    id: 'ayuda-instrumentos',
    title: 'Instrumentos',
    icon: Guitar,
    items: [
      <>La letra se copia a los otros instrumentos.</>,
      <>Los acordes y las notas de ejecución se quedan en el instrumento que editas.</>,
      <>Cambia de instrumento arriba. Si hay cambios sin guardar, te pregunta antes.</>,
      <>Una canción nueva empieza igual en los cinco instrumentos.</>,
    ],
  },
]

export function EditorHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Collapsible.Root open={open} onOpenChange={onOpenChange} className="rounded-xl border bg-card">
      <Collapsible.Trigger className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <CircleHelp aria-hidden className="size-4 text-muted-foreground" />
        <span className="flex-1">Cómo usar el editor</span>
        <ChevronDown aria-hidden className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </Collapsible.Trigger>
      <Collapsible.Content className="border-t px-3 pt-3 pb-3">
        <div className="grid gap-3 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section
              key={group.id}
              id={group.id}
              tabIndex={-1}
              aria-labelledby={`${group.id}-title`}
              className="scroll-mt-20 rounded-lg border bg-background p-3 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <h3 id={`${group.id}-title`} className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
                <group.icon aria-hidden className="size-4 text-primary" />
                {group.title}
              </h3>
              <ul className="flex list-disc flex-col gap-1 pl-4 text-xs leading-relaxed text-muted-foreground marker:text-border">
                {group.items.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
          <FileText aria-hidden className="size-3.5" />
          Pasa el ratón sobre un botón para ver qué hace.
        </p>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}
