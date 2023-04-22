const { default: colors } = await import("colors");
const { diffLines } = await import("diff");
const fs = await import("node:fs/promises");

export function compareStringsToStdOut(expected, actual, fileName) {
  const changes = diffLines(expected, actual);

  let success = true;
  process.stdout.write(colors.yellow(`[${fileName}]\n`));
  
  for (const change of changes) {
    const value = change.value.slice(0, -1);
    const last = change.value.slice(-1);
    if (change.added) {
      const lines = "+ " + value.split("\n").join("\n+ ");
      process.stdout.write(colors.green(lines + last));
      success = false;
    } else if (change.removed) {
      const lines = "- " + value.split("\n").join("\n- ");
      process.stdout.write(colors.red(lines + last));
      success = false;
    } else {
      const lines = "  " + value.split("\n").join("\n  ");
      process.stdout.write(lines + last);
    }
  }
  if (success) {
    process.stdout.write(colors.green(`[${fileName}]: Success!\n`));
  } else {
    process.stdout.write(colors.red(`[${fileName}]: Fail!\n`));
  }
  
  process.stdout.write("\n");
  return success;
}

export async function exists(loc) {
  try {
    await fs.access(loc);
  } catch(ex) {
    return false;
  }
  return true;
}