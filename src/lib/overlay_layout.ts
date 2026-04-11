import { Conf, OverlayLayout } from '@/ipc/bindings.ts'
import { getProfile } from '@/lib/profile.ts'

export const OVERLAY_TITLE_BAR_WIDTH = 84
export const OVERLAY_TITLE_BAR_HEIGHT = 30
export const OVERLAY_GUIDE_HEADER_BASE_TOP = 70
export const OVERLAY_GUIDE_HEADER_HEIGHT = 40

type OverlayTitleBarLayoutRequired = Required<NonNullable<OverlayLayout['titleBar']>>
type OverlaySidebarLayoutRequired = Required<NonNullable<OverlayLayout['sidebar']>>
type OverlayGuideHeaderLayoutRequired = Required<NonNullable<OverlayLayout['guideHeader']>>

export type OverlayLayoutRequired = {
  titleBar: OverlayTitleBarLayoutRequired
  sidebar: OverlaySidebarLayoutRequired
  guideHeader: OverlayGuideHeaderLayoutRequired
}

export const DEFAULT_OVERLAY_LAYOUT: OverlayLayoutRequired = {
  titleBar: { offsetX: 0, offsetY: 0 },
  sidebar: { offsetY: 0, collapsedWidth: 56, expandedWidth: 224, heightPercent: 100 },
  guideHeader: { widthPercent: 80, offsetX: 0, offsetY: 0 },
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function getOverlayLayout(layout?: OverlayLayout): OverlayLayoutRequired {
  return {
    titleBar: {
      offsetX: layout?.titleBar?.offsetX ?? DEFAULT_OVERLAY_LAYOUT.titleBar.offsetX,
      offsetY: layout?.titleBar?.offsetY ?? DEFAULT_OVERLAY_LAYOUT.titleBar.offsetY,
    },
    sidebar: {
      offsetY: layout?.sidebar?.offsetY ?? DEFAULT_OVERLAY_LAYOUT.sidebar.offsetY,
      collapsedWidth: layout?.sidebar?.collapsedWidth ?? DEFAULT_OVERLAY_LAYOUT.sidebar.collapsedWidth,
      expandedWidth: layout?.sidebar?.expandedWidth ?? DEFAULT_OVERLAY_LAYOUT.sidebar.expandedWidth,
      heightPercent: layout?.sidebar?.heightPercent ?? DEFAULT_OVERLAY_LAYOUT.sidebar.heightPercent,
    },
    guideHeader: {
      widthPercent: layout?.guideHeader?.widthPercent ?? DEFAULT_OVERLAY_LAYOUT.guideHeader.widthPercent,
      offsetX: layout?.guideHeader?.offsetX ?? DEFAULT_OVERLAY_LAYOUT.guideHeader.offsetX,
      offsetY: layout?.guideHeader?.offsetY ?? DEFAULT_OVERLAY_LAYOUT.guideHeader.offsetY,
    },
  }
}

export function clampOverlayLayout(layout: OverlayLayoutRequired): OverlayLayoutRequired {
  const sidebarCollapsedWidth = clamp(layout.sidebar.collapsedWidth, 44, 96)
  const sidebarExpandedWidth = clamp(layout.sidebar.expandedWidth, 140, 360)

  return {
    titleBar: {
      offsetX: clamp(layout.titleBar.offsetX, 0, 4000),
      offsetY: clamp(layout.titleBar.offsetY, 0, 4000),
    },
    sidebar: {
      offsetY: clamp(layout.sidebar.offsetY, 0, 4000),
      collapsedWidth: sidebarCollapsedWidth,
      expandedWidth: Math.max(sidebarExpandedWidth, sidebarCollapsedWidth + 24),
      heightPercent: clamp(layout.sidebar.heightPercent, 40, 100),
    },
    guideHeader: {
      widthPercent: clamp(layout.guideHeader.widthPercent, 50, 100),
      offsetX: clamp(layout.guideHeader.offsetX, -4000, 4000),
      offsetY: clamp(layout.guideHeader.offsetY, -4000, 4000),
    },
  }
}

export function isOverlayEditModeEnabled(conf: Conf) {
  return getProfile(conf).overlayEditMode ?? false
}

export function withOverlayEditMode(conf: Conf, enabled: boolean): Conf {
  return {
    ...conf,
    profiles: conf.profiles.map((profile) =>
      profile.id === conf.profileInUse
        ? {
            ...profile,
            overlayEditMode: enabled,
          }
        : profile,
    ),
  }
}
