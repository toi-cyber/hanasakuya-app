pub mod camera;
pub mod inference;
pub mod postprocess;

use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
pub struct DetectionBox {
    pub x1: f64,
    pub y1: f64,
    pub x2: f64,
    pub y2: f64,
    pub confidence: f64,
}

#[derive(Serialize, Debug)]
pub struct CameraInfo {
    pub id: i32,
    pub name: String,
}
