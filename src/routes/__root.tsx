import { QueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet, useLocation } from '@tanstack/react-router'
import { error } from '@tauri-apps/plugin-log'
import { Suspense, useEffect, useRef } from 'react'

import { DeepLinkGuideDownloadDialog } from '@/components/deep_link_guide_download_dialog.tsx'
import { NotificationAlertDialog } from '@/components/notification_alert_dialog.tsx'
import { TitleBar } from '@/components/title_bar.tsx'
import { Toaster } from '@/components/ui/sonner.tsx'
import { useJwtExpiredHandler } from '@/hooks/use_jwt_expired_handler.ts'
import { useMalformedGuidesHandler } from '@/hooks/use_malformed_guides_handler.ts'
import { useOverlaySync } from '@/hooks/use_overlay_sync.ts'
import { useWebviewEvent } from '@/hooks/use_webview_event.ts'
import { taurpc } from '@/ipc/ipc.ts'
import { isInImageViewerPath } from '@/lib/image_viewer.ts'
import { isOverlayEditModeEnabled } from '@/lib/overlay_layout.ts'
import { confQuery } from '@/queries/conf.query.ts'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  component: Root,
})

function Root() {
  useJwtExpiredHandler()
  useMalformedGuidesHandler()
  useOverlaySync()
  const conf = useQuery(confQuery)
  const location = useLocation()
  const isImageViewer = useRef(isInImageViewerPath(location.pathname)) // only check on first mount
  useWebviewEvent('overlay-visibility-changed', (event) => {
    window.document.documentElement.dataset.overlayVisible = event.payload ? 'true' : 'false'
  })

  useEffect(() => {
    if (!isImageViewer.current) {
      taurpc.base.startup().catch((err) => {
        error(`Error sending startup message: ${err}`)
      })
    }
  }, [])

  useEffect(() => {
    const visibility = (conf.data?.overlayClickableVisibility ?? 75) / 100
    window.document.documentElement.style.setProperty('--overlay-clickable-visibility', visibility.toFixed(2))
  }, [conf.data?.overlayClickableVisibility])

  useEffect(() => {
    const isEditMode = conf.data?.overlayMode && isOverlayEditModeEnabled(conf.data)
    window.document.documentElement.dataset.overlayEditMode = isEditMode ? 'true' : 'false'
  }, [conf.data])

  useEffect(() => {
    window.document.documentElement.dataset.overlayVisible = 'true'
  }, [])

  return (
    <>
      <TitleBar />
      <Toaster />
      <Outlet />
      <Suspense>
        <DeepLinkGuideDownloadDialog />
        <NotificationAlertDialog />
      </Suspense>
    </>
  )
}
