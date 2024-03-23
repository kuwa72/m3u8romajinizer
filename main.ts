import { Parser } from "npm:m3u8-parser@7.1.0";
import mm from "npm:music-metadata@7.14.0";
import Kuroshiro from "npm:kuroshiro@1.2.0";
//import Kuroshiro from "./core.ts";
import Analyzer from "npm:kuroshiro-analyzer-kuromoji@1.1.0";

const args = Deno.args;
console.log(args);
const [m3uPath, outPath] = args;
if (!m3uPath) {
  console.error("No m3u path provided");
  Deno.exit(1);
}

const m3u = await Deno.readTextFile(m3uPath);

if (!outPath) {
  console.error("No out path provided");
  Deno.exit(1);
}

Deno.permissions.query({ name: "write", path: outPath }).catch(() => {
  console.error("No write permission to out path");
  Deno.exit(1);
});

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
  // first 32 chars
  return str.substring(0, 32);
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

  //console.log("Processing ", fullpath);

  //console.log(    `command: ./ffmpeg -y -i ${target} -c:v copy -metadata title='${rtitle}' -metadata artist='${rartist}' ${fullpath}`  );
  const ffmpegCommand = new Deno.Command(ffmpegPath, {
    args: [
      "-y",
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
