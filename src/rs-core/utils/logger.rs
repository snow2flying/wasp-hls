use std::sync::atomic::AtomicU8;

#[cfg(target_arch = "wasm32")]
use crate::bindings::jsLog;
use crate::bindings::LogLevel;

#[cfg(target_arch = "wasm32")]
fn emit_log(level: LogLevel, text: &str) {
    jsLog(level, text);
}

#[cfg(not(target_arch = "wasm32"))]
fn emit_log<T>(_level: T, _text: &str) {}

pub static MAX_LOG_LEVEL: AtomicU8 = AtomicU8::new(LoggerLevel::None as u8);

#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum LoggerLevel {
    None = 0,
    Error = 1,
    Warn = 2,
    Info = 3,
    Debug = 4,
}

impl LoggerLevel {
    pub(crate) fn from_u32(level: u32) -> Self {
        match level {
            1 => LoggerLevel::Error,
            2 => LoggerLevel::Warn,
            3 => LoggerLevel::Info,
            4 => LoggerLevel::Debug,
            _ => LoggerLevel::None,
        }
    }
}

// TODO Explore other logging functions implementations.

pub struct Logger {}

impl Logger {
    pub fn set_logger_level(new_level: LoggerLevel) {
        MAX_LOG_LEVEL.store(new_level as u8, std::sync::atomic::Ordering::Relaxed);
    }

    pub fn info(text: &str) {
        if MAX_LOG_LEVEL.load(std::sync::atomic::Ordering::Relaxed) >= LoggerLevel::Info as u8 {
            emit_log(LogLevel::Info, text);
        }
    }

    pub fn error(text: &str) {
        if MAX_LOG_LEVEL.load(std::sync::atomic::Ordering::Relaxed) >= LoggerLevel::Error as u8 {
            emit_log(LogLevel::Error, text);
        }
    }

    pub fn warn(text: &str) {
        if MAX_LOG_LEVEL.load(std::sync::atomic::Ordering::Relaxed) >= LoggerLevel::Warn as u8 {
            emit_log(LogLevel::Warn, text);
        }
    }

    pub fn debug(text: &str) {
        if MAX_LOG_LEVEL.load(std::sync::atomic::Ordering::Relaxed) >= LoggerLevel::Debug as u8 {
            emit_log(LogLevel::Debug, text);
        }
    }

    pub fn lazy_info<F: FnOnce() -> String>(func: F) {
        if MAX_LOG_LEVEL.load(std::sync::atomic::Ordering::Relaxed) >= LoggerLevel::Info as u8 {
            emit_log(LogLevel::Info, &func());
        }
    }

    pub fn lazy_error<F: FnOnce() -> String>(func: F) {
        if MAX_LOG_LEVEL.load(std::sync::atomic::Ordering::Relaxed) >= LoggerLevel::Error as u8 {
            emit_log(LogLevel::Error, &func());
        }
    }

    pub fn lazy_warn<F: FnOnce() -> String>(func: F) {
        if MAX_LOG_LEVEL.load(std::sync::atomic::Ordering::Relaxed) >= LoggerLevel::Warn as u8 {
            emit_log(LogLevel::Warn, &func());
        }
    }

    pub fn lazy_debug<F: FnOnce() -> String>(func: F) {
        if MAX_LOG_LEVEL.load(std::sync::atomic::Ordering::Relaxed) >= LoggerLevel::Debug as u8 {
            emit_log(LogLevel::Debug, &func());
        }
    }
}
