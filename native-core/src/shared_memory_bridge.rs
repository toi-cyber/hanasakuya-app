use shared_memory::{Shmem, ShmemConf};

/// 共有メモリによるフレーム転送（RGBA、ゼロコピー）
///
/// メモリレイアウト:
/// [0..4]  sequence番号 (u32 LE) — UIが更新検出に使用
/// [4..]   RGBA pixel data (width * height * 4 bytes)
pub struct FrameSharedMemory {
    shmem: Shmem,
    name: String,
    width: u32,
    height: u32,
}

const HEADER_SIZE: usize = 4; // sequence number

impl FrameSharedMemory {
    /// 新しい共有メモリを作成
    pub fn create(name: &str, width: u32, height: u32) -> Result<Self, String> {
        let data_size = (width * height * 4) as usize + HEADER_SIZE;

        let shmem = ShmemConf::new()
            .os_id(name)
            .size(data_size)
            .create()
            .map_err(|e| format!("Failed to create shared memory '{}': {}", name, e))?;

        eprintln!(
            "[shm] Created '{}' ({}x{}, {} bytes)",
            name, width, height, data_size
        );

        Ok(Self {
            shmem,
            name: name.to_string(),
            width,
            height,
        })
    }

    /// RGBAフレームデータを共有メモリに書き込み
    pub fn write_frame(&self, rgba_data: &[u8], sequence: u32) {
        let expected = (self.width * self.height * 4) as usize;
        if rgba_data.len() != expected {
            eprintln!(
                "[shm] Frame size mismatch: got {}, expected {}",
                rgba_data.len(),
                expected
            );
            return;
        }

        unsafe {
            let ptr = self.shmem.as_ptr();
            // sequence番号を書き込み
            std::ptr::copy_nonoverlapping(
                sequence.to_le_bytes().as_ptr(),
                ptr,
                4,
            );
            // RGBAデータを書き込み
            std::ptr::copy_nonoverlapping(
                rgba_data.as_ptr(),
                ptr.add(HEADER_SIZE),
                rgba_data.len(),
            );
        }
    }

    pub fn name(&self) -> &str {
        &self.name
    }

    pub fn width(&self) -> u32 {
        self.width
    }

    pub fn height(&self) -> u32 {
        self.height
    }
}
