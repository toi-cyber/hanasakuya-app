use crate::DetectionBox;

/// 何フレーム連続でマッチしなかったらトラックを削除するか（~0.5s@10fps）
const MAX_MISS: u32 = 5;

/// トラックと検出をマッチさせる最小IoU
/// NMSの閾値(0.45)より低め：卵子の微小移動・サイズ変動に対応
const IOU_THRESHOLD: f64 = 0.2;

struct Track {
    id: u32,
    bbox: DetectionBox,
    misses: u32,
}

pub struct Tracker {
    tracks: Vec<Track>,
    next_id: u32,
}

impl Tracker {
    pub fn new() -> Self {
        Self { tracks: Vec::new(), next_id: 1 }
    }

    /// 検出結果（track_id=0）を受け取り、各ボックスにtrack_idを付与して返す。
    /// conf_threshold: 新規トラック作成に必要な最低信頼度（既存トラックはこれ以下でも維持）
    pub fn update(&mut self, mut detections: Vec<DetectionBox>, conf_threshold: f64) -> Vec<DetectionBox> {
        let n_det = detections.len();
        let n_trk = self.tracks.len();

        let mut matched_track: Vec<Option<usize>> = vec![None; n_det];
        let mut matched_det: Vec<bool> = vec![false; n_trk];

        // IoUが高い順に（検出, トラック）ペアを列挙し、グリーディーマッチング
        let mut candidates: Vec<(f64, usize, usize)> = Vec::new();
        for (di, det) in detections.iter().enumerate() {
            for (ti, trk) in self.tracks.iter().enumerate() {
                let iou = compute_iou(det, &trk.bbox);
                if iou >= IOU_THRESHOLD {
                    candidates.push((iou, di, ti));
                }
            }
        }
        candidates.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());

        for (_, di, ti) in &candidates {
            if matched_track[*di].is_none() && !matched_det[*ti] {
                matched_track[*di] = Some(*ti);
                matched_det[*ti] = true;
            }
        }

        // マッチしたトラックを更新
        for (di, maybe_ti) in matched_track.iter().enumerate() {
            if let Some(ti) = maybe_ti {
                detections[di].track_id = self.tracks[*ti].id;
                self.tracks[*ti].bbox = detections[di].clone();
                self.tracks[*ti].misses = 0;
            }
        }

        // マッチしなかったトラックのmissカウントを増やす
        for (ti, matched) in matched_det.iter().enumerate() {
            if !matched {
                self.tracks[ti].misses += 1;
            }
        }

        // マッチしなかった検出は新規トラックとして登録（信頼度が閾値以上の場合のみ）
        for (di, maybe_ti) in matched_track.iter().enumerate() {
            if maybe_ti.is_none() && detections[di].confidence >= conf_threshold {
                let id = self.next_id;
                self.next_id += 1;
                detections[di].track_id = id;
                self.tracks.push(Track { id, bbox: detections[di].clone(), misses: 0 });
            }
        }

        // MAX_MISSを超えたトラックを削除
        self.tracks.retain(|t| t.misses <= MAX_MISS);

        // 未トラックの低信頼度検出を除外
        detections.retain(|d| d.track_id > 0);

        // 一時的に見失ったトラックも最後の位置で出力に含める（チラつき防止）
        for track in &self.tracks {
            if track.misses > 0 {
                detections.push(track.bbox.clone());
            }
        }

        detections
    }

    /// トラック一覧をリセット（検出セッション再開時に呼ぶ）
    pub fn reset(&mut self) {
        self.tracks.clear();
        self.next_id = 1;
    }
}

fn compute_iou(a: &DetectionBox, b: &DetectionBox) -> f64 {
    let ix1 = a.x1.max(b.x1);
    let iy1 = a.y1.max(b.y1);
    let ix2 = a.x2.min(b.x2);
    let iy2 = a.y2.min(b.y2);
    let inter = (ix2 - ix1).max(0.0) * (iy2 - iy1).max(0.0);
    let area_a = (a.x2 - a.x1) * (a.y2 - a.y1);
    let area_b = (b.x2 - b.x1) * (b.y2 - b.y1);
    let union = area_a + area_b - inter;
    if union > 0.0 { inter / union } else { 0.0 }
}
