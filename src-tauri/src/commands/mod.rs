pub mod chat;
pub mod workspace;
pub mod file_explorer;

// 重新导出命令函数，确保它们在模块级别可见
pub use chat::{start_chat, continue_chat};
pub use workspace::validate_workspace_path;
pub use workspace::get_directory_info;
pub use file_explorer::{
    read_directory, get_file_content, create_file, create_directory,
    delete_file, rename_file, path_exists, read_commands, search_files
};
