import { useQuery } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import { useEffect } from 'react'
import { error } from '@tauri-apps/plugin-log'
import { InteractiveRegion } from '@/ipc/bindings.ts'
import { setInteractiveRegions } from '@/ipc/overlay.ts'
import { confQuery } from '@/queries/conf.query.ts'

const OVERLAY_INTERACTIVE_SELECTOR = [
  '[data-overlay-interactive="true"]',
  'button:not([disabled])',
  'a[href]',
  'input:not([type="hidden"]):not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  '[role="button"]',
  '[data-radix-popper-content-wrapper]',
  '[data-sonner-toaster]',
].join(', ')

function isVisible(element: HTMLElement) {
  const rect = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.pointerEvents !== 'none'
  )
}

function toInteractiveRegion(rect: DOMRect): InteractiveRegion {
  const scale = window.devicePixelRatio || 1
  const padding = 2

  return {
    x: Math.round(rect.left * scale) - padding,
    y: Math.round(rect.top * scale) - padding,
    width: Math.round(rect.width * scale) + padding * 2,
    height: Math.round(rect.height * scale) + padding * 2,
  }
}

function collectInteractiveRegions() {
  const elements = [...document.querySelectorAll<HTMLElement>(OVERLAY_INTERACTIVE_SELECTOR)]

  return elements.filter(isVisible).map((element) => toInteractiveRegion(element.getBoundingClientRect()))
}

function getFullWindowInteractiveRegion(): InteractiveRegion[] {
  const scale = window.devicePixelRatio || 1

  return [
    {
      x: 0,
      y: 0,
      width: Math.round(window.innerWidth * scale),
      height: Math.round(window.innerHeight * scale),
    },
  ]
}

export function useOverlaySync() {
  const conf = useQuery(confQuery)
  const location = useLocation()
  const isSettingsRoute = location.pathname === '/settings'

  useEffect(() => {
    if (!conf.data?.overlayMode) {
      setInteractiveRegions([]).then((result) => {
        if (result.isErr()) {
          error(`Failed to clear overlay regions: ${String(result.error.cause)}`)
        }
      })

      return
    }

    let frameId = 0
    let disposed = false
    const mutationObserver = new MutationObserver(scheduleSync)
    const resizeObserver = new ResizeObserver(() => {
      scheduleSync()
    })

    function syncNow() {
      frameId = 0

      const interactiveRegions = isSettingsRoute ? getFullWindowInteractiveRegion() : collectInteractiveRegions()

      setInteractiveRegions(interactiveRegions).then((result) => {
        if (result.isErr()) {
          error(`Failed to sync overlay regions: ${String(result.error.cause)}`)
        }
      })
    }

    function scheduleSync() {
      if (disposed || frameId !== 0) {
        return
      }

      frameId = window.requestAnimationFrame(syncNow)
    }

    mutationObserver.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-state', 'data-disabled', 'hidden'],
    })
    resizeObserver.observe(document.body)
    window.addEventListener('resize', scheduleSync)
    window.addEventListener('scroll', scheduleSync, true)

    scheduleSync()

    return () => {
      disposed = true

      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId)
      }

      mutationObserver.disconnect()
      resizeObserver.disconnect()
      window.removeEventListener('resize', scheduleSync)
      window.removeEventListener('scroll', scheduleSync, true)
    }
  }, [conf.data?.overlayMode, isSettingsRoute])
}
