import { useLingui } from '@lingui/react/macro'
import { useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { GuideFrame } from '@/components/guide_frame.tsx'
import { Position } from '@/components/position.tsx'
import { StepProgress } from '@/components/step_progress/step_progress.tsx'
import { useGuide } from '@/hooks/use_guide.ts'
import { useScrollToTop } from '@/hooks/use_scroll_to_top.ts'
import { useStepNoteReminder } from '@/hooks/use_step_note_reminder.tsx'
import { onCopyCurrentGuideStep } from '@/ipc/guides.ts'
import { getProfile } from '@/lib/profile.ts'
import { queueProgressSync } from '@/lib/sync_progress_queue.ts'
import { cn } from '@/lib/utils.ts'
import { useSetConf } from '@/mutations/set_conf.mutation.ts'
import { confQuery } from '@/queries/conf.query.ts'
import { GuideActionsDropdown } from '@/routes/_app/guides/-$id/guide_actions_dropdown.tsx'

import { GuideNotesDialog, GuideNotesMenuTrigger } from './guide_notes_dialog.tsx'
import { ReportDialog, ReportDialogTrigger } from './report_dialog.tsx'
import { StepNoteDialog } from './step_note_dialog.tsx'
import { SummaryDialog, SummaryDialogTrigger } from './summary_dialog.tsx'

const useOnCopyStep = (cb: () => void) => {
  useEffect(() => {
    const unlisten = onCopyCurrentGuideStep().on(cb)

    return () => {
      unlisten.then((cb) => cb())
    }
  }, [cb])
}

export function GuidePage({ id, stepIndex: index }: { id: number; stepIndex: number }) {
  const { t } = useLingui()
  const guide = useGuide(id)
  const step = guide.steps[index]
  const stepMax = guide.steps.length - 1
  const scrollableRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const conf = useSuspenseQuery(confQuery)
  const setConf = useSetConf()
  const navigate = useNavigate()
  const isOverlayMode = conf.data.overlayMode ?? false
  const overlaySidebarWidth = isOverlayMode ? (conf.data.overlayLayout?.sidebar?.collapsedWidth ?? 56) : 0
  const overlayHeader = conf.data.overlayLayout?.guideHeader
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1280
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720
  const guideHeaderTopBase = 70
  const guideHeaderHeight = 40
  const overlayHeaderWidthPercent = overlayHeader?.widthPercent ?? 80
  const guideHeaderContainerWidth = Math.max(240, ((viewportWidth - overlaySidebarWidth) * overlayHeaderWidthPercent) / 100)
  const overlayHeaderLeft = isOverlayMode
    ? Math.max(
        0,
        Math.min(
          overlaySidebarWidth + (overlayHeader?.offsetX ?? 0),
          Math.max(0, viewportWidth - guideHeaderContainerWidth),
        ),
      )
    : 0
  const overlayHeaderTopOffset = isOverlayMode
    ? Math.max(
        -guideHeaderTopBase,
        Math.min(
          overlayHeader?.offsetY ?? 0,
          Math.max(-guideHeaderTopBase, viewportHeight - guideHeaderTopBase - guideHeaderHeight),
        ),
      )
    : 0
  const [noteOpen, setNoteOpen] = useState(false)
  const [noteStepIndex, setNoteStepIndex] = useState(index)
  const [guideNotesOpen, setGuideNotesOpen] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const showSummary = guide.game_type !== 'wakfu'
  const showReport = guide.status === 'gp' || guide.status === 'certified'

  useScrollToTop(scrollableRef, [step])
  useStepNoteReminder(guide.id, index)

  const changeStep = async (nextStep: number) => {
    const clampedStep = nextStep < 0 ? 0 : nextStep >= guide.steps.length ? stepMax : nextStep
    const updatedAt = new Date().toISOString()

    const newConf = {
      ...conf.data,
      profiles: conf.data.profiles.map((p) => {
        if (p.id === conf.data.profileInUse) {
          const existingProgress = p.progresses.find((progress) => progress.id === guide.id)

          return {
            ...p,
            progresses: existingProgress
              ? p.progresses.map((progress) => {
                  if (progress.id === guide.id) {
                    return {
                      ...progress,
                      currentStep: clampedStep,
                      updatedAt,
                    }
                  }

                  return progress
                })
              : [
                  ...p.progresses,
                  {
                    id: guide.id,
                    currentStep: clampedStep,
                    steps: {},
                    updatedAt,
                  },
                ],
          }
        }

        return p
      }),
    }

    setConf.mutate(newConf)

    const profile = getProfile(newConf)
    const progress = profile.progresses.find((p) => p.id === guide.id)
    queueProgressSync(profile.server_id, guide.id, clampedStep, progress?.steps ?? {}, queryClient, guide.name)

    await navigate({
      to: '/guides/$id',
      params: {
        id: guide.id,
      },
      search: {
        step: nextStep,
      },
    })
  }

  const onClickPrevious = async (): Promise<boolean> => {
    if (index === 0) {
      return false
    }

    await changeStep(index - 1)

    return true
  }

  const onClickNext = async (): Promise<boolean> => {
    if (index === stepMax) {
      return false
    }

    await changeStep(index + 1)

    return true
  }

  const onChangeStep = async (stepIndex: number): Promise<boolean> => {
    if (index === stepIndex) {
      return false
    }

    await changeStep(stepIndex)

    return true
  }

  const handleOpenNote = () => {
    setNoteStepIndex(index)
    setNoteOpen(true)
  }

  const handleEditStep = (step: number) => {
    setGuideNotesOpen(false)
    setNoteStepIndex(step)
    setNoteOpen(true)
  }

  const handleGoToStep = (step: number) => {
    setGuideNotesOpen(false)
    onChangeStep(step)
  }

  useOnCopyStep(() => {
    toast
      .promise(writeText((index + 1).toString()), {
        success: t`Le numéro de l'étape (${index + 1}) a été copié dans le presse-papiers.`,
        error: t`Erreur lors de la copie du numéro de l'étape (${index + 1}).`,
        loading: t`Copie du numéro de l'étape (${index + 1})...`,
      })
      .unwrap()
  })

  // Use theme-aware background color with opacity via CSS color-mix
  const bgColor = `color-mix(in srgb, var(--color-surface-page) ${conf.data.opacity * 100}%, transparent)`
  const isSmallGuide = conf.data.guideDisplay === 'Small'

  return (
    <div
      className={cn(
        'scroller mt-[40px] flex h-[calc(100vh-var(--spacing-titlebar)-40px-40px)] flex-col overflow-x-hidden overflow-y-scroll pb-2',
        isOverlayMode && 'ml-0',
      )}
      ref={scrollableRef}
      style={{ backgroundColor: bgColor }}
    >
      <header
        className={cn('fixed top-[70px] z-10', !isSmallGuide && 'sm:top-[66px]')}
        style={{
          backgroundColor: bgColor,
          left: isOverlayMode ? `${overlayHeaderLeft}px` : 0,
          right: 0,
          transform: isOverlayMode ? `translateY(${overlayHeaderTopOffset}px)` : undefined,
        }}
      >
        <div
          className={cn('flex h-10 items-center p-1', isOverlayMode && 'mx-auto min-w-0')}
          style={isOverlayMode ? { width: `${overlayHeader?.widthPercent ?? 80}%` } : undefined}
        >
          {step && (
            <>
              <div className={cn('flex w-16 shrink-0 items-center justify-start pl-1', isOverlayMode && 'w-10 pl-0')}>
                {step.map !== null && step.map.toLowerCase() !== 'nomap' && (
                  <Position compact={isOverlayMode} pos_x={step.pos_x} pos_y={step.pos_y} />
                )}
              </div>

              <div className="flex flex-1 items-center justify-center">
                <StepProgress
                  compact={isOverlayMode}
                  currentIndex={index}
                  key={`${guide.id}-${index}`}
                  maxIndex={stepMax}
                  onChangeStep={changeStep}
                  onNext={onClickNext}
                  onPrevious={onClickPrevious}
                />
              </div>

              <div
                className={cn(
                  'hidden w-20 shrink-0 items-center justify-end pr-1 xs:flex sm:w-24',
                  isOverlayMode && 'w-10 gap-0.5 pr-0 sm:w-10',
                )}
              >
                <GuideNotesMenuTrigger
                  guideId={guide.id}
                  onOpenGuideNotes={() => setGuideNotesOpen(true)}
                  onOpenNote={handleOpenNote}
                  stepIndex={index}
                />
                {showSummary && (
                  <SummaryDialogTrigger compact={isOverlayMode} onClick={() => setSummaryOpen(true)} />
                )}
                {showReport && <ReportDialogTrigger compact={isOverlayMode} onClick={() => setReportOpen(true)} />}
              </div>
              <div className="flex w-fit shrink-0 items-center justify-end pr-1 xs:hidden">
                <GuideActionsDropdown
                  guideId={guide.id}
                  onOpenGuideNotes={() => setGuideNotesOpen(true)}
                  onOpenNote={handleOpenNote}
                  onOpenReport={() => setReportOpen(true)}
                  onOpenSummary={() => setSummaryOpen(true)}
                  showReport={showReport}
                  showSummary={showSummary}
                  stepIndex={index}
                />
              </div>
            </>
          )}
        </div>
      </header>
      <StepNoteDialog guideId={guide.id} onOpenChange={setNoteOpen} open={noteOpen} stepIndex={noteStepIndex} />
      <GuideNotesDialog
        guideId={guide.id}
        onEditStep={handleEditStep}
        onGoToStep={handleGoToStep}
        onOpenChange={setGuideNotesOpen}
        open={guideNotesOpen}
      />
      {showSummary && (
        <SummaryDialog
          guideId={guide.id}
          onChangeStep={onChangeStep}
          onOpenChange={setSummaryOpen}
          open={summaryOpen}
        />
      )}
      {showReport && (
        <ReportDialog guideId={guide.id} onOpenChange={setReportOpen} open={reportOpen} stepIndex={index} />
      )}
      {step && (
        <GuideFrame
          className={cn(
            'guide px-2 pt-2 leading-5',
            !isSmallGuide && 'xs:px-3 xs:pt-3 sm:px-4 sm:pt-4',
            isOverlayMode && 'pl-3 xs:pl-4 sm:pl-5',
            conf.data.fontSize === 'ExtraSmall' && 'text-xs',
            conf.data.fontSize === 'Small' && 'text-sm leading-4',
            conf.data.fontSize === 'Large' && 'text-md leading-5',
            conf.data.fontSize === 'ExtraLarge' && 'text-lg leading-6',
          )}
          guideId={guide.id}
          html={step.web_text}
          stepIndex={index}
        />
      )}
    </div>
  )
}
