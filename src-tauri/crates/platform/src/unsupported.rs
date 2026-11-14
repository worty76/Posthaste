use crate::Session;

pub type Handle = ();

pub fn session() -> Session {
    Session::Unknown
}

pub fn foreground() -> Option<(Handle, Option<String>)> {
    None
}

pub fn activate(_: &Handle) -> bool {
    false
}
