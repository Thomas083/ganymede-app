use std::env;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use log::{debug, info, warn};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::combat_visual::{
    capture_dofus_visual_signature, infer_visual_combat_state, VISUAL_FRAME_SIZE,
};
use crate::conf::get_conf;
use crate::event::Event;
use crate::visibility_control::VisibilityController;

const START_TOKENS: [&str; 2] = ["GameFightStartingMessage", "GameFightJoinMessage"];
const END_TOKENS: [&str; 1] = ["GameFightEndMessage"];
const CONTEXT_DESTROY_TOKEN: &str = "GameContextDestroyMessage";
const ROLEPLAY_RETURN_TOKENS: [&str; 5] = [
    "RoleplayContextFrame",
    "GameRolePlayShowActorMessage",
    "MapComplementaryInformationsDataMessage",
    "GameMapMovementMessage",
    "RoleplayWorldFrame",
];
const DOFUS3_START_TOKENS: [&str; 1] = ["Core.UILogic.Fight."];
const DOFUS3_END_TOKENS: [&str; 4] = [
    "Core.UILogic.Quest.",
    "Core.UILogic.Inventory.",
    "Core.UILogic.Crafting.",
    "Core.UILogic.GameUICore.",
];

const STATE_DEBOUNCE: Duration = Duration::from_millis(200);
const LOOP_SLEEP: Duration = Duration::from_millis(250);
const CONF_REFRESH_INTERVAL: Duration = Duration::from_secs(3);
const VISUAL_POLL_INTERVAL: Duration = Duration::from_millis(500);
const INITIAL_SCAN_BYTES: u64 = 64 * 1024;
const ROTATION_REOPEN_INTERVAL: Duration = Duration::from_millis(700);
const CONTEXT_DESTROY_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug)]
struct TailState {
    path: PathBuf,
    offset: u64,
    carry: String,
    last_rotation_check: Instant,
}

#[derive(Debug)]
struct ParserState {
    in_combat: bool,
    pending_context_destroy_until: Option<Instant>,
}

impl ParserState {
    fn new() -> Self {
        Self {
            in_combat: false,
            pending_context_destroy_until: None,
        }
    }

    fn apply_line(&mut self, line: &str, now: Instant) -> Option<bool> {
        // DOFUS 3 logs may not expose GameFight* message names (obfuscated protocol).
        // Fallback on UI namespace traces from dofus-dofus3 log files.
        if DOFUS3_START_TOKENS.iter().any(|token| line.contains(token)) {
            self.pending_context_destroy_until = None;
            if !self.in_combat {
                self.in_combat = true;
                return Some(true);
            }
            return None;
        }

        if DOFUS3_END_TOKENS.iter().any(|token| line.contains(token)) {
            self.pending_context_destroy_until = None;
            if self.in_combat {
                self.in_combat = false;
                return Some(false);
            }
            return None;
        }

        if START_TOKENS.iter().any(|token| line.contains(token)) {
            self.pending_context_destroy_until = None;
            if !self.in_combat {
                self.in_combat = true;
                return Some(true);
            }
            return None;
        }

        if END_TOKENS.iter().any(|token| line.contains(token)) {
            self.pending_context_destroy_until = None;
            if self.in_combat {
                self.in_combat = false;
                return Some(false);
            }
            return None;
        }

        if line.contains(CONTEXT_DESTROY_TOKEN) {
            self.pending_context_destroy_until = Some(now + CONTEXT_DESTROY_TIMEOUT);
            return None;
        }

        if let Some(deadline) = self.pending_context_destroy_until {
            if now <= deadline
                && ROLEPLAY_RETURN_TOKENS
                    .iter()
                    .any(|token| line.contains(token))
            {
                self.pending_context_destroy_until = None;
                if self.in_combat {
                    self.in_combat = false;
                    return Some(false);
                }
            } else if now > deadline {
                self.pending_context_destroy_until = None;
            }
        }

        None
    }
}

fn to_lines(buffer: &str) -> Vec<&str> {
    buffer.lines().collect()
}

fn visual_references_are_usable(in_ref: &[u8], out_ref: &[u8]) -> bool {
    if in_ref.len() != VISUAL_FRAME_SIZE || out_ref.len() != VISUAL_FRAME_SIZE {
        return false;
    }

    let mut sum = 0u64;
    for (a, b) in in_ref.iter().zip(out_ref.iter()) {
        sum += (*a as i16 - *b as i16).unsigned_abs() as u64;
    }
    let avg = sum as f64 / VISUAL_FRAME_SIZE as f64;
    avg >= 0.25
}

fn newest_matching_log(dir: &Path, prefix: &str, suffix: &str) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    let mut selected: Option<(PathBuf, std::time::SystemTime)> = None;

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(file_name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if !file_name.starts_with(prefix)
            || !file_name.ends_with(suffix)
            || file_name.contains(".prev.")
        {
            continue;
        }

        let modified = path
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);

        match &selected {
            Some((_, current_modified)) if *current_modified >= modified => {}
            _ => {
                selected = Some((path.clone(), modified));
            }
        }
    }

    selected.map(|(path, _)| path)
}

fn auto_detect_log_paths() -> Vec<PathBuf> {
    let mut paths = vec![];

    #[cfg(windows)]
    {
        if let Ok(local_app_data) = env::var("LOCALAPPDATA") {
            let root = PathBuf::from(local_app_data);
            paths.push(
                root.join("Ankama")
                    .join("Dofus")
                    .join("app")
                    .join("application.log"),
            );
            paths.push(
                root.join("Ankama")
                    .join("Dofus Retro")
                    .join("app")
                    .join("application.log"),
            );
            paths.push(
                root.join("Ankama")
                    .join("Dofus-dofus3")
                    .join("application.log"),
            );
            paths.push(
                root.join("Ankama")
                    .join("zaap")
                    .join("games")
                    .join("dofus")
                    .join("logs")
                    .join("application.log"),
            );
            paths.push(
                root.join("Ankama")
                    .join("zaap")
                    .join("games")
                    .join("retro")
                    .join("logs")
                    .join("application.log"),
            );
        }
        if let Ok(app_data) = env::var("APPDATA") {
            let roaming = PathBuf::from(app_data);
            let dofus3_games_logs = roaming.join("zaap").join("gamesLogs").join("dofus-dofus3");
            let retro_games_logs = roaming.join("zaap").join("gamesLogs").join("dofus-retro");

            if let Some(path) = newest_matching_log(&dofus3_games_logs, "dofus.", ".log") {
                paths.push(path);
            }
            if let Some(path) = newest_matching_log(&retro_games_logs, "dofus.", ".log") {
                paths.push(path);
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        if let Ok(home) = env::var("HOME") {
            let root = PathBuf::from(home);
            paths.push(
                root.join(".config")
                    .join("Ankama")
                    .join("Dofus")
                    .join("app")
                    .join("application.log"),
            );
            paths.push(
                root.join(".config")
                    .join("Ankama")
                    .join("Dofus Retro")
                    .join("app")
                    .join("application.log"),
            );
        }
    }

    #[cfg(target_os = "macos")]
    {
        if let Ok(home) = env::var("HOME") {
            let root = PathBuf::from(home);
            paths.push(
                root.join("Library")
                    .join("Application Support")
                    .join("Ankama")
                    .join("Dofus")
                    .join("app")
                    .join("application.log"),
            );
            paths.push(
                root.join("Library")
                    .join("Application Support")
                    .join("Ankama")
                    .join("Dofus Retro")
                    .join("app")
                    .join("application.log"),
            );
        }
    }

    paths
}

fn resolve_paths_from_conf(custom_paths: &[String]) -> Vec<PathBuf> {
    if !custom_paths.is_empty() {
        custom_paths.iter().map(PathBuf::from).collect()
    } else {
        auto_detect_log_paths()
    }
}

fn choose_active_path(paths: &[PathBuf]) -> Option<PathBuf> {
    let mut selected: Option<(PathBuf, i32, std::time::SystemTime)> = None;

    for path in paths {
        if !path.exists() {
            continue;
        }
        let priority = path_priority(path);

        let modified = path
            .metadata()
            .ok()
            .and_then(|metadata| metadata.modified().ok())
            .unwrap_or(std::time::SystemTime::UNIX_EPOCH);

        match &selected {
            Some((_, current_priority, current_modified))
                if *current_priority > priority
                    || (*current_priority == priority && *current_modified >= modified) => {}
            _ => {
                selected = Some((path.clone(), priority, modified));
            }
        }
    }

    selected.map(|(path, _, _)| path)
}

fn path_priority(path: &Path) -> i32 {
    let path_str = path
        .to_string_lossy()
        .to_ascii_lowercase()
        .replace('\\', "/");

    if path_str.contains("/zaap/gameslogs/dofus-dofus3/")
        || path_str.contains("/zaap/gameslogs/dofus-retro/")
    {
        return 400;
    }
    if path_str.contains("/ankama/dofus-dofus3/") {
        return 300;
    }
    if path_str.contains("/ankama/dofus/app/application.log")
        || path_str.contains("/ankama/dofus retro/app/application.log")
    {
        return 250;
    }
    if path_str.contains("/ankama/zaap/games/dofus/logs/application.log")
        || path_str.contains("/ankama/zaap/games/retro/logs/application.log")
    {
        return 200;
    }
    if path_str.contains("application.log") {
        return 100;
    }

    0
}

fn read_tail_for_initial_state(path: &Path) -> (bool, String) {
    let mut file = match File::open(path) {
        Ok(file) => file,
        Err(_) => return (false, String::new()),
    };

    let len = match file.metadata() {
        Ok(metadata) => metadata.len(),
        Err(_) => return (false, String::new()),
    };

    let offset = len.saturating_sub(INITIAL_SCAN_BYTES);
    if file.seek(SeekFrom::Start(offset)).is_err() {
        return (false, String::new());
    }

    let mut content = String::new();
    if file.read_to_string(&mut content).is_err() {
        return (false, String::new());
    }

    let mut parser = ParserState::new();
    let now = Instant::now();
    for line in to_lines(&content) {
        let _ = parser.apply_line(line, now);
    }

    (parser.in_combat, content)
}

fn read_new_chunk(path: &Path, offset: &mut u64, carry: &mut String) -> Option<Vec<String>> {
    let mut file = File::open(path).ok()?;
    let metadata = file.metadata().ok()?;
    let len = metadata.len();

    if len < *offset {
        *offset = 0;
        carry.clear();
    }

    if file.seek(SeekFrom::Start(*offset)).is_err() {
        return None;
    }

    let mut chunk = String::new();
    if file.read_to_string(&mut chunk).is_err() {
        return None;
    }

    *offset = len;

    if chunk.is_empty() && carry.is_empty() {
        return Some(vec![]);
    }

    let mut content = String::new();
    content.push_str(carry);
    content.push_str(&chunk);

    let mut lines = vec![];
    if content.ends_with('\n') {
        lines.extend(content.lines().map(|line| line.to_string()));
        carry.clear();
    } else {
        let mut split = content
            .lines()
            .map(|line| line.to_string())
            .collect::<Vec<_>>();
        if let Some(last) = split.pop() {
            *carry = last;
        } else {
            carry.clear();
        }
        lines.extend(split);
    }

    Some(lines)
}

fn refresh_tail_state(
    current: &mut Option<TailState>,
    configured_paths: &[PathBuf],
    parser_state: &mut ParserState,
) -> Option<bool> {
    let Some(active_path) = choose_active_path(configured_paths) else {
        let had_active_path = current.is_some();
        *current = None;
        parser_state.in_combat = false;
        parser_state.pending_context_destroy_until = None;
        return if had_active_path { Some(false) } else { None };
    };

    let changed_path = current
        .as_ref()
        .map(|state| state.path != active_path)
        .unwrap_or(true);

    if changed_path {
        let mut offset = 0;
        let mut carry = String::new();

        if let Ok(metadata) = std::fs::metadata(&active_path) {
            offset = metadata.len();
        }

        let (initial_in_combat, initial_chunk) = read_tail_for_initial_state(&active_path);
        parser_state.in_combat = initial_in_combat;
        parser_state.pending_context_destroy_until = None;

        if !initial_chunk.is_empty() && !initial_chunk.ends_with('\n') {
            if let Some(last) = initial_chunk.lines().last() {
                carry = last.to_string();
            }
        }

        *current = Some(TailState {
            path: active_path.clone(),
            offset,
            carry,
            last_rotation_check: Instant::now(),
        });

        info!(
            "[CombatWatcher] monitoring log path: {} (priority={})",
            active_path.display(),
            path_priority(&active_path)
        );
        return Some(parser_state.in_combat);
    }

    None
}

fn emit_and_apply<R: Runtime>(app: &AppHandle<R>, in_combat: bool) {
    let conf = match get_conf(app) {
        Ok(conf) => conf,
        Err(err) => {
            warn!(
                "[CombatWatcher] failed to read conf while applying combat state: {}",
                err
            );
            return;
        }
    };

    app.state::<VisibilityController>()
        .set_in_combat(app, &conf, in_combat);

    if let Err(err) = app.emit(Event::CombatStateChanged.into(), in_combat) {
        warn!(
            "[CombatWatcher] failed to emit combat-state-changed: {}",
            err
        );
    }
}

pub fn start_combat_state_watcher<R: Runtime + 'static>(app: &AppHandle<R>) {
    let app_handle = app.clone();

    std::thread::spawn(move || {
        let mut parser_state = ParserState::new();
        let mut tail_state: Option<TailState> = None;
        let mut tracked_paths: Vec<PathBuf> = vec![];
        let mut detection_enabled = true;
        let mut visual_in_ref: Vec<u8> = vec![];
        let mut visual_out_ref: Vec<u8> = vec![];
        let mut visual_roi = None;
        let mut last_visual_poll = Instant::now() - VISUAL_POLL_INTERVAL;
        let mut last_conf_refresh = Instant::now() - CONF_REFRESH_INTERVAL;
        let mut last_emitted_state: Option<bool> = None;
        let mut pending_state: Option<(bool, Instant)> = None;

        loop {
            if last_conf_refresh.elapsed() >= CONF_REFRESH_INTERVAL {
                match get_conf(&app_handle) {
                    Ok(conf) => {
                        detection_enabled = conf.combat_detection_enabled;
                        visual_in_ref = conf.combat_visual_in_combat_ref.clone();
                        visual_out_ref = conf.combat_visual_out_of_combat_ref.clone();
                        visual_roi = conf.combat_visual_roi.clone();

                        if !detection_enabled {
                            tracked_paths.clear();
                            tail_state = None;
                            parser_state.in_combat = false;
                            parser_state.pending_context_destroy_until = None;
                            pending_state = Some((false, Instant::now() + STATE_DEBOUNCE));
                        } else {
                            tracked_paths = resolve_paths_from_conf(&conf.dofus_log_paths);
                        }
                    }
                    Err(err) => {
                        warn!("[CombatWatcher] failed to read conf: {}", err);
                    }
                }
                last_conf_refresh = Instant::now();
            }

            let visual_ready = visual_references_are_usable(&visual_in_ref, &visual_out_ref);

            if detection_enabled
                && visual_ready
                && last_visual_poll.elapsed() >= VISUAL_POLL_INTERVAL
            {
                last_visual_poll = Instant::now();
                if let Some(signature) = capture_dofus_visual_signature() {
                    if let Some(new_state) = infer_visual_combat_state(
                        &signature,
                        &visual_in_ref,
                        &visual_out_ref,
                        visual_roi.as_ref(),
                    ) {
                        pending_state = Some((new_state, Instant::now() + STATE_DEBOUNCE));
                    }
                }
            } else if detection_enabled {
                if let Some(initial_state) =
                    refresh_tail_state(&mut tail_state, &tracked_paths, &mut parser_state)
                {
                    pending_state = Some((initial_state, Instant::now() + STATE_DEBOUNCE));
                }
                let has_active_path = tail_state.is_some();

                if has_active_path {
                    if let Some(state) = tail_state.as_mut() {
                        if state.last_rotation_check.elapsed() >= ROTATION_REOPEN_INTERVAL {
                            state.last_rotation_check = Instant::now();
                            if !state.path.exists() {
                                debug!(
                                    "[CombatWatcher] active log disappeared, waiting for reattach"
                                );
                                tail_state = None;
                            }
                        }
                    }
                }

                if let Some(state) = tail_state.as_mut() {
                    if let Some(lines) =
                        read_new_chunk(&state.path, &mut state.offset, &mut state.carry)
                    {
                        let now = Instant::now();
                        for line in lines {
                            if let Some(new_state) = parser_state.apply_line(&line, now) {
                                pending_state = Some((new_state, Instant::now() + STATE_DEBOUNCE));
                            }
                        }
                    }
                }
            }

            if let Some((state, deadline)) = pending_state {
                if Instant::now() >= deadline && Some(state) != last_emitted_state {
                    last_emitted_state = Some(state);
                    pending_state = None;
                    emit_and_apply(&app_handle, state);
                }
            }

            std::thread::sleep(LOOP_SLEEP);
        }
    });
}
