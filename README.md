# m3u8romajinizer

For Japanese DJ tool, mp3/aac files metadata Romaji-nizer.

# 概要

Rekordbox/iTunes等から出力したm3u8ファイルを読み込み、その中に含まれるファイルのタイトル・アーティストをローマ字化して別ディレクトリにコピーするためのツールです。

CDJ350など日本語表示できない環境で日本語曲をかけたいときに使ってください。

# 使い方

## 必要なもの

- Deno
- ffmpeg

## 実行方法

ビルドする場合は以下

```
deno compile --allow-read --allow-env --allow-run ./main.ts

./m3u8romajinizer hogehoge.m3u8 outputdir
```

直接実行するときは以下

```
deno run --allow-read --allow-env --allow-run .\main.ts  hogehoge.m3u8 outputdir
```
