use crate::core::auth::ApiRequestContext;
use crate::core::models::{
    ApiProxyConfigPayload, ApiProxyDetectPayload, ApiProxyMode, ApiProxyTestPayload, AuthMode,
    CoreError,
};
use std::time::Duration;

pub fn sanitize_proxy_config(
    config: &ApiProxyConfigPayload,
) -> Result<ApiProxyConfigPayload, CoreError> {
    match config.mode {
        ApiProxyMode::Direct => Ok(ApiProxyConfigPayload {
            mode: ApiProxyMode::Direct,
            url: None,
        }),
        ApiProxyMode::Manual => {
            let url = config
                .url
                .as_deref()
                .map(str::trim)
                .filter(|url| !url.is_empty())
                .ok_or_else(|| CoreError::InvalidData("Manual proxy URL is required".into()))?;
            if !(url.starts_with("http://")
                || url.starts_with("https://")
                || url.starts_with("socks5://")
                || url.starts_with("socks5h://"))
            {
                return Err(CoreError::InvalidData(
                    "Proxy URL must start with http://, https://, socks5://, or socks5h://".into(),
                ));
            }
            Ok(ApiProxyConfigPayload {
                mode: ApiProxyMode::Manual,
                url: Some(url.to_string()),
            })
        }
    }
}

pub fn test_api_connectivity(
    config: &ApiProxyConfigPayload,
    context: Option<&ApiRequestContext>,
) -> ApiProxyTestPayload {
    let normalized = match sanitize_proxy_config(config) {
        Ok(config) => config,
        Err(error) => {
            return ApiProxyTestPayload {
                code: "invalid_proxy".into(),
                reachable: false,
                status_code: None,
                message: error.to_string(),
            };
        }
    };

    let mut builder = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent("pptoken/0.1");
    if let ApiProxyMode::Manual = normalized.mode {
        if let Some(url) = normalized.url.as_deref() {
            match reqwest::Proxy::all(url) {
                Ok(proxy) => builder = builder.proxy(proxy),
                Err(error) => {
                    return ApiProxyTestPayload {
                        code: "invalid_proxy".into(),
                        reachable: false,
                        status_code: None,
                        message: error.to_string(),
                    };
                }
            }
        }
    }

    let client = match builder.build() {
        Ok(client) => client,
        Err(error) => {
            return ApiProxyTestPayload {
                code: "client_error".into(),
                reachable: false,
                status_code: None,
                message: error.to_string(),
            };
        }
    };

    let mut request = client.get("https://api.openai.com/v1/models");
    if let Some(context) = context {
        match context.auth_mode {
            AuthMode::Apikey => {
                if let Some(api_key) = context.api_key.as_deref() {
                    request = request.bearer_auth(api_key);
                }
            }
            AuthMode::Chatgpt => {
                if let Some(token) = context.bearer_token.as_deref() {
                    request = request.bearer_auth(token);
                }
            }
        }
    }

    match request.send() {
        Ok(response) => {
            let status = response.status();
            ApiProxyTestPayload {
                code: if status.is_success() || status.as_u16() == 401 {
                    "reachable".into()
                } else {
                    "http_status".into()
                },
                reachable: status.is_success() || status.as_u16() == 401,
                status_code: Some(i32::from(status.as_u16())),
                message: format!("HTTP {}", status.as_u16()),
            }
        }
        Err(error) => ApiProxyTestPayload {
            code: "request_failed".into(),
            reachable: false,
            status_code: error.status().map(|status| i32::from(status.as_u16())),
            message: error.to_string(),
        },
    }
}

pub fn detect_api_proxy_config(context: Option<&ApiRequestContext>) -> ApiProxyDetectPayload {
    let direct = ApiProxyConfigPayload {
        mode: ApiProxyMode::Direct,
        url: None,
    };
    let direct_probe = test_api_connectivity(&direct, context);
    if direct_probe.reachable {
        return ApiProxyDetectPayload {
            found: true,
            mode: Some(ApiProxyMode::Direct),
            url: None,
            probe: direct_probe,
        };
    }

    for var in ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy"] {
        let Ok(url) = std::env::var(var) else {
            continue;
        };
        let config = ApiProxyConfigPayload {
            mode: ApiProxyMode::Manual,
            url: Some(url),
        };
        let probe = test_api_connectivity(&config, context);
        if probe.reachable {
            return ApiProxyDetectPayload {
                found: true,
                mode: Some(ApiProxyMode::Manual),
                url: config.url,
                probe,
            };
        }
    }

    ApiProxyDetectPayload {
        found: false,
        mode: None,
        url: None,
        probe: direct_probe,
    }
}
