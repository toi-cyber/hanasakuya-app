use crate::DetectionBox;
use crate::inference::INPUT_SIZE;

/// YOLO出力テンソルをパースし、NMSを適用してDetectionBox群を返す
///
/// output_data: flat f32 slice
/// output_shape: テンソル形状 (e.g., [1, 5, 8400])
pub fn process_output(
    output_data: &[f32],
    output_shape: &[usize],
    conf_threshold: f64,
    iou_threshold: f64,
) -> Vec<DetectionBox> {
    if output_shape.len() != 3 {
        eprintln!("[postprocess] Unexpected shape: {:?}", output_shape);
        return Vec::new();
    }

    let (num_features, num_preds, transposed) = if output_shape[1] == 5 {
        // [1, 5, 8400]
        (output_shape[1], output_shape[2], false)
    } else if output_shape[2] == 5 {
        // [1, 8400, 5]
        (output_shape[2], output_shape[1], true)
    } else {
        eprintln!("[postprocess] Unknown output layout: {:?}", output_shape);
        return Vec::new();
    };

    let input_size = INPUT_SIZE as f64;

    // 信頼度フィルタ
    let mut candidates: Vec<DetectionBox> = Vec::new();

    for i in 0..num_preds {
        let (cx, cy, w, h, score) = if !transposed {
            // [1, 5, 8400]: feature_idx * 8400 + pred_idx
            (
                output_data[0 * num_preds + i] as f64,
                output_data[1 * num_preds + i] as f64,
                output_data[2 * num_preds + i] as f64,
                output_data[3 * num_preds + i] as f64,
                output_data[4 * num_preds + i] as f64,
            )
        } else {
            // [1, 8400, 5]: pred_idx * 5 + feature_idx
            (
                output_data[i * num_features + 0] as f64,
                output_data[i * num_features + 1] as f64,
                output_data[i * num_features + 2] as f64,
                output_data[i * num_features + 3] as f64,
                output_data[i * num_features + 4] as f64,
            )
        };

        if score < conf_threshold {
            continue;
        }

        // 640x640座標系のまま（パイプラインで元画像サイズにスケーリング）
        candidates.push(DetectionBox {
            x1: (cx - w / 2.0) / input_size,
            y1: (cy - h / 2.0) / input_size,
            x2: (cx + w / 2.0) / input_size,
            y2: (cy + h / 2.0) / input_size,
            confidence: score,
        });
    }

    // 信頼度降順ソート
    candidates.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap());

    // NMS
    nms(&candidates, iou_threshold)
}

/// Greedy NMS
fn nms(boxes: &[DetectionBox], iou_threshold: f64) -> Vec<DetectionBox> {
    let mut selected: Vec<DetectionBox> = Vec::new();
    let mut suppressed = vec![false; boxes.len()];

    for i in 0..boxes.len() {
        if suppressed[i] {
            continue;
        }
        selected.push(boxes[i].clone());

        for j in (i + 1)..boxes.len() {
            if suppressed[j] {
                continue;
            }
            if iou(&boxes[i], &boxes[j]) > iou_threshold {
                suppressed[j] = true;
            }
        }
    }

    selected
}

fn iou(a: &DetectionBox, b: &DetectionBox) -> f64 {
    let x1 = a.x1.max(b.x1);
    let y1 = a.y1.max(b.y1);
    let x2 = a.x2.min(b.x2);
    let y2 = a.y2.min(b.y2);

    let intersection = (x2 - x1).max(0.0) * (y2 - y1).max(0.0);
    let area_a = (a.x2 - a.x1) * (a.y2 - a.y1);
    let area_b = (b.x2 - b.x1) * (b.y2 - b.y1);
    let union = area_a + area_b - intersection;

    if union > 0.0 {
        intersection / union
    } else {
        0.0
    }
}
