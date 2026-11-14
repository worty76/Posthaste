use std::path::Path;

use windows_sys::Win32::Foundation::{CloseHandle, HWND};
use windows_sys::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows_sys::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowThreadProcessId, IsWindow, SetForegroundWindow,
};

use crate::Session;

/// The previously focused top-level window, stored as an integer so the
/// handle can cross threads.
pub type Handle = isize;

pub fn session() -> Session {
    Session::Windows
}

pub fn foreground() -> Option<(Handle, Option<String>)> {
    // SAFETY: plain Win32 queries; every pointer passed is valid for the call.
    unsafe {
        let hwnd: HWND = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == std::process::id() {
            return None;
        }
        Some((hwnd as isize, process_name(pid)))
    }
}

unsafe fn process_name(pid: u32) -> Option<String> {
    let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
    if process.is_null() {
        return None;
    }
    let mut buf = [0u16; 1024];
    let mut len = buf.len() as u32;
    let ok = QueryFullProcessImageNameW(process, 0, buf.as_mut_ptr(), &mut len);
    CloseHandle(process);
    if ok == 0 {
        return None;
    }
    let path = String::from_utf16_lossy(&buf[..len as usize]);
    Path::new(&path)
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
}

pub fn activate(handle: &Handle) -> bool {
    // SAFETY: IsWindow guards against the window having been closed meanwhile.
    // We are the foreground process at this point, so Windows permits the call.
    unsafe {
        let hwnd = *handle as HWND;
        IsWindow(hwnd) != 0 && SetForegroundWindow(hwnd) != 0
    }
}
