import { Trans, useLingui } from '@lingui/react/macro'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from '@tanstack/react-router'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { error } from '@tauri-apps/plugin-log'
import {
  CloudDownloadIcon,
  CrosshairIcon,
  HomeIcon,
  LocateIcon,
  LogInIcon,
  LogOutIcon,
  MapIcon,
  MenuIcon,
  MinusIcon,
  NotebookPenIcon,
  NotebookTextIcon,
  PencilRulerIcon,
  SettingsIcon,
  XIcon,
} from 'lucide-react'
import { type PointerEvent as ReactPointerEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown_menu.tsx'
import { useIsBodyLockedFromDialog } from '@/hooks/use_is_body_locked_from_dialog.ts'
import { getLang } from '@/lib/conf.ts'
import { isInImageViewerPath } from '@/lib/image_viewer.ts'
import {
  OVERLAY_TITLE_BAR_HEIGHT,
  OVERLAY_TITLE_BAR_WIDTH,
  getOverlayLayout,
  isOverlayEditModeEnabled,
  withOverlayEditMode,
} from '@/lib/overlay_layout.ts'
import { cn } from '@/lib/utils.ts'
import { useCleanAuthTokens } from '@/mutations/clean_auth_tokens.mutation.ts'
import { useOpenDofusDbHunt } from '@/mutations/open_dofusdb_hunt.mutation.ts'
import { useOpenDofusDbMap } from '@/mutations/open_dofusdb_map.mutation.ts'
import { useOpenUrlInBrowser } from '@/mutations/open_url_in_browser.ts'
import { useSetConf } from '@/mutations/set_conf.mutation.ts'
import { useStartOAuthFlow } from '@/mutations/start_oauth_flow.mutation.ts'
import { confQuery } from '@/queries/conf.query.ts'
import { getAuthTokensQuery } from '@/queries/get_auth_tokens.query.ts'

import { KoFiIcon } from './icons/ko_fi_icon.tsx'

const appWindow = getCurrentWindow()

export function TitleBar() {
  const { t } = useLingui()
  const location = useLocation()
  const openInBrowser = useOpenUrlInBrowser()
  const isBodyLocked = useIsBodyLockedFromDialog()
  const startOAuthFlow = useStartOAuthFlow()
  const setConf = useSetConf()
  const authTokens = useQuery(getAuthTokensQuery)
  const cleanAuthTokens = useCleanAuthTokens()
  const conf = useQuery(confQuery)
  const openDofusDbHunt = useOpenDofusDbHunt()
  const openDofusDbMap = useOpenDofusDbMap()

  const linksAreDisabled = location.pathname.includes('app-old-version')
  const isImageViewer = isInImageViewerPath(location.pathname)
  const title = location.search.title || 'Ganymède'
  const isOverlayMode = conf.data?.overlayMode ?? false
  const overlayLayout = getOverlayLayout(conf.data?.overlayLayout)
  const overlayTitleBar = overlayLayout.titleBar
  const isOverlayEditMode = conf.data ? isOverlayEditModeEnabled(conf.data) : false
  const [liveOffsets, setLiveOffsets] = useState<{ offsetX: number; offsetY: number } | null>(null)
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720
  const titleBarWidth = OVERLAY_TITLE_BAR_WIDTH
  const titleBarHeight = OVERLAY_TITLE_BAR_HEIGHT
  const activeTitleBarOffsetX = liveOffsets?.offsetX ?? overlayTitleBar.offsetX
  const activeTitleBarOffsetY = liveOffsets?.offsetY ?? overlayTitleBar.offsetY
  const overlayTitleBarLeft = Math.max(0, Math.min(activeTitleBarOffsetX, Math.max(0, viewportWidth - titleBarWidth)))
  const overlayTitleBarTop = Math.max(0, Math.min(activeTitleBarOffsetY, Math.max(0, viewportHeight - titleBarHeight)))

  useEffect(() => {
    setLiveOffsets(null)
  }, [overlayTitleBar.offsetX, overlayTitleBar.offsetY, conf.data?.profileInUse])

  const toggleEditMode = () => {
    if (!conf.data) {
      return
    }

    setConf.mutate(withOverlayEditMode(conf.data, !isOverlayEditMode))
  }

  const startTitleBarDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!conf.data || !isOverlayMode || !isOverlayEditMode) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startY = event.clientY
    const startOffsetX = overlayTitleBar.offsetX
    const startOffsetY = overlayTitleBar.offsetY
    let lastOffsetX = startOffsetX
    let lastOffsetY = startOffsetY

    const maxOffsetX = Math.max(0, window.innerWidth - titleBarWidth)
    const maxOffsetY = Math.max(0, window.innerHeight - titleBarHeight)

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY

      lastOffsetX = Math.max(0, Math.min(startOffsetX + Math.round(deltaX), maxOffsetX))
      lastOffsetY = Math.max(0, Math.min(startOffsetY + Math.round(deltaY), maxOffsetY))
      setLiveOffsets({ offsetX: lastOffsetX, offsetY: lastOffsetY })
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setLiveOffsets(null)
      setConf.mutate({
        ...conf.data,
        overlayLayout: {
          ...overlayLayout,
          titleBar: {
            ...overlayLayout.titleBar,
            offsetX: lastOffsetX,
            offsetY: lastOffsetY,
          },
        },
      })
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div
      className={cn(
        'pointer-events-auto sticky top-0 z-60 flex h-titlebar items-center bg-surface-inset text-primary-foreground',
        isOverlayMode && 'w-fit rounded-br-md shadow-md',
        isOverlayEditMode && 'ring-2 ring-accent/70',
      )}
      data-overlay-interactive="true"
      data-overlay-editable={isOverlayEditMode ? 'true' : undefined}
      style={
        isOverlayMode
          ? {
              left: `${overlayTitleBarLeft}px`,
              top: `${overlayTitleBarTop}px`,
              position: 'fixed',
            }
          : undefined
      }
    >
      {!linksAreDisabled && !isImageViewer && (
        <DropdownMenu>
          <DropdownMenuTrigger className="h-full px-2 outline-hidden" disabled={isBodyLocked}>
            <MenuIcon className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" alignOffset={6} sideOffset={0}>
            {authTokens.isSuccess && authTokens.data !== null ? (
              <DropdownMenuItem
                className="gap-2"
                disabled={cleanAuthTokens.isPending}
                onClick={async () => {
                  try {
                    await cleanAuthTokens.mutateAsync()

                    toast.success(t`Déconnecté`)
                  } catch (err) {
                    error('Failed to clean auth tokens: ' + (err instanceof Error ? err.message : String(err)))

                    toast.error(t`Une erreur est survenue lors de la déconnexion`)
                  }
                }}
              >
                <LogOutIcon />
                <Trans>Se déconnecter</Trans>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                asChild
                className="gap-2"
                disabled={startOAuthFlow.isPending}
                onClick={() => {
                  startOAuthFlow.mutate()
                }}
              >
                <Link draggable={false} to="/oauth/waiting">
                  <LogInIcon />
                  <Trans>Se connecter</Trans>
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2">
              <Link draggable={false} to="/">
                <HomeIcon />
                <Trans>Accueil</Trans>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="gap-2">
              <Link draggable={false} search={{ path: '' }} to="/guides">
                <NotebookTextIcon />
                <Trans>Guides</Trans>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="gap-2">
              <Link draggable={false} to="/downloads">
                <CloudDownloadIcon />
                <Trans>Télécharger un guide</Trans>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2">
              <Link draggable={false} to="/auto-pilot">
                <LocateIcon />
                <Trans>Autopilotage</Trans>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild className="gap-2">
              <Link draggable={false} to="/notes">
                <NotebookPenIcon />
                <Trans>Notes</Trans>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2"
              disabled={openDofusDbMap.isPending}
              onClick={() => {
                openDofusDbMap.mutate(getLang(conf.data?.lang).toLowerCase())
              }}
            >
              <MapIcon />
              <Trans>Carte</Trans>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2"
              disabled={openDofusDbHunt.isPending}
              onClick={() => {
                openDofusDbHunt.mutate(getLang(conf.data?.lang).toLowerCase())
              }}
            >
              <CrosshairIcon />
              <Trans>Chasse au trésor</Trans>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 bg-red-700 font-semibold focus-visible:bg-red-600"
              onClick={() => openInBrowser.mutate('https://ko-fi.com/ganymededofus')}
            >
              <KoFiIcon />
              <Trans>Supporter Ganymède</Trans>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {!isOverlayMode && (
        <>
          <p className="center-absolute cursor-default text-center text-sm font-semibold select-none sm:text-base">
            {title}
          </p>
          <p className="relative z-10 size-full grow" data-tauri-drag-region="" />
        </>
      )}
      <div className={cn('flex h-full justify-end', !isOverlayMode && 'ml-auto')}>
        {isOverlayMode && (
          <>
            <button
              className={cn(
                'inline-flex h-titlebar w-6 items-center justify-center xs:w-titlebar',
                isOverlayEditMode ? 'bg-accent/70 text-accent-foreground hover:bg-accent' : 'hover:bg-surface-card',
              )}
              data-overlay-edit-allow="true"
              onClick={toggleEditMode}
              title={isOverlayEditMode ? t`Quitter le mode édition` : t`Mode édition`}
            >
              <PencilRulerIcon className="size-4" />
            </button>
            {isOverlayEditMode && (
              <button
                className="inline-flex h-titlebar w-6 cursor-grab items-center justify-center bg-accent/30 hover:bg-accent/50 xs:w-titlebar"
                data-overlay-edit-allow="true"
                onPointerDown={startTitleBarDrag}
                title={t`Déplacer la barre`}
              >
                <MenuIcon className="size-4" />
              </button>
            )}
          </>
        )}
        {!linksAreDisabled && !isImageViewer && (
          <Link
            className="inline-flex h-titlebar w-6 items-center justify-center hover:bg-surface-card aria-disabled:pointer-events-none xs:w-titlebar"
            disabled={location.pathname === '/settings' || isBodyLocked}
            draggable={false}
            search={{
              from: location.pathname,
              search: location.search,
              hash: location.hash,
              state: location.state,
            }}
            title={t`Paramètres`}
            to="/settings"
          >
            <SettingsIcon className="size-4" />
          </Link>
        )}
        {!isOverlayMode && (
          <>
            <button
              className="inline-flex h-titlebar w-6 items-center justify-center hover:bg-surface-card xs:w-titlebar"
              id="titlebar-minimize"
              onClick={async () => {
                await appWindow.minimize()
              }}
              title={t`Réduire`}
            >
              <MinusIcon className="size-4" />
            </button>
            <button
              className="inline-flex h-titlebar w-6 items-center justify-center hover:bg-destructive xs:w-titlebar"
              id="titlebar-close"
              onClick={async () => {
                await appWindow.close()
              }}
              title={t`Fermer`}
            >
              <XIcon className="size-4" />
            </button>
          </>
        )}
      </div>
    </div>
  )
}
