use std::sync::Mutex;

use log::error;
use tauri::{AppHandle, Manager, Runtime};

use crate::conf::Conf;

#[derive(Debug, Default)]
struct VisibilityState {
    in_combat: bool,
    manual_hidden: bool,
    hidden_by_combat: bool,
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
            if hidden {
                state.hidden_by_combat = false;
            }
        }

        if let Some(window) = app.get_webview_window("main") {
            if hidden {
                if let Err(err) = window.hide() {
                    error!("[Visibility] failed to hide window manually: {}", err);
                }
            } else if let Err(err) = window.show() {
                error!("[Visibility] failed to show window manually: {}", err);
            } else if let Err(err) = window.set_focus() {
                error!("[Visibility] failed to focus window manually: {}", err);
            }
        }
    }

    pub fn sync_with_conf<R: Runtime>(&self, app: &AppHandle<R>, conf: &Conf) {
        let Some(window) = app.get_webview_window("main") else {
            return;
        };

        let mut should_show = false;
        let mut should_hide = false;

        {
            let mut state = self.state.lock().unwrap();

            if state.manual_hidden {
                should_hide = true;
                state.hidden_by_combat = false;
            } else {
                let should_hide_for_combat =
                    conf.overlay_mode && conf.overlay_hide_in_combat && state.in_combat;

                if should_hide_for_combat {
                    should_hide = true;
                    state.hidden_by_combat = true;
                } else if state.hidden_by_combat {
                    should_show = true;
                    state.hidden_by_combat = false;
                }
            }
        }

        if should_hide {
            if let Err(err) = window.hide() {
                error!(
                    "[Visibility] failed to hide window for combat/manual rule: {}",
                    err
                );
            }
        } else if should_show {
            if let Err(err) = window.show() {
                error!(
                    "[Visibility] failed to restore window visibility after combat: {}",
                    err
                );
            }
        }
    }

    pub fn set_in_combat<R: Runtime>(&self, app: &AppHandle<R>, conf: &Conf, in_combat: bool) {
        {
            let mut state = self.state.lock().unwrap();
            state.in_combat = in_combat;
        }

        self.sync_with_conf(app, conf);
    }
}
