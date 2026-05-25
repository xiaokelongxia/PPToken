#[cfg(target_os = "windows")]
pub fn background_command(program: &str) -> std::process::Command {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let mut command = std::process::Command::new(program);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn validate_registry_env_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() || name.contains('\0') {
        return Err("environment variable name is invalid".to_string());
    }
    Ok(())
}

#[cfg_attr(not(target_os = "windows"), allow(dead_code))]
fn validate_registry_env_value(value: &str) -> Result<(), String> {
    if value.contains('\0') {
        return Err("environment variable value contains NUL".to_string());
    }
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn set_user_environment_variable(name: &str, value: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegOpenKeyExW, RegSetValueExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE, REG_SZ,
    };

    validate_registry_env_name(name)?;
    validate_registry_env_value(value)?;

    let subkey = wide_null("Environment");
    let value_name = wide_null(name);
    let value_data = std::ffi::OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let mut key: HKEY = 0;
    let open_status = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            0,
            KEY_SET_VALUE,
            &mut key,
        )
    };
    if open_status != ERROR_SUCCESS {
        return Err(format!("open HKCU\\Environment failed: {open_status}"));
    }

    let set_status = unsafe {
        RegSetValueExW(
            key,
            value_name.as_ptr(),
            0,
            REG_SZ,
            value_data.as_ptr().cast::<u8>(),
            (value_data.len() * std::mem::size_of::<u16>()) as u32,
        )
    };
    unsafe {
        RegCloseKey(key);
    }
    if set_status != ERROR_SUCCESS {
        return Err(format!("write user environment failed: {set_status}"));
    }

    broadcast_environment_change();
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn unset_user_environment_variable(name: &str) -> Result<(), String> {
    use windows_sys::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS};
    use windows_sys::Win32::System::Registry::{
        RegCloseKey, RegDeleteValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER, KEY_SET_VALUE,
    };

    validate_registry_env_name(name)?;

    let subkey = wide_null("Environment");
    let value_name = wide_null(name);
    let mut key: HKEY = 0;
    let open_status = unsafe {
        RegOpenKeyExW(
            HKEY_CURRENT_USER,
            subkey.as_ptr(),
            0,
            KEY_SET_VALUE,
            &mut key,
        )
    };
    if open_status != ERROR_SUCCESS {
        return Err(format!("open HKCU\\Environment failed: {open_status}"));
    }

    let delete_status = unsafe { RegDeleteValueW(key, value_name.as_ptr()) };
    unsafe {
        RegCloseKey(key);
    }
    if delete_status != ERROR_SUCCESS && delete_status != ERROR_FILE_NOT_FOUND {
        return Err(format!("delete user environment failed: {delete_status}"));
    }

    broadcast_environment_change();
    Ok(())
}

#[cfg(target_os = "windows")]
fn wide_null(value: &str) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;
    std::ffi::OsStr::new(value)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(target_os = "windows")]
fn broadcast_environment_change() {
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SendMessageTimeoutW, HWND_BROADCAST, SMTO_ABORTIFHUNG, WM_SETTINGCHANGE,
    };

    let environment = wide_null("Environment");
    let mut result = 0;
    unsafe {
        SendMessageTimeoutW(
            HWND_BROADCAST,
            WM_SETTINGCHANGE,
            0,
            environment.as_ptr() as isize,
            SMTO_ABORTIFHUNG,
            5000,
            &mut result,
        );
    }
}

#[cfg(target_os = "windows")]
pub fn background_command_path(program: &std::path::Path) -> std::process::Command {
    use std::os::windows::process::CommandExt;

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let mut command = std::process::Command::new(program);
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_environment_variable_names_and_values() {
        assert!(validate_registry_env_name("PPTOKEN_RELAY_TEST_API_KEY").is_ok());
        assert!(validate_registry_env_name("").is_err());
        assert!(validate_registry_env_name("BAD\0NAME").is_err());
        assert!(validate_registry_env_value("sk-test").is_ok());
        assert!(validate_registry_env_value("bad\0value").is_err());
    }
}
