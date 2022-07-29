// ==UserScript==
// @name     Fanboxed
// @version  1
// @grant    GM.xmlHttpRequest
// @require  https://cdnjs.cloudflare.com/ajax/libs/jszip/3.9.1/jszip.min.js
// @include  https://*.fanbox.cc/*
// ==/UserScript==

const FORMAT_FILENAME = "[{year:04}-{month:02}-{day:02}] [{author}] {title}.zip";

//

const LOCALES = {
  "ja": {
    format_value_not_found: "'{name}'という名前の値はありません",
    format_invalid_spec: "'{spec}'は形式化文字列として不正です",

    unexpected_error_no_metadata: "予期せぬエラー：メタデータがない",

    download_failed: "'{url}'のダウンロードに失敗しました",
    download_error: "ダウンロード中にエラーが発生しました：{error}",

    text_download: "ダウンロード",
    text_download_progress: "ダウンロード中... （{current} / {total}）",
  },
  "en": {
    format_value_not_found: "No value named '{name}'",
    format_invalid_spec: "Invalid format '{spec}'",

    unexpected_error_no_metadata: "Unexpected error: no metadata",

    download_failed: "Failed to download '{url}'",
    download_error: "Error occured during download: {error}",

    text_download: "Download",
    text_download_progress: "Downloading... ({current} / {total})",
  },
};

let locale;
function localize(key, obj) {
  if (!locale) {
    let lang = navigator.language;
    if (!(lang in LOCALES)) {
      // en-US -> en
      lang = lang.replace(/-.*$/, "");
    }
    if (!(lang in LOCALES)) {
      lang = "en";
    }
    if (!(lang in LOCALES)) {
      throw new Error(`Unexpected error: invalid language: ${navigator.language}`);
    }
    locale = LOCALES[lang];
  }
  if (!(key in locale)) {
    throw new Error(`Unexpected error: not a localized message: ${key}`);
  }
  return obj ? easyFormat(locale[key], obj) : locale[key];
}

function easyFormat(fmt, obj) {
  return fmt.replace(/{([^:}]+)(?::([^}]+))?}/g, (_, name, spec) => {
    if (!(name in obj)) {
      throw new Error(localize("format_value_not_found", { name }));
    }

    const v = obj[name];
    if (spec === undefined) {
      return v;
    }

    if (!/^0\d+$/.test(spec)) {
      return new Error(localize("format_invalid_spec", { spec }));
    }

    const n = Number.parseInt(spec, 10);
    return v.toString().padStart(n, "0");
  });
}

function extractExt(s) {
  return s.replace(/^.*\.(\w+)$/, "$1");
}

let style;
function addStyle(css) {
  if (!style) {
    const head = document.querySelector("head");
    if (!head) {
      return;
    }

    style = document.createElement("style");
    style.type = "text/css";
    head.append(style);
  }
  style.append(css + "\n");
}

function download(url) {
  return new Promise((resolve, reject) => {
    GM.xmlHttpRequest({
      method: "GET",
      url,
      responseType: "arraybuffer",
      onload(res) {
        resolve(res.response);
      },
      onerror() {
        reject(localize("download_failed", { url }));
      },
    });
  });
}

async function downloadAsZip(metadata, urls, progress) {
  let total = urls.length;
  if (metadata.cover) {
    total++;
  }
  let current = 0;
  progress(current, total);

  const zip = new JSZip();

  // add a description file
  if (metadata.description) {
    zip.file("description.txt", metadata.description);
  }

  // download a cover image
  if (metadata.cover) {
    const blob = await download(metadata.cover);

    const name = `cover.${extractExt(metadata.cover)}`;
    zip.file(name, blob);
    progress(++current, total);
  }

  // download content images
  for (let i = 0; i < urls.length; i++) {
    const url = urls[i];
    const blob = await download(url);

    const padded = i.toString().padStart(3, "0");
    const name = `page_${padded}.${extractExt(url)}`;
    zip.file(name, blob);
    progress(++current, total);
  }
  return await zip.generateAsync({ type: "blob" });
}

function collectMetadata() {
  const article = document.querySelector("#root > div > div > div > div > div > div > div > article");
  const md = {};

  md.author = document.querySelector("#root > div > div > div > div > div > div > div > div > div > div > h1 > a").textContent;
  md.title = article.querySelector(":scope > div > h1").textContent;

  const date = article.querySelector(":scope > div > h1 + div").textContent;
  const m = date.match(/(\d+)年(\d+)月(\d+)日 (\d+):(\d+)/);
  md.year = Number.parseInt(m[1], 10);
  md.month = Number.parseInt(m[2], 10);
  md.day = Number.parseInt(m[3], 10);
  md.hour = Number.parseInt(m[4], 10);
  md.minute = Number.parseInt(m[5], 10);

  const coverElement = article.querySelector(":scope > div > div > div > div > div > div[style]");
  if (coverElement) {
    md.cover = JSON.parse(coverElement.style.backgroundImage.replace(/^url\(|\)$/g, ""));
  }

  let description = "";
  for (const e of article.querySelectorAll(":scope > div")) {
    if (e.querySelector(":scope > h1") !== null) {
      // header
      continue;
    }

    let targets;
    const draftRoot = e.querySelector(":scope > .DraftEditor-root");
    if (draftRoot) {
      targets = [...draftRoot.querySelectorAll(":scope > .DraftEditor-editorContainer > .public-DraftEditor-content > div > :not(figure)")];
    } else {
      targets = [e];
    }

    for (const t of targets) {
      const text = t.innerText;
      if (text === "") {
        continue;
      }

      description += text + "\n";
    }
  }
  md.description = description.trim() + "\n";

  return md;
}

async function startDownload() {
  const downloadButton = this;

  const metadata = collectMetadata();
  if (!metadata) {
    alert(localize("unexpected_error_no_metadata"));
    return;
  }

  const urls = Array.from(
    document.querySelectorAll("a[href^='https://downloads.fanbox.cc/images/post/']"),
    a => a.href,
  );

  downloadButton.disabled = true;
  let bin;
  try {
    bin = await downloadAsZip(
      metadata,
      urls,
      (current, total) => {
        downloadButton.textContent = localize("text_download_progress", { current, total });
      },
    );
  } catch (error) {
    alert(localize("download_error", { error }));
    downloadButton.disabled = false;
    downloadButton.textContent = localize("text_download");
    return;
  }

  const dl = document.createElement("a");
  dl.href = URL.createObjectURL(bin);
  dl.download = easyFormat(FORMAT_FILENAME, metadata);
  document.body.append(dl);
  dl.click();
  dl.remove();

  downloadButton.disabled = false;
  downloadButton.textContent = localize("text_download");
}

addStyle(`
.fanboxed-button {
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  align-items: center;
  min-width: 100px;
  height: 28px;
  font-size: 12px;
  font-weight: bold;
  color: #999999;
  padding: 0px 14px;
  margin-left: 6px;
  border-radius: 14px;
  border: 1px solid #999999;
  background-color: white;
}
`);

const observer = new MutationObserver(() => {
  if (document.getElementById("fanboxed-download-button")) {
    return;
  }

  const likeButton = document.querySelector("#root > div > div > div > div > div > div > div > article + div > div > div > div > button");
  if (!likeButton) {
    return;
  }

  if (document.querySelector("article a[href$='/plans']")) {
    return;
  }

  const downloadButton = document.createElement("button");
  downloadButton.id = "fanboxed-download-button";
  downloadButton.className = "fanboxed-button";
  downloadButton.textContent = localize("text_download");
  downloadButton.addEventListener("click", startDownload);
  likeButton.after(downloadButton);
});
observer.observe(document.getElementById("root"), { childList: true, subtree: true });
