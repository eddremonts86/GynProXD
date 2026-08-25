import { useEffect, useState } from 'react'
import { DownloadSimple } from '@phosphor-icons/react'
import { Button } from '@/ui/Button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallAppButton() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    if (window.matchMedia('(display-mode: standalone)').matches) {
      queueMicrotask(() => setInstalled(true))
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!deferred || installed) return null

  return (
    <Button
      variant="secondary"
      onClick={() => {
        void deferred.prompt()
        void deferred.userChoice.then((choice) => {
          if (choice.outcome === 'accepted') setInstalled(true)
          setDeferred(null)
        })
      }}
    >
      <DownloadSimple size={16} />
      Install app
    </Button>
  )
}
