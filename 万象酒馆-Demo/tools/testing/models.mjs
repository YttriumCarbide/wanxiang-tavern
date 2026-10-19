import { readdir, access } from 'node:fs/promises';
import path from 'node:path';
import { projectRoot, command } from './runtime.mjs';

export async function models() {
  const directory = path.join(path.dirname(projectRoot), '建模工具');
  const python =
    process.env.PYTHON_EXECUTABLE ||
    path.join(
      directory,
      '.venv',
      process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
    );
  await access(python);
  const files = (await readdir(directory))
    .filter((name) => name.endsWith('.py'))
    .map((name) => path.join(directory, name));
  await command(python, ['-m', 'black', '--check', '--line-length', '100', ...files]);
  await command(python, [
    '-c',
    'import ast,pathlib,sys;[ast.parse(pathlib.Path(p).read_text(encoding="utf-8")) for p in sys.argv[1:]]',
    ...files,
  ]);
  return { formattedAndParsed: files.length, modelsRebuilt: false };
}
