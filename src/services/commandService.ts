/**
 * 命令服务 - 处理命令解析和参数替换
 */

import type { Command, CommandResult, ParsedCommand } from '../types/command';

/**
 * Claude Code 命令提示词模板
 * 将命令转换为 AI 可以理解和执行的提示词
 */
const COMMAND_PROMPTS: Record<string, (args: string[], fileRefs: string[]) => string> = {
  // 会话管理
  'stats': () => '请显示当前会话的统计信息，包括消息数量、token 使用量、会话时长等。',
  'map': () => '请显示当前工作区的文件结构映射，用树形结构列出主要目录和文件。',
  'token': () => '请显示当前会话的 token 使用统计，包括输入和输出的 token 数量。',

  // Git 操作
  'commit': (args) => {
    const msg = args.length ? `"${args.join(' ')}"` : '适当的提交信息';
    return `请创建一个 git commit，提交信息是 ${msg}。如果当前有修改，请先查看 git status，然后执行 git add 和 git commit。`;
  },
  'diff': (args) => {
    if (args.length === 0) {
      return '请显示当前项目的 git diff，展示所有未提交的修改。';
    }
    return `请显示 git diff，针对以下文件或路径：${args.join(' ')}`;
  },
  'patch': (args) => {
    if (args.length === 0) {
      return '请查看当前的 git patch 或未提交的更改。';
    }
    return `请查看或应用 patch，针对：${args.join(' ')}`;
  },
  'push': (args) => {
    const branch = args.length ? args[0] : '当前分支';
    return `请将当前分支推送到远程仓库。当前分支是：${branch}。`;
  },
  'pull': (args) => {
    const branch = args.length ? args[0] : '当前分支';
    return `请从远程仓库拉取最新代码。目标分支是：${branch}。`;
  },
  'branch': (args) => {
    if (args.length === 0) {
      return '请显示当前所有分支。';
    }
    return args.length === 1 ? `请切换到分支：${args[0]}` : `请创建并切换到新分支：${args.join(' ')}`;
  },
  'merge': (args) => {
    const branch = args.length ? args[0] : '默认分支';
    return `请将分支 ${branch} 合并到当前分支。如果有冲突，请帮助解决。`;
  },

  // 代码质量
  'format': (args, fileRefs) => {
    if (fileRefs.length > 0) {
      return `请格式化以下文件：${fileRefs.join(', ')}。使用项目的代码格式化标准。`;
    }
    if (args.length > 0) {
      return `请检查并格式化以下路径的代码：${args.join(' ')}`;
    }
    return '请检查当前代码的格式问题，并使用项目的格式化工具（如 Prettier、Black 等）进行格式化。';
  },
  'lint': (args, fileRefs) => {
    if (fileRefs.length > 0) {
      return `请对以下文件进行代码检查：${fileRefs.join(', ')}。使用项目的 linter（如 ESLint、Pylint 等）。`;
    }
    if (args.length > 0) {
      return `请对以下路径进行代码检查：${args.join(' ')}`;
    }
    return '请对当前项目运行代码检查（lint），指出潜在的问题、代码异味或不符合规范的地方。';
  },
  'test': (args) => {
    if (args.length > 0) {
      return `请运行测试：${args.join(' ')}。如果测试失败，请分析失败原因。`;
    }
    return '请运行项目的测试套件。如果测试失败，请分析失败原因并提供修复建议。';
  },
  'build': (args) => {
    if (args.length > 0) {
      return `请构建项目：${args.join(' ')}。`;
    }
    return '请构建当前项目。如果构建失败，请分析错误日志并提供修复建议。';
  },
  'run': (args) => {
    if (args.length === 0) {
      return '请运行项目的主程序或默认脚本。';
    }
    return `请运行：${args.join(' ')}。`;
  },

  // 文件操作
  'edit': (args, fileRefs) => {
    if (fileRefs.length === 0) {
      return '请指定要编辑的文件，使用格式：/edit @文件路径';
    }
    const file = fileRefs[0];
    const instruction = args.length ? args.join(' ') : '进行必要的修改';
    return `请编辑文件 ${file}，${instruction}。请显示修改前后的差异。`;
  },
  'search': (args) => {
    if (args.length === 0) {
      return '请指定要搜索的内容。使用格式：/search 搜索关键词';
    }
    return `请在当前工作区搜索：${args.join(' ')}。请搜索代码内容、文件名或符号定义。`;
  },
  'find': (args) => {
    if (args.length === 0) {
      return '请指定要查找的内容。';
    }
    return `请在代码中查找：${args.join(' ')}。`;
  },

  // AI 模型控制
  'model': (args) => {
    if (args.length === 0) {
      return '请显示当前使用的 AI 模型信息。';
    }
    return `请切换 AI 模型为：${args.join(' ')}。如果该模型不可用，请推荐替代方案。`;
  },
  'compact': () => '请使用紧凑模式回复，尽量简洁明了。',
  'verbose': () => '请使用详细模式回复，提供更多细节和解释。',

  // 上下文管理
  'context': (args) => {
    if (args.length === 0) {
      return '请显示当前会话的上下文信息，包括已加载的文件和环境。';
    }
    return `请添加以下内容到上下文：${args.join(' ')}`;
  },
  'forget': (args) => {
    if (args.length === 0) {
      return '请清除当前会话中之前记住的信息或上下文。';
    }
    return `请忘记之前关于以下内容的信息：${args.join(' ')}`;
  },
  'reset': () => '请重置当前会话状态，清除所有上下文历史。',

  // 文档和帮助
  'help': () => '请显示 Claude Code 的使用帮助，包括可用命令和功能说明。',
  'commands': () => '请列出所有可用的斜杠命令及其说明。',
  'guide': (args) => {
    if (args.length === 0) {
      return '请提供如何有效使用 Claude Code 的指导和建议。';
    }
    return `请提供关于以下主题的指导：${args.join(' ')}`;
  },

  // 数据库（如果项目使用）
  'database': (args) => {
    if (args.length === 0) {
      return '请检查项目的数据库连接和状态。';
    }
    return `请执行数据库操作：${args.join(' ')}`;
  },
  'db': (args) => {
    if (args.length === 0) {
      return '请显示项目的数据库 schema 或结构信息。';
    }
    return `请查询数据库：${args.join(' ')}`;
  },

  // 配置和环境
  'env': () => '请显示当前项目的环境配置信息。',
  'config': (args) => {
    if (args.length === 0) {
      return '请显示当前项目的配置信息。';
    }
    return `请显示或修改配置项：${args.join(' ')}`;
  },

  // 依赖管理
  'install': (args) => {
    if (args.length === 0) {
      return '请安装项目的依赖（npm install, pip install 等）。';
    }
    return `请安装依赖包：${args.join(' ')}`;
  },
  'update': (args) => {
    if (args.length === 0) {
      return '请更新项目的依赖包到最新版本。';
    }
    return `请更新依赖包：${args.join(' ')}`;
  },
  'upgrade': (args) => {
    if (args.length === 0) {
      return '请升级项目的主要依赖或框架版本。';
    }
    return `请升级：${args.join(' ')}`;
  },

  // 其他实用命令
  'clear': () => '请确认已清除之前的输出，准备好接收新的任务。',
  'history': () => '请显示当前会话的命令历史记录。',
  'log': (args) => {
    if (args.length === 0) {
      return '请显示 git 日志。';
    }
    return `请显示 git log，${args.join(' ')}`;
  },
  'status': () => '请显示 git 状态和当前分支信息。',
  'stash': (args) => {
    if (args.length === 0) {
      return '请暂存当前的修改（git stash）。';
    }
    return `请暂存修改，说明：${args.join(' ')}`;
  },
  'pop': () => '请恢复最近暂存的修改（git stash pop）。',
  'clean': () => '请清理项目中的未跟踪文件或构建产物。',
  'init': () => '请帮助初始化项目，包括创建配置文件、设置开发环境等。',
  'review': () => '请对当前修改进行代码审查，指出问题和改进建议。',
  'refactor': (args) => {
    if (args.length === 0) {
      return '请对当前代码进行重构，改进代码结构和质量。';
    }
    return `请重构以下内容：${args.join(' ')}`;
  },
  'explain': (args, fileRefs) => {
    if (fileRefs.length > 0) {
      return `请解释以下文件的代码：${fileRefs.join(', ')}。`;
    }
    if (args.length > 0) {
      return `请解释：${args.join(' ')}`;
    }
    return '请解释当前项目的功能和结构。';
  },
  'document': (args, fileRefs) => {
    if (fileRefs.length > 0) {
      return `请为以下文件添加或更新文档注释：${fileRefs.join(', ')}。`;
    }
    if (args.length > 0) {
      return `请为以下内容生成文档：${args.join(' ')}`;
    }
    return '请为当前项目生成文档，包括 README、API 文档等。';
  },

  // 设计相关 - Frontend-design Skill
  'frontend-design-skill': (args, fileRefs) => {
    let content = '';

    // 文件引用
    if (fileRefs.length > 0) {
      content += `\n\n目标文件：${fileRefs.join(', ')}`;
    }

    // 用户需求
    if (args.length > 0) {
      content += `\n\n具体需求：${args.join(' ')}`;
    }

    // 明确触发词，确保 Skill 被激活
    return `请使用 Frontend-design Skill 为我创建/优化一个 production-grade 的 frontend interface${content}`;
  },
};

/**
 * 将命令转换为 AI 提示词
 * @param command 解析后的命令对象
 * @returns 转换后的提示词
 */
export function convertCommandToPrompt(command: ParsedCommand): string {
  const { name, args, fileRefs } = command;

  // 查找命令模板
  const template = COMMAND_PROMPTS[name];

  if (template) {
    return template(args, fileRefs);
  }

  // 未知命令 - 让 AI 尝试执行
  const argsStr = args.length ? ` ${args.join(' ')}` : '';
  const refsStr = fileRefs.length ? ` ${fileRefs.map(f => `@${f}`).join(' ')}` : '';

  return `请帮我执行 /${name}${argsStr}${refsStr} 命令。如果这是有效的 Claude Code 命令，请执行相应的操作；如果不是，请告诉我这个命令的作用。`;
}

/**
 * 解析命令输入
 * 支持格式:
 *   /command_name
 *   /command_name arg1 arg2
 *   /command_name @file1.txt @file2.txt
 */
export function parseCommandInput(input: string, availableCommands: Command[]): CommandResult {
  const trimmed = input.trim();

  // 检查是否是命令（以 / 开头）
  if (!trimmed.startsWith('/')) {
    return { type: 'message', message: trimmed };
  }

  // 提取命令名称和参数
  const parts = trimmed.slice(1).split(/\s+/);
  const commandName = parts[0];
  const args = parts.slice(1);

  // 查找命令
  const command = availableCommands.find(cmd => cmd.name === commandName);

  // 提取文件引用（@语法）
  const fileRefs: string[] = [];
  const regularArgs: string[] = [];

  args.forEach(arg => {
    if (arg.startsWith('@')) {
      fileRefs.push(arg.slice(1));
    } else {
      regularArgs.push(arg);
    }
  });

  const parsed: ParsedCommand = {
    raw: trimmed,
    name: commandName,
    args: regularArgs,
    fileRefs,
  };

  // 内置命令 - 需要前端处理
  if (command && command.type === 'builtin') {
    // help 和 commands 有特殊处理，在 ChatInput 中生成消息
    // 其他内置命令转换为提示词发送给 AI
    if (commandName !== 'help' && commandName !== 'commands') {
      parsed.fullCommand = convertCommandToPrompt(parsed);
    }
    return { type: 'command', command: parsed };
  }

  // 自定义命令 - 使用定义的内容
  if (command && command.content) {
    const replaced = replaceCommandArguments(command.content, regularArgs, fileRefs);
    parsed.fullCommand = replaced;
    return { type: 'command', command: parsed };
  }

  // 未知命令 - 转换为提示词让 AI 执行
  parsed.fullCommand = convertCommandToPrompt(parsed);
  return { type: 'command', command: parsed };
}

/**
 * 替换命令参数
 * 支持的占位符:
 *   $ARGUMENTS - 所有参数
 *   $0 - 命令名称
 *   $1, $2, ... - 位置参数
 *   $@ - 所有参数（各自引用）
 *   ${n} - 位置参数（带花括号）
 */
export function replaceCommandArguments(
  template: string,
  args: string[],
  fileRefs: string[]
): string {
  let result = template;

  // 处理文件引用前缀
  if (fileRefs.length > 0) {
    const filePrefix = fileRefs.map(f => `@${f}`).join(' ');
    result = filePrefix + ' ' + result;
  }

  // 替换 $ARGUMENTS
  result = result.replace(/\$ARGUMENTS/g, args.join(' '));

  // 替换 $@（所有参数作为独立引用）
  result = result.replace(/\$@/g, args.join(' '));

  // 替换 $0（命令名称，通常不需要，但保持兼容性）
  // result = result.replace(/\$0/g, commandName);

  // 替换位置参数 $1, $2, $3, ...
  result = result.replace(/\$(\d+)/g, (_, index) => {
    const idx = parseInt(index, 10) - 1;
    return args[idx] || '';
  });

  // 替换花括号形式 ${n}
  result = result.replace(/\$\{(\d+)\}/g, (_, index) => {
    const idx = parseInt(index, 10) - 1;
    return args[idx] || '';
  });

  return result;
}

/**
 * 生成命令列表消息
 */
export function generateCommandsListMessage(commands: Command[]): string {
  const builtin = commands.filter(c => c.type === 'builtin');
  const custom = commands.filter(c => c.type === 'custom');

  let message = '## 可用命令\n\n';

  if (builtin.length > 0) {
    message += '### 内置命令\n\n';
    builtin.forEach(cmd => {
      message += `- **/${cmd.name}** - ${cmd.description}\n`;
    });
    message += '\n';
  }

  if (custom.length > 0) {
    message += '### 自定义命令\n\n';
    custom.forEach(cmd => {
      message += `- **/${cmd.name}** - ${cmd.description}`;
      if (cmd.params && cmd.params.length > 0) {
        const params = cmd.params.map(p => p.name).join(' ');
        message += ` (\`${params}\`)`;
      }
      message += '\n';
    });
  }

  message += '\n使用 `/命令名 参数` 来执行命令。';

  return message;
}

/**
 * 生成帮助消息
 */
export function generateHelpMessage(): string {
  return `## 帮助

### 斜杠命令
- 输入 \`/\` 可以快速访问命令
- \`/commands\` - 列出所有可用命令
- \`/help\` - 显示此帮助信息

### 文件引用
- 使用 \`@文件名\` 可以引用工作区中的文件
- 例如: \`@src/main.ts\` 会引用该文件内容

### 示例
- \`/help\` - 显示帮助
- \`/commands\` - 列出所有命令
- \`@README.md 请解释这个项目\` - 引用文件并提问
`;
}
