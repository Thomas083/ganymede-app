use std::sync::Mutex;

use log::error;
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::conf::Conf;
use crate::event::Event;
use crate::overlay::OverlayManager;

#[derive(Debug, Default)]
struct VisibilityState {
    manual_hidden: bool,
}

#[derive(Debug, Default)]
pub struct VisibilityController {
    state: Mutex<VisibilityState>,
}

impl VisibilityController {
    pub fn set_manual_hidden<R: Runtime>(&self, app: &AppHandle<R>, hidden: bool) {
        {
            let mut state = self.state.lock().unwrap();
            state.manual_hidden = hidden;
        }

        if let Some(window) = app.get_webview_window("main") {
            if hidden {
                app.state::<OverlayManager>()
                    .set_interactive_regions(vec![]);
                let _ = window.set_ignore_cursor_events(true);

                if let Err(err) = window.hide() {
                    error!("[Visibility] failed to hide window manually: {}", err);
                }
                let _ = app.emit(Event::OverlayVisibilityChanged.into(), false);
            } else {
                let _ = window.set_ignore_cursor_events(true);

                if let Err(err) = window.show() {
                    error!("[Visibility] failed to show window manually: {}", err);
                    return;
                }

                let _ = app.emit(Event::OverlayVisibilityChanged.into(), true);

                if let Err(err) = window.set_focus() {
                    error!("[Visibility] failed to focus window manually: {}", err);
                }
            }
        }
    }

    pub fn sync_with_conf<R: Runtime>(&self, app: &AppHandle<R>, conf: &Conf) {
        let _ = conf;
        let Some(window) = app.get_webview_window("main") else {
            return;
        };

        let mut should_hide = false;

        {
            let state = self.state.lock().unwrap();
            if state.manual_hidden {
                should_hide = true;
            }
        }

        if should_hide {
            if let Err(err) = window.hide() {
                error!(
                    "[Visibility] failed to hide window for combat/manual rule: {}",
                    err
                );
            }
        }
    }

    pub fn set_in_combat<R: Runtime>(&self, app: &AppHandle<R>, conf: &Conf, in_combat: bool) {
        let _ = in_combat;
        self.sync_with_conf(app, conf);
    }
}
