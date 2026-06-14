use std::os::raw::{c_char, c_int, c_void};

pub type ProjectMHandle = *mut c_void;

#[repr(C)]
pub enum ProjectMChannels {
    Mono = 1,
    Stereo = 2,
}

#[link(name = "projectM-4")]
unsafe extern "C" {
    pub fn projectm_create() -> ProjectMHandle;
    pub fn projectm_destroy(instance: ProjectMHandle);
    pub fn projectm_pcm_get_max_samples() -> u32;
    pub fn projectm_pcm_add_float(
        instance: ProjectMHandle,
        samples: *const f32,
        count: u32,
        channels: ProjectMChannels,
    );
    pub fn projectm_set_mesh_size(instance: ProjectMHandle, width: u32, height: u32);
    pub fn projectm_set_fps(instance: ProjectMHandle, fps: u32);
    pub fn projectm_load_preset_file(
        instance: ProjectMHandle,
        preset_path: *const c_char,
        smooth_transition: c_int,
    );
    pub fn projectm_set_window_size(instance: ProjectMHandle, width: u32, height: u32);
    pub fn projectm_opengl_render_frame(instance: ProjectMHandle);
}

pub struct ProjectM {
    pub handle: ProjectMHandle,
    pub last_w: u32,
    pub last_h: u32,
}

impl ProjectM {
    pub fn new() -> Self {
        unsafe {
            ProjectM {
                handle: projectm_create(),
                last_w: 0,
                last_h: 0,
            }
        }
    }

    pub fn set_window_size(&mut self, width: u32, height: u32) {
        unsafe {
            projectm_set_window_size(self.handle, width, height);
        }
    }

    pub fn set_mesh_size(&mut self, width: u32, height: u32) {
        unsafe {
            projectm_set_mesh_size(self.handle, width, height);
        }
    }

    pub fn set_fps(&mut self, fps: u32) {
        unsafe {
            projectm_set_fps(self.handle, fps);
        }
    }

    pub fn load_preset_file(&mut self, path: &str, smooth_transition: bool) {
        use std::ffi::CString;
        let c_path = CString::new(path).unwrap();
        unsafe {
            projectm_load_preset_file(
                self.handle,
                c_path.as_ptr(),
                if smooth_transition { 1 } else { 0 },
            );
        }
    }

    pub fn render_frame(&mut self) {
        unsafe {
            projectm_opengl_render_frame(self.handle);
        }
    }
}

impl Drop for ProjectM {
    fn drop(&mut self) {
        unsafe {
            projectm_destroy(self.handle);
        }
    }
}
unsafe impl Send for ProjectM {}
unsafe impl Sync for ProjectM {}
