use crate::{CameraInfo, DetectionBox};
use opencv::prelude::*;
use opencv::videoio;
use opencv::imgproc;
use opencv::core::Mat;

/// レターボックス前処理のパディング情報（座標補正用）
pub struct LetterboxInfo {
    pub pad_x: f64,
    pub pad_y: f64,
}

impl LetterboxInfo {
    /// レターボックス空間の正規化座標を元画像の正規化座標に変換
    pub fn correct_boxes(&self, boxes: &mut Vec<DetectionBox>, input_size: f64) {
        for b in boxes.iter_mut() {
            b.x1 = (b.x1 * input_size - self.pad_x) / (input_size - 2.0 * self.pad_x);
            b.y1 = (b.y1 * input_size - self.pad_y) / (input_size - 2.0 * self.pad_y);
            b.x2 = (b.x2 * input_size - self.pad_x) / (input_size - 2.0 * self.pad_x);
            b.y2 = (b.y2 * input_size - self.pad_y) / (input_size - 2.0 * self.pad_y);
            // クランプ
            b.x1 = b.x1.clamp(0.0, 1.0);
            b.y1 = b.y1.clamp(0.0, 1.0);
            b.x2 = b.x2.clamp(0.0, 1.0);
            b.y2 = b.y2.clamp(0.0, 1.0);
        }
    }
}

/// 利用可能なカメラデバイスを列挙
pub fn list_cameras() -> Vec<CameraInfo> {
    let mut cameras = Vec::new();

    #[cfg(target_os = "windows")]
    let backends = &[
        ("DSHOW", videoio::CAP_DSHOW),
        ("MSMF", videoio::CAP_MSMF),
    ];
    #[cfg(not(target_os = "windows"))]
    let backends = &[
        ("ANY", videoio::CAP_ANY),
    ];

    let mut found_ids: std::collections::HashSet<i32> = std::collections::HashSet::new();

    for (backend_name, backend) in backends.iter() {
        eprintln!("[camera] Scanning with backend: {}", backend_name);
        for id in 0..5 {
            if found_ids.contains(&id) {
                continue;
            }
            eprintln!("[camera] Probing device {} ({})...", id, backend_name);
            match videoio::VideoCapture::new(id, *backend) {
                Ok(mut cap) => {
                    if cap.is_opened().unwrap_or(false) {
                        let w = cap.get(videoio::CAP_PROP_FRAME_WIDTH).unwrap_or(0.0) as u32;
                        let h = cap.get(videoio::CAP_PROP_FRAME_HEIGHT).unwrap_or(0.0) as u32;
                        let name = format!("Camera {} ({}x{})", id, w, h);
                        eprintln!("[camera] Found via {}: {}", backend_name, name);
                        cameras.push(CameraInfo { id, name });
                        found_ids.insert(id);
                        let _ = cap.release();
                    } else {
                        eprintln!("[camera] Device {} not opened ({})", id, backend_name);
                    }
                }
                Err(e) => {
                    eprintln!("[camera] Device {} error ({}): {}", id, backend_name, e);
                }
            }
        }
    }
    cameras
}

/// カメラキャプチャを管理
pub struct CameraCapture {
    cap: videoio::VideoCapture,
    width: u32,
    height: u32,
}

impl CameraCapture {
    /// カメラを開く
    pub fn open(device_id: i32) -> Result<Self, String> {
        #[cfg(target_os = "windows")]
        let backends = &[videoio::CAP_DSHOW, videoio::CAP_MSMF];
        #[cfg(not(target_os = "windows"))]
        let backends = &[videoio::CAP_ANY];

        for &backend in backends.iter() {
            if let Ok(cap) = videoio::VideoCapture::new(device_id, backend) {
                if cap.is_opened().unwrap_or(false) {
                    let width = cap.get(videoio::CAP_PROP_FRAME_WIDTH).unwrap_or(640.0) as u32;
                    let height = cap.get(videoio::CAP_PROP_FRAME_HEIGHT).unwrap_or(480.0) as u32;
                    eprintln!("[camera] Opened device {} ({}x{}) backend={}", device_id, width, height, backend);
                    return Ok(Self { cap, width, height });
                }
            }
        }

        Err(format!("Camera {} is not available", device_id))
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }

    /// フレームを読み取り、BGRのMatを返す
    pub fn read_frame(&mut self) -> Result<Mat, String> {
        let mut frame = Mat::default();
        self.cap
            .read(&mut frame)
            .map_err(|e| format!("Failed to read frame: {}", e))?;

        if frame.empty() {
            return Err("Empty frame".to_string());
        }

        Ok(frame)
    }

    /// BGRフレームをRGBAに変換（共有メモリ転送用）
    pub fn bgr_to_rgba(bgr: &Mat) -> Result<Vec<u8>, String> {
        let mut rgba = Mat::default();
        imgproc::cvt_color(bgr, &mut rgba, imgproc::COLOR_BGR2RGBA, 0, opencv::core::AlgorithmHint::ALGO_HINT_DEFAULT)
            .map_err(|e| format!("Color conversion failed: {}", e))?;

        let data = rgba.data_bytes()
            .map_err(|e| format!("Failed to get pixel data: {}", e))?;

        Ok(data.to_vec())
    }

    /// BGRフレームをレターボックス付きでRGB 640x640に変換（推論用）
    /// アスペクト比を保持し、余白をダークモード背景色(#2a2a2a)で埋める
    pub fn preprocess_for_inference(bgr: &Mat, target_size: i32) -> Result<(Vec<f32>, LetterboxInfo), String> {
        // BGR → RGB
        let mut rgb = Mat::default();
        imgproc::cvt_color(bgr, &mut rgb, imgproc::COLOR_BGR2RGB, 0, opencv::core::AlgorithmHint::ALGO_HINT_DEFAULT)
            .map_err(|e| format!("BGR2RGB failed: {}", e))?;

        let src_w = rgb.cols() as f64;
        let src_h = rgb.rows() as f64;
        let target = target_size as f64;

        // アスペクト比を保持するスケール
        let scale = (target / src_w).min(target / src_h);
        let new_w = (src_w * scale).round() as i32;
        let new_h = (src_h * scale).round() as i32;

        // リサイズ（アスペクト比保持）
        let mut resized = Mat::default();
        imgproc::resize(&rgb, &mut resized, opencv::core::Size::new(new_w, new_h), 0.0, 0.0, imgproc::INTER_LINEAR)
            .map_err(|e| format!("Resize failed: {}", e))?;

        // パディング量（上下左右に均等配分）
        let pad_x = (target_size - new_w) / 2;
        let pad_y = (target_size - new_h) / 2;
        let pad_r = target_size - new_w - pad_x;
        let pad_b = target_size - new_h - pad_y;

        // レターボックス: ダークモード背景色 #2a2a2a (RGB: 42, 42, 42)
        let mut letterboxed = Mat::default();
        opencv::core::copy_make_border(
            &resized, &mut letterboxed,
            pad_y, pad_b, pad_x, pad_r,
            opencv::core::BORDER_CONSTANT,
            opencv::core::Scalar::new(42.0, 42.0, 42.0, 0.0),
        ).map_err(|e| format!("Letterbox padding failed: {}", e))?;

        // u8 → f32 正規化 [0, 1]、NCHW形式に変換
        let data = letterboxed.data_bytes()
            .map_err(|e| format!("Failed to get letterboxed data: {}", e))?;

        let pixels = target_size as usize;
        let mut nchw = vec![0.0f32; 3 * pixels * pixels];

        for y in 0..pixels {
            for x in 0..pixels {
                let idx = (y * pixels + x) * 3;
                let r = data[idx] as f32 / 255.0;
                let g = data[idx + 1] as f32 / 255.0;
                let b = data[idx + 2] as f32 / 255.0;

                // NCHW: [C, H, W]
                nchw[0 * pixels * pixels + y * pixels + x] = r;
                nchw[1 * pixels * pixels + y * pixels + x] = g;
                nchw[2 * pixels * pixels + y * pixels + x] = b;
            }
        }

        let info = LetterboxInfo {
            pad_x: pad_x as f64,
            pad_y: pad_y as f64,
        };

        Ok((nchw, info))
    }

    /// BGRフレームをJPEGエンコード（UI表示転送用）
    /// 表示用なので品質は抑えめ(60)、リサイズもする
    pub fn bgr_to_jpeg(bgr: &Mat, max_width: i32, quality: i32) -> Result<Vec<u8>, String> {
        use opencv::imgcodecs;
        use opencv::core::Vector;

        let mut src = bgr.clone();

        // 表示用にリサイズ（元が大きい場合）
        let w = bgr.cols();
        if w > max_width {
            let scale = max_width as f64 / w as f64;
            let new_h = (bgr.rows() as f64 * scale) as i32;
            let mut resized = Mat::default();
            imgproc::resize(&src, &mut resized, opencv::core::Size::new(max_width, new_h), 0.0, 0.0, imgproc::INTER_LINEAR)
                .map_err(|e| format!("Resize for JPEG failed: {}", e))?;
            src = resized;
        }

        let mut params = Vector::new();
        params.push(imgcodecs::IMWRITE_JPEG_QUALITY);
        params.push(quality);

        let mut buf = Vector::new();
        imgcodecs::imencode(".jpg", &src, &mut buf, &params)
            .map_err(|e| format!("JPEG encode failed: {}", e))?;

        Ok(buf.to_vec())
    }
}

impl Drop for CameraCapture {
    fn drop(&mut self) {
        let _ = self.cap.release();
        eprintln!("[camera] Released");
    }
}
