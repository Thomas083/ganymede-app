use tauri::{AppHandle, Runtime};

use crate::combat_visual::{capture_dofus_visual_signature, compute_roi, VISUAL_FRAME_SIZE};
use crate::conf::{get_conf, save_conf};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, taurpc::specta::Type)]
pub enum CombatReferenceKind {
    InCombat,
    OutOfCombat,
}

#[derive(Debug, serde::Serialize, thiserror::Error, taurpc::specta::Type)]
#[specta(rename = "CombatError")]
pub enum Error {
    #[error("failed to read conf")]
    GetConf(#[from] crate::conf::Error),
    #[error("failed to capture dofus window")]
    CaptureFailed,
}

#[taurpc::procedures(path = "combat", export_to = "../src/ipc/bindings.ts")]
pub trait CombatApi {
    #[taurpc(alias = "captureVisualReference")]
    async fn capture_visual_reference<R: Runtime>(
        app_handle: AppHandle<R>,
        kind: CombatReferenceKind,
    ) -> Result<(), Error>;
    #[taurpc(alias = "clearVisualReferences")]
    async fn clear_visual_references<R: Runtime>(app_handle: AppHandle<R>) -> Result<(), Error>;
}

#[derive(Clone)]
pub struct CombatApiImpl;

#[taurpc::resolvers]
impl CombatApi for CombatApiImpl {
    async fn capture_visual_reference<R: Runtime>(
        self,
        app_handle: AppHandle<R>,
        kind: CombatReferenceKind,
    ) -> Result<(), Error> {
        let mut conf = get_conf(&app_handle)?;
        let signature = capture_dofus_visual_signature().ok_or(Error::CaptureFailed)?;
        if signature.len() != VISUAL_FRAME_SIZE {
            return Err(Error::CaptureFailed);
        }

        match kind {
            CombatReferenceKind::InCombat => {
                conf.combat_visual_in_combat_ref = signature;
            }
            CombatReferenceKind::OutOfCombat => {
                conf.combat_visual_out_of_combat_ref = signature;
            }
        }

        if !conf.combat_visual_in_combat_ref.is_empty()
            && !conf.combat_visual_out_of_combat_ref.is_empty()
        {
            conf.combat_visual_roi = compute_roi(
                &conf.combat_visual_in_combat_ref,
                &conf.combat_visual_out_of_combat_ref,
            );
        }

        save_conf(&mut conf, &app_handle)?;
        Ok(())
    }

    async fn clear_visual_references<R: Runtime>(
        self,
        app_handle: AppHandle<R>,
    ) -> Result<(), Error> {
        let mut conf = get_conf(&app_handle)?;
        conf.combat_visual_in_combat_ref.clear();
        conf.combat_visual_out_of_combat_ref.clear();
        conf.combat_visual_roi = None;
        save_conf(&mut conf, &app_handle)?;
        Ok(())
    }
}
