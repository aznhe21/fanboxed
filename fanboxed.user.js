// ==UserScript==
// @name        Fanboxed
// @version     1.1.0
// @homepageURL https://github.com/aznhe21/fanboxed
// @updateURL   https://raw.githubusercontent.com/aznhe21/fanboxed/master/fanboxed.user.js
// @downloadURL https://raw.githubusercontent.com/aznhe21/fanboxed/master/fanboxed.user.js
// @grant       GM.xmlHttpRequest
// @require     https://cdnjs.cloudflare.com/ajax/libs/jszip/3.9.1/jszip.min.js
// @include     https://*.fanbox.cc/*
// ==/UserScript==

const FORMAT_FILENAME = "[{year:04}-{month:02}-{day:02}] [{author}] {title}.zip";

// locale

/**
 * @typedef {Object} Locale
 * @property {string} format_value_not_found
 * @property {string} format_invalid_spec
 * @property {string} api_failed
 * @property {string} api_error
 * @property {string} article_restricted
 * @property {string} download_failed
 * @property {string} download_error
 * @property {string} text_download
 * @property {string} text_download_pending
 * @property {string} text_download_setup
 * @property {string} text_download_progress
 * @property {string} text_download_zip
 */

/** @type {Record.<string, Locale>} */
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
    text_download_pending: "ダウンロード待機中（残り{pending}件）",
    text_download_setup: "ダウンロード準備中...",
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
    text_download_pending: "Pending downloads ({pending} remaining)",
    text_download_setup: "Preparing to download...",
    text_download_progress: "Downloading... ({current} / {total})",
    text_download_zip: "Generating ZIP...",
  },
};

/**
 * @type {Locale|undefined}
 */
let locale;

/**
 * @param {keyof Locale} key
 * @param {Record.<string, Object>} [obj]
 */
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

// utils

/**
 * @param {string} fmt
 * @param {Record.<string, any>} obj
 * @returns {string}
 */
function easyFormat(fmt, obj) {
  return fmt.replace(
    /{([^:}]+)(?::([^}]+))?}/g,
    /**
     * @param {string} name
     * @param {string} [spec]
     */
    (_, name, spec) => {
      if (!(name in obj)) {
        throw new Error(localize("format_value_not_found", { name }));
      }

      const v = obj[name];
      if (spec === undefined) {
        return v;
      }

      if (!/^0\d+$/.test(spec)) {
        throw new Error(localize("format_invalid_spec", { spec }));
      }

      const n = Number.parseInt(spec, 10);
      return v.toString().padStart(n, "0");
    },
  );
}

/**
 * @param {string} s
 * @returns {string}
 */
function extractExt(s) {
  return s.replace(/^.*\.(\w+)$/, "$1");
}

/**
 * @type {HTMLStyleElement|undefined}
 */
let style;
/**
 * @param {string} css
 */
function addStyle(css) {
  if (!style) {
    const head = document.querySelector("head");
    if (!head) {
      return;
    }

    style = document.createElement("style");
    head.append(style);
  }
  style.append(css + "\n");
}

/**
 * @param {string} url
 * @param {Object} options
 * @param {() => string} errorMessage
 * @returns {Promise.<any>}
 */
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

/**
 * @param {string} url
 * @returns {Promise.<ArrayBuffer>}
 */
async function download(url) {
  /** @type {ArrayBuffer} */
  return await request(
    url,
    {
      responseType: "arraybuffer",
    },
    () => localize("download_failed", { url }),
  );
}

// downloader

/**
 * @typedef {Object} DownloadObserver
 * @property {boolean} isAlive
 * @property {(postId: number|null) => void} onProgress
 */

const DownloadManager = new class {
  constructor() {
    /**
     * @readonly
     * @type {number[]}
     */
    this.queue = [];
    /**
     * @readonly
     * @type {Array.<DownloadObserver>}
     */
    this.observers = [];
    /** @type {{ done: number; total: number; }} */
    this.currentStatus = { done: 0, total: 0 };
  }

  /**
   * @param {DownloadObserver} observer
   */
  subscribe(observer) {
    this.observers.push(observer);
  }

  /**
   * @param {number} postId
   */
  download(postId) {
    if (this.queue.indexOf(postId) >= 0) {
      return;
    }

    this.queue.push(postId);
    if (this.queue.length === 1) {
      // ignore returned Promise
      this._downloadTask();
    }

    this._notifyProgress(null);
  }

  // private

  /**
   * @private
   * @param {BeforeUnloadEvent} e
   */
  _beforeUnload(e) {
    e.preventDefault();
    return e.returnValue = "";
  }

  /**
   * @private
   * @param {number|null} postId
   */
  _notifyProgress(postId) {
    for (let i = 0; i < this.observers.length;) {
      const ob = this.observers[i];
      if (!ob.isAlive) {
        this.observers.splice(i, 1);
        continue;
      }

      try {
        ob.onProgress(postId);
      } catch (e) {
      }
      i++;
    }
  }

  /**
   * @private
   * @param {string} message
   */
  _reportError(message) {
    // do not block following downloads
    setTimeout(() => alert(message), 0);
  }

  /**
   * @private
   * @returns {Promise.<void>}
   */
  async _downloadTask() {
    window.addEventListener("beforeunload", this._beforeUnload);

    while (this.queue.length > 0) {
      try {
        await this._downloadPost(this.queue[0]);
      } catch (e) {
        this._reportError(e instanceof Error ? e.message : String(e));
      }

      this.queue.shift();
      this._notifyProgress(null);
    }

    window.removeEventListener("beforeunload", this._beforeUnload);
  }

  /**
   * @typedef {object} FanboxPostInfo
   * @property {string} author
   * @property {string} title

   * @property {number} year
   * @property {number} month
   * @property {number} day
   * @property {number} hour
   * @property {number} minute

   * @property {string|null} cover
   * @property {string} description
   * @property {string[]} images
   */

  /**
   * @private
   * @param {number} postId
   * @returns {Promise.<FanboxPostInfo>} info a
   */
  async _requestInfo(postId) {
    /**
     * @type {Post}
     */
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
    if ("error" in res) {
      throw new Error(localize("api_error", { error: res.error }));
    }

    const raw = res.body;
    if (!raw) {
      throw new Error(localize("api_failed"));
    }

    if (raw.isRestricted || !raw.body) {
      throw new Error(localize("article_restricted"));
    }

    let description = "";
    /** @type {string[]} */
    let images = [];
    switch (raw.type) {
      case "image":
        description = raw.body.text;
        if (raw.body.images) {
          images = raw.body.images.map(i => i.originalUrl);
        }
        break;
      case "article":
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
        break;
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

  /**
   * @private
   * @param {number} postId
   * @returns {Promise.<void>}
   */
  async _downloadPost(postId) {
    this.currentStatus = { done: 0, total: Infinity };

    const info = await this._requestInfo(postId);
    this.currentStatus.total = info.images.length;
    if (info.cover) {
      this.currentStatus.total++;
    }
    this._notifyProgress(postId);

    /** @type {Blob} */
    let bin;
    try {
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

        this.currentStatus.done++;
        this._notifyProgress(postId);
      }

      // download content images
      for (let i = 0; i < info.images.length; i++) {
        const url = info.images[i];
        const blob = await download(url);

        const padded = (i + 1).toString().padStart(3, "0");
        const name = `page_${padded}.${extractExt(url)}`;
        zip.file(name, blob);

        this.currentStatus.done++;
        this._notifyProgress(postId);
      }

      bin = await zip.generateAsync({ type: "blob" });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      throw new Error(localize("download_error", { error }));
    }

    // fire the download
    const dl = document.createElement("a");
    dl.href = URL.createObjectURL(bin);
    dl.download = easyFormat(FORMAT_FILENAME, info);
    document.body.append(dl);
    dl.click();
    dl.remove();
  }
};

// ui

/**
 * @class
 * @implements {DownloadObserver}
 */
class DownloadButton {
  /**
   * @param {number} postId
   * @param {Element} insertAfter
   */
  constructor(postId, insertAfter) {
    /** @type {number} */
    this.postId = postId;

    /** @type {HTMLButtonElement} */
    this.button = document.createElement("button");
    this.button.addEventListener("click", e => {
      e.preventDefault();
      DownloadManager.download(this.postId);
    });
    insertAfter.after(this.button);

    DownloadManager.subscribe(this);
    this.updateText();
  }

  updateText() {
    const pending = DownloadManager.queue.findIndex(i => this.postId === i);
    switch (pending) {
      case -1:
        this.button.textContent = localize("text_download");
        this.button.disabled = false;
        break;

      case 0: {
        const { done, total } = DownloadManager.currentStatus;
        this.button.textContent = total === Infinity
          ? localize("text_download_setup")
          : done < total
            ? localize("text_download_progress", { current: done + 1, total })
            : localize("text_download_zip");
        this.button.disabled = true;
        break;
      }

      default:
        this.button.textContent = localize("text_download_pending", { pending });
        this.button.disabled = true;
        break;
    }
  }

  // DownloadObserver

  /**
   * @type {boolean}
   */
  get isAlive() {
    return document.contains(this.button);
  }

  /**
   * @param {number|null} postId
   */
  onProgress(postId) {
    if (this.postId === postId || postId === null) {
      this.updateText();
    }
  }
}

class PostDownloadButton extends DownloadButton {
  /**
   * @param {number} postId
   * @param {Element} insertAfter
   */
  constructor(postId, insertAfter) {
    super(postId, insertAfter);

    this.button.id = "fanboxed-download-button";
  }
}

class ListDownloadButton extends DownloadButton {
  /**
   * @param {number} postId
   * @param {Element} insertAfter
   */
  constructor(postId, insertAfter) {
    super(postId, insertAfter);

    this.button.classList.add("fanboxed-button");
  }
}


// main

/**
 * @param {string} url
 * @returns {number|null}
 */
function extractPostId(url) {
  const m = url.match(/\/posts\/(\d+)/);
  return m ? Number.parseInt(m[1], 10) : null;
}

/**
 * @param {Element} likeButton
 */
function handlePostPage(likeButton) {
  if (document.querySelector("article a[href$='/plans']")) {
    return;
  }

  const postId = extractPostId(location.href);
  if (postId === null) {
    return;
  }

  new PostDownloadButton(postId, likeButton);
}

/**
 * @param {NodeListOf.<HTMLAnchorElement>} cards
 */
function handleListPage(cards) {
  for (const card of cards) {
    if (card.querySelector(".fanboxed-button")) {
      continue;
    }

    const likeButton = card.querySelector(":scope > div > div > div > button, :scope > div > div > button");
    if (!likeButton) {
      continue;
    }

    const postId = extractPostId(card.href);
    if (!postId) {
      continue;
    }

    new ListDownloadButton(postId, likeButton);
  }
}

addStyle(`
.fanboxed-button {
	line-height: inherit;
	width: fit-content;
	height: 24px;
	padding: 0px 8px;
	border: 1px solid #999999;
	border-radius: 12px;
	background-color: white;
	background-repeat: no-repeat;
	background-position: 8px center;
	color: #999999;
}

#fanboxed-download-button {
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
  const likeButton = document.querySelector("#root > div > div > div > div > div > div > div > article + div > div > div > div > button");
  if (likeButton) {
    if (document.getElementById("fanboxed-download-button")) {
      return;
    }

    return handlePostPage(likeButton);
  }

  /** @type {NodeListOf.<HTMLAnchorElement>} */
  const cards = document.querySelectorAll(`
    #root > div > div > div > div > div > div > div > div > a,
    #root > div > div > div > div > div > div > div > a
  `);
  if (cards.length > 0) {
    return handleListPage(cards);
  }
});
(() => {
  const root = document.getElementById("root");
  if (!root) {
    return;
  }

  observer.observe(root, { childList: true, subtree: true });
})();
