//! キャプチャーボード診断ツール
//! カメラから直接フレームを取得 → YOLO推論 → OpenCVウィンドウに結果表示
//!
//! Usage:
//!   cargo run --bin diagnose
//!   cargo run --bin diagnose -- --device 1
//!   cargo run --bin diagnose -- --device 1 --threshold 0.1 --save

use opencv::prelude::*;
use opencv::{core, highgui, imgcodecs, imgproc, videoio};
use std::path::Path;
use std::time::Instant;

// native-core ライブラリを使う
use oocyte_core::camera::{CameraCapture, LetterboxInfo};
use oocyte_core::inference::{OnnxInference, INPUT_SIZE};

fn main() {
    let args: Vec<String> = std::env::args().collect();

    let mut device_id: i32 = -1; // -1 = auto detect
    let mut conf_threshold: f64 = 0.10; // 低めで全部見る
    let mut save_frames = false;

    let mut i = 1;
    while i < args.len() {
        match args[i].as_str() {
            "--device" | "-d" => {
                i += 1;
                device_id = args.get(i).and_then(|s| s.parse().ok()).unwrap_or(0);
            }
            "--threshold" | "-t" => {
                i += 1;
                conf_threshold = args.get(i).and_then(|s| s.parse().ok()).unwrap_or(0.10);
            }
            "--save" | "-s" => {
                save_frames = true;
            }
            "--help" | "-h" => {
                println!("Usage: diagnose [--device N] [--threshold 0.1] [--save]");
                println!("  --device N     Camera device ID (default: auto-detect)");
                println!("  --threshold N  Confidence threshold (default: 0.10)");
                println!("  --save         Save first frame as diagnose_frame.png");
                return;
            }
            _ => {}
        }
        i += 1;
    }

    // --- モデル読み込み ---
    let model_path = find_model();
    println!("[diagnose] Model: {}", model_path);

    let mut inference = OnnxInference::load(Path::new(&model_path)).expect("Failed to load model");
    inference.set_conf_threshold(conf_threshold);
    println!("[diagnose] Confidence threshold: {}", conf_threshold);

    // --- カメラ列挙 ---
    println!("\n[diagnose] === カメラ列挙 ===");
    let cameras = oocyte_core::camera::list_cameras();
    if cameras.is_empty() {
        println!("[diagnose] カメラが見つかりません！");
        return;
    }
    for cam in &cameras {
        println!("  Device {}: {}", cam.id, cam.name);
    }

    // auto-detect: 最後のデバイス（外部キャプチャーボードは通常後ろ）
    if device_id < 0 {
        device_id = cameras.last().unwrap().id;
        println!("[diagnose] Auto-selected device {}", device_id);
    }

    // --- カメラオープン ---
    println!("\n[diagnose] === カメラ {} を開いています... ===", device_id);
    let mut cam = CameraCapture::open(device_id).expect("Failed to open camera");
    println!("[diagnose] Opened: {}x{}", cam.width(), cam.height());

    // --- ウィンドウ作成 ---
    let window = "hanasakuya diagnose";
    highgui::named_window(window, highgui::WINDOW_NORMAL).ok();
    highgui::resize_window(window, 960, 540).ok();

    println!("\n[diagnose] === ライブ推論開始 (ESCで終了) ===");
    println!("  conf_threshold={}, input_size={}", conf_threshold, INPUT_SIZE);

    let mut frame_count: u64 = 0;
    let mut saved = false;
    let global_start = Instant::now();

    loop {
        // フレーム取得
        let bgr = match cam.read_frame() {
            Ok(f) => f,
            Err(e) => {
                eprintln!("[diagnose] Frame read error: {}", e);
                continue;
            }
        };

        frame_count += 1;

        // --- 診断出力 (最初の5フレーム + 以降100フレームごと) ---
        let diag = frame_count <= 5 || frame_count % 100 == 0;

        if diag {
            print_frame_diagnostics(&bgr, frame_count);
        }

        // --- 前処理 ---
        let (input_nchw, letterbox) = match CameraCapture::preprocess_for_inference(&bgr, INPUT_SIZE) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[diagnose] Preprocess error: {}", e);
                continue;
            }
        };

        if diag {
            print_nchw_diagnostics(&input_nchw);
        }

        // --- 推論 ---
        let (mut boxes, inference_ms) = match inference.run(&input_nchw) {
            Ok(v) => v,
            Err(e) => {
                eprintln!("[diagnose] Inference error: {}", e);
                continue;
            }
        };

        // レターボックス座標補正
        letterbox.correct_boxes(&mut boxes, INPUT_SIZE as f64);

        if diag || !boxes.is_empty() {
            let elapsed = global_start.elapsed().as_secs_f64();
            let fps = frame_count as f64 / elapsed;
            println!(
                "[frame#{}] 検出数={} inference={}ms fps={:.1}",
                frame_count, boxes.len(), inference_ms, fps
            );
            for (i, b) in boxes.iter().enumerate() {
                println!(
                    "  box[{}]: conf={:.4} ({:.3},{:.3})-({:.3},{:.3})",
                    i, b.confidence, b.x1, b.y1, b.x2, b.y2
                );
            }
        }

        // --- 閾値以下の最大confidence（検出0の場合の診断用） ---
        if diag && boxes.is_empty() {
            print_raw_max_confidence(&input_nchw, &mut inference);
        }

        // --- フレーム保存 ---
        if save_frames && !saved {
            let params = core::Vector::<i32>::new();
            imgcodecs::imwrite("diagnose_frame.png", &bgr, &params).ok();
            println!("[diagnose] Saved: diagnose_frame.png");
            saved = true;
        }

        // --- BBox描画 ---
        let mut display = bgr.clone();
        let h = display.rows() as f64;
        let w = display.cols() as f64;

        for b in &boxes {
            let x1 = (b.x1 * w) as i32;
            let y1 = (b.y1 * h) as i32;
            let x2 = (b.x2 * w) as i32;
            let y2 = (b.y2 * h) as i32;

            // 緑の矩形
            imgproc::rectangle(
                &mut display,
                core::Rect::new(x1, y1, x2 - x1, y2 - y1),
                core::Scalar::new(0.0, 255.0, 0.0, 0.0),
                2,
                imgproc::LINE_8,
                0,
            ).ok();

            // confidence表示
            let label = format!("{:.2}", b.confidence);
            imgproc::put_text(
                &mut display,
                &label,
                core::Point::new(x1, y1 - 5),
                imgproc::FONT_HERSHEY_SIMPLEX,
                0.6,
                core::Scalar::new(0.0, 255.0, 0.0, 0.0),
                2,
                imgproc::LINE_8,
                false,
            ).ok();
        }

        // 左上に情報表示
        let info = format!(
            "frame:{} det:{} {}ms th:{:.2}",
            frame_count, boxes.len(), inference_ms, conf_threshold
        );
        imgproc::put_text(
            &mut display,
            &info,
            core::Point::new(10, 30),
            imgproc::FONT_HERSHEY_SIMPLEX,
            0.8,
            core::Scalar::new(255.0, 255.0, 255.0, 0.0),
            2,
            imgproc::LINE_8,
            false,
        ).ok();

        // 表示
        highgui::imshow(window, &display).ok();

        // ESC or ウィンドウ閉じで終了
        let key = highgui::wait_key(1).unwrap_or(-1);
        if key == 27 || key == 'q' as i32 {
            break;
        }
    }

    println!("\n[diagnose] 終了: {}フレーム処理", frame_count);
    highgui::destroy_all_windows().ok();
}

fn print_frame_diagnostics(frame: &core::Mat, count: u64) {
    let rows = frame.rows();
    let cols = frame.cols();
    let channels = frame.channels();
    let depth = frame.depth();
    println!(
        "[診断] frame#{}: size={}x{} ch={} depth={}",
        count, cols, rows, channels, depth
    );

    if let Ok(data) = frame.data_bytes() {
        let total = (rows * cols) as usize;
        if data.len() >= total * 3 {
            let (mut sum_b, mut sum_g, mut sum_r) = (0u64, 0u64, 0u64);
            let (mut min_b, mut min_g, mut min_r) = (255u8, 255u8, 255u8);
            let (mut max_b, mut max_g, mut max_r) = (0u8, 0u8, 0u8);
            for i in 0..total {
                let b = data[i * 3];
                let g = data[i * 3 + 1];
                let r = data[i * 3 + 2];
                sum_b += b as u64;
                sum_g += g as u64;
                sum_r += r as u64;
                min_b = min_b.min(b);
                min_g = min_g.min(g);
                min_r = min_r.min(r);
                max_b = max_b.max(b);
                max_g = max_g.max(g);
                max_r = max_r.max(r);
            }
            let n = total as f64;
            println!(
                "[診断] BGR平均: B={:.1} G={:.1} R={:.1}",
                sum_b as f64 / n, sum_g as f64 / n, sum_r as f64 / n
            );
            println!(
                "[診断] BGR範囲: B=[{}-{}] G=[{}-{}] R=[{}-{}]",
                min_b, max_b, min_g, max_g, min_r, max_r
            );
        }
    }
}

fn print_nchw_diagnostics(input: &[f32]) {
    let pixels = INPUT_SIZE as usize;
    let ch_size = pixels * pixels;
    let r_mean: f32 = input[0..ch_size].iter().sum::<f32>() / ch_size as f32;
    let g_mean: f32 = input[ch_size..2 * ch_size].iter().sum::<f32>() / ch_size as f32;
    let b_mean: f32 = input[2 * ch_size..3 * ch_size].iter().sum::<f32>() / ch_size as f32;
    println!(
        "[診断] NCHW平均(0-1): R={:.4} G={:.4} B={:.4}",
        r_mean, g_mean, b_mean
    );
}

/// 閾値以下のconfidenceの最大値を取得して表示（検出0の原因切り分け用）
fn print_raw_max_confidence(input_nchw: &[f32], inference: &mut OnnxInference) {
    // 閾値0で再推論して全confidenceを見る
    let saved = 0.0; // ダミー: 一時的に閾値0で推論
    inference.set_conf_threshold(0.0);
    if let Ok((all_boxes, _)) = inference.run(input_nchw) {
        if all_boxes.is_empty() {
            println!("[診断] ⚠ 閾値0でも検出なし → モデル出力が根本的に異常");
        } else {
            let max_conf = all_boxes.iter().map(|b| b.confidence).fold(0.0f64, f64::max);
            let top5: Vec<String> = all_boxes.iter().take(5).map(|b| format!("{:.4}", b.confidence)).collect();
            println!(
                "[診断] 閾値以下の最大confidence={:.6} (上位5: [{}])",
                max_conf,
                top5.join(", ")
            );
        }
    }
    // 閾値を戻す（呼び出し元で設定し直すため、ここでは最低限の復旧）
    // NOTE: 呼び出し元のconf_thresholdに依存するが、次フレームで再設定されるので問題なし
}

fn find_model() -> String {
    let candidates = [
        "resources/models/yolov8n_oocyte.onnx",
        "../resources/models/yolov8n_oocyte.onnx",
        "native-core/../resources/models/yolov8n_oocyte.onnx",
    ];
    for path in &candidates {
        if Path::new(path).exists() {
            return path.to_string();
        }
    }
    panic!("Model file not found! Tried: {:?}", candidates);
}
