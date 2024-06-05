import { Parser } from "npm:m3u8-parser@7.1.0";
import mm from "npm:music-metadata@7.14.0";
import Kuroshiro from "npm:kuroshiro@1.2.0";
//import Kuroshiro from "./core.ts";
import Analyzer from "npm:kuroshiro-analyzer-kuromoji@1.1.0";

const args = Deno.args;
console.log(args);
const [m3uPath] = args;
if (!m3uPath) {
  console.error("No m3u path provided");
  Deno.exit(1);
}

const m3u = await Deno.readTextFile(m3uPath);

// generate out path from m3u path
const outPath = m3uPath
  .replace(/\.m3u8?$/i, "")
  .replace(/\\/g, "/")
  .split("/")
  .pop();
if (!outPath) {
  console.error("Invalid m3u path");
  Deno.exit(1);
}

Deno.permissions.query({ name: "write", path: outPath }).catch(() => {
  console.error("No write permission to out path");
  Deno.exit(1);
});

try {
  await Deno.mkdir(outPath, { recursive: true });
} catch (err) {
  if (!(err instanceof Deno.errors.AlreadyExists)) {
    throw err;
  }
  // ignore err if already exists
}

// check ffmpeg command from path, if not found, use current dir
let ffmpegPath = "ffmpeg";
const ffmpegCommand = new Deno.Command("ffmpeg", { args: ["-version"] });
try {
  await ffmpegCommand.output();
} catch {
  const ffmpegCommand = new Deno.Command("./ffmpeg", { args: ["-version"] });
  try {
    await ffmpegCommand.output();
  } catch {
    console.error("No ffmpeg command found");
    Deno.exit(1);
  }
  ffmpegPath = "./ffmpeg";
}

const parser = new Parser();
parser.push(m3u);
parser.end();

const kuroshiro = new Kuroshiro.default();
await kuroshiro.init(new Analyzer());

const targets = parser.manifest.segments.map((segment: any) => segment.uri);

// ascii safe func, compress unknowns to one _
const asciiSafe = (str: string) => {
  return str.replace(/[^a-zA-Z0-9\.\-]+/g, "_");
};
const toRome = async (str: string) => {
  str = await kuroshiro.convert(str, {
    to: "romaji",
    romajiSystem: "passport",
    mode: "spaced",
  });
  // Upper case all first letter
  str = str.replace(/\b\w/g, (c) => c.toUpperCase());
  // compress spaces
  str = str.replace(/\s+/g, " ");
  // first 64 chars
  return str.substring(0, 64);
};

targets.forEach(async (target: string) => {
  const buf = await Deno.readFile(target);

  const meta = await mm.parseBuffer(buf);
  let ext = target.split(".").pop()?.toLowerCase();
  let force = false;
  const copyOpts = ["-c:a", "copy"];

  if (!(ext === "mp3" || ext === "aac" || ext === "m4a")) {
    console.log("Unsupported format: " + ext);
    force = true;
    ext = "m4a"; // force aac
  }

  // convert title and artist to romaji
  let rtitle = await toRome(meta.common?.title ?? "");
  const rartist = await toRome(
    meta.common?.artist ?? meta.common?.albumartist ?? ""
  );
  const rfilename = await toRome(
    target.replaceAll("\\", "/").split("/").pop() ?? "unknown"
  );
  if (rtitle === "") {
    rtitle = rfilename;
  }

  const filename = asciiSafe(rtitle) + " - " + asciiSafe(rartist) + "." + ext;
  const fullpath = outPath + "/" + filename;

  try {
    const fsinfo = await Deno.lstat(fullpath);
    // remove empty files if exists, for reprocessing failed files
    if (fsinfo.isFile && fsinfo.size == 0) {
      await Deno.remove(fullpath);
    } else {
      return; // skip if file exists
    }
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      throw err;
    }
    // generate new file if not exists
  }

  //console.log("Processing ", fullpath);

  //console.log(    `command: ./ffmpeg -y -i ${target} -c:v copy -metadata title='${rtitle}' -metadata artist='${rartist}' ${fullpath}`  );
  const ffmpegCommand = new Deno.Command(ffmpegPath, {
    args: [
      "-n", // no overwrite, cause we check empty files
      "-i",
      target,
      "-c:v",
      "copy",
      ...(force ? [] : copyOpts),
      "-metadata",
      `title=${rtitle}`,
      "-metadata",
      `artist=${rartist}`,
      fullpath,
    ],
  });
  const { success, stdout, stderr } = await ffmpegCommand.output();
  const d = new TextDecoder();
  if (!success) {
    console.log(success, d.decode(stdout), d.decode(stderr));
    Deno.exit(1);
  }
});
