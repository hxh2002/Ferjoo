#!/usr/bin/env python3
"""把阿里妈妈方圆体切成按需下载的 WOFF2。

源文件是仓库根目录的 AlimamaFangYuanTiVF-Thin-2.ttf（可变字体，约 7MB）。
网页不引用这份 TTF。

- 钉住倒角轴 BEVL=80，对应字体里的 Thin / Regular / Medium / SemiBold / Bold，
  字重仍由 CSS font-weight 在 200–700 之间选取，和现有设计字重对齐。
- fangyuan-ui.woff2：界面文案里出现、且字体里有的字，再加上全部非汉字（数字、英文、标点）。
  每个页面都会用到，只这一份进入首屏。
- fangyuan-ext-XX.woff2：字体里其余汉字，按码位分段，并写上 unicode-range。
  浏览器只在画面上真的出现这些字时才下载对应分段，用来盖住用户昵称、日记、备注。

字号不在这里改，仍用样式里已经按设计和 Figma 定好的像素值。
重新生成：python3 scripts/subset-fangyuan.py
依赖：fontTools、brotli。
"""

from __future__ import annotations

import re
from io import BytesIO
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "AlimamaFangYuanTiVF-Thin-2.ttf"
OUT_DIR = ROOT / "public" / "fonts"
CSS_PATH = ROOT / "src" / "assets" / "fonts.css"
FAMILY = "Alimama FangYuanTi VF"
BEVEL = 80
# 一段大约几十 KB，日记里偶尔出现的生僻字不会把整包汉字拉下来。
CHUNK = 420
SCAN_SUFFIXES = {".vue", ".js", ".css", ".html", ".webmanifest"}


def strip_comments(source: str) -> str:
    # 只去掉整行 // 注释、块注释和 HTML 注释。行内的 // 留给网址，避免把同一行后面的文案切掉。
    text = re.sub(r"(?m)^\s*//.*$", "", source)
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    return text


def scan_text() -> str:
    chunks = []
    paths = [ROOT / "index.html"]
    for folder in (ROOT / "src", ROOT / "public"):
        for path in folder.rglob("*"):
            if not path.is_file() or path.suffix not in SCAN_SUFFIXES:
                continue
            if path.name in {"sw.js", "fonts.css"} or "fonts" in path.parts and path.suffix == ".woff2":
                continue
            paths.append(path)
    for path in paths:
        chunks.append(strip_comments(path.read_text(encoding="utf-8", errors="ignore")))
    return "\n".join(chunks)


def unicode_range(codepoints: list[int]) -> str:
    parts = []
    start = prev = codepoints[0]
    for value in codepoints[1:]:
        if value == prev + 1:
            prev = value
            continue
        parts.append(f"U+{start:04X}" if start == prev else f"U+{start:04X}-{prev:04X}")
        start = prev = value
    parts.append(f"U+{start:04X}" if start == prev else f"U+{start:04X}-{prev:04X}")
    return ", ".join(parts)


def subset_font(source: TTFont, codepoints: list[int]) -> bytes:
    buffer = BytesIO()
    source.save(buffer)
    buffer.seek(0)
    font = TTFont(buffer)
    options = Options()
    options.layout_features = ["*"]
    options.desubroutinize = True
    options.recommended_glyphs = True
    options.notdef_outline = True
    options.name_IDs = ["*"]
    options.hinting = True
    tool = Subsetter(options=options)
    tool.populate(unicodes=codepoints)
    tool.subset(font)
    if "fvar" not in font:
        raise SystemExit("子集丢掉了字重轴，网页上的 font-weight 将无法对应到方圆体。")
    axis = font["fvar"].axes[0]
    if axis.axisTag != "wght" or axis.minValue != 200 or axis.maxValue != 700:
        raise SystemExit(f"字重轴异常：{axis.axisTag} {axis.minValue}–{axis.maxValue}")
    out = BytesIO()
    font.flavor = "woff2"
    font.save(out)
    return out.getvalue()


def face(filename: str, codepoints: list[int]) -> str:
    return (
        "@font-face {\n"
        f'  font-family: "{FAMILY}";\n'
        f'  src: url("/fonts/{filename}") format("woff2") tech(variations);\n'
        "  font-weight: 200 700;\n"
        "  font-style: normal;\n"
        "  font-display: swap;\n"
        f"  unicode-range: {unicode_range(codepoints)};\n"
        "}\n"
    )


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"找不到源字体：{SOURCE}")
    scanned = scan_text()
    used = {ord(char) for char in scanned if ord(char) >= 0x20 and char not in "\t\r\n"}
    variable = TTFont(str(SOURCE))
    pinned = instantiateVariableFont(variable, {"BEVL": BEVEL}, inplace=False)
    cmap = pinned.getBestCmap() or {}
    eager = sorted(cp for cp in cmap if not (0x4E00 <= cp <= 0x9FFF) or cp in used)
    lazy = sorted(cp for cp in cmap if 0x4E00 <= cp <= 0x9FFF and cp not in used)
    missing = sorted(cp for cp in used if cp not in cmap and not (cp < 0x80))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for old in OUT_DIR.glob("fangyuan-*.woff2"):
        old.unlink()

    files = [("fangyuan-ui.woff2", eager)]
    for index in range(0, len(lazy), CHUNK):
        files.append((f"fangyuan-ext-{index // CHUNK + 1:02d}.woff2", lazy[index:index + CHUNK]))

    css = [
        "/* 阿里妈妈方圆体。首包只含界面用字；其余汉字按 unicode-range 按需下载。",
        "   字重轴 200–700 对应设计里的 Thin 到 Bold。字号仍用各页面已有的设计值。",
        "   源字体没有的符号继续回退到 --font-sans 后面的系统字体。 */",
        "",
    ]
    total = 0
    for filename, codepoints in files:
        payload = subset_font(pinned, codepoints)
        (OUT_DIR / filename).write_bytes(payload)
        total += len(payload)
        css.append(face(filename, codepoints))
        print(f"{filename:24} {len(codepoints):5} 字  {len(payload) / 1024:7.1f} KB")
    CSS_PATH.write_text("\n".join(css), encoding="utf-8")
    print(f"界面包 {len(eager)} 字，延后 {len(lazy)} 字，共 {len(files)} 个文件 {total / 1024:.0f} KB")
    if missing:
        sample = "".join(chr(cp) for cp in missing[:40])
        print(f"源字体未收录、走系统回退的符号 {len(missing)} 个：{sample}")


if __name__ == "__main__":
    main()
