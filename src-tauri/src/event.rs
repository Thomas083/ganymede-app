pub enum Event {
    GoToNextGuideStep,
    GoToPreviousGuideStep,
    CombatStateChanged,
    OverlayVisibilityChanged,
    UpdateStarted,
    UpdateInProgress,
    UpdateFinished,
    UpdateError,
}

impl Into<&str> for Event {
    fn into(self) -> &'static str {
        match self {
            Event::GoToNextGuideStep => "go-to-next-guide-step",
            Event::GoToPreviousGuideStep => "go-to-previous-guide-step",
            Event::CombatStateChanged => "combat-state-changed",
            Event::OverlayVisibilityChanged => "overlay-visibility-changed",
            Event::UpdateStarted => "update-started",
            Event::UpdateInProgress => "update-in-progress",
            Event::UpdateFinished => "update-finished",
            Event::UpdateError => "update-error",
        }
    }
}
