import { Trans, useLingui } from '@lingui/react/macro'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useDebounce } from '@uidotdev/usehooks'
import { TriangleAlertIcon } from 'lucide-react'
import { type PointerEvent as ReactPointerEvent, type PropsWithChildren, type ReactNode, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { GenericLoader } from '@/components/generic_loader.tsx'
import { PageScrollableContent } from '@/components/page_scrollable_content.tsx'
import { SelectLangLabel, SelectLangSelect } from '@/components/select_lang.tsx'
import { ShortcutInput } from '@/components/shortcut_input.tsx'
import { ThemeSelector } from '@/components/theme_selector.tsx'
import { Button } from '@/components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card.tsx'
import { Input } from '@/components/ui/input.tsx'
import { Label } from '@/components/ui/label.tsx'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select.tsx'
import { Slider } from '@/components/ui/slider.tsx'
import { Switch } from '@/components/ui/switch.tsx'
import { useSwitchProfile } from '@/hooks/use_switch_profile.ts'
import { ConfLang, FontSize, GuideDisplay } from '@/ipc/bindings.ts'
import { createProfileRemote } from '@/ipc/sync.ts'
import { cn } from '@/lib/utils.ts'
import { useNewId } from '@/mutations/new_id.mutation.ts'
import { useReregisterShortcuts } from '@/mutations/reregister_shortcuts.mutation.ts'
import { useSetConf } from '@/mutations/set_conf.mutation.ts'
import { confQuery } from '@/queries/conf.query.ts'
import { Page } from '@/routes/-page.tsx'
import { Profiles } from '@/routes/_app/-settings/profiles.tsx'

import { BackButtonLink } from './downloads/-back_button_link.tsx'

const SearchZod = z.object({
  from: z.string().optional(),
  hash: z.string().optional(),
  state: z.any().optional(),
  search: z.any().optional(),
})

export const Route = createFileRoute('/_app/settings')({
  validateSearch: SearchZod.parse,
  component: Settings,
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(confQuery)
  },
  pendingComponent: () => {
    const { t } = useLingui()

    return (
      <Page key="settings-page" title={t`Paramètres`}>
        <PageScrollableContent className="flex items-center justify-center">
          <GenericLoader />
        </PageScrollableContent>
      </Page>
    )
  },
  pendingMs: 200,
})

function SettingCard({
  title,
  description,
  id,
  className,
  children,
}: PropsWithChildren<{ title: ReactNode; description?: ReactNode; id: string; className?: string }>) {
  return (
    <Card className={cn('flex flex-col gap-2 text-sm', className)}>
      <CardHeader className="xs:pb-2">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 xs:pt-2" id={id}>
        {children}
      </CardContent>
    </Card>
  )
}

function SettingCardSection({ id, children }: PropsWithChildren<{ id: string }>) {
  return (
    <section className="flex flex-col gap-2" id={id}>
      {children}
    </section>
  )
}

function OverlaySlider({
  id,
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  id: string
  label: ReactNode
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs" htmlFor={id}>
          {label}
        </Label>
        <span className="text-[11px] text-muted-foreground">{value}</span>
      </div>
      <Slider
        id={id}
        max={max}
        min={min}
        onValueChange={(values) => {
          onChange(values[0])
        }}
        step={step}
        value={[value]}
      />
    </div>
  )
}

function OverlayPreview({
  titleBarOffsetX,
  titleBarOffsetY,
  titleBarOffsetXMin,
  titleBarOffsetXMax,
  titleBarOffsetYMin,
  titleBarOffsetYMax,
  sidebarOffsetY,
  sidebarOffsetYMin,
  sidebarOffsetYMax,
  sidebarCollapsedWidth,
  sidebarExpandedWidth,
  sidebarHeightPercent,
  guideHeaderWidthPercent,
  guideHeaderOffsetX,
  guideHeaderOffsetY,
  guideHeaderOffsetXMin,
  guideHeaderOffsetXMax,
  guideHeaderOffsetYMin,
  guideHeaderOffsetYMax,
  onTitleBarOffsetXChange,
  onTitleBarOffsetYChange,
  onSidebarOffsetYChange,
  onSidebarCollapsedWidthChange,
  onSidebarExpandedWidthChange,
  onSidebarHeightPercentChange,
  onGuideHeaderOffsetXChange,
  onGuideHeaderOffsetYChange,
  onGuideHeaderWidthPercentChange,
}: {
  titleBarOffsetX: number
  titleBarOffsetY: number
  titleBarOffsetXMin: number
  titleBarOffsetXMax: number
  titleBarOffsetYMin: number
  titleBarOffsetYMax: number
  sidebarOffsetY: number
  sidebarOffsetYMin: number
  sidebarOffsetYMax: number
  sidebarCollapsedWidth: number
  sidebarExpandedWidth: number
  sidebarHeightPercent: number
  guideHeaderWidthPercent: number
  guideHeaderOffsetX: number
  guideHeaderOffsetY: number
  guideHeaderOffsetXMin: number
  guideHeaderOffsetXMax: number
  guideHeaderOffsetYMin: number
  guideHeaderOffsetYMax: number
  onTitleBarOffsetXChange: (value: number) => void
  onTitleBarOffsetYChange: (value: number) => void
  onSidebarOffsetYChange: (value: number) => void
  onSidebarCollapsedWidthChange: (value: number) => void
  onSidebarExpandedWidthChange: (value: number) => void
  onSidebarHeightPercentChange: (value: number) => void
  onGuideHeaderOffsetXChange: (value: number) => void
  onGuideHeaderOffsetYChange: (value: number) => void
  onGuideHeaderWidthPercentChange: (value: number) => void
}) {
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  const mapValue = (value: number, fromMin: number, fromMax: number, toMin: number, toMax: number) => {
    if (fromMax <= fromMin) {
      return toMin
    }
    const progress = (value - fromMin) / (fromMax - fromMin)
    return toMin + progress * (toMax - toMin)
  }
  const previewWidth = 280
  const previewHeight = 160
  const scaleX = previewWidth / 700
  const scaleY = previewHeight / 420
  const titleBarWidth = 84
  const titleBarHeight = 24
  const sidebarWidth = Math.max(22, sidebarCollapsedWidth * 0.45)
  const sidebarOpenWidth = Math.max(sidebarWidth + 28, sidebarExpandedWidth * 0.45)
  const titleBarLeft = mapValue(titleBarOffsetX, titleBarOffsetXMin, titleBarOffsetXMax, 8, previewWidth - titleBarWidth)
  const titleBarTop = mapValue(titleBarOffsetY, titleBarOffsetYMin, titleBarOffsetYMax, 8, previewHeight - titleBarHeight)
  const sidebarTop = mapValue(sidebarOffsetY, sidebarOffsetYMin, sidebarOffsetYMax, 34, previewHeight - 36)
  const sidebarAvailableHeight = Math.max(36, previewHeight - 42 - sidebarTop)
  const sidebarHeight = Math.max(36, (sidebarAvailableHeight * sidebarHeightPercent) / 100)
  const guideHeaderWidth = ((previewWidth - sidebarWidth) * guideHeaderWidthPercent) / 100
  const guideHeaderLeft = mapValue(
    guideHeaderOffsetX,
    guideHeaderOffsetXMin,
    guideHeaderOffsetXMax,
    0,
    previewWidth - guideHeaderWidth,
  )
  const guideHeaderTop = mapValue(
    guideHeaderOffsetY,
    guideHeaderOffsetYMin,
    guideHeaderOffsetYMax,
    0,
    previewHeight - 28,
  )
  const clampedTitleBarLeft = clamp(titleBarLeft, 8, previewWidth - titleBarWidth)
  const clampedTitleBarTop = clamp(titleBarTop, 8, previewHeight - titleBarHeight)
  const clampedSidebarTop = clamp(sidebarTop, 34, previewHeight - 36)
  const clampedGuideHeaderLeft = clamp(guideHeaderLeft, 0, previewWidth - guideHeaderWidth)
  const clampedGuideHeaderTop = clamp(guideHeaderTop, 0, previewHeight - 28)

  const startTitleBarMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const startOffsetX = titleBarOffsetX
    const startOffsetY = titleBarOffsetY

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY
      const nextOffsetX = startOffsetX + (deltaX / Math.max(previewWidth - titleBarWidth - 8, 1)) * (titleBarOffsetXMax - titleBarOffsetXMin)
      const nextOffsetY = startOffsetY + (deltaY / Math.max(previewHeight - titleBarHeight - 8, 1)) * (titleBarOffsetYMax - titleBarOffsetYMin)
      onTitleBarOffsetXChange(clamp(Math.round(nextOffsetX), titleBarOffsetXMin, titleBarOffsetXMax))
      onTitleBarOffsetYChange(clamp(Math.round(nextOffsetY), titleBarOffsetYMin, titleBarOffsetYMax))
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startSidebarMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const startY = event.clientY
    const startOffset = sidebarOffsetY

    const onMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY
      const nextOffsetY = startOffset + (deltaY / Math.max(previewHeight - 70, 1)) * (sidebarOffsetYMax - sidebarOffsetYMin)
      onSidebarOffsetYChange(clamp(Math.round(nextOffsetY), sidebarOffsetYMin, sidebarOffsetYMax))
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startSidebarWidthResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = sidebarCollapsedWidth

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      onSidebarCollapsedWidthChange(Math.round(startWidth + deltaX / 0.45))
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startSidebarExpandedWidthResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = sidebarExpandedWidth

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      onSidebarExpandedWidthChange(Math.round(startWidth + deltaX / 0.45))
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startGuideHeaderMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const startOffsetX = guideHeaderOffsetX
    const startOffsetY = guideHeaderOffsetY

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      const deltaY = moveEvent.clientY - startY
      const nextOffsetX =
        startOffsetX + (deltaX / Math.max(previewWidth - guideHeaderWidth, 1)) * (guideHeaderOffsetXMax - guideHeaderOffsetXMin)
      const nextOffsetY =
        startOffsetY + (deltaY / Math.max(previewHeight - 28, 1)) * (guideHeaderOffsetYMax - guideHeaderOffsetYMin)
      onGuideHeaderOffsetXChange(clamp(Math.round(nextOffsetX), guideHeaderOffsetXMin, guideHeaderOffsetXMax))
      onGuideHeaderOffsetYChange(clamp(Math.round(nextOffsetY), guideHeaderOffsetYMin, guideHeaderOffsetYMax))
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startGuideHeaderResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const availableWidth = previewWidth - sidebarWidth

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX
      const nextWidth = guideHeaderWidth + deltaX
      const nextWidthPercent = Math.round((nextWidth / Math.max(availableWidth, 1)) * 100)
      onGuideHeaderWidthPercentChange(nextWidthPercent)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const startSidebarResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const startY = event.clientY

    const onMove = (moveEvent: PointerEvent) => {
      const deltaY = moveEvent.clientY - startY
      const nextSidebarHeight = sidebarHeight + deltaY
      const nextHeightPercent = Math.round((nextSidebarHeight / Math.max(sidebarAvailableHeight, 1)) * 100)
      onSidebarHeightPercentChange(nextHeightPercent)
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  return (
    <div className="rounded-xl border border-border-muted bg-surface-page/80 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="font-medium text-xs">
          <Trans>Aperçu overlay</Trans>
        </p>
        <p className="text-[11px] text-muted-foreground">
          <Trans>Mise à jour instantanée</Trans>
        </p>
      </div>
      <div className="relative overflow-hidden rounded-lg border border-border-muted bg-surface-inset/60" style={{ height: previewHeight }}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(231,194,114,0.16),transparent_36%),linear-gradient(180deg,rgba(29,39,48,0.4),rgba(18,31,42,0.9))]" />

        <div
          className="absolute rounded-md bg-surface-card shadow-md ring-1 ring-border-muted"
          onPointerDown={startTitleBarMove}
          style={{
            top: clampedTitleBarTop,
            left: clampedTitleBarLeft,
            width: titleBarWidth,
            height: titleBarHeight,
            cursor: 'grab',
          }}
        >
          <div className="flex h-full items-center justify-between px-2 text-[10px] text-foreground/90">
            <span>≡</span>
            <span>⚙</span>
          </div>
        </div>

        <div
          className="group absolute rounded-md bg-surface-card shadow-md ring-1 ring-border-muted transition-[width] duration-150"
          onPointerDown={startSidebarMove}
          style={{
            left: 8,
            top: clampedSidebarTop,
            width: sidebarWidth,
            height: sidebarHeight,
            cursor: 'grab',
          }}
        >
          <div className="flex h-full flex-col items-center gap-1 p-1">
            <div className="h-9 w-full rounded bg-surface-page/70" />
            <div className="h-9 w-full rounded bg-surface-page/55" />
            <div className="h-9 w-full rounded bg-surface-page/55" />
            <div className="mt-auto h-9 w-full rounded bg-surface-page/70" />
          </div>
          <div
            className="pointer-events-none absolute top-0 hidden h-full rounded-md border border-dashed border-accent/70 bg-surface-card/35 group-hover:block"
            style={{ width: sidebarOpenWidth }}
          />
          <div
            className="absolute top-1 right-[-6px] h-[calc(100%-0.5rem)] w-2 cursor-ew-resize rounded bg-accent/70"
            onPointerDown={startSidebarWidthResize}
          />
          <div
            className="absolute right-1 bottom-1 h-2 w-[calc(100%-0.5rem)] cursor-ns-resize rounded bg-accent/70"
            onPointerDown={startSidebarResize}
          />
          <div
            className="absolute top-1 right-[-14px] h-[calc(100%-0.5rem)] w-2 cursor-ew-resize rounded border border-dashed border-accent bg-accent/35"
            onPointerDown={startSidebarExpandedWidthResize}
          />
        </div>

        <div
          className="absolute rounded-md bg-surface-card/95 shadow-md ring-1 ring-border-muted"
          onPointerDown={startGuideHeaderMove}
          style={{
            left: clampedGuideHeaderLeft,
            top: clampedGuideHeaderTop,
            width: guideHeaderWidth,
            height: 28,
            cursor: 'grab',
          }}
        >
          <div className="flex h-full items-center gap-1 px-2">
            <div className="h-4 w-10 rounded bg-surface-page/80" />
            <div className="h-5 w-5 rounded-md bg-surface-page/80" />
            <div className="h-4 flex-1 rounded bg-success/70" />
            <div className="h-5 w-5 rounded-md bg-surface-page/80" />
            <div className="h-5 w-5 rounded-md bg-surface-page/80" />
            <div className="h-5 w-5 rounded-md bg-surface-page/80" />
          </div>
          <div
            className="absolute top-1 right-1 h-[calc(100%-0.5rem)] w-2 cursor-ew-resize rounded bg-accent/70"
            onPointerDown={startGuideHeaderResize}
          />
        </div>
      </div>
    </div>
  )
}

function Settings() {
  const { t } = useLingui()
  const { from, hash, state, search } = Route.useSearch()
  const queryClient = useQueryClient()
  const newId = useNewId()
  const conf = useSuspenseQuery(confQuery)
  const setConf = useSetConf()
  const reregisterShortcuts = useReregisterShortcuts()
  const switchProfile = useSwitchProfile()
  const [opacity, setOpacity] = useState(conf.data.opacity)
  const opacityDebounced = useDebounce(opacity, 300)

  // oxlint-disable react-hooks/exhaustive-deps -- no need more deps
  useEffect(() => {
    setConf.mutate({
      ...conf.data,
      opacity: opacityDebounced,
    })
  }, [opacityDebounced])
  // oxlint-enable react-hooks/exhaustive-deps

  useEffect(() => {
    window.document.documentElement.style.setProperty('--opacity', `${opacity.toFixed(2)}`)
  }, [opacity])

  const overlayLayout = conf.data.overlayLayout ?? {
    titleBar: { offsetX: 0, offsetY: 0 },
    sidebar: { offsetY: 0, collapsedWidth: 56, expandedWidth: 224, heightPercent: 100 },
    guideHeader: { widthPercent: 80, offsetX: 0, offsetY: 0 },
  }
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720
  const titleBarOffsetXMin = 0
  const titleBarOffsetXMax = Math.max(0, viewportWidth - 84)
  const titleBarOffsetYMin = 0
  const titleBarOffsetYMax = Math.max(0, viewportHeight - 30)
  const sidebarOffsetYMin = 0
  const sidebarOffsetYMax = Math.max(0, viewportHeight - 30 - 48)
  const guideHeaderWidthPx = Math.max(
    240,
    ((viewportWidth - overlayLayout.sidebar.collapsedWidth) * overlayLayout.guideHeader.widthPercent) / 100,
  )
  const guideHeaderOffsetXMin = -overlayLayout.sidebar.collapsedWidth
  const guideHeaderOffsetXMax = Math.max(
    guideHeaderOffsetXMin,
    viewportWidth - overlayLayout.sidebar.collapsedWidth - guideHeaderWidthPx,
  )
  const guideHeaderOffsetYMin = -70
  const guideHeaderOffsetYMax = Math.max(guideHeaderOffsetYMin, viewportHeight - 70 - 40)

  const updateOverlayLayout = (nextLayout: typeof overlayLayout) => {
    setConf.mutate({
      ...conf.data,
      overlayLayout: nextLayout,
    })
  }

  return (
    <Page
      backButton={<BackButtonLink from={Route.fullPath} hash={hash} search={search} state={state} to={from} />}
      key="settings-page"
      title={t`Paramètres`}
    >
      <PageScrollableContent className="py-2">
        <div className="container flex max-w-lg flex-col gap-4 px-2 py-2">
          <SettingCard id="section-general" title={<Trans>Général</Trans>}>
            <SettingCardSection id="section-auto-open-guides">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs" htmlFor="auto-open-guides">
                  <Trans>Ouvrir les guides à l'ouverture</Trans>
                </Label>
                <Switch
                  checked={conf.data.autoOpenGuides}
                  id="auto-open-guides"
                  onCheckedChange={(checked) => {
                    setConf.mutate({
                      ...conf.data,
                      autoOpenGuides: checked,
                    })
                  }}
                />
              </div>
            </SettingCardSection>
            <SettingCardSection id="section-auto-travel-copy">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs" htmlFor="auto-travel-copy">
                  <Trans>Copie d'autopilote</Trans>
                </Label>
                <Switch
                  checked={conf.data.autoTravelCopy}
                  id="auto-travel-copy"
                  onCheckedChange={(checked) => {
                    setConf.mutate({
                      ...conf.data,
                      autoTravelCopy: checked,
                    })
                  }}
                />
              </div>
            </SettingCardSection>
            <SettingCardSection id="section-show-done-guides">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs" htmlFor="show-done-guides">
                  <Trans>Afficher les guides terminés</Trans>
                </Label>
                <Switch
                  checked={conf.data.showDoneGuides}
                  id="show-done-guides"
                  onCheckedChange={(checked) => {
                    setConf.mutate({
                      ...conf.data,
                      showDoneGuides: checked,
                    })
                  }}
                />
              </div>
            </SettingCardSection>
            <SettingCardSection id="section-overlay-mode">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs" htmlFor="overlay-mode">
                    <Trans>Mode overlay</Trans>
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    <Trans>
                      Laisse passer les clics vers Dofus sauf sur les éléments interactifs de Ganymède.
                    </Trans>
                  </p>
                </div>
                <Switch
                  checked={conf.data.overlayMode ?? false}
                  id="overlay-mode"
                  onCheckedChange={(checked) => {
                    setConf.mutate({
                      ...conf.data,
                      overlayMode: checked,
                    })
                  }}
                />
              </div>
            </SettingCardSection>
          </SettingCard>
          <SettingCard id="section-appearance" title={<Trans>Apparence</Trans>}>
            <SettingCardSection id="section-opacity">
              <Label className="text-xs" htmlFor="opacity">
                <Trans>Opacité</Trans>
              </Label>
              <Slider
                defaultValue={[conf.data.opacity * 100]}
                id="opacity"
                max={98}
                onValueChange={(v) => {
                  setOpacity(v[0] / 100)
                }}
                step={1}
              />
            </SettingCardSection>
            <SettingCardSection id="section-font-size">
              <p className="text-xs leading-none font-medium">
                <Trans>Taille de texte des guides</Trans>
              </p>
              <Select
                onValueChange={(value) => {
                  setConf.mutate({
                    ...conf.data,
                    fontSize: value as FontSize,
                  })
                }}
                value={conf.data.fontSize}
              >
                <SelectTrigger className="text-xs" id="lang-guides">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ExtraSmall">
                    <Trans>Très petite</Trans>
                  </SelectItem>
                  <SelectItem value="Small">
                    <Trans>Petite</Trans>
                  </SelectItem>
                  <SelectItem value="Normal">
                    <Trans>Normale</Trans>
                  </SelectItem>
                  <SelectItem value="Large">
                    <Trans>Grande</Trans>
                  </SelectItem>
                  <SelectItem value="ExtraLarge">
                    <Trans>Très grande</Trans>
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingCardSection>
            <SettingCardSection id="section-guide-display">
              <p className="text-xs leading-none font-medium">
                <Trans>Taille des onglets de guides</Trans>
              </p>
              <Select
                onValueChange={(value) => {
                  setConf.mutate({
                    ...conf.data,
                    guideDisplay: value as GuideDisplay,
                  })
                }}
                value={conf.data.guideDisplay ?? 'Dynamic'}
              >
                <SelectTrigger className="text-xs" id="guide-display">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Dynamic">
                    <Trans>Dynamique (selon la fenêtre)</Trans>
                  </SelectItem>
                  <SelectItem value="Small">
                    <Trans>Compact (toujours)</Trans>
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingCardSection>
            <SettingCardSection id="section-lang">
              <SelectLangLabel htmlFor="lang-guides" />
              <SelectLangSelect
                onValueChange={async (value) => {
                  setConf.mutate({
                    ...conf.data,
                    lang: value as ConfLang,
                  })
                }}
                value={conf.data.lang}
              />
            </SettingCardSection>
            <SettingCardSection id="section-theme">
              <ThemeSelector />
            </SettingCardSection>
          </SettingCard>
          {(conf.data.overlayMode ?? false) && (
            <SettingCard
              className="slot-[card-description]:text-xs"
              description={<Trans>Réglages de position et de taille des blocs visibles en mode overlay.</Trans>}
              id="section-overlay-layout"
              title={<Trans>Layout overlay</Trans>}
            >
              <SettingCardSection id="section-overlay-preview">
                <OverlayPreview
                  guideHeaderOffsetX={overlayLayout.guideHeader.offsetX}
                  guideHeaderOffsetXMax={guideHeaderOffsetXMax}
                  guideHeaderOffsetXMin={guideHeaderOffsetXMin}
                  guideHeaderOffsetY={overlayLayout.guideHeader.offsetY}
                  guideHeaderOffsetYMax={guideHeaderOffsetYMax}
                  guideHeaderOffsetYMin={guideHeaderOffsetYMin}
                  guideHeaderWidthPercent={overlayLayout.guideHeader.widthPercent}
                  sidebarCollapsedWidth={overlayLayout.sidebar.collapsedWidth}
                  sidebarExpandedWidth={overlayLayout.sidebar.expandedWidth}
                  sidebarHeightPercent={overlayLayout.sidebar.heightPercent}
                  sidebarOffsetY={overlayLayout.sidebar.offsetY}
                  sidebarOffsetYMax={sidebarOffsetYMax}
                  sidebarOffsetYMin={sidebarOffsetYMin}
                  titleBarOffsetX={overlayLayout.titleBar.offsetX}
                  titleBarOffsetXMax={titleBarOffsetXMax}
                  titleBarOffsetXMin={titleBarOffsetXMin}
                  titleBarOffsetY={overlayLayout.titleBar.offsetY}
                  titleBarOffsetYMax={titleBarOffsetYMax}
                  titleBarOffsetYMin={titleBarOffsetYMin}
                  onGuideHeaderOffsetXChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      guideHeader: {
                        ...overlayLayout.guideHeader,
                        offsetX: Math.max(guideHeaderOffsetXMin, Math.min(guideHeaderOffsetXMax, value)),
                      },
                    })
                  }}
                  onGuideHeaderOffsetYChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      guideHeader: {
                        ...overlayLayout.guideHeader,
                        offsetY: Math.max(guideHeaderOffsetYMin, Math.min(guideHeaderOffsetYMax, value)),
                      },
                    })
                  }}
                  onGuideHeaderWidthPercentChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      guideHeader: {
                        ...overlayLayout.guideHeader,
                        widthPercent: Math.max(50, Math.min(100, value)),
                      },
                    })
                  }}
                  onSidebarCollapsedWidthChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      sidebar: {
                        ...overlayLayout.sidebar,
                        collapsedWidth: Math.max(44, Math.min(96, value)),
                      },
                    })
                  }}
                  onSidebarExpandedWidthChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      sidebar: {
                        ...overlayLayout.sidebar,
                        expandedWidth: Math.max(140, Math.min(360, value)),
                      },
                    })
                  }}
                  onSidebarHeightPercentChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      sidebar: {
                        ...overlayLayout.sidebar,
                        heightPercent: Math.max(40, Math.min(100, value)),
                      },
                    })
                  }}
                  onSidebarOffsetYChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      sidebar: {
                        ...overlayLayout.sidebar,
                        offsetY: Math.max(sidebarOffsetYMin, Math.min(sidebarOffsetYMax, value)),
                      },
                    })
                  }}
                  onTitleBarOffsetXChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      titleBar: {
                        ...overlayLayout.titleBar,
                        offsetX: Math.max(titleBarOffsetXMin, Math.min(titleBarOffsetXMax, value)),
                      },
                    })
                  }}
                  onTitleBarOffsetYChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      titleBar: {
                        ...overlayLayout.titleBar,
                        offsetY: Math.max(titleBarOffsetYMin, Math.min(titleBarOffsetYMax, value)),
                      },
                    })
                  }}
                />
              </SettingCardSection>
              <SettingCardSection id="section-overlay-clickable-visibility">
                <p className="font-medium text-xs leading-none">
                  <Trans>Éléments cliquables</Trans>
                </p>
                <OverlaySlider
                  id="overlay-clickable-visibility"
                  label={<Trans>Visibilité (%)</Trans>}
                  max={100}
                  min={0}
                  onChange={(value) => {
                    setConf.mutate({
                      ...conf.data,
                      overlayClickableVisibility: value,
                    })
                  }}
                  value={conf.data.overlayClickableVisibility ?? 75}
                />
              </SettingCardSection>
              <SettingCardSection id="section-overlay-titlebar-layout">
                <p className="font-medium text-xs leading-none">
                  <Trans>Barre du haut</Trans>
                </p>
                <OverlaySlider
                  id="overlay-titlebar-offset-x"
                  label={<Trans>Décalage horizontal</Trans>}
                    max={titleBarOffsetXMax}
                    min={titleBarOffsetXMin}
                  onChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      titleBar: {
                        ...overlayLayout.titleBar,
                        offsetX: value,
                      },
                    })
                  }}
                  value={overlayLayout.titleBar.offsetX}
                />
                <OverlaySlider
                  id="overlay-titlebar-offset-y"
                  label={<Trans>Décalage vertical</Trans>}
                    max={titleBarOffsetYMax}
                    min={titleBarOffsetYMin}
                  onChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      titleBar: {
                        ...overlayLayout.titleBar,
                        offsetY: value,
                      },
                    })
                  }}
                  value={overlayLayout.titleBar.offsetY}
                />
              </SettingCardSection>
              <SettingCardSection id="section-overlay-sidebar-layout">
                <p className="font-medium text-xs leading-none">
                  <Trans>Rail d'onglets</Trans>
                </p>
                <OverlaySlider
                  id="overlay-sidebar-offset-y"
                  label={<Trans>Décalage vertical</Trans>}
                    max={sidebarOffsetYMax}
                    min={sidebarOffsetYMin}
                  onChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      sidebar: {
                        ...overlayLayout.sidebar,
                        offsetY: value,
                      },
                    })
                  }}
                  value={overlayLayout.sidebar.offsetY}
                />
                <OverlaySlider
                  id="overlay-sidebar-collapsed-width"
                  label={<Trans>Largeur fermée</Trans>}
                  max={96}
                  min={44}
                  onChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      sidebar: {
                        ...overlayLayout.sidebar,
                        collapsedWidth: value,
                      },
                    })
                  }}
                  value={overlayLayout.sidebar.collapsedWidth}
                />
                <OverlaySlider
                  id="overlay-sidebar-expanded-width"
                  label={<Trans>Largeur ouverte</Trans>}
                  max={360}
                  min={140}
                  onChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      sidebar: {
                        ...overlayLayout.sidebar,
                        expandedWidth: value,
                      },
                    })
                  }}
                  value={overlayLayout.sidebar.expandedWidth}
                />
                <OverlaySlider
                  id="overlay-sidebar-height-percent"
                  label={<Trans>Longueur (%)</Trans>}
                  max={100}
                  min={40}
                  onChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      sidebar: {
                        ...overlayLayout.sidebar,
                        heightPercent: value,
                      },
                    })
                  }}
                  value={overlayLayout.sidebar.heightPercent}
                />
              </SettingCardSection>
              <SettingCardSection id="section-overlay-guide-header-layout">
                <p className="font-medium text-xs leading-none">
                  <Trans>Bandeau du guide</Trans>
                </p>
                <OverlaySlider
                  id="overlay-guide-header-width"
                  label={<Trans>Largeur (%)</Trans>}
                  max={100}
                  min={50}
                  onChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      guideHeader: {
                        ...overlayLayout.guideHeader,
                        widthPercent: value,
                      },
                    })
                  }}
                  value={overlayLayout.guideHeader.widthPercent}
                />
                <OverlaySlider
                  id="overlay-guide-header-offset-x"
                  label={<Trans>Décalage horizontal</Trans>}
                    max={guideHeaderOffsetXMax}
                    min={guideHeaderOffsetXMin}
                  onChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      guideHeader: {
                        ...overlayLayout.guideHeader,
                        offsetX: value,
                      },
                    })
                  }}
                  value={overlayLayout.guideHeader.offsetX}
                />
                <OverlaySlider
                  id="overlay-guide-header-offset-y"
                  label={<Trans>Décalage vertical</Trans>}
                    max={guideHeaderOffsetYMax}
                    min={guideHeaderOffsetYMin}
                  onChange={(value) => {
                    updateOverlayLayout({
                      ...overlayLayout,
                      guideHeader: {
                        ...overlayLayout.guideHeader,
                        offsetY: value,
                      },
                    })
                  }}
                  value={overlayLayout.guideHeader.offsetY}
                />
              </SettingCardSection>
            </SettingCard>
          )}
          <SettingCard
            className="slot-[card-content]:pt-0 slot-[card-description]:text-xs"
            description={
              <Trans>
                Note : Les raccourcis déjà utilisés par d'autres applications (AMD Adrenalin, Nvidia App, etc.) ne
                peuvent pas être enregistrés. Supprimez-les d'abord dans ces applications.
              </Trans>
            }
            id="section-shortcuts"
            title={<Trans>Raccourcis clavier</Trans>}
          >
            <SettingCardSection id="section-shortcuts-inputs">
              <ShortcutInput
                description={t`Efface tous vos profils et paramètres (pas les guides)`}
                id="reset-conf"
                label={t`Réinitialiser la configuration`}
                onChange={async (value) => {
                  try {
                    await setConf.mutateAsync({
                      ...conf.data,
                      shortcuts: {
                        ...conf.data.shortcuts,
                        resetConf: value,
                      },
                    })
                    await reregisterShortcuts.mutateAsync()
                    toast.success(t`Raccourci mis à jour`)
                  } catch {
                    toast.error(t`Erreur lors de la mise à jour du raccourci`)
                  }
                }}
                value={conf.data.shortcuts?.resetConf}
              />
              <ShortcutInput
                id="go-previous-step"
                label={t`Étape précédente`}
                onChange={async (value) => {
                  try {
                    await setConf.mutateAsync({
                      ...conf.data,
                      shortcuts: {
                        ...conf.data.shortcuts,
                        goPreviousStep: value,
                      },
                    })
                    await reregisterShortcuts.mutateAsync()
                    toast.success(t`Raccourci mis à jour`)
                  } catch {
                    toast.error(t`Erreur lors de la mise à jour du raccourci`)
                  }
                }}
                value={conf.data.shortcuts?.goPreviousStep}
              />
              <ShortcutInput
                id="go-next-step"
                label={t`Étape suivante`}
                onChange={async (value) => {
                  try {
                    await setConf.mutateAsync({
                      ...conf.data,
                      shortcuts: {
                        ...conf.data.shortcuts,
                        goNextStep: value,
                      },
                    })
                    await reregisterShortcuts.mutateAsync()
                    toast.success(t`Raccourci mis à jour`)
                  } catch {
                    toast.error(t`Erreur lors de la mise à jour du raccourci`)
                  }
                }}
                value={conf.data.shortcuts?.goNextStep}
              />
              <ShortcutInput
                id="copy-current-step"
                label={t`Copier l'étape actuelle`}
                onChange={async (value) => {
                  try {
                    await setConf.mutateAsync({
                      ...conf.data,
                      shortcuts: {
                        ...conf.data.shortcuts,
                        copyCurrentStep: value,
                      },
                    })
                    await reregisterShortcuts.mutateAsync()
                    toast.success(t`Raccourci mis à jour`)
                  } catch {
                    toast.error(t`Erreur lors de la mise à jour du raccourci`)
                  }
                }}
                value={conf.data.shortcuts?.copyCurrentStep}
              />
            </SettingCardSection>
          </SettingCard>
          <SettingCard id="section-profiles-card" title={<Trans>Profils</Trans>}>
            <SettingCardSection id="section-profiles">
              <div className="w-full">
                <Profiles />
              </div>
            </SettingCardSection>
            <SettingCardSection id="section-create-profile">
              <Label className="text-xs" htmlFor="create-profile">
                <Trans>Créer un profil</Trans>
              </Label>
              <form
                className="flex flex-col gap-2"
                onSubmit={async (evt) => {
                  evt.preventDefault()
                  const form = evt.currentTarget

                  const profileName = form.newProfile.value as string

                  // Check if the profile name is not empty and if it doesn't already exist
                  if (profileName.trim() !== '' && !conf.data.profiles.find((p) => p.name === profileName.trim())) {
                    const id = await newId.mutateAsync()

                    const trimmedName = profileName.trim()

                    const newConf = {
                      ...conf.data,
                      profiles: [
                        ...conf.data.profiles,
                        {
                          id,
                          name: trimmedName,
                          progresses: [],
                        },
                      ],
                      profileInUse: id,
                    }

                    await setConf.mutateAsync(newConf)
                    await switchProfile(newConf, id)

                    createProfileRemote(trimmedName, id).then((result) => {
                      if (result.isOk()) {
                        const serverId = result.value
                        const currentConf = queryClient.getQueryData(confQuery.queryKey)
                        if (currentConf) {
                          setConf.mutate({
                            ...currentConf,
                            profiles: currentConf.profiles.map((p) =>
                              p.id === id ? { ...p, server_id: serverId } : p,
                            ),
                          })
                        }
                      }
                    })

                    toast.success(t`Profil créé avec succès`)

                    form.newProfile.value = ''
                  } else {
                    toast.error(t`Erreur lors de la création du profil. Vérifiez le nom du profil (nom unique).`)
                  }
                }}
              >
                <Input className="h-9" id="create-profile" name="newProfile" />
                <Button className="self-start" type="submit">
                  <span>
                    <Trans>Créer</Trans>
                  </span>
                  {newId.isError && <TriangleAlertIcon className="text-red-500" />}
                </Button>
              </form>
            </SettingCardSection>
          </SettingCard>
        </div>
      </PageScrollableContent>
    </Page>
  )
}
