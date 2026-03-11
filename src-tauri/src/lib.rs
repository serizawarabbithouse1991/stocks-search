use tauri::Manager;

/// FastAPIバックエンドのヘルスチェック
#[tauri::command]
async fn check_backend() -> Result<String, String> {
    let client = reqwest::Client::new();
    match client
        .get("http://127.0.0.1:8000/")
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
    {
        Ok(resp) => {
            let text = resp.text().await.unwrap_or_default();
            Ok(text)
        }
        Err(e) => Err(format!("Backend not available: {}", e)),
    }
}

/// バックエンドAPIへのプロキシ（フロントエンドから直接fetchできない場合用）
#[tauri::command]
async fn proxy_api(path: String, method: String, body: Option<String>) -> Result<String, String> {
    let client = reqwest::Client::new();
    let url = format!("http://127.0.0.1:8000{}", path);

    let request = match method.to_uppercase().as_str() {
        "POST" => {
            let mut req = client.post(&url);
            if let Some(b) = body {
                req = req.header("Content-Type", "application/json").body(b);
            }
            req
        }
        _ => client.get(&url),
    };

    match request.timeout(std::time::Duration::from_secs(60)).send().await {
        Ok(resp) => {
            let text = resp.text().await.unwrap_or_default();
            Ok(text)
        }
        Err(e) => Err(format!("API error: {}", e)),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![check_backend, proxy_api])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
