const { compareStringsToStdOut, exists } = await import("./util.mjs");
const { default: colors } = await import("colors");
const { default: main } = (await import("../out/cli/index.js")).default;

const { default: glob } = await import("glob");
const files = glob.sync("test/programs/*.wo");
const { dirname, basename, extname, join } = await import("node:path");
const { readFile, writeFile } = await import("node:fs/promises");

// TODO: Turn this into an argument
// const update = process.argv.includes("--update") // very lazy
const update = true;

for (const file of files) {
  const fileDir = dirname(file);
  const fileExt = extname(file);
  const fileBase = basename(file, fileExt);
  const oFileName = join(fileDir, fileBase + ".o");
  const llFileName = join(fileDir, fileBase + ".ll");
  const bcFileName = join(fileDir, fileBase + ".bc");
  const wirFileName = join(fileDir, fileBase + ".wir");
  const wasmFileName = join(fileDir, fileBase + ".wasm");
  const result = await main([
    file,
    "--outO",
    oFileName,
    "--outWIR",
    wirFileName,
    "--outLL",
    llFileName,
    "--outBC",
    bcFileName,
    "--outWASM",
    wasmFileName,
  ]);

  let success = true;

  // For each output file:
  for (const [outputFileName, outputFileContents] of Object.entries(
    result.files,
  )) {
    // either do diff string, or [BINARY CONTENT DIFFERENT]
    const snapFileName = outputFileName + ".snap";
    const snapExists = await exists(snapFileName);

    if (outputFileContents.constructor === String) {
      if (snapExists && !update) {
        const expectedFileContents = await readFile(snapFileName, "utf-8");
        // we can't use &&= becuase emscripten reasons :\
        success = success && compareStringsToStdOut(
          expectedFileContents,
          outputFileContents,
          outputFileName,
        );
      } else {
        await writeFile(snapFileName, outputFileContents, "utf-8");
      }
    } else {
      if (snapExists && !update) {
        const expectedFileContents = await readFile(snapFileName);
        const buffersEqual =
          expectedFileContents.compare(outputFileContents) === 0;
        if (buffersEqual) {
          process.stdout.write(colors.green(`[${fileName}]: Success!\n`));
        } else {
          process.stdout.write(colors.red(`[${fileName}]: Fail!\n`));
        }
        success = success && buffersEqual;
      } else {
        await writeFile(snapFileName, outputFileContents);
      }
    }
  }
}
