import { Trans } from '@lingui/react/macro'
import { useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { debug } from '@tauri-apps/plugin-log'
import { XIcon } from 'lucide-react'
import { type PointerEvent as ReactPointerEvent, useEffect } from 'react'

import { GuideNodeImage } from '@/components/guide_node_image.tsx'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context_menu.tsx'
import { TabsTrigger } from '@/components/ui/tabs.tsx'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip.tsx'
import { useGuideOrUndefined } from '@/hooks/use_guide.ts'
import { useProfile } from '@/hooks/use_profile.ts'
import { useTabs } from '@/hooks/use_tabs.ts'
import { clamp } from '@/lib/clamp.ts'
import { getStepOr } from '@/lib/progress.ts'
import { OpenedGuideDropPosition } from '@/lib/tabs.ts'
import { cn } from '@/lib/utils.ts'
import { useRegisterGuideClose } from '@/mutations/register_guide_close.mutation.ts'
import { confQuery } from '@/queries/conf.query.ts'

type GuideTabsTriggerProps = {
  id: number
  currentId: number
  dropPosition: OpenedGuideDropPosition | null
  isDragging: boolean
  isOverlayMode: boolean
  onTabPointerDown: (evt: ReactPointerEvent<HTMLDivElement>, id: number) => void
}

export function GuideTabsTrigger({
  id,
  currentId,
  dropPosition,
  isDragging,
  isOverlayMode,
  onTabPointerDown,
}: GuideTabsTriggerProps) {
  const guide = useGuideOrUndefined(id)
  const removeTab = useTabs((s) => s.removeTab)
  const setTabs = useTabs((s) => s.setTabs)
  const registerGuideClose = useRegisterGuideClose()
  const tabs = useTabs((s) => s.tabs)
  const navigate = useNavigate()
  const profile = useProfile()
  const conf = useSuspenseQuery(confQuery)
  const isSmallGuide = conf.data.guideDisplay === 'Small'

  useEffect(() => {
    if (!guide) {
      removeTab(id)
      registerGuideClose.mutate({ guideId: id, profileId: profile.id })
    }
  }, [guide, id, removeTab, registerGuideClose, profile.id])

  if (!guide) {
    return null
  }

  const totalSteps = guide.steps.length
  const currentStep = profile.progresses.find((p) => p.id === id)?.currentStep ?? 0
  const progressPercent = totalSteps <= 1 ? 100 : (currentStep / (totalSteps - 1)) * 100
  const positionInList = tabs.findIndex((tab) => tab === id)
  const hasTabsToRight = positionInList !== -1 && positionInList < tabs.length - 1
  const hasOtherTabs = tabs.length > 1

  const onOpenTab = async () => {
    if (currentId === id) {
      return
    }

    await navigate({
      to: '/guides/$id',
      params: {
        id,
      },
      search: {
        step: getStepOr(profile, id, 0),
      },
    })
  }

  const onCloseTab = async () => {
    try {
      if (tabs.length === 1) {
        await navigate({
          to: '/guides',
          search: {
            path: '',
          },
        })

        return
      }

      debug(`Closing tab: ${id} at position ${positionInList} - current: ${currentId}`)

      if (currentId === id && positionInList !== -1) {
        const nextGuide = tabs.filter((tab) => tab !== id)[clamp(positionInList - 1, 0, tabs.length - 1)]

        debug(`Navigating to next guide: ${nextGuide}`)

        await navigate({
          to: '/guides/$id',
          params: {
            id: nextGuide,
          },
          search: {
            step: getStepOr(profile, nextGuide, 0),
          },
        })
      }
    } finally {
      removeTab(id)
      registerGuideClose.mutate({ guideId: id, profileId: profile.id })
    }
  }

  const onCloseTabsToRight = async () => {
    if (!hasTabsToRight) return

    const toRemove = tabs.slice(positionInList + 1)
    const remaining = tabs.slice(0, positionInList + 1)

    setTabs(remaining)

    if (!remaining.includes(currentId)) {
      await navigate({
        to: '/guides/$id',
        params: { id },
        search: { step: getStepOr(profile, id, 0) },
      })
    }

    for (const tabId of toRemove) {
      registerGuideClose.mutate({ guideId: tabId, profileId: profile.id })
    }
  }

  const onCloseOtherTabs = async () => {
    if (!hasOtherTabs) return

    const toRemove = tabs.filter((tab) => tab !== id)

    setTabs([id])

    if (currentId !== id) {
      await navigate({
        to: '/guides/$id',
        params: { id },
        search: { step: getStepOr(profile, id, 0) },
      })
    }

    for (const tabId of toRemove) {
      registerGuideClose.mutate({ guideId: tabId, profileId: profile.id })
    }
  }

  const onCloseAllTabs = async () => {
    const toRemove = [...tabs]

    setTabs([])

    await navigate({
      to: '/guides',
      search: { path: '' },
    })

    for (const tabId of toRemove) {
      registerGuideClose.mutate({ guideId: tabId, profileId: profile.id })
    }
  }

  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <ContextMenu>
          <TooltipTrigger asChild>
            <ContextMenuTrigger asChild>
              <div
                className={cn(
                  'relative flex shrink-0 cursor-grab pb-1 active:cursor-grabbing',
                  isOverlayMode && 'w-full px-0 pb-0',
                  isDragging && 'opacity-60',
                )}
                data-guide-id={id}
                data-guide-tab="true"
                onPointerDown={(evt) => onTabPointerDown(evt, id)}
              >
                {dropPosition && (
                  <span
                    className={cn(
                      'pointer-events-none absolute top-0 bottom-1 z-10 w-0.5 rounded-full bg-primary',
                      dropPosition === 'before' ? 'left-0' : 'right-0',
                      isOverlayMode &&
                        'right-0 left-0 h-0.5 w-auto rounded-full ' +
                          (dropPosition === 'before' ? 'top-0 bottom-auto' : 'top-auto bottom-0'),
                    )}
                  />
                )}
                <TabsTrigger
                  asChild
                  className={cn(
                    'group/tab relative m-0 flex max-w-40 items-center gap-1.5 overflow-hidden rounded-lg bg-surface-inset text-xs font-medium whitespace-nowrap text-foreground/75 transition-none data-[state=active]:bg-surface-page data-[state=active]:text-foreground data-[state=active]:shadow-sm data-[state=inactive]:hover:bg-surface-page/50',
                    !isSmallGuide && 'xs:text-sm lg:max-w-62',
                    isOverlayMode && 'h-12 w-full max-w-none justify-start rounded-md px-2 py-0',
                  )}
                  onClick={async (evt) => {
                    evt.preventDefault()

                    await onOpenTab()
                  }}
                  onMouseDown={(evt) => {
                    if (evt.button === 0) {
                      evt.preventDefault()
                      return
                    }

                    if (evt.button === 1) {
                      evt.preventDefault()
                      evt.stopPropagation()
                      onCloseTab()
                    }
                  }}
                  value={id.toString()}
                >
                  <div className={cn(isOverlayMode && 'flex w-full min-w-0 items-center gap-2')} draggable={false}>
                    <GuideNodeImage guide={guide} />
                    <span
                      className={cn(
                        'hidden -translate-y-0.5 truncate',
                        !isSmallGuide && 'xs:inline',
                        isOverlayMode &&
                          'inline max-w-0 flex-1 opacity-0 transition-[max-width,opacity] duration-150 group-hover/overlay-tabs:max-w-[9rem] group-hover/overlay-tabs:opacity-100 group-data-[state=active]/tab:max-w-[9rem] group-data-[state=active]/tab:opacity-100',
                      )}
                      draggable={false}
                    >
                      {guide.name}
                    </span>
                    <div
                      className={cn(
                        'absolute bottom-0 left-0 h-0.5 w-full',
                        isOverlayMode && 'top-0 right-0 left-auto h-full w-0.5',
                      )}
                    >
                      <div className="size-full bg-black/20">
                        <div
                          className={cn('h-full rounded-b-xl bg-success', isOverlayMode && 'rounded-r-xl rounded-b-none')}
                          style={
                            isOverlayMode
                              ? { height: `${Math.min(progressPercent, 100)}%` }
                              : { width: `${Math.min(progressPercent, 100)}%` }
                          }
                        />
                      </div>
                    </div>
                    {isOverlayMode ? (
                      <button
                        className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-card p-0 opacity-0 transition-opacity duration-150 group-hover/overlay-tabs:opacity-100 group-data-[state=active]/tab:opacity-100"
                        data-no-tab-drag="true"
                        draggable={false}
                        onClick={async (evt) => {
                          evt.preventDefault()
                          evt.stopPropagation()

                          await onCloseTab()
                        }}
                      >
                        <XIcon className="size-3" />
                      </button>
                    ) : (
                      <button
                        className={cn(
                          'group/close invisible absolute top-0 right-0 z-0 cursor-pointer bg-surface-page text-primary-foreground transition-none group-hover/tab:visible',
                          !isSmallGuide &&
                            'xs:top-0 xs:bottom-0.5 xs:flex xs:h-[calc(100%-0.125rem)] xs:w-6 xs:items-center xs:justify-end xs:pr-1.5 xs:mask-gradient-to-left',
                        )}
                        data-no-tab-drag="true"
                        draggable={false}
                        onClick={async (evt) => {
                          evt.preventDefault()
                          evt.stopPropagation()

                          await onCloseTab()
                        }}
                      >
                        <XIcon
                          className={cn(
                            'size-3 rounded-full p-0.5',
                            !isSmallGuide && 'xs:group-hover/close:bg-surface-inset',
                          )}
                        />
                      </button>
                    )}
                  </div>
                </TabsTrigger>
              </div>
            </ContextMenuTrigger>
          </TooltipTrigger>
          <ContextMenuContent>
            <ContextMenuItem onSelect={onCloseTab}>
              <Trans>Fermer</Trans>
            </ContextMenuItem>
            <ContextMenuItem disabled={!hasTabsToRight} onSelect={onCloseTabsToRight}>
              <Trans>Fermer à droite</Trans>
            </ContextMenuItem>
            <ContextMenuItem disabled={!hasOtherTabs} onSelect={onCloseOtherTabs}>
              <Trans>Fermer les autres</Trans>
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={onCloseAllTabs}>
              <Trans>Tout fermer</Trans>
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
        <TooltipContent className={cn('xl:hidden', isOverlayMode && 'hidden')} side={isOverlayMode ? 'right' : 'bottom'}>
          {guide.name}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
