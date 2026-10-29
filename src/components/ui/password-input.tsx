import { useState, type ComponentProps } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Password field with a show/hide eye. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [shown, setShown] = useState(false)
  return (
    <span className={cn('relative block min-w-0', className)}>
      <Input {...props} type={shown ? 'text' : 'password'} className="pr-10" />
      <button
        type="button"
        aria-label={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={shown}
        title={shown ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute top-1/2 right-1.5 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        onClick={() => setShown((value) => !value)}
      >
        {shown ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </span>
  )
}
