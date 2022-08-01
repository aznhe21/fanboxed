// ==UserScript==
// @name        Fanboxed
// @version     1.0.1
// @homepageURL https://github.com/aznhe21/fanboxed
// @updateURL   https://raw.githubusercontent.com/aznhe21/fanboxed/master/fanboxed.user.js
// @downloadURL https://raw.githubusercontent.com/aznhe21/fanboxed/master/fanboxed.user.js
// @grant       GM.xmlHttpRequest
// @require     https://cdnjs.cloudflare.com/ajax/libs/jszip/3.9.1/jszip.min.js
// @include     https://*.fanbox.cc/*
// ==/UserScript==

const FORMAT_FILENAME = "[{year:04}-{month:02}-{day:02}] [{author}] {title}.zip";

//

const LOCALES = {
  "ja": {
    format_value_not_found: "'{name}'という名前の値はありません",
    format_invalid_spec: "'{spec}'は形式化文字列として不正です",

    api_failed: "API呼び出しに失敗しました",
    api_error: "API呼び出しに失敗しました：{error}",

    article_restricted: "記事の閲覧が制限されています",

    download_failed: "'{url}'のダウンロードに失敗しました",
    download_error: "ダウンロード中にエラーが発生しました：{error}",

    text_download: "ダウンロード",
    text_download_progress: "ダウンロード中... （{current} / {total}）",
    text_download_zip: "ZIPを生成中...",
  },
  "en": {
    format_value_not_found: "No value named '{name}'",
    format_invalid_spec: "Invalid format '{spec}'",

    api_failed: "Failed to call an API",
    api_error: "Failed to call an API: {error}",

    article_restricted: "The article is restricted",

    download_failed: "Failed to download '{url}'",
    download_error: "Error occured during download: {error}",

    text_download: "Download",
    text_download_progress: "Downloading... ({current} / {total})",
    text_download_zip: "Generating ZIP...",
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

function request(url, options, errorMessage) {
  return new Promise((resolve, reject) => {
    GM.xmlHttpRequest({
      method: "GET",
      url,
      ...options,
      onload(res) {
        resolve(res.response);
      },
      onerror() {
        reject(new Error(errorMessage()));
      },
    });
  });
}

async function download(url) {
  return await request(
    url,
    {
      responseType: "arraybuffer",
    },
    () => localize("download_failed", { url }),
  );
}

async function requestInfo(postId) {
  const res = await request(
    `https://api.fanbox.cc/post.info?postId=${postId}`,
    {
      headers: {
        Origin: "https://www.fanbox.cc",
      },
      responseType: "json",
    },
    () => localize("api_failed"),
  );
  if (res.error) {
    throw new Error(localize("api_error", { error: res.error }));
  }

  const raw = res.body;
  if (!raw) {
    throw new Error(localize("api_failed"));
  }

  if (raw.isRestricted) {
    throw new Error(localize("article_restricted"));
  }

  let description = "";
  let images = [];
  if (raw.body.blocks) {
    for (const block of raw.body.blocks) {
      switch (block.type) {
        case "header":
          description += "\n" + block.text + "\n";
          break;
        case "p":
          description += block.text + "\n";
          break;

        case "image":
          images.push(raw.body.imageMap[block.imageId].originalUrl);
          break;
      }
    }

    description = description.trim().replace(/\n{3,}/g, "\n\n");
  } else {
    description = raw.body.text;
    images = raw.body.images.map(i => i.originalUrl);
  }

  const date = new Date(raw.publishedDatetime);
  return {
    author: raw.user.name,
    title: raw.title,

    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),

    cover: raw.coverImageUrl,
    description,
    images,
  };
}

async function downloadAsZip(info, progress) {
  let total = info.images.length;
  if (info.cover) {
    total++;
  }
  let done = 0;
  progress(done, total);

  const zip = new JSZip();

  // add a description file
  if (info.description) {
    zip.file("description.txt", info.description);
  }

  // download a cover image
  if (info.cover) {
    const blob = await download(info.cover);

    const name = `cover.${extractExt(info.cover)}`;
    zip.file(name, blob);
    progress(++done, total);
  }

  // download content images
  for (let i = 0; i < info.images.length; i++) {
    const url = info.images[i];
    const blob = await download(url);

    const padded = (i + 1).toString().padStart(3, "0");
    const name = `page_${padded}.${extractExt(url)}`;
    zip.file(name, blob);
    progress(++done, total);
  }
  return await zip.generateAsync({ type: "blob" });
}

function extractPostId(url) {
  const m = url.match(/\/posts\/(\d+)/);
  return m ? Number.parseInt(m[1], 10) : null;
}

async function startDownload(downloadButton, postId) {
  let info
  try {
    info = await requestInfo(postId);
  } catch (e) {
    alert(e.message);
    return;
  }

  downloadButton.disabled = true;
  let bin;
  try {
    bin = await downloadAsZip(
      info,
      (done, total) => {
        downloadButton.textContent = done < total
          ? localize("text_download_progress", { current: done + 1, total })
          : localize("text_download_zip");
      },
    );
  } catch (e) {
    alert(localize("download_error", { error: e.message }));
    downloadButton.disabled = false;
    downloadButton.textContent = localize("text_download");
    return;
  }

  const dl = document.createElement("a");
  dl.href = URL.createObjectURL(bin);
  dl.download = easyFormat(FORMAT_FILENAME, info);
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

  const postId = extractPostId(location.href);
  if (postId === null) {
    return;
  }

  const downloadButton = document.createElement("button");
  downloadButton.id = "fanboxed-download-button";
  downloadButton.className = "fanboxed-button";
  downloadButton.textContent = localize("text_download");
  downloadButton.addEventListener("click", () => {
    startDownload(downloadButton, postId);
  });
  likeButton.after(downloadButton);
});
(() => {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }

  observer.observe(root, { childList: true, subtree: true });
})();
