use std::{borrow::BorrowMut, collections::HashMap, fs};

use log::{debug, info};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime, Window};

use crate::overlay::OverlayManager;
use crate::tauri_api_ext::ConfPathExt;
use crate::visibility_control::VisibilityController;

// Constants

const DEFAULT_LEVEL: u32 = 200;

const fn default_level() -> u32 {
    DEFAULT_LEVEL
}

const fn default_overlay_edit_mode() -> bool {
    false
}

const fn default_auto_open_guides() -> bool {
    true
}

const fn default_overlay_mode() -> bool {
    false
}

const fn default_overlay_hide_in_combat() -> bool {
    true
}

const fn default_combat_detection_enabled() -> bool {
    true
}

fn default_dofus_log_paths() -> Vec<String> {
    vec![]
}

const fn default_overlay_clickable_visibility() -> u32 {
    75
}

const fn default_overlay_title_bar_offset_x() -> i32 {
    0
}

const fn default_overlay_title_bar_offset_y() -> i32 {
    0
}

const fn default_overlay_sidebar_offset_y() -> i32 {
    0
}

const fn default_overlay_sidebar_collapsed_width() -> u32 {
    56
}

const fn default_overlay_sidebar_expanded_width() -> u32 {
    224
}

const fn default_overlay_sidebar_height_percent() -> u32 {
    100
}

const fn default_overlay_guide_header_width_percent() -> u32 {
    80
}

const fn default_overlay_guide_header_offset_x() -> i32 {
    0
}

const fn default_overlay_guide_header_offset_y() -> i32 {
    0
}

fn default_reset_conf_shortcut() -> String {
    "Alt+Shift+P".to_string()
}

fn default_go_next_step_shortcut() -> String {
    "CommandOrControl+Shift+E".to_string()
}

fn default_go_previous_step_shortcut() -> String {
    "CommandOrControl+Shift+A".to_string()
}

fn default_copy_current_step_shortcut() -> String {
    "CommandOrControl+Shift+C".to_string()
}

fn default_toggle_visibility_shortcut() -> String {
    "CommandOrControl+Shift+H".to_string()
}

const fn default_auto_travel_step_source() -> AutoTravelStepSource {
    AutoTravelStepSource::Current
}

// Enums

#[derive(Debug, Serialize, thiserror::Error, taurpc::specta::Type)]
#[specta(rename = "ConfError")]
pub enum Error {
    #[error("failed to get conf, file is malformed")]
    Malformed(#[from] crate::json::Error),
    #[error("failed to create conf dir: {0}")]
    CreateConfDir(String),
    #[error("failed to get conf dir: {0}")]
    ConfDir(String),
    #[error("failed to serialize conf")]
    SerializeConf(crate::json::Error),
    #[error("unhandled io error: {0}")]
    UnhandledIo(String),
    #[error("failed to save conf: {0}")]
    SaveConf(String),
    #[error("failed to get profile in use")]
    GetProfileInUse,
    #[error("failed to reset conf: {0}")]
    ResetConf(Box<Error>),
}

#[derive(Debug, Clone, Serialize, Deserialize, taurpc::specta::Type)]
pub enum ConfLang {
    En,
    Fr,
    Es,
    Pt,
}

#[derive(Debug, Clone, Serialize, Deserialize, taurpc::specta::Type)]
pub enum ConfTheme {
    Default,
    Standard,
    Bonta,
    Brakmar,
    Tribute,
    GoldSteel,
    Belladone,
    Unicorn,
    Emerald,
    Sufokia,
    Pandala,
    Wabbit,
}

#[derive(Debug, Clone, Serialize, Deserialize, taurpc::specta::Type)]
pub enum FontSize {
    ExtraSmall,
    Small,
    Normal,
    Large,
    ExtraLarge,
}

#[derive(Debug, Clone, Serialize, Deserialize, taurpc::specta::Type)]
pub enum GuideDisplay {
    Dynamic,
    Small,
}

#[derive(Debug, Clone, Serialize, Deserialize, taurpc::specta::Type)]
pub enum AutoTravelStepSource {
    Current,
    Next,
}

// Structs

#[derive(Debug)]
#[taurpc::ipc_type]
#[serde(rename_all = "camelCase")]
pub struct Shortcuts {
    #[serde(default = "default_reset_conf_shortcut")]
    pub reset_conf: String,
    #[serde(default = "default_go_next_step_shortcut")]
    pub go_next_step: String,
    #[serde(default = "default_go_previous_step_shortcut")]
    pub go_previous_step: String,
    #[serde(default = "default_copy_current_step_shortcut")]
    pub copy_current_step: String,
    #[serde(default = "default_toggle_visibility_shortcut")]
    pub toggle_visibility: String,
}

#[derive(Debug)]
#[taurpc::ipc_type]
pub struct Profile {
    pub id: String,
    pub name: String,
    #[serde(default = "default_level")]
    pub level: u32,
    pub progresses: Vec<Progress>,
    #[serde(default)]
    pub server_id: Option<u32>,
    #[serde(default = "default_overlay_edit_mode", rename = "overlayEditMode")]
    pub overlay_edit_mode: bool,
}

#[derive(Debug)]
#[taurpc::ipc_type]
pub struct ConfStep {
    pub checkboxes: Vec<u32>,
}

#[derive(Debug)]
#[taurpc::ipc_type]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub id: u32, // guide id
    pub current_step: u32,
    pub steps: HashMap<u32, ConfStep>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug)]
#[taurpc::ipc_type]
pub struct AutoPilot {
    pub name: String,
    pub position: String,
}

#[derive(Debug)]
#[taurpc::ipc_type]
pub struct Note {
    pub name: String,
    pub text: String,
}

#[derive(Debug)]
#[taurpc::ipc_type]
#[serde(rename_all = "camelCase")]
pub struct OverlayTitleBarLayout {
    #[serde(default = "default_overlay_title_bar_offset_x")]
    pub offset_x: i32,
    #[serde(default = "default_overlay_title_bar_offset_y")]
    pub offset_y: i32,
}

#[derive(Debug)]
#[taurpc::ipc_type]
#[serde(rename_all = "camelCase")]
pub struct OverlaySidebarLayout {
    #[serde(default = "default_overlay_sidebar_offset_y")]
    pub offset_y: i32,
    #[serde(default = "default_overlay_sidebar_collapsed_width")]
    pub collapsed_width: u32,
    #[serde(default = "default_overlay_sidebar_expanded_width")]
    pub expanded_width: u32,
    #[serde(default = "default_overlay_sidebar_height_percent")]
    pub height_percent: u32,
}

#[derive(Debug)]
#[taurpc::ipc_type]
#[serde(rename_all = "camelCase")]
pub struct OverlayGuideHeaderLayout {
    #[serde(default = "default_overlay_guide_header_width_percent")]
    pub width_percent: u32,
    #[serde(default = "default_overlay_guide_header_offset_x")]
    pub offset_x: i32,
    #[serde(default = "default_overlay_guide_header_offset_y")]
    pub offset_y: i32,
}

#[derive(Debug)]
#[taurpc::ipc_type]
#[serde(rename_all = "camelCase")]
pub struct OverlayLayout {
    #[serde(default)]
    pub title_bar: OverlayTitleBarLayout,
    #[serde(default)]
    pub sidebar: OverlaySidebarLayout,
    #[serde(default)]
    pub guide_header: OverlayGuideHeaderLayout,
}

#[derive(Debug)]
#[taurpc::ipc_type]
#[serde(rename_all = "camelCase")]
pub struct CombatVisualRoi {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug)]
#[taurpc::ipc_type]
#[serde(rename_all = "camelCase")]
pub struct Conf {
    pub auto_travel_copy: bool,
    #[serde(default = "default_auto_travel_step_source")]
    pub auto_travel_step_source: AutoTravelStepSource,
    pub show_done_guides: bool,
    #[serde(default)]
    pub lang: ConfLang,
    #[serde(default)]
    pub theme: ConfTheme,
    #[serde(default)]
    pub font_size: FontSize,
    #[serde(default)]
    pub guide_display: GuideDisplay,
    pub profiles: Vec<Profile>,
    pub profile_in_use: String,
    pub auto_pilots: Vec<AutoPilot>,
    pub notes: Vec<Note>,
    pub opacity: f32,
    #[serde(default = "default_auto_open_guides")]
    pub auto_open_guides: bool,
    #[serde(default = "default_overlay_mode")]
    pub overlay_mode: bool,
    #[serde(default = "default_overlay_hide_in_combat")]
    pub overlay_hide_in_combat: bool,
    #[serde(default = "default_combat_detection_enabled")]
    pub combat_detection_enabled: bool,
    #[serde(default = "default_dofus_log_paths")]
    pub dofus_log_paths: Vec<String>,
    #[serde(default)]
    pub combat_visual_in_combat_ref: Vec<u8>,
    #[serde(default)]
    pub combat_visual_out_of_combat_ref: Vec<u8>,
    #[serde(default)]
    pub combat_visual_roi: Option<CombatVisualRoi>,
    #[serde(default = "default_overlay_clickable_visibility")]
    pub overlay_clickable_visibility: u32,
    #[serde(default)]
    pub overlay_layout: OverlayLayout,
    #[serde(default)]
    pub shortcuts: Shortcuts,
}

// Functions

fn add_or_update_progress_step(progress: &mut Progress, step: ConfStep, step_index: u32) {
    match progress.steps.get(&step_index) {
        Some(s) => {
            progress.steps.insert(step_index, s.clone());
        }
        None => {
            progress.steps.insert(step_index, step.clone());
        }
    }
}

fn create_progress(id: u32) -> Progress {
    Progress {
        id,
        current_step: 0,
        steps: HashMap::new(),
        updated_at: Some(chrono::Utc::now().to_rfc3339()),
    }
}

fn get_profile_progress_mut(profile: &mut Profile, guide_id: u32) -> &mut Progress {
    if let Some(index) = profile.progresses.iter().position(|p| p.id == guide_id) {
        return &mut profile.progresses[index];
    }

    profile.progresses.push(create_progress(guide_id));

    profile
        .progresses
        .last_mut()
        .expect("[Conf] the element has just been added, it should exist.")
}

fn toggle_conf_step_checkbox(step: &mut ConfStep, checkbox_index: u32) {
    match step.checkboxes.iter().position(|&i| i == checkbox_index) {
        Some(index) => {
            step.checkboxes.remove(index);
        }
        None => {
            step.checkboxes.push(checkbox_index);
        }
    }
}

pub fn get_conf<R: Runtime>(app_handle: &AppHandle<R>) -> Result<Conf, Error> {
    let conf_path = app_handle.path().app_conf_file();

    let file = fs::read_to_string(conf_path);

    match file {
        Err(err) => match err.kind() {
            std::io::ErrorKind::NotFound => Ok(Conf::default()),
            _ => Err(Error::UnhandledIo(err.to_string())),
        },
        Ok(file) => Ok(crate::json::from_str::<Conf>(file.as_str()).map_err(Error::Malformed)?),
    }
}

pub fn save_conf<R: Runtime>(conf: &mut Conf, app: &AppHandle<R>) -> Result<(), Error> {
    let conf_path = app.path().app_conf_file();

    normalize_conf(conf);

    let json = crate::json::serialize_pretty(conf).map_err(Error::SerializeConf)?;

    fs::write(conf_path, json).map_err(|err| Error::SaveConf(err.to_string()))
}

pub fn backup_conf<R: Runtime>(app: &AppHandle<R>) -> Result<(), Error> {
    let conf_path = app.path().app_conf_file();
    let backup_path = app.path().app_conf_backup_file();

    if conf_path.exists() {
        fs::copy(&conf_path, &backup_path)
            .map_err(|err| Error::SaveConf(format!("backup failed: {}", err)))?;
        info!("[Conf] backup created at {:?}", backup_path);
    }

    Ok(())
}

fn get_conf_profile_in_use_mut(conf: &mut Conf) -> Result<&mut Profile, Error> {
    conf.profiles
        .iter_mut()
        .find(|p| p.id == conf.profile_in_use)
        .ok_or(Error::GetProfileInUse)
}

fn normalize_conf(conf: &mut Conf) {
    conf.opacity = conf.opacity.clamp(0.0, 0.98);
    conf.overlay_clickable_visibility = conf.overlay_clickable_visibility.clamp(0, 100);
    conf.overlay_layout.sidebar.collapsed_width =
        conf.overlay_layout.sidebar.collapsed_width.clamp(44, 96);
    conf.overlay_layout.sidebar.expanded_width =
        conf.overlay_layout.sidebar.expanded_width.clamp(140, 360);
    conf.overlay_layout.sidebar.height_percent =
        conf.overlay_layout.sidebar.height_percent.clamp(40, 100);
    conf.overlay_layout.guide_header.width_percent = conf
        .overlay_layout
        .guide_header
        .width_percent
        .clamp(25, 100);
    conf.overlay_layout.title_bar.offset_x = conf.overlay_layout.title_bar.offset_x.clamp(0, 4000);
    conf.overlay_layout.title_bar.offset_y = conf.overlay_layout.title_bar.offset_y.clamp(0, 4000);
    conf.overlay_layout.sidebar.offset_y = conf.overlay_layout.sidebar.offset_y.clamp(0, 4000);
    conf.overlay_layout.guide_header.offset_x =
        conf.overlay_layout.guide_header.offset_x.clamp(-4000, 4000);
    conf.overlay_layout.guide_header.offset_y =
        conf.overlay_layout.guide_header.offset_y.clamp(-4000, 4000);
    conf.dofus_log_paths = conf
        .dofus_log_paths
        .iter()
        .map(|path| path.trim().to_string())
        .filter(|path| !path.is_empty())
        .collect();
    conf.combat_visual_in_combat_ref.truncate(96 * 54);
    conf.combat_visual_out_of_combat_ref.truncate(96 * 54);
    conf.combat_visual_roi = conf.combat_visual_roi.take().map(|roi| {
        let x = roi.x.min(95);
        let y = roi.y.min(53);
        CombatVisualRoi {
            x,
            y,
            width: roi.width.clamp(1, 96 - x),
            height: roi.height.clamp(1, 54 - y),
        }
    });
}

// Implementations

impl Default for Shortcuts {
    fn default() -> Self {
        Shortcuts {
            reset_conf: default_reset_conf_shortcut(),
            go_next_step: default_go_next_step_shortcut(),
            go_previous_step: default_go_previous_step_shortcut(),
            copy_current_step: default_copy_current_step_shortcut(),
            toggle_visibility: default_toggle_visibility_shortcut(),
        }
    }
}

impl Default for ConfStep {
    fn default() -> Self {
        ConfStep { checkboxes: vec![] }
    }
}

impl Default for ConfLang {
    fn default() -> Self {
        ConfLang::Fr
    }
}

impl Default for ConfTheme {
    fn default() -> Self {
        ConfTheme::Default
    }
}

impl Default for FontSize {
    fn default() -> Self {
        FontSize::Normal
    }
}

impl Default for GuideDisplay {
    fn default() -> Self {
        GuideDisplay::Dynamic
    }
}

impl Default for OverlayTitleBarLayout {
    fn default() -> Self {
        OverlayTitleBarLayout {
            offset_x: default_overlay_title_bar_offset_x(),
            offset_y: default_overlay_title_bar_offset_y(),
        }
    }
}

impl Default for OverlaySidebarLayout {
    fn default() -> Self {
        OverlaySidebarLayout {
            offset_y: default_overlay_sidebar_offset_y(),
            collapsed_width: default_overlay_sidebar_collapsed_width(),
            expanded_width: default_overlay_sidebar_expanded_width(),
            height_percent: default_overlay_sidebar_height_percent(),
        }
    }
}

impl Default for OverlayGuideHeaderLayout {
    fn default() -> Self {
        OverlayGuideHeaderLayout {
            width_percent: default_overlay_guide_header_width_percent(),
            offset_x: default_overlay_guide_header_offset_x(),
            offset_y: default_overlay_guide_header_offset_y(),
        }
    }
}

impl Default for OverlayLayout {
    fn default() -> Self {
        OverlayLayout {
            title_bar: OverlayTitleBarLayout::default(),
            sidebar: OverlaySidebarLayout::default(),
            guide_header: OverlayGuideHeaderLayout::default(),
        }
    }
}

impl Default for Conf {
    fn default() -> Self {
        let default_profile = Profile::default();
        let default_profile_id = default_profile.id.clone();

        Conf {
            auto_travel_copy: true,
            auto_travel_step_source: AutoTravelStepSource::Current,
            show_done_guides: true,
            lang: ConfLang::default(),
            theme: ConfTheme::default(),
            font_size: FontSize::default(),
            guide_display: GuideDisplay::default(),
            profiles: vec![default_profile],
            profile_in_use: default_profile_id,
            auto_pilots: vec![],
            notes: vec![],
            opacity: 0.98,
            auto_open_guides: true,
            overlay_mode: false,
            overlay_hide_in_combat: default_overlay_hide_in_combat(),
            combat_detection_enabled: default_combat_detection_enabled(),
            dofus_log_paths: default_dofus_log_paths(),
            combat_visual_in_combat_ref: vec![],
            combat_visual_out_of_combat_ref: vec![],
            combat_visual_roi: None,
            overlay_clickable_visibility: default_overlay_clickable_visibility(),
            overlay_layout: OverlayLayout::default(),
            shortcuts: Shortcuts::default(),
        }
    }
}

impl Default for Profile {
    fn default() -> Self {
        Profile {
            id: uuid::Uuid::new_v4().to_string(),
            name: "Player".to_string(),
            level: 200,
            progresses: vec![],
            server_id: None,
            overlay_edit_mode: default_overlay_edit_mode(),
        }
    }
}

// Public Functions

pub fn ensure_conf_file(app_handle: &AppHandle) -> Result<(), Error> {
    let resolver = app_handle.path();
    let conf_dir = resolver
        .app_config_dir()
        .map_err(|err| Error::ConfDir(err.to_string()))?;

    if !conf_dir.exists() {
        fs::create_dir_all(conf_dir).map_err(|err| Error::CreateConfDir(err.to_string()))?;
    }

    let conf_path = resolver.app_conf_file();

    info!("[Conf] path: {:?}", conf_path);

    if !conf_path.exists() {
        info!("[Conf] file does not exists, creating default one");

        let default_conf = &mut Conf::default();

        save_conf(default_conf, app_handle)?;
    }

    Ok(())
}

// TauRPC API

#[taurpc::procedures(path = "conf", export_to = "../src/ipc/bindings.ts")]
pub trait ConfApi {
    async fn get<R: Runtime>(app_handle: AppHandle<R>) -> Result<Conf, Error>;
    async fn set<R: Runtime>(conf: Conf, app_handle: AppHandle<R>) -> Result<(), Error>;
    #[taurpc(alias = "toggleGuideCheckbox")]
    async fn toggle_guide_checkbox<R: Runtime>(
        app_handle: AppHandle<R>,
        guide_id: u32,
        step_index: u32,
        checkbox_index: u32,
    ) -> Result<u32, Error>;
    async fn reset<R: Runtime>(app_handle: AppHandle<R>, window: Window<R>) -> Result<(), Error>;
}

#[derive(Clone)]
pub struct ConfApiImpl;

#[taurpc::resolvers]
impl ConfApi for ConfApiImpl {
    async fn get<R: Runtime>(self, app: AppHandle<R>) -> Result<Conf, Error> {
        get_conf(&app)
    }

    async fn set<R: Runtime>(self, conf: Conf, app: AppHandle<R>) -> Result<(), Error> {
        let mut conf = conf;
        save_conf(conf.borrow_mut(), &app)?;
        app.state::<OverlayManager>().set_enabled(conf.overlay_mode);
        app.state::<VisibilityController>()
            .sync_with_conf(&app, &conf);

        Ok(())
    }

    async fn toggle_guide_checkbox<R: Runtime>(
        self,
        app: AppHandle<R>,
        guide_id: u32,
        step_index: u32,
        checkbox_index: u32,
    ) -> Result<u32, Error> {
        debug!(
            "[Conf] toggle_guide_checkbox: guide_id: {}, step_index: {}, checkbox_index: {}",
            guide_id, step_index, checkbox_index
        );
        let conf = &mut get_conf(&app)?;
        let profile = get_conf_profile_in_use_mut(conf)?;
        let progress = get_profile_progress_mut(profile, guide_id);

        let step = match progress.steps.get_mut(&step_index) {
            Some(step) => {
                toggle_conf_step_checkbox(step, checkbox_index);

                step.clone()
            }
            None => {
                let mut step = ConfStep::default();
                toggle_conf_step_checkbox(&mut step, checkbox_index);

                step
            }
        };

        add_or_update_progress_step(progress, step, step_index);
        progress.updated_at = Some(chrono::Utc::now().to_rfc3339());

        save_conf(conf, &app)?;

        Ok(checkbox_index)
    }

    async fn reset<R: Runtime>(self, app: AppHandle<R>, window: Window<R>) -> Result<(), Error> {
        let default_conf = &mut Conf::default();
        save_conf(default_conf, &app).map_err(|e| Error::ResetConf(Box::new(e)))?;
        app.state::<OverlayManager>()
            .set_enabled(default_conf.overlay_mode);
        app.state::<VisibilityController>()
            .sync_with_conf(&app, default_conf);

        let webview = window
            .get_webview_window("main")
            .expect("[Conf] main webview should exist");

        let url = webview.url().unwrap();

        webview
            .navigate(url)
            .expect("[Conf] failed to reload webview");

        Ok(())
    }
}
