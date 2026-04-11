use crate::conf::CombatVisualRoi;

pub const VISUAL_FRAME_WIDTH: u32 = 96;
pub const VISUAL_FRAME_HEIGHT: u32 = 54;
pub const VISUAL_FRAME_SIZE: usize = (VISUAL_FRAME_WIDTH * VISUAL_FRAME_HEIGHT) as usize;

#[cfg(windows)]
mod windows_impl {
    use super::{CombatVisualRoi, VISUAL_FRAME_HEIGHT, VISUAL_FRAME_SIZE, VISUAL_FRAME_WIDTH};
    use std::cmp::{max, min};
    use windows_sys::Win32::Foundation::{CloseHandle, BOOL, HANDLE, HWND, LPARAM, RECT};
    use windows_sys::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        SRCCOPY,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetClassNameW, GetWindowRect, GetWindowTextLengthW, GetWindowTextW,
        GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    };

    unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let windows = &mut *(lparam as *mut Vec<HWND>);
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let title_len = GetWindowTextLengthW(hwnd);
        if title_len <= 0 {
            return 1;
        }
        windows.push(hwnd);
        1
    }

    fn wide_to_string(buffer: &[u16]) -> String {
        let end = buffer
            .iter()
            .position(|value| *value == 0)
            .unwrap_or(buffer.len());
        String::from_utf16_lossy(&buffer[..end])
    }

    fn get_window_title(hwnd: HWND) -> String {
        let length = unsafe { GetWindowTextLengthW(hwnd) };
        if length <= 0 {
            return String::new();
        }
        let mut buffer = vec![0u16; length as usize + 1];
        unsafe {
            GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
        }
        wide_to_string(&buffer)
    }

    fn get_window_class(hwnd: HWND) -> String {
        let mut buffer = vec![0u16; 256];
        unsafe {
            GetClassNameW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32);
        }
        wide_to_string(&buffer)
    }

    fn find_dofus_window() -> Option<HWND> {
        let mut windows = vec![];
        unsafe {
            EnumWindows(
                Some(enum_windows_proc),
                &mut windows as *mut Vec<HWND> as isize,
            );
        }

        let mut best_unity: Option<HWND> = None;
        let mut best_release: Option<HWND> = None;

        for hwnd in windows {
            let title = get_window_title(hwnd);
            if !title.contains(" - Release") {
                continue;
            }
            if !is_dofus_process_window(hwnd) {
                continue;
            }
            best_release.get_or_insert(hwnd);

            let class_name = get_window_class(hwnd);
            if class_name.to_ascii_lowercase().contains("unity") {
                best_unity = Some(hwnd);
                break;
            }
        }

        best_unity.or(best_release)
    }

    fn is_dofus_process_window(hwnd: HWND) -> bool {
        let mut pid = 0u32;
        unsafe {
            GetWindowThreadProcessId(hwnd, &mut pid);
        }
        if pid == 0 {
            return false;
        }

        let process: HANDLE = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if process.is_null() {
            return false;
        }

        let mut buffer = vec![0u16; 1024];
        let mut size = buffer.len() as u32;
        let ok =
            unsafe { QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut size) } != 0;
        unsafe {
            CloseHandle(process);
        }
        if !ok || size == 0 {
            return false;
        }

        let exe_path = String::from_utf16_lossy(&buffer[..size as usize]).to_ascii_lowercase();
        exe_path.ends_with("\\dofus.exe")
    }

    fn capture_window_grayscale(hwnd: HWND) -> Option<Vec<u8>> {
        unsafe {
            if IsIconic(hwnd) != 0 {
                return None;
            }
        }

        let mut rect = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        unsafe {
            if GetWindowRect(hwnd, &mut rect) == 0 {
                return None;
            }
        }
        let width = rect.right - rect.left;
        let height = rect.bottom - rect.top;
        if width <= 10 || height <= 10 {
            return None;
        }

        let hdc_window = unsafe { GetDC(std::ptr::null_mut()) };
        if hdc_window.is_null() {
            return None;
        }

        let hdc_mem = unsafe { CreateCompatibleDC(hdc_window) };
        if hdc_mem.is_null() {
            unsafe {
                ReleaseDC(std::ptr::null_mut(), hdc_window);
            }
            return None;
        }

        let hbitmap = unsafe { CreateCompatibleBitmap(hdc_window, width, height) };
        if hbitmap.is_null() {
            unsafe {
                DeleteDC(hdc_mem);
                ReleaseDC(std::ptr::null_mut(), hdc_window);
            }
            return None;
        }

        unsafe {
            SelectObject(hdc_mem, hbitmap as _);
            BitBlt(
                hdc_mem, 0, 0, width, height, hdc_window, rect.left, rect.top, SRCCOPY,
            );
        }

        let mut bmi: BITMAPINFO = unsafe { std::mem::zeroed() };
        bmi.bmiHeader = BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: width,
            biHeight: -height,
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            biSizeImage: 0,
            biXPelsPerMeter: 0,
            biYPelsPerMeter: 0,
            biClrUsed: 0,
            biClrImportant: 0,
        };

        let mut bgra = vec![0u8; (width * height * 4) as usize];
        let scanlines = unsafe {
            GetDIBits(
                hdc_mem,
                hbitmap,
                0,
                height as u32,
                bgra.as_mut_ptr() as *mut _,
                &mut bmi,
                DIB_RGB_COLORS,
            )
        };

        unsafe {
            DeleteObject(hbitmap as _);
            DeleteDC(hdc_mem);
            ReleaseDC(std::ptr::null_mut(), hdc_window);
        }

        if scanlines == 0 {
            return None;
        }

        let mut out = vec![0u8; VISUAL_FRAME_SIZE];
        for y in 0..VISUAL_FRAME_HEIGHT as usize {
            for x in 0..VISUAL_FRAME_WIDTH as usize {
                let src_x = min(
                    ((x as f32 / VISUAL_FRAME_WIDTH as f32) * width as f32) as i32,
                    width - 1,
                ) as usize;
                let src_y = min(
                    ((y as f32 / VISUAL_FRAME_HEIGHT as f32) * height as f32) as i32,
                    height - 1,
                ) as usize;
                let idx = (src_y * width as usize + src_x) * 4;
                let b = bgra[idx] as u32;
                let g = bgra[idx + 1] as u32;
                let r = bgra[idx + 2] as u32;
                let gray = ((r * 299 + g * 587 + b * 114) / 1000) as u8;
                out[y * VISUAL_FRAME_WIDTH as usize + x] = gray;
            }
        }

        Some(out)
    }

    pub fn capture_dofus_visual_signature() -> Option<Vec<u8>> {
        let hwnd = find_dofus_window()?;
        capture_window_grayscale(hwnd)
    }

    pub fn compute_roi(in_combat: &[u8], out_of_combat: &[u8]) -> Option<CombatVisualRoi> {
        if in_combat.len() != VISUAL_FRAME_SIZE || out_of_combat.len() != VISUAL_FRAME_SIZE {
            return None;
        }

        let mut min_x = VISUAL_FRAME_WIDTH as i32;
        let mut min_y = VISUAL_FRAME_HEIGHT as i32;
        let mut max_x = 0i32;
        let mut max_y = 0i32;
        let mut active_count = 0usize;

        for y in 0..VISUAL_FRAME_HEIGHT as usize {
            for x in 0..VISUAL_FRAME_WIDTH as usize {
                let idx = y * VISUAL_FRAME_WIDTH as usize + x;
                let diff = (in_combat[idx] as i16 - out_of_combat[idx] as i16).abs() as u8;
                if diff < 18 {
                    continue;
                }
                active_count += 1;
                min_x = min(min_x, x as i32);
                min_y = min(min_y, y as i32);
                max_x = max(max_x, x as i32);
                max_y = max(max_y, y as i32);
            }
        }

        if active_count < 20 {
            return Some(CombatVisualRoi {
                x: 0,
                y: 0,
                width: VISUAL_FRAME_WIDTH,
                height: VISUAL_FRAME_HEIGHT,
            });
        }

        min_x = max(min_x - 2, 0);
        min_y = max(min_y - 2, 0);
        max_x = min(max_x + 2, VISUAL_FRAME_WIDTH as i32 - 1);
        max_y = min(max_y + 2, VISUAL_FRAME_HEIGHT as i32 - 1);

        Some(CombatVisualRoi {
            x: min_x as u32,
            y: min_y as u32,
            width: (max_x - min_x + 1) as u32,
            height: (max_y - min_y + 1) as u32,
        })
    }

    pub fn infer_visual_combat_state(
        current: &[u8],
        in_combat_ref: &[u8],
        out_of_combat_ref: &[u8],
        roi: Option<&CombatVisualRoi>,
    ) -> Option<bool> {
        if current.len() != VISUAL_FRAME_SIZE
            || in_combat_ref.len() != VISUAL_FRAME_SIZE
            || out_of_combat_ref.len() != VISUAL_FRAME_SIZE
        {
            return None;
        }

        let (x0, y0, w, h) = match roi {
            Some(roi) => {
                let x0 = roi.x.min(VISUAL_FRAME_WIDTH - 1);
                let y0 = roi.y.min(VISUAL_FRAME_HEIGHT - 1);
                let w = roi.width.clamp(1, VISUAL_FRAME_WIDTH - x0);
                let h = roi.height.clamp(1, VISUAL_FRAME_HEIGHT - y0);
                (x0 as usize, y0 as usize, w as usize, h as usize)
            }
            None => (
                0usize,
                0usize,
                VISUAL_FRAME_WIDTH as usize,
                VISUAL_FRAME_HEIGHT as usize,
            ),
        };

        let mut combat_diff_sum = 0u64;
        let mut out_diff_sum = 0u64;
        let mut count = 0u64;
        for y in y0..(y0 + h) {
            for x in x0..(x0 + w) {
                let idx = y * VISUAL_FRAME_WIDTH as usize + x;
                combat_diff_sum += (current[idx] as i16 - in_combat_ref[idx] as i16).abs() as u64;
                out_diff_sum += (current[idx] as i16 - out_of_combat_ref[idx] as i16).abs() as u64;
                count += 1;
            }
        }
        if count == 0 {
            return None;
        }

        let combat_avg = combat_diff_sum as f64 / count as f64;
        let out_avg = out_diff_sum as f64 / count as f64;

        if combat_avg <= out_avg {
            Some(true)
        } else {
            Some(false)
        }
    }
}

#[cfg(windows)]
pub use windows_impl::{capture_dofus_visual_signature, compute_roi, infer_visual_combat_state};

#[cfg(not(windows))]
pub fn capture_dofus_visual_signature() -> Option<Vec<u8>> {
    None
}

#[cfg(not(windows))]
pub fn compute_roi(_: &[u8], _: &[u8]) -> Option<CombatVisualRoi> {
    None
}

#[cfg(not(windows))]
pub fn infer_visual_combat_state(
    _: &[u8],
    _: &[u8],
    _: &[u8],
    _: Option<&CombatVisualRoi>,
) -> Option<bool> {
    None
}
